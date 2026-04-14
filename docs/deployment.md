# Deployment

Wie der FrohZeitRakete-Stack auf den Hetzner-Server deployed wird, wie das CI/CD
funktioniert, wie Resilienz und Backups aufgesetzt sind und wie man im Fehlerfall
manuell eingreift.

---

## Überblick

```
git push origin main                      Continuous Deployment
        │
        ▼
┌────────────────────────┐
│  GitHub Actions Runner │      .github/workflows/deploy.yml
│     ubuntu-latest      │
└────────┬───────────────┘
         │  SSH (ED25519 Key aus Secret DEPLOY_SSH_KEY)
         ▼
┌──────────────────────────────────┐
│      Hetzner Cloud Host          │      deploy@46.224.7.46
│      Ubuntu · Docker             │
├──────────────────────────────────┤
│ 1. git pull                      │
│ 2. docker compose build backend  │   neues Image, alte Container weiter live
│ 3. docker compose run --rm \     │   Migrationen separat → kein Crash-Loop
│      backend alembic upgrade head│
│ 4. docker compose up -d --wait   │   Healthchecks müssen grün werden
└──────────────────────────────────┘
```

Effekt: jede Schemaänderung wird vor dem Container-Restart als eigener Schritt
ausgeführt. Schlägt sie fehl, bleibt der Live-Container unangetastet.
Schlagen Healthchecks fehl, schlägt der Workflow fehl und Alarme gehen raus.

---

## Stack auf dem Server

`infra/staging/docker-compose.yml` startet vier Container im Netz `fzr_net`:

| Container | Image | Healthcheck | Zweck |
|---|---|---|---|
| `fzr_caddy` | `caddy:2` | — | HTTPS-Termination, Let's Encrypt, Security-Header |
| `fzr_backend` | `staging-backend` | `GET /health/ready` (DB-Ping) | FastAPI |
| `fzr_admin` | `staging-admin-web` | — | Next.js Admin |
| `fzr_postgres` | `postgres:16` | `pg_isready` | Datenbank, Volume `postgres_data` |

Alle Container haben Log-Rotation: max. 10 MB pro Datei, 5 Dateien rolling.

Caddy ist der einzige Container mit publiziertem Port nach außen (80, 443) und routet:
- `api.froehlichdienste.de` → `fzr_backend:8000`
- `admin.froehlichdienste.de` → `fzr_admin:3000`

---

## Environment Variables

Die Backend-Settings werden über `infra/staging/.env` gelesen (mode 600,
nicht im Git getracked).

### Pflicht

| Variable | Beispiel | Beschreibung |
|---|---|---|
| `POSTGRES_DB` | `frohzeitrakete` | DB-Name |
| `POSTGRES_USER` | `fzr` | DB-User |
| `POSTGRES_PASSWORD` | `...` | DB-Passwort |
| `DATABASE_URL` | `postgresql://fzr:...@postgres:5432/frohzeitrakete` | SQLAlchemy-URL |
| `PATTI_BASE_URL` | `https://patti.app` | Patti-API-Endpunkt |
| `PATTI_LOGIN_EMAIL` | `...` | Patti-Login-Email |
| `PATTI_LOGIN_PASSWORD` | `...` | Patti-Login-Passwort |
| `SECRET_KEY` | `...` | JWT-Signing-Key (mind. 32 Bytes Random) |

### Auth & Cookies

| Variable | Default | Beschreibung |
|---|---|---|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access-Token-Lebensdauer |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh-Token-Lebensdauer |
| `JWT_ALGORITHM` | `HS256` | JWT-Signing-Algorithmus |
| `ACCESS_COOKIE_NAME` | `fz_access_token` | Cookie-Name |
| `REFRESH_COOKIE_NAME` | `fz_refresh_token` | Cookie-Name |
| `COOKIE_SECURE` | `false` | **In Production immer `true`!** |
| `COOKIE_SAMESITE` | `lax` | `lax`, `strict` oder `none` |

### Logging & Observability

