#!/usr/bin/env bash
# PostgreSQL daily backup for FrohZeit Rakete
#
# - Läuft als cron auf dem Hetzner-Host (nicht im Container)
# - Nutzt `docker compose exec` um pg_dump im Container aufzurufen
# - Speichert komprimierte Dumps in BACKUP_DIR
# - Behält die letzten $RETENTION_DAYS Tage
#
# Installation:
#   sudo cp backup_postgres.sh /usr/local/bin/fzr_backup.sh
#   sudo chmod +x /usr/local/bin/fzr_backup.sh
#   sudo crontab -e
#     → 30 3 * * *  /usr/local/bin/fzr_backup.sh >> /var/log/fzr_backup.log 2>&1
#
# Optional: BACKUP_DIR überschreiben per Env-Var.

set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/home/deploy/apps/frohzeitrakete/infra/staging}"
BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
CONTAINER="${CONTAINER:-fzr_postgres}"

# .env des Compose-Setups lesen (für POSTGRES_USER/DB/PASSWORD)
if [ -f "$COMPOSE_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$COMPOSE_DIR/.env"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-frohzeit}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d_%H%M)"
OUTFILE="$BACKUP_DIR/fzr_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

echo "[$(date '+%F %T')] Starting backup → $OUTFILE"

# pg_dump im Container, stream stdout nach gzip auf dem Host
docker exec -i "$CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gzip -9 > "$OUTFILE"

# Integritäts-Check: hat gzip etwas geschrieben?
if [ ! -s "$OUTFILE" ]; then
  echo "[ERROR] Backup leer – abbruch"
  rm -f "$OUTFILE"
  exit 1
fi

SIZE="$(du -h "$OUTFILE" | cut -f1)"
echo "[$(date '+%F %T')] Backup fertig: $OUTFILE ($SIZE)"

# Alte Backups löschen (älter als RETENTION_DAYS Tage)
find "$BACKUP_DIR" -name 'fzr_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete

echo "[$(date '+%F %T')] Cleanup done, retention=${RETENTION_DAYS}d"
