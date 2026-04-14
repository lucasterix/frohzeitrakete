#!/usr/bin/env bash
# ============================================================================
# FrohZeit Rakete – First Time Hetzner Setup
# ============================================================================
#
# Dieses Script erledigt die 4 einmal-pro-Server-Aufgaben in einem Rutsch:
#
#   1. ORS_API_KEY in die Compose .env eintragen (damit Km-Tracking läuft)
#   2. ADMIN_SEED_PASSWORD in die Compose .env eintragen (für den ersten Admin)
#   3. Backup-Cron für Postgres installieren (tägliches pg_dump)
#   4. Backend neu starten, Admin seed'en, Health-Checks prüfen
#
# Voraussetzungen:
#   - Ausgeführt als `deploy` User auf dem Hetzner-Host
#   - Das Repo liegt unter /home/deploy/apps/frohzeitrakete/
#   - Docker Compose läuft bereits
#
# Aufruf interaktiv (empfohlen, fragt nach Keys):
#   bash /home/deploy/apps/frohzeitrakete/infra/setup/first_time_setup.sh
#
# Aufruf non-interactive (CI/CD):
#   ORS_API_KEY=xyz ADMIN_SEED_PASSWORD=abc bash ./first_time_setup.sh --yes
#
# Idempotent: Mehrfach-Aufruf ist safe, existierende Werte werden nicht
# überschrieben es sei denn --force ist gesetzt.
# ============================================================================

set -euo pipefail

# Farben für lesbare Ausgabe
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
NC=$'\033[0m'

log() { echo "${BLUE}==>${NC} $*"; }
ok()  { echo "${GREEN}✓${NC} $*"; }
warn(){ echo "${YELLOW}⚠${NC} $*"; }
err() { echo "${RED}✗${NC} $*"; }

REPO_DIR="${REPO_DIR:-/home/deploy/apps/frohzeitrakete}"
COMPOSE_DIR="$REPO_DIR/infra/staging"
ENV_FILE="$COMPOSE_DIR/.env"
BACKUP_SCRIPT_SRC="$REPO_DIR/infra/backup/backup_postgres.sh"
BACKUP_SCRIPT_DEST="/usr/local/bin/fzr_backup.sh"

INTERACTIVE=true
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) INTERACTIVE=false ;;
    --force)  FORCE=true ;;
    --help|-h)
      grep '^# ' "$0" | cut -c3-
      exit 0
      ;;
  esac
done

# ----------------------------------------------------------------------------
# Vorbedingungen prüfen
# ----------------------------------------------------------------------------
log "Prüfe Vorbedingungen …"

if [ ! -d "$REPO_DIR" ]; then
  err "Repo nicht gefunden unter $REPO_DIR"
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  err ".env nicht gefunden unter $ENV_FILE"
  err "Das Staging-Setup scheint noch nicht initialisiert zu sein."
  exit 1
fi
if ! command -v docker &>/dev/null; then
  err "docker ist nicht installiert"
  exit 1
fi
if ! command -v crontab &>/dev/null; then
  warn "crontab nicht gefunden — Backup-Cron wird übersprungen"
fi
ok "Vorbedingungen OK"

# Helper: setzt oder überschreibt einen KEY=VALUE Eintrag in der .env
set_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"

  if [ -z "$value" ]; then
    return 0
  fi

  if grep -q "^${key}=" "$file"; then
    if [ "$FORCE" = true ]; then
      sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
      ok "  $key überschrieben"
    else
      local existing
      existing="$(grep "^${key}=" "$file" | cut -d'=' -f2-)"
      if [ -n "$existing" ] && [ "$existing" != "$value" ]; then
        warn "  $key ist bereits gesetzt (nutze --force zum Überschreiben)"
      else
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
        ok "  $key aktualisiert"
      fi
    fi
  else
    echo "${key}=${value}" >> "$file"
    ok "  $key hinzugefügt"
  fi
}

# ----------------------------------------------------------------------------
# 1. ORS_API_KEY
# ----------------------------------------------------------------------------
log "Schritt 1/4: ORS_API_KEY in .env eintragen"

if [ "$INTERACTIVE" = true ] && [ -z "${ORS_API_KEY:-}" ]; then
  echo "Hol dir einen Key auf https://openrouteservice.org/dev/#/signup"
  read -r -p "ORS_API_KEY (Enter = überspringen): " ORS_API_KEY
fi

if [ -n "${ORS_API_KEY:-}" ]; then
  set_env_var "ORS_API_KEY" "$ORS_API_KEY" "$ENV_FILE"
else
  warn "Kein ORS_API_KEY angegeben — Km-Tracking wird deaktiviert bleiben"
fi

# ----------------------------------------------------------------------------
# 2. ADMIN_SEED_PASSWORD
# ----------------------------------------------------------------------------
log "Schritt 2/4: ADMIN_SEED_PASSWORD in .env eintragen"

if [ "$INTERACTIVE" = true ] && [ -z "${ADMIN_SEED_PASSWORD:-}" ]; then
  echo "Das wird das initial-Passwort für admin@example.com (mind. 12 Zeichen)"
  read -r -s -p "ADMIN_SEED_PASSWORD (Enter = überspringen): " ADMIN_SEED_PASSWORD
  echo
fi

if [ -n "${ADMIN_SEED_PASSWORD:-}" ]; then
  set_env_var "ADMIN_SEED_PASSWORD" "$ADMIN_SEED_PASSWORD" "$ENV_FILE"
else
  warn "Kein ADMIN_SEED_PASSWORD angegeben — Admin-Seed wird übersprungen"