| Variable | Default | Beschreibung |
|---|---|---|
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `LOG_FORMAT` | `json` | `json` (Production) oder `console` (lokal) |
| `SQL_ECHO` | `false` | Wenn `true`, loggt SQLAlchemy alle Queries — **nie in Production**, leakt PII |
| `SENTRY_DSN` | _leer_ | Wenn gesetzt, wird Sentry aktiviert |
| `SENTRY_ENVIRONMENT` | `staging` | Wird an Sentry mitgeschickt |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.0` | Performance-Tracing-Rate (0.0 - 1.0) |

### Security

| Variable | Default | Beschreibung |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000,https://admin.froehlichdienste.de` | Komma-getrennte CORS-Allowlist |
| `LOGIN_RATE_LIMIT` | `5/minute` | slowapi-Format, gilt pro Client-IP |

### Patti-Resilienz

| Variable | Default | Beschreibung |
|---|---|---|
| `PATTI_TIMEOUT_SECONDS` | `15` | Timeout für Patti-HTTP-Calls |
| `PATTI_CACHE_TTL_SECONDS` | `60` | TTL für In-Process-Cache |

### Admin Seed (optional)

| Variable | Default | Beschreibung |
|---|---|---|
| `ADMIN_SEED_EMAIL` | `admin@example.com` | Email des seedbaren Admins |
| `ADMIN_SEED_PASSWORD` | _leer_ | Wenn leer, wird kein Admin angelegt (Sicherheits-Default) |
| `ADMIN_SEED_FULL_NAME` | `Admin` | |

### Frontend

| Variable | Beschreibung |
|---|---|
| `ADMIN_FRONTEND_URL` | URL des Admin-Web (für Redirect-Zwecke) |
| `NEXT_PUBLIC_API_BASE_URL` | URL des Backends (wird vom Next.js-Build eingebacken) |

---

## Erstmaliges Setup auf einem neuen Server

```bash
# 1. Server vorbereiten
ssh deploy@<hostname>
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git

# 2. Repo klonen
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/lucasterix/frohzeitrakete.git
cd frohzeitrakete/infra/staging

# 3. .env anlegen (siehe Tabelle oben), dann absichern
nano .env
chmod 600 .env

# 4. Stack starten — Alembic legt das Schema beim ersten Start automatisch an
docker compose run --rm backend alembic upgrade head
docker compose up -d --wait

# 5. Initial-Admin anlegen (ADMIN_SEED_PASSWORD muss in der .env gesetzt sein)
docker compose exec backend python -m app.scripts.seed_admin
```

---

## CI/CD via GitHub Actions

### Was im Workflow passiert

