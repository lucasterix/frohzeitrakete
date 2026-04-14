# Deployment

Wie der FrohZeitRakete-Stack auf den Hetzner-Server deployed wird, wie das CI/CD
funktioniert und wie man im Fehlerfall manuell eingreift.

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
┌────────────────────────┐
│   Hetzner Cloud Host   │      deploy@46.224.7.46
│   Ubuntu · Docker      │
├────────────────────────┤
│  git pull              │
│  docker compose up -d  │
│         --build        │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│      fzr_backend       │      Container-CMD:
│    Container Restart   │      alembic upgrade head &&
│                        │      uvicorn app.main:app
└────────────────────────┘
```

Effekt: jede Schemaänderung kommt durch eine neue Alembic-Revision automatisch
mit, jeder Code-Push ist nach 1–2 Minuten live.

---

## Stack auf dem Server

`infra/staging/docker-compose.yml` startet vier Container im Netz `fzr_net`:

| Container | Image | Ports | Zweck |
|---|---|---|---|
| `fzr_caddy` | `caddy:2` | 80, 443 | HTTPS-Termination, Reverse Proxy, Let's Encrypt |
| `fzr_backend` | `staging-backend` (built) | 8000 (intern) | FastAPI |
| `fzr_admin` | `staging-admin-web` (built) | 3000 (intern) | Next.js Admin |
| `fzr_postgres` | `postgres:16` | 5432 (intern) | Datenbank, Volume `postgres_data` |

Caddy ist der einzige Container mit publiziertem Port nach außen und routet:
- `api.froehlichdienste.de` → `fzr_backend:8000`
- `admin.froehlichdienste.de` → `fzr_admin:3000`

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

# 3. .env anlegen (Production-Secrets!)
cat > .env << 'EOF'
POSTGRES_DB=frohzeitrakete
POSTGRES_USER=fzr
POSTGRES_PASSWORD=...
DATABASE_URL=postgresql://fzr:...@postgres:5432/frohzeitrakete

PATTI_BASE_URL=https://patti.app
PATTI_LOGIN_EMAIL=...
PATTI_LOGIN_PASSWORD=...

SECRET_KEY=...

ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
JWT_ALGORITHM=HS256

ACCESS_COOKIE_NAME=fz_access_token
REFRESH_COOKIE_NAME=fz_refresh_token
COOKIE_SECURE=true
COOKIE_SAMESITE=lax

ADMIN_FRONTEND_URL=https://admin.froehlichdienste.de
NEXT_PUBLIC_API_BASE_URL=https://api.froehlichdienste.de
EOF
chmod 600 .env

# 4. Stack starten — Alembic legt das Schema beim ersten Start automatisch an
docker compose up -d --build

# 5. Admin-User anlegen
docker compose exec backend python -m app.scripts.seed_admin
```

> Die `infra/staging/.env` ist absichtlich in der `.gitignore` — sie liegt nur auf
> dem Server und enthält Credentials. Nie committen.

---

## CI/CD via GitHub Actions

### Was im Workflow passiert

Die Workflow-Definition liegt in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
Sie nutzt [`appleboy/ssh-action`](https://github.com/appleboy/ssh-action), um nach
jedem Push auf `main` per SSH einen einzigen Befehl auf dem Server auszuführen:

```bash
cd /home/deploy/apps/frohzeitrakete
git pull
cd infra/staging
docker compose up -d --build
```

### Secrets

Im Repo-Settings unter `Secrets and variables → Actions`:

| Secret | Inhalt |
|---|---|
| `DEPLOY_SSH_KEY` | Privater ED25519 Key, dessen Public-Key in `~/.ssh/authorized_keys` des `deploy`-Users liegt |

Der Deploy-Key ist **read-only** für den Server selbst (er wird nur von GitHub
benutzt, um zu SSHen) und hat **keinen** Zugriff auf das GitHub-Repo selbst —
der Server zieht den Code per HTTPS-Pull, weil das Repo public ist.

### Status

Den Status der Deployments live unter
[github.com/lucasterix/frohzeitrakete/actions](https://github.com/lucasterix/frohzeitrakete/actions).

---

## Datenbank-Migrationen

Migrationen werden mit Alembic verwaltet (siehe `apps/backend/migrations/`).

### Neue Migration erstellen

Lokal, mit laufender Postgres-DB:

```bash
cd apps/backend
source .venv/bin/activate
alembic revision --autogenerate -m "<beschreibung>"
```

Den generierten File reviewen, committen, pushen — wird beim nächsten Deploy
automatisch ausgeführt.

### Migration manuell ausführen / zurückrollen

Auf dem Server:

```bash
cd ~/apps/frohzeitrakete/infra/staging
docker compose exec backend alembic current        # aktuelle Revision
docker compose exec backend alembic history        # alle Revisionen
docker compose exec backend alembic upgrade head   # auf neueste hochziehen
docker compose exec backend alembic downgrade -1   # eine Revision zurück
```

### Bestehende DB ohne Migrationen einbinden

Wenn ein Server mit `create_all()` (statt Alembic) aufgesetzt wurde:

```bash
docker compose exec backend alembic stamp head
```

Damit wird die `alembic_version`-Tabelle angelegt und die aktuellste Revision
als „bereits applied" markiert, ohne dass DDL läuft.

---

## Backups

Postgres läuft mit einem benannten Volume `postgres_data`. Empfohlene
Backup-Strategie:

```bash
# Manuelles Snapshot via pg_dump
docker compose exec postgres pg_dump -U fzr frohzeitrakete \
  | gzip > /backup/fzr-$(date +%F).sql.gz
```

Per Cronjob auf dem Host als nächtliches Backup einplanen.

---

## Monitoring & Logs

```bash
# Live-Logs eines Containers
docker compose logs -f backend
docker compose logs -f admin-web
docker compose logs -f caddy

# Letzte 100 Zeilen des Backends
docker compose logs --tail=100 backend
```

Health-Endpoint für externes Monitoring:
```
GET https://api.froehlichdienste.de/health  →  {"status": "ok"}
```

---

## Rollback

Im Fehlerfall einer fehlerhaften Migration oder eines Bugs:

```bash
# 1. Auf die letzte funktionierende Commit zurück
cd ~/apps/frohzeitrakete
git log --oneline -10
git checkout <commit-hash>

# 2. Falls Migration zurückgerollt werden muss
cd infra/staging
docker compose exec backend alembic downgrade -1

# 3. Container neu bauen mit altem Code
docker compose up -d --build backend
```

Anschließend den Bug fixen, sauber committen, pushen — der Workflow deployed
automatisch wieder den neuesten Stand und die Migration läuft erneut hoch.
