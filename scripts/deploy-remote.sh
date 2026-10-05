#!/usr/bin/env bash
# deploy-remote.sh — deploy SyncUp to the production server.
#
# Run this from your machine, not the server. The server has no node and only
# ~950 MB of RAM, so the frontend is built here and the dist shipped across.
#
#   bash scripts/deploy-remote.sh                 # dry run — shows the plan
#   bash scripts/deploy-remote.sh --commit        # deploy
#   bash scripts/deploy-remote.sh --commit --with-nginx   # also update nginx
#
# What it guarantees, in order:
#   1. A verified database snapshot exists off-box BEFORE anything changes
#   2. The new code imports under the SERVER's Python before the service is
#      restarted — the server runs 3.9, this machine likely doesn't
#   3. Migrations run via the unit's ExecStartPre, then the live site is
#      verified end to end; any failed check tells you how to roll back
#
# Why not deploy.sh: that one installs nginx.syncup.conf (HTTP, :3210) and
# syncup-backend.service (www-data, :8002). Production is HTTPS/:443 proxying
# to :8000 as ubuntu. Running it there takes the site down.
set -euo pipefail

HOST="${SYNCUP_HOST:-155.248.244.171}"
USER="${SYNCUP_USER:-ubuntu}"
KEY="${SYNCUP_KEY:-$HOME/.ssh/aurocode_syncup.key}"
DOMAIN="${SYNCUP_DOMAIN:-syncup.aurocode.in}"
REMOTE_BACKEND=/opt/apps/syncup/backend
REMOTE_DIST=/opt/apps/syncup/frontend/dist
SERVICE=syncup-backend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$SCRIPT_DIR")"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_BACKUPS="${SYNCUP_BACKUP_DIR:-$REPO/.deploy-backups}"

COMMIT=false
WITH_NGINX=false
for arg in "$@"; do
    case "$arg" in
        --commit)      COMMIT=true ;;
        --with-nginx)  WITH_NGINX=true ;;
    esac
done

