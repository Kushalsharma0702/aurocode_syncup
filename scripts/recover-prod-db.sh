#!/usr/bin/env bash
# recover-prod-db.sh — rebuild the production database after WAL contamination.
#
# Context: a deploy copied a development WAL file next to the production
# database, and SQLite replayed those pages into it. The result is corrupt and
# partly contains another database's rows, so it cannot be repaired in place —
# the surviving pages are a mix of two databases and there is no way to tell
# every row apart.
#
# This script preserves the damaged file for inspection, then builds a clean
# database at the current schema revision. It does NOT invent data: whatever
# production held is gone, and you create the admin account afterwards.
#
#   sudo bash scripts/recover-prod-db.sh            # show what it would do
#   sudo bash scripts/recover-prod-db.sh --commit   # actually do it
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/opt/apps/syncup/backend}"
SERVICE="${SERVICE:-syncup-backend}"
FORENSICS="${FORENSICS:-/var/backups/syncup/corrupted-$(date +%Y%m%d-%H%M%S)}"
COMMIT=false
[[ "${1:-}" == "--commit" ]] && COMMIT=true

log() { echo "▶ $*"; }
ok()  { echo "✓ $*"; }
die() { echo "✗ $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run with sudo."
[[ -d "$BACKEND_DIR" ]] || die "Backend not found at $BACKEND_DIR"

DB="$BACKEND_DIR/app.db"

echo "═══════════════════════════════════════════════"
echo "  Production database recovery"
echo "═══════════════════════════════════════════════"

if [[ -f "$DB" ]]; then
    STATE=$(sqlite3 "$DB" "PRAGMA integrity_check;" 2>&1 | head -1)
    log "Current database: $STATE"
    if [[ "$STATE" == "ok" ]]; then
        echo
        echo "The database reports as healthy. Nothing to recover."
        echo "If you still want to rebuild it, move it aside manually first."
        exit 0
    fi
else
    log "No database present — a fresh one will be created."
fi

if ! $COMMIT; then
    echo
    echo "Dry run. With --commit this would:"
    echo "  1. Stop $SERVICE"
    echo "  2. Move app.db and any sidecars to $FORENSICS/"
    echo "  3. Run 'alembic upgrade head' to build a clean database"
    echo "  4. Hand it to www-data and start $SERVICE"
    echo "  5. Leave you to run scripts/create_admin.py"
    echo
    echo "Re-run with --commit when ready."
    exit 0
fi

log "Stopping $SERVICE"
systemctl stop "$SERVICE" || true
# The service can take a moment to release its file handles.
for _ in $(seq 1 10); do
    fuser -s "$DB" 2>/dev/null || break
    sleep 1
done

log "Preserving the damaged files in $FORENSICS"
mkdir -p "$FORENSICS"
for f in "$DB" "$DB-wal" "$DB-shm"; do
    [[ -e "$f" ]] && mv "$f" "$FORENSICS/" && echo "    moved $(basename "$f")"
done
ok "Damaged files preserved (not deleted)."

log "Building a clean database at the current schema revision"
cd "$BACKEND_DIR"
sudo -u www-data "$BACKEND_DIR/.venv/bin/alembic" upgrade head

CHECK=$(sudo -u www-data sqlite3 "$DB" "PRAGMA integrity_check;")
[[ "$CHECK" == "ok" ]] || die "Freshly built database failed its integrity check ($CHECK)."
REV=$(sudo -u www-data sqlite3 "$DB" "SELECT version_num FROM alembic_version;")
ok "Clean database built at revision $REV."

chown www-data:www-data "$DB"
chmod 640 "$DB"

log "Starting $SERVICE"
systemctl start "$SERVICE"
sleep 3

HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8002/healthz || true)
if [[ "$HTTP" == "200" ]]; then
    ok "Backend healthy."
else
    echo "⚠ Backend returned HTTP $HTTP — check: journalctl -u $SERVICE -n 50"
fi

echo
echo "═══════════════════════════════════════════════"
echo "  Recovery complete — the database is empty."
echo
echo "  Create your admin account:"
echo "    cd $BACKEND_DIR"
echo "    sudo -u www-data .venv/bin/python scripts/create_admin.py"
echo
echo "  Damaged files kept at: $FORENSICS"
echo "═══════════════════════════════════════════════"
