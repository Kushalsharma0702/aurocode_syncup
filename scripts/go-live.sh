#!/usr/bin/env bash
# go-live.sh — take SyncUp from the current half-deployed state to live.
#
# Does, in order:
#   1. Fixes the production .env so the new startup guards pass
#   2. Moves the WAL-corrupted database aside (preserved, not deleted)
#   3. Runs deploy.sh, which rebuilds the schema and restarts everything
#   4. Verifies the result end to end
#   5. Offers to create your admin account
#
#   sudo bash scripts/go-live.sh            # dry run — prints the plan
#   sudo bash scripts/go-live.sh --commit   # do it
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DEST="${BACKEND_DEST:-/opt/apps/syncup/backend}"
SERVICE="${SERVICE:-syncup-backend}"
ENV_FILE="$BACKEND_DEST/.env"
APP_PORT="${APP_PORT:-3210}"

COMMIT=false
[[ "${1:-}" == "--commit" ]] && COMMIT=true

log()  { echo "▶ $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run with sudo: sudo bash scripts/go-live.sh --commit"
[[ -f "$ENV_FILE" ]] || die "No .env at $ENV_FILE"
[[ -f "$REPO_DIR/deploy.sh" ]] || die "deploy.sh not found next to this script"

echo "═══════════════════════════════════════════════"
echo "  SyncUp — go live"
echo "═══════════════════════════════════════════════"

# ── 1. what needs changing in .env ────────────────────────────────────────────
NEEDS_ENV=false
grep -q '^ENV=production' "$ENV_FILE" || NEEDS_ENV=true
grep -q 'REPLACE_WITH' "$ENV_FILE" && NEEDS_ENV=true

DB="$BACKEND_DEST/app.db"
DB_STATE="absent"
if [[ -f "$DB" ]]; then
    DB_STATE=$(sqlite3 "$DB" "PRAGMA integrity_check;" 2>&1 | head -1)
fi

log "Current state"
echo "    ENV=production set : $(grep -q '^ENV=production' "$ENV_FILE" && echo yes || echo no)"
echo "    CORS placeholder   : $(grep -q 'REPLACE_WITH' "$ENV_FILE" && echo 'present (blocks boot)' || echo clean)"
echo "    database           : $DB_STATE"
echo "    service            : $(systemctl is-active "$SERVICE" 2>/dev/null || echo inactive)"

if ! $COMMIT; then
    echo
    echo "Dry run. With --commit this would:"
    $NEEDS_ENV && echo "  • Set ENV=production, drop the CORS placeholder, shorten the token lifetime"
    [[ "$DB_STATE" != "ok" && "$DB_STATE" != "absent" ]] && \
        echo "  • Move the corrupted database to /var/backups/syncup/corrupted-* and rebuild it"
    echo "  • Run deploy.sh (build, sync, migrate, restart, reload nginx)"
    echo "  • Verify health, widget delivery and security headers"
    echo "  • Offer to create an admin account"
    echo
    echo "Re-run with --commit when ready."
    exit 0
fi

# ── 2. fix .env ───────────────────────────────────────────────────────────────
if $NEEDS_ENV; then
    BACKUP="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
    cp "$ENV_FILE" "$BACKUP"
    log "Backed up .env → $BACKUP"

    # Drop placeholder entries from the CORS list without disturbing real ones.
    if grep -q 'REPLACE_WITH' "$ENV_FILE"; then
        python3 - "$ENV_FILE" <<'PY'
import sys
path = sys.argv[1]
out = []
for line in open(path):
    if line.startswith("CORS_ORIGINS="):
        key, _, value = line.partition("=")
        keep = [o.strip() for o in value.strip().split(",")
                if o.strip() and "REPLACE_WITH" not in o]
        line = f"{key}={','.join(keep)}\n"
    out.append(line)
open(path, "w").writelines(out)
PY
        ok "Removed the CORS placeholder."
    fi

    grep -q '^ENV=' "$ENV_FILE" \
        && sed -i 's|^ENV=.*|ENV=production|' "$ENV_FILE" \
        || sed -i '1i ENV=production' "$ENV_FILE"

    # 8 hours, matching the new default.
    grep -q '^ACCESS_TOKEN_EXPIRE_MINUTES=' "$ENV_FILE" \
        && sed -i 's|^ACCESS_TOKEN_EXPIRE_MINUTES=.*|ACCESS_TOKEN_EXPIRE_MINUTES=480|' "$ENV_FILE"

    chown www-data:www-data "$ENV_FILE"
    chmod 640 "$ENV_FILE"
    ok "Production environment configured."
fi

# Confirm the app would actually accept this config before we restart anything.
log "Validating configuration against the startup guards"
VALIDATION=$(cd "$BACKEND_DEST" && sudo -u www-data "$BACKEND_DEST/.venv/bin/python" -c "
from app.config import Settings
problems = Settings().check_production_safety()
print('OK' if not problems else ' | '.join(problems))
" 2>&1 | tail -1)
[[ "$VALIDATION" == "OK" ]] || die "Config still blocks startup: $VALIDATION"
ok "Configuration passes."

# ── 3. corrupted database out of the way ──────────────────────────────────────
if [[ "$DB_STATE" != "ok" && "$DB_STATE" != "absent" ]]; then
    FORENSICS="/var/backups/syncup/corrupted-$(date +%Y%m%d-%H%M%S)"
    log "Database is damaged — preserving it in $FORENSICS"
    systemctl stop "$SERVICE" || true
    for _ in $(seq 1 10); do fuser -s "$DB" 2>/dev/null || break; sleep 1; done
    mkdir -p "$FORENSICS"
    for f in "$DB" "$DB-wal" "$DB-shm"; do
        [[ -e "$f" ]] && mv "$f" "$FORENSICS/" && echo "    moved $(basename "$f")"
    done
    ok "Preserved. deploy.sh will build a clean schema."
elif [[ "$DB_STATE" == "ok" ]]; then
    ok "Database is healthy — leaving it alone."
fi

# ── 4. deploy ─────────────────────────────────────────────────────────────────
log "Running deploy.sh"
echo "───────────────────────────────────────────────"
bash "$REPO_DIR/deploy.sh"
echo "───────────────────────────────────────────────"

# ── 5. verify ─────────────────────────────────────────────────────────────────
log "Verifying"
FAILED=0
check() {
    local label="$1" got="$2" want="$3"
    if [[ "$got" == "$want" ]]; then
        echo "    ✓ $label"
    else
        echo "    ✗ $label (got '$got', wanted '$want')"
        FAILED=$((FAILED + 1))
    fi
}

sleep 2
check "backend health"        "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8002/healthz)" "200"
check "database reachable"    "$(curl -s http://127.0.0.1:8002/healthz | grep -o '\"database\":\"ok\"' || echo missing)" '"database":"ok"'
check "frontend served"       "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT/)" "200"
check "widget.js reachable"   "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT/widget.js)" "200"
check "html2canvas self-hosted" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT/vendor/html2canvas.min.js)" "200"
check "no CDN in widget"      "$(curl -s http://127.0.0.1:$APP_PORT/widget.js | grep -c jsdelivr || true)" "0"
check "nosniff header"        "$(curl -s -D- -o /dev/null http://127.0.0.1:$APP_PORT/ | grep -ci 'x-content-type-options')" "1"
check "schema at head"        "$(sudo -u www-data sqlite3 "$DB" 'SELECT version_num FROM alembic_version;' 2>/dev/null)" "0006"
check "database integrity"    "$(sudo -u www-data sqlite3 "$DB" 'PRAGMA integrity_check;' 2>/dev/null)" "ok"
check "WAL mode on"           "$(sudo -u www-data sqlite3 "$DB" 'PRAGMA journal_mode;' 2>/dev/null)" "wal"
check "login rejects garbage" "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:$APP_PORT/api/auth/login -H 'Content-Type: application/json' -d '{\"username\":\"nobody\",\"password\":\"nope\"}')" "401"

if (( FAILED > 0 )); then
    echo
    die "$FAILED check(s) failed. Inspect: journalctl -u $SERVICE -n 50"
fi
ok "All checks passed."

# ── 6. admin account ──────────────────────────────────────────────────────────
USER_COUNT=$(sudo -u www-data sqlite3 "$DB" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo 0)
echo
echo "═══════════════════════════════════════════════"
echo "  SyncUp is live on http://localhost:$APP_PORT"
echo "═══════════════════════════════════════════════"

if [[ "$USER_COUNT" == "0" ]]; then
    echo
    echo "The database has no accounts yet. Creating your admin now."
    echo "(Password is typed at a prompt, so it stays out of your shell history.)"
    echo
    cd "$BACKEND_DEST"
    sudo -u www-data "$BACKEND_DEST/.venv/bin/python" scripts/create_admin.py || {
        warn "Admin creation was cancelled. Run it later with:"
        echo "    cd $BACKEND_DEST && sudo -u www-data .venv/bin/python scripts/create_admin.py"
    }
else
    echo "  $USER_COUNT account(s) already present — skipping admin creation."
fi

cat <<EOF

Still worth doing:
  • Email       — set SMTP_* in $ENV_FILE, or no notification ever leaves the app
  • Backups     — crontab: 15 2 * * * RCLONE_REMOTE=<remote> /bin/bash $REPO_DIR/scripts/backup.sh >> /var/log/syncup-backup.log 2>&1
  • Disk alert  — crontab: 0 * * * * /bin/bash $REPO_DIR/scripts/disk-check.sh >> /var/log/syncup-backup.log 2>&1
  • Logrotate   — cp $REPO_DIR/ops/syncup.logrotate /etc/logrotate.d/syncup
  • HTTPS       — this is HTTP on :$APP_PORT. Before any real client touches it,
                  point a domain here, run certbot, and uncomment the TLS block
                  in nginx.syncup.conf plus the HSTS header.
EOF
