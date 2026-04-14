# Ops Handbuch — FrohZeit Rakete

Dieses Dokument fasst alle operationalen Aufgaben zusammen, die **außerhalb
von Code** passieren: Deployment, Monitoring, Prod/Staging-Trennung,
Incident-Response.

## Umgebungen

| Umgebung | Admin-Web                              | Backend                                       | DB                         |
|----------|----------------------------------------|-----------------------------------------------|----------------------------|
| Staging  | https://admin.froehlichdienste.de      | https://api.froehlichdienste.de               | `frohzeitrakete` / `fzr`   |
| Prod     | https://app.froehlichdienste.de        | https://api-prod.froehlichdienste.de          | `frohzeitrakete_prod` / `fzr_prod` |

Beide Umgebungen laufen derzeit auf dem **gleichen Hetzner-Host** (46.224.7.46),
aber mit **getrennten Container-Namen**, **getrennten Postgres-Datenbanken**,
und **getrennten Caddy-Sites**. Die Compose-Projekte leben nebeneinander:

```
/home/deploy/apps/frohzeitrakete/
├── infra/staging/   # fzr_postgres, fzr_backend, fzr_admin, fzr_caddy
└── infra/prod/      # fzr_prod_postgres, fzr_prod_backend, ...
```

**Wichtig:** Port 80/443 kann nur **ein** Caddy gleichzeitig binden. Für den
parallelen Prod-Betrieb muss der Staging-Caddy gestoppt oder auf einen
anderen Port verschoben werden, oder man trennt die Umgebungen auf zwei
Hosts.

## Deployment

### Staging

Push auf `main` triggert den GitHub-Actions-Workflow `deploy.yml`, der per
SSH auf den Host verbindet, `git pull` + `docker compose up -d --build`
ausführt und Alembic-Migrations laufen lässt.

### Prod

Aktuell **manuell** (bewusst — damit kein versehentlicher `main`-Push auf
Prod landet):

```bash
ssh deploy@46.224.7.46
cd /home/deploy/apps/frohzeitrakete
git fetch --tags
git checkout <release-tag>
cd infra/prod
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Später: eigener `deploy-prod.yml`-Workflow, der nur bei manuellem Dispatch
und Tag-Pattern `prod-v*` läuft.

## Erst-Setup Prod

1. DNS-Einträge setzen:
   ```
   app.froehlichdienste.de       A  46.224.7.46
   api-prod.froehlichdienste.de  A  46.224.7.46
   ```
2. `infra/prod/.env.example` nach `infra/prod/.env` kopieren, alle
   `CHANGE_ME`-Werte setzen (besonders `POSTGRES_PASSWORD`, `SECRET_KEY`,
   `ADMIN_SEED_PASSWORD`).
3. Erstmalig `docker compose up -d` — Caddy holt Let's-Encrypt-Zertifikate.
4. `first_time_setup.sh` aus `infra/setup/` läuft auch gegen Prod, wenn
   `REPO_DIR` und `COMPOSE_DIR` auf `infra/prod` gesetzt werden.

## Monitoring

### Sentry

- Backend: `SENTRY_DSN` in `.env` → automatische Error-Erfassung via
  `sentry_sdk` (siehe [`app/main.py`](../apps/backend/app/main.py)).
- Mobile: `--dart-define=SENTRY_DSN=https://...` beim Flutter-Build →
  `SentryFlutter.init` in [`main.dart`](../apps/mobile/lib/main.dart).
- Empfohlen: **separate Sentry-Projekte** für Staging und Prod, damit die
  Alerts sauber getrennt sind.

### Uptime-Monitoring

**Kein Setup-Code** nötig — nur ein externer Service anmelden:

1. Account bei [UptimeRobot](https://uptimerobot.com/) (kostenlos, 50
   Monitore @ 5-Min-Intervall) oder [BetterStack](https://betterstack.com/).
2. Monitore anlegen für:

   | Ziel                                                    | Erwartung        |
   |---------------------------------------------------------|------------------|
   | `https://api.froehlichdienste.de/health`                | 200 `"status":"ok"` |
   | `https://api.froehlichdienste.de/health/ready`          | 200 `"ready"`       |
   | `https://api.froehlichdienste.de/health/ors`            | 200 `"live_ok":true` |
   | `https://api-prod.froehlichdienste.de/health`           | 200 (nach Prod-Launch) |
   | `https://admin.froehlichdienste.de`                     | 200 / 401         |
   | `https://app.froehlichdienste.de`                       | 200 / 401         |

3. Alert-Ziel: E-Mail an `daniel.rupp@froehlichdienste.de` + später Slack.
4. **Wichtig:** `/health/ors` ist ein **Early-Warning** — wenn das auf
   `live_ok:false` geht, funktioniert das Km-Tracking nicht mehr, aber der
   Rest der App läuft noch. Monitor entsprechend als "Warning", nicht
   "Critical".

### Logs

```bash
# Staging
docker logs -f fzr_backend --tail 200
docker logs -f fzr_caddy --tail 200

# Prod
docker logs -f fzr_prod_backend --tail 200
```

Backend loggt als strukturiertes JSON (`LOG_FORMAT=json`), damit Sentry/
Datadog/Loki es parsen können.

## Backups

Täglicher Postgres-Dump um 03:30 via Cron, installiert durch
[`first_time_setup.sh`](setup/first_time_setup.sh). Dumps landen in
`/home/deploy/backups/postgres/`, werden aktuell **nicht** off-site
gespiegelt — vor Prod-Launch auf B2/S3 syncen.

## Incident-Response

1. **Alarm** kommt via UptimeRobot / Sentry.
2. SSH auf Host, `docker ps` zum Check welche Container laufen.
3. `docker logs --tail 200 fzr_backend` für den ersten Blick.
4. Wenn DB down: `docker logs fzr_postgres`, ggf. `docker compose restart postgres`.
5. Wenn ORS down: kein Panik — Km-Tracking wird gracefully gefallbacked,
   der Rest der App läuft.
6. Für echte Datenverluste: Restore aus `/home/deploy/backups/postgres/`
   (siehe `infra/backup/backup_postgres.sh` für das Format).

## Kontakte

- Hetzner-Host: 46.224.7.46, User `deploy`, SSH-Key auf Daniels Laptop.
- Repo: https://github.com/lucasterix/frohzeitrakete
- Sentry / UptimeRobot / Firebase / Apple Developer / Google Play:
  Credentials in Daniels 1Password-Vault.
