#!/usr/bin/env bash
# deploy.sh — Build and deploy Syncup (frontend + backend + Nginx + systemd)
# Usage: sudo bash deploy.sh [--skip-build] [--skip-nginx] [--skip-service]
set -euo pipefail

# ── resolve the real user's npm (works when invoked via sudo) ──────────────────
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)

# Load nvm if available so npm/node are on PATH
if [[ -s "$REAL_HOME/.nvm/nvm.sh" ]]; then
    export NVM_DIR="$REAL_HOME/.nvm"
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh" --no-use
    # Put the current nvm node on PATH
    NVM_NODE=$(su - "$REAL_USER" -c 'source "$HOME/.nvm/nvm.sh" --no-use 2>/dev/null; nvm which current 2>/dev/null || true' 2>/dev/null || true)
    if [[ -n "$NVM_NODE" ]]; then
        export PATH="$(dirname "$NVM_NODE"):$PATH"
    fi
fi

# Fall back: search common locations for npm
if ! command -v npm &>/dev/null; then
    for candidate in \
        "$REAL_HOME/.nvm/versions/node"/*/bin \
        /usr/local/bin /usr/bin; do
        if [[ -x "$candidate/npm" ]]; then
            export PATH="$candidate:$PATH"
            break
        fi
    done
fi

NPM_BIN=$(command -v npm 2>/dev/null) || { echo "✗ npm not found — install Node.js via nvm then re-run" >&2; exit 1; }

# ── paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_SRC="$SCRIPT_DIR/frontend"
BACKEND_SRC="$SCRIPT_DIR/backend"

DEPLOY_ROOT="/opt/apps/syncup"
FRONTEND_DIST="$DEPLOY_ROOT/frontend/dist"
BACKEND_DEST="$DEPLOY_ROOT/backend"

SERVICE_NAME="syncup-backend"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NGINX_CONF="/etc/nginx/sites-available/syncup"
NGINX_ENABLED="/etc/nginx/sites-enabled/syncup"

# ── flags ──────────────────────────────────────────────────────────────────────
SKIP_BUILD=false
SKIP_NGINX=false
SKIP_SERVICE=false

for arg in "$@"; do
    case $arg in
        --skip-build)   SKIP_BUILD=true ;;
        --skip-nginx)   SKIP_NGINX=true ;;
        --skip-service) SKIP_SERVICE=true ;;
    esac
done

# ── helpers ────────────────────────────────────────────────────────────────────
log()  { echo "▶ $*"; }
ok()   { echo "✓ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

require_root() {
    [[ $EUID -eq 0 ]] || die "Run this script with sudo: sudo bash deploy.sh"
}

# ── 1. build frontend ──────────────────────────────────────────────────────────
build_frontend() {
    log "Building React frontend… (npm: $NPM_BIN)"
    cd "$FRONTEND_SRC"

    # Run npm as the real user so nvm/node_modules ownership stays correct
    run_as_user() { sudo -u "$REAL_USER" env PATH="$PATH" "$@"; }

    if [[ ! -d node_modules ]]; then
        log "Installing npm dependencies…"
        run_as_user "$NPM_BIN" ci --prefer-offline
    fi

    run_as_user "$NPM_BIN" run build
    ok "Frontend build complete → $FRONTEND_SRC/dist"
}

# ── 2. deploy frontend dist ────────────────────────────────────────────────────
deploy_frontend() {
    log "Deploying frontend dist → $FRONTEND_DIST"
    mkdir -p "$FRONTEND_DIST"
    # Wipe old dist so stale hashed chunks don't accumulate
    rm -rf "${FRONTEND_DIST:?}"/*
    cp -r "$FRONTEND_SRC/dist/." "$FRONTEND_DIST/"
    chown -R www-data:www-data "$DEPLOY_ROOT/frontend"
    ok "Frontend deployed."
}

# ── 3. deploy backend ──────────────────────────────────────────────────────────
deploy_backend() {
    log "Deploying backend → $BACKEND_DEST"
    mkdir -p "$BACKEND_DEST"

    # Sync source (exclude dev-only dirs)
    rsync -a --delete \
        --exclude='.venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.env' \
        --exclude='app.db' \
        --exclude='uploads' \
        "$BACKEND_SRC/" "$BACKEND_DEST/"

    # Create / update virtualenv
    if [[ ! -x "$BACKEND_DEST/.venv/bin/python" ]]; then
        log "Creating Python virtualenv…"
        python3 -m venv "$BACKEND_DEST/.venv"
    fi

    log "Installing Python dependencies…"
    "$BACKEND_DEST/.venv/bin/pip" install --quiet --upgrade pip
    "$BACKEND_DEST/.venv/bin/pip" install --quiet -r "$BACKEND_DEST/requirements.txt"

    # Create .env from example if it doesn't exist yet
    if [[ ! -f "$BACKEND_DEST/.env" ]]; then
        log "Creating default .env (edit $BACKEND_DEST/.env to set production values)"
        cp "$BACKEND_DEST/.env.example" "$BACKEND_DEST/.env"
        # Generate a random SECRET_KEY automatically
        SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
        sed -i "s|change-me-in-production|$SECRET|" "$BACKEND_DEST/.env"
    fi

    # Ensure uploads dir exists and is writable by the service user
    mkdir -p "$BACKEND_DEST/uploads"
    chown -R www-data:www-data "$BACKEND_DEST"
    ok "Backend deployed."
}

# ── 4. install systemd service ─────────────────────────────────────────────────
install_service() {
    log "Installing systemd service → $SERVICE_FILE"
    cp "$SCRIPT_DIR/syncup-backend.service" "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    systemctl restart "$SERVICE_NAME"
    ok "Service $SERVICE_NAME started."
}

# ── 5. configure Nginx ─────────────────────────────────────────────────────────
configure_nginx() {
    log "Installing Nginx config → $NGINX_CONF"
    cp "$SCRIPT_DIR/nginx.syncup.conf" "$NGINX_CONF"

    # Enable site
    ln -sf "$NGINX_CONF" "$NGINX_ENABLED"

    # Disable default site if it exists (avoids port-80 conflict)
    if [[ -L /etc/nginx/sites-enabled/default ]]; then
        rm /etc/nginx/sites-enabled/default
        log "Removed default Nginx site."
    fi

    nginx -t || die "Nginx config test failed — fix errors before reloading."
    if systemctl is-active --quiet nginx; then
        systemctl reload nginx
    else
        systemctl start nginx
    fi
    ok "Nginx configured and reloaded."
}

# ── 6. smoke test ──────────────────────────────────────────────────────────────
smoke_test() {
    log "Running smoke test…"
    sleep 2  # give uvicorn a moment to finish startup

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8002/api/health || true)
    if [[ "$HTTP_CODE" == "200" ]]; then
        ok "Backend health check passed (HTTP 200)."
    else
        echo "⚠ Backend health check returned HTTP $HTTP_CODE — check: journalctl -u $SERVICE_NAME -n 50"
    fi

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3210/ || true)
    if [[ "$HTTP_CODE" == "200" ]]; then
        ok "Frontend health check passed (HTTP 200)."
    else
        echo "⚠ Frontend returned HTTP $HTTP_CODE — check: nginx -t && journalctl -u nginx"
    fi
}

# ── main ───────────────────────────────────────────────────────────────────────
require_root

echo "═══════════════════════════════════════════════"
echo "  Syncup Deploy  —  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════"

if [[ "$SKIP_BUILD" == false ]]; then
    build_frontend
fi

deploy_frontend
deploy_backend

if [[ "$SKIP_SERVICE" == false ]]; then
    install_service
fi

if [[ "$SKIP_NGINX" == false ]]; then
    configure_nginx
fi

smoke_test

echo ""
echo "═══════════════════════════════════════════════"
echo "  Deploy complete!"
echo "  Backend logs : journalctl -u $SERVICE_NAME -f"
echo "  Nginx logs   : tail -f /var/log/nginx/error.log"
echo "  .env path    : $BACKEND_DEST/.env"
echo "═══════════════════════════════════════════════"