log()  { echo "▶ $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 "$USER@$HOST")
remote() { "${SSH[@]}" "$@"; }

echo "═══════════════════════════════════════════════"
echo "  SyncUp → $DOMAIN ($HOST)"
echo "═══════════════════════════════════════════════"

[[ -f "$KEY" ]] || die "SSH key not found: $KEY"
remote 'true' 2>/dev/null || die "Cannot reach $USER@$HOST with $KEY"
ok "SSH reachable."

# ── current state ─────────────────────────────────────────────────────────────
log "Inspecting the server"
remote 'bash -s' <<'EOS' | sed 's/^/    /'
B=/opt/apps/syncup/backend
$B/.venv/bin/python - <<'PY'
import sqlite3
try:
    c = sqlite3.connect("file:/opt/apps/syncup/backend/app.db?mode=ro", uri=True)
    print("revision :", c.execute("SELECT version_num FROM alembic_version").fetchone()[0])
    print("integrity:", c.execute("PRAGMA integrity_check").fetchone()[0])
    print("tasks    :", c.execute("SELECT COUNT(*) FROM tasks").fetchone()[0])
except Exception as e:
    print("database :", e)
PY
echo "python   : $($B/.venv/bin/python -c 'import sys;print(".".join(map(str,sys.version_info[:3])))')"
echo "service  : $(systemctl is-active syncup-backend)"
EOS

if ! $COMMIT; then
    cat <<EOF

Dry run. With --commit this would:
  1. Build the frontend here (the server has no node)
  2. Snapshot the database on the server, verify it, and pull it to
     $LOCAL_BACKUPS/
  3. rsync backend + dist (never app.db, .env, uploads, or WAL sidecars)
  4. pip install -r requirements.txt on the server
  5. Import-check the new code under the server's Python — stops here on failure,
     before the service is touched
  6. Restart $SERVICE (ExecStartPre runs alembic upgrade head)
  7. Verify the live site, and report how to roll back if anything fails
$($WITH_NGINX && echo "  8. Install nginx.production.conf (backed up, nginx -t gated, auto-rollback)")

Re-run with --commit.
EOF
    exit 0
fi

# ── 1. build frontend locally ─────────────────────────────────────────────────
log "Building the frontend"
( cd "$REPO/frontend" && npm run build >/dev/null 2>&1 ) || die "Frontend build failed. Run 'npm run build' in frontend/ to see why."
[[ -f "$REPO/frontend/dist/index.html" ]] || die "Build produced no dist/index.html"
[[ -f "$REPO/frontend/dist/widget.js" ]]  || die "Build produced no dist/widget.js"
[[ -f "$REPO/frontend/dist/vendor/html2canvas.min.js" ]] || \
    die "dist/vendor/html2canvas.min.js missing — the widget would fall back to a CDN"
ok "Frontend built."

# ── 2. verified backup, pulled off-box ────────────────────────────────────────
log "Backing up the database (verified, then copied here)"
mkdir -p "$LOCAL_BACKUPS"
remote "bash -s" <<EOS > /dev/null
set -e
mkdir -p /home/$USER/backups
/opt/apps/syncup/backend/.venv/bin/python - "/home/$USER/backups/predeploy-$STAMP.db" <<'PY'
import sqlite3, sys
dest = sys.argv[1]
src = sqlite3.connect("file:/opt/apps/syncup/backend/app.db?mode=ro", uri=True)
dst = sqlite3.connect(dest)
with dst:
    src.backup(dst)
dst.close(); src.close()
state = sqlite3.connect(dest).execute("PRAGMA integrity_check").fetchone()[0]
if state != "ok":
    raise SystemExit("snapshot failed integrity check: " + state)
PY
gzip -f "/home/$USER/backups/predeploy-$STAMP.db"
EOS
scp -q -i "$KEY" -o BatchMode=yes \
    "$USER@$HOST:/home/$USER/backups/predeploy-$STAMP.db.gz" "$LOCAL_BACKUPS/" \
    || die "Could not pull the backup off the server. Stopping — no backup, no deploy."

# Re-verify the copy that landed here, not the one on the server.
gunzip -kf "$LOCAL_BACKUPS/predeploy-$STAMP.db.gz"
VERIFY=$(python3 - "$LOCAL_BACKUPS/predeploy-$STAMP.db" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
print(c.execute("PRAGMA integrity_check").fetchone()[0])
PY
)
[[ "$VERIFY" == "ok" ]] || die "The backup copy here failed its integrity check. Stopping."
rm -f "$LOCAL_BACKUPS/predeploy-$STAMP.db"
ok "Backup verified on both ends → $LOCAL_BACKUPS/predeploy-$STAMP.db.gz"

# ── 3. sync code ──────────────────────────────────────────────────────────────
# app.db* is a glob on purpose: copying a dev WAL next to the production
# database makes SQLite replay dev pages into it and corrupts it.
log "Syncing backend"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
    --exclude='.venv' --exclude='__pycache__' --exclude='*.pyc' \
    --exclude='.env' \
    --exclude='app.db' --exclude='app.db-wal' --exclude='app.db-shm' \
    --exclude='app.db.replaced-*' --exclude='*.sqlite' --exclude='*.sqlite3' \
    --exclude='uploads' \
    "$REPO/backend/" "$USER@$HOST:$REMOTE_BACKEND/"

log "Syncing frontend"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
    "$REPO/frontend/dist/" "$USER@$HOST:$REMOTE_DIST/"

# A WAL beside a *running* service is normal and holds committed transactions.
# It is only suspicious when nothing is holding the database — that is the
# signature of a sidecar copied in from another machine.
STRAY=$(remote "ls $REMOTE_BACKEND/app.db-wal 2>/dev/null | wc -l")
RUNNING=$(remote "systemctl is-active $SERVICE" || true)
if [[ "$STRAY" != "0" && "$RUNNING" != "active" ]]; then
    warn "A WAL file exists but $SERVICE is stopped. If it came from another machine it will corrupt the database."
    warn "Check: ssh ... '$REMOTE_BACKEND/.venv/bin/python -c \"import sqlite3;print(sqlite3.connect(\\\"$REMOTE_BACKEND/app.db\\\").execute(\\\"PRAGMA integrity_check\\\").fetchone())\"'"
fi
ok "Code synced."

# ── 4. dependencies ───────────────────────────────────────────────────────────
log "Installing Python dependencies"
remote "$REMOTE_BACKEND/.venv/bin/pip install --quiet -r $REMOTE_BACKEND/requirements.txt" \
    || die "pip install failed on the server."
ok "Dependencies installed."

# ── 5. import check BEFORE restarting ─────────────────────────────────────────
# The server runs an older Python than most dev machines. Catching a syntax or
# typing incompatibility here costs nothing; catching it after the restart is
# an outage.
log "Import-checking the new code under the server's Python"
IMPORT_OUT=$(remote "cd $REMOTE_BACKEND && $REMOTE_BACKEND/.venv/bin/python -c '
import app.main
from app.config import settings
problems = settings.check_production_safety()
print(\"IMPORT_OK\" if not problems else \"GUARD_FAIL: \" + \" | \".join(problems))
'" 2>&1) || die "New code does NOT import on the server. Service untouched, site still up.
$IMPORT_OUT"
[[ "$IMPORT_OUT" == *IMPORT_OK* ]] || die "Startup guards would block the boot. Service untouched, site still up.
$IMPORT_OUT"
ok "Code imports and passes the startup guards."

# ── 6. nginx (optional) ───────────────────────────────────────────────────────
if $WITH_NGINX; then
    log "Installing nginx config"
    scp -q -i "$KEY" -o BatchMode=yes "$REPO/nginx.production.conf" "$USER@$HOST:/tmp/syncup.nginx"
    remote 'bash -s' <<'EOS' | sed 's/^/    /'
set -e
CONF=/etc/nginx/sites-available/syncup
BAK=$CONF.bak-$(date +%Y%m%d-%H%M%S)
sudo cp $CONF $BAK
sudo cp /tmp/syncup.nginx $CONF

# Capture the real output first. Testing again after the rollback would report
# on the restored config and hide the actual error.
TEST_OUT=$(sudo nginx -t 2>&1) && TEST_RC=0 || TEST_RC=$?
if [[ $TEST_RC -eq 0 ]]; then
    sudo systemctl reload nginx
    echo "nginx updated and reloaded (previous config at $BAK)"
else
    sudo cp "$BAK" "$CONF"
    echo "nginx -t FAILED — rolled back, nothing changed. Error was:"
    echo "$TEST_OUT" | grep -E "emerg|warn|error" | sed 's/^/  /'
    exit 1
fi
EOS
    ok "nginx updated."
fi

# ── 7. restart + migrate ──────────────────────────────────────────────────────
log "Restarting $SERVICE (migrations run via ExecStartPre)"
remote "sudo systemctl restart $SERVICE"
sleep 6
remote "systemctl is-active $SERVICE" | grep -q active || {
    remote "sudo journalctl -u $SERVICE -n 30 --no-pager" | tail -20
    die "Service failed to start. Roll back with:
  gunzip -c $LOCAL_BACKUPS/predeploy-$STAMP.db.gz > /tmp/restore.db
  scp -i $KEY /tmp/restore.db $USER@$HOST:/tmp/
  ssh -i $KEY $USER@$HOST 'sudo systemctl stop $SERVICE && \\
      sudo mv $REMOTE_BACKEND/app.db $REMOTE_BACKEND/app.db.failed && \\
      sudo rm -f $REMOTE_BACKEND/app.db-wal $REMOTE_BACKEND/app.db-shm && \\
      sudo cp /tmp/restore.db $REMOTE_BACKEND/app.db && \\
      sudo chown $USER:$USER $REMOTE_BACKEND/app.db && \\
      sudo systemctl start $SERVICE'"
}
ok "Service running."

remote 'bash -s' <<'EOS' | sed 's/^/    /'
/opt/apps/syncup/backend/.venv/bin/python - <<'PY'
import sqlite3
c = sqlite3.connect("file:/opt/apps/syncup/backend/app.db?mode=ro", uri=True)
print("revision :", c.execute("SELECT version_num FROM alembic_version").fetchone()[0])
print("integrity:", c.execute("PRAGMA integrity_check").fetchone()[0])
print("journal  :", c.execute("PRAGMA journal_mode").fetchone()[0])
print("tasks    :", c.execute("SELECT COUNT(*) FROM tasks").fetchone()[0])
PY
EOS

# ── 8. verify the live site ───────────────────────────────────────────────────
log "Verifying https://$DOMAIN"
FAILED=0
check() {
    local label="$1" got="$2" want="$3"
    if [[ "$got" == "$want" ]]; then echo "    ✓ $label"
    else echo "    ✗ $label (got '$got', wanted '$want')"; FAILED=$((FAILED+1)); fi
}
# Header checks assert "present exactly once": zero means missing, more than
# one means nginx and the app are both emitting it and could disagree.
BAD_LOGIN=$(mktemp); printf '{"username":"__deploycheck__","password":"__nope__"}' > "$BAD_LOGIN"

check "site serving"        "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/")" "200"
# "/" must be the marketing page, and every other path must still reach the
# SPA — otherwise client magic links and report links break.
check "landing on /"        "$(curl -s --max-time 15 "https://$DOMAIN/" | grep -c 'data-app-cta')" "3"
# Guards against shipping the wrong landing design: the primary page is the
# aurora one, identified by its ambient backdrop element.
check "primary design live" "$(curl -s --max-time 15 "https://$DOMAIN/" | grep -c 'class="aurora"')" "1"
check "app on /login"       "$(curl -s --max-time 15 "https://$DOMAIN/login" | grep -c 'id="root"')" "1"
check "app on /dashboard"   "$(curl -s --max-time 15 "https://$DOMAIN/dashboard" | grep -c 'id="root"')" "1"
check "magic links intact"  "$(curl -s --max-time 15 "https://$DOMAIN/go/sometoken" | grep -c 'id="root"')" "1"
check "report links intact" "$(curl -s --max-time 15 "https://$DOMAIN/r/sometoken" | grep -c 'id="root"')" "1"
check "TLS certificate"     "$(curl -s -o /dev/null -w '%{ssl_verify_result}' --max-time 15 "https://$DOMAIN/")" "0"
check "api health"          "$(curl -s --max-time 15 "https://$DOMAIN/api/health" | grep -o ok)" "ok"
check "healthz + database"  "$(curl -s --max-time 15 "https://$DOMAIN/healthz" | grep -o '\"database\":\"ok\"')" '"database":"ok"'
check "widget.js"           "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/widget.js")" "200"
check "html2canvas local"   "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/vendor/html2canvas.min.js")" "200"
check "no CDN in widget"    "$(curl -s --max-time 15 "https://$DOMAIN/widget.js" | grep -c jsdelivr)" "0"
check "login rejects bad"   "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "https://$DOMAIN/api/auth/login" -H 'Content-Type: application/json' --data @"$BAD_LOGIN")" "401"
check "nosniff header"      "$(curl -sI --max-time 15 "https://$DOMAIN/api/health" | grep -ci 'x-content-type-options')" "1"
check "HSTS header"         "$(curl -sI --max-time 15 "https://$DOMAIN/api/health" | grep -ci 'strict-transport-security')" "1"
rm -f "$BAD_LOGIN"

if (( FAILED > 0 )); then
    echo
    die "$FAILED check(s) failed. The backup is at $LOCAL_BACKUPS/predeploy-$STAMP.db.gz
Logs: ssh -i $KEY $USER@$HOST 'sudo journalctl -u $SERVICE -n 50'"
fi

echo
echo "═══════════════════════════════════════════════"
echo "  Deployed — https://$DOMAIN"
echo "  Backup:  $LOCAL_BACKUPS/predeploy-$STAMP.db.gz"
echo "═══════════════════════════════════════════════"