Die Workflow-Definition liegt in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
Sie nutzt [`appleboy/ssh-action`](https://github.com/appleboy/ssh-action), um nach
jedem Push auf `main` einen Sequenz auf dem Server auszuführen:

```bash
git pull
docker compose build backend
docker compose run --rm backend alembic upgrade head
docker compose up -d --wait
```

`--wait` blockiert, bis alle Container ihren Healthcheck bestanden haben. Schlägt
ein Healthcheck fehl, schlägt der Workflow fehl und das Team wird via
GitHub-Notification informiert.

### Secrets

Im Repo unter `Settings → Secrets and variables → Actions`:

| Secret | Inhalt |
|---|---|
| `DEPLOY_SSH_KEY` | Privater ED25519 Key, dessen Public-Key in `~/.ssh/authorized_keys` des `deploy`-Users liegt |

Status: [github.com/lucasterix/frohzeitrakete/actions](https://github.com/lucasterix/frohzeitrakete/actions)

---

## Datenbank-Migrationen

Migrationen werden mit Alembic verwaltet (siehe `apps/backend/migrations/`).
Sie laufen im Workflow als **eigener Schritt vor** dem Container-Restart, damit
ein Migration-Fehler nicht zu einem Crash-Loop des Live-Containers führt.

### Neue Migration erstellen

Lokal, mit laufender Postgres-DB:

```bash
cd apps/backend
source .venv/bin/activate
alembic revision --autogenerate -m "<beschreibung>"
```

Den generierten File reviewen, committen, pushen — wird beim nächsten Deploy
automatisch ausgeführt.

### Manuell ausführen / zurückrollen

```bash
cd ~/apps/frohzeitrakete/infra/staging
docker compose exec backend alembic current        # aktuelle Revision
docker compose exec backend alembic history        # alle Revisionen
docker compose exec backend alembic upgrade head   # auf neueste
docker compose exec backend alembic downgrade -1   # eine Revision zurück
```

---

## Backups

### Automatisches nightly pg_dump

Auf dem Server liegt `/home/deploy/fzr-backup.sh`, das per Cron jede Nacht
um 03:03 Uhr läuft:

```bash
#!/usr/bin/env bash
docker exec fzr_postgres pg_dump -U fzr -d frohzeitrakete | gzip > \
  /home/deploy/backups/frohzeitrakete_$(date +%Y%m%d_%H%M%S).sql.gz
find /home/deploy/backups -name 'frohzeitrakete_*.sql.gz' -mtime +14 -delete
```

Retention: 14 Tage. Alte Backups werden automatisch gelöscht.

Cron-Eintrag:
```
03 03 * * * /home/deploy/fzr-backup.sh >> /home/deploy/backups/backup.log 2>&1
```

### Restore

```bash
# Container muss laufen
gunzip -c /home/deploy/backups/frohzeitrakete_<TS>.sql.gz | \
  docker exec -i fzr_postgres psql -U fzr -d frohzeitrakete
```

> Empfehlung: zusätzlich zur lokalen Retention die Backups regelmäßig auf eine
> Hetzner Storage Box rsyncen.

---

## Monitoring & Logs

### Container-Logs

```bash
docker compose logs -f backend            # live
docker compose logs --tail=100 backend    # letzte 100 Zeilen
docker compose logs --since=10m backend   # letzte 10 Minuten
```

Backend-Logs sind strukturiertes JSON (außer wenn `LOG_FORMAT=console`). Jeder
Request hat eine `request_id`, die im `X-Request-ID`-Response-Header zurückgegeben
wird — Bug-Reports sollten diese ID immer enthalten.

### Health-Endpunkte

| Endpunkt | Zweck |
|---|---|
| `GET /health` | Liveness — antwortet immer wenn der Prozess läuft |
| `GET /health/ready` | Readiness — pingt die DB. Wird auch vom Docker-Healthcheck genutzt |

### Sentry (optional)

Wenn `SENTRY_DSN` in der `.env` gesetzt ist, werden alle Exceptions und
HTTP-500er an Sentry gemeldet (mit Request-Kontext, aber ohne PII).
Ohne DSN ist Sentry komplett ausgeschaltet.

Setup:
1. Account bei [sentry.io](https://sentry.io) erstellen, Projekt „frohzeitrakete-backend" anlegen (Plattform: Python · FastAPI)
2. DSN aus dem Projekt kopieren
3. In `infra/staging/.env` setzen: `SENTRY_DSN=https://...@sentry.io/...`
4. Backend-Container restarten

### Externes Uptime-Monitoring

Empfohlen: [UptimeRobot](https://uptimerobot.com/) (kostenlos für 50 Monitors)
oder [Healthchecks.io](https://healthchecks.io/).

Setup für UptimeRobot:
1. Monitor-Type: HTTP(s)
2. URL: `https://api.froehlichdienste.de/health/ready`
3. Interval: 5 Minuten
4. Alert auf Status ≠ 200
5. Notifications an Slack/Email

---

## Rollback

Bei Bug oder fehlerhaftem Deploy:

```bash
cd ~/apps/frohzeitrakete

# 1. Auf vorherigen Commit zurück
git log --oneline -10
git checkout <commit-hash>

# 2. Falls Migration zurückgerollt werden muss
cd infra/staging
docker compose exec backend alembic downgrade -1

# 3. Container neu bauen mit altem Code
docker compose up -d --build --wait
```

Anschließend Bug fixen, sauber committen, pushen — der Workflow deployed
automatisch wieder den neuesten Stand.