fi

# ----------------------------------------------------------------------------
# 3. Backup-Cron einrichten
# ----------------------------------------------------------------------------
log "Schritt 3/4: Postgres-Backup-Cron einrichten"

if [ ! -f "$BACKUP_SCRIPT_SRC" ]; then
  warn "Backup-Script nicht gefunden unter $BACKUP_SCRIPT_SRC — wird übersprungen"
elif ! command -v crontab &>/dev/null; then
  warn "crontab fehlt — wird übersprungen"
else
  if sudo test -f "$BACKUP_SCRIPT_DEST"; then
    ok "  Backup-Script ist bereits unter $BACKUP_SCRIPT_DEST installiert"
  else
    sudo cp "$BACKUP_SCRIPT_SRC" "$BACKUP_SCRIPT_DEST"
    sudo chmod +x "$BACKUP_SCRIPT_DEST"
    ok "  Backup-Script nach $BACKUP_SCRIPT_DEST kopiert"
  fi

  CRON_LINE="30 3 * * *  $BACKUP_SCRIPT_DEST >> /var/log/fzr_backup.log 2>&1"
  CRON_CURRENT="$(sudo crontab -l 2>/dev/null || true)"
  if echo "$CRON_CURRENT" | grep -qF "$BACKUP_SCRIPT_DEST"; then
    ok "  Cron-Eintrag existiert bereits"
  else
    (echo "$CRON_CURRENT"; echo "$CRON_LINE") | sudo crontab -
    ok "  Cron-Eintrag angelegt (täglich 03:30)"
  fi

  sudo mkdir -p /home/deploy/backups/postgres
  sudo chown deploy:deploy /home/deploy/backups/postgres || true
  sudo touch /var/log/fzr_backup.log
  sudo chmod 644 /var/log/fzr_backup.log

  log "  Teste Backup-Script einmal direkt …"
  if sudo "$BACKUP_SCRIPT_DEST"; then
    ok "  Backup-Testlauf erfolgreich"
    ls -lh /home/deploy/backups/postgres/ | tail -3
  else
    err "  Backup-Testlauf fehlgeschlagen (siehe Output oben)"
  fi
fi

# ----------------------------------------------------------------------------
# 4. Backend neu starten + Admin-Seed + Health-Checks
# ----------------------------------------------------------------------------
log "Schritt 4/4: Backend neu starten und seed'en"

cd "$COMPOSE_DIR"

log "  docker compose up -d backend (re-liest .env)"
docker compose up -d backend

# Warten bis backend ready ist
log "  Warte bis Backend ready …"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sS --max-time 3 http://localhost:8000/health | grep -q '"status":"ok"'; then
    ok "  Backend ist ready"
    break
  fi
  sleep 2
done

if [ -n "${ADMIN_SEED_PASSWORD:-}" ]; then
  log "  Führe Admin-Seed aus …"
  if docker compose exec -T backend python -m app.scripts.seed_admin; then
    ok "  Admin-Seed erfolgreich"
  else
    err "  Admin-Seed fehlgeschlagen"
  fi
else
  warn "  Admin-Seed übersprungen (kein Passwort)"
fi

# ----------------------------------------------------------------------------
# Health-Checks
# ----------------------------------------------------------------------------
log "Abschließende Health-Checks …"

HEALTH="$(curl -sS http://localhost:8000/health 2>/dev/null || echo '')"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "  /health         → ok"
else
  err "  /health         → nicht erreichbar ($HEALTH)"
fi

READY="$(curl -sS http://localhost:8000/health/ready 2>/dev/null || echo '')"
if echo "$READY" | grep -q '"status":"ready"'; then
  ok "  /health/ready   → ready (DB-Verbindung steht)"
else
  err "  /health/ready   → DB unreachable ($READY)"
fi

ORS="$(curl -sS http://localhost:8000/health/ors 2>/dev/null || echo '')"
if echo "$ORS" | grep -q '"live_ok":true'; then
  ok "  /health/ors     → live_ok=true (ORS funktioniert)"
elif echo "$ORS" | grep -q '"configured":true'; then
  warn "  /health/ors     → configured aber live_ok=false ($ORS)"
else
  warn "  /health/ors     → ORS_API_KEY fehlt — Km-Tracking inaktiv"
fi

# ----------------------------------------------------------------------------
# Zusammenfassung
# ----------------------------------------------------------------------------
echo
echo "════════════════════════════════════════════════════════════════════"
ok "Setup abgeschlossen"
echo "════════════════════════════════════════════════════════════════════"
echo
echo "Nächste Schritte:"
echo "  1. Admin-Login im Admin-Web:"
echo "     https://admin.froehlichdienste.de"
echo "     E-Mail:    admin@example.com"
if [ -n "${ADMIN_SEED_PASSWORD:-}" ]; then
  echo "     Passwort:  (das eben gesetzte ADMIN_SEED_PASSWORD)"
else
  echo "     Passwort:  noch nicht gesetzt!"
fi
echo
echo "  2. Unter 'Users' echte Betreuungskräfte anlegen"
echo "     Wichtig: 'patti_person_id' muss gesetzt sein (Patti people.id),"
echo "     sonst sieht der Betreuer in der Mobile-App keine Patienten."
echo
echo "  3. Patti people.id findest du über die Patti-Webapp"
echo "     → /people/X im URL-Bar nach dem Login"
echo
echo "  4. Mobile-App starten und mit dem neuen User einloggen"
echo "════════════════════════════════════════════════════════════════════"
