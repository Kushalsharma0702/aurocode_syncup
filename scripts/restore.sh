#!/usr/bin/env bash
# restore.sh — restore a SyncUp snapshot taken by backup.sh.
#
# An untested backup isn't a backup. Run this against a scratch directory
# before you need it for real:
#
#   sudo bash scripts/restore.sh /var/backups/syncup/app-20261005-021500.db.gz --dry-run
#
# For a real restore:
#   sudo systemctl stop syncup-backend
#   sudo bash scripts/restore.sh /var/backups/syncup/app-<stamp>.db.gz
#   sudo systemctl start syncup-backend
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/opt/apps/syncup/backend}"
SNAPSHOT="${1:-}"
DRY_RUN=false
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

log() { echo "[restore] $*"; }
die() { echo "[restore] ERROR: $*" >&2; exit 1; }

[[ -n "$SNAPSHOT" ]] || die "usage: restore.sh <snapshot.db.gz> [--dry-run]"
[[ -f "$SNAPSHOT" ]] || die "snapshot not found: $SNAPSHOT"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

log "Decompressing $SNAPSHOT"
gunzip -c "$SNAPSHOT" > "$WORK/restored.db"

log "Checking integrity"
INTEGRITY=$(sqlite3 "$WORK/restored.db" "PRAGMA integrity_check;")
[[ "$INTEGRITY" == "ok" ]] || die "snapshot is corrupt: $INTEGRITY"

USERS=$(sqlite3 "$WORK/restored.db" "SELECT COUNT(*) FROM users;")
PROJECTS=$(sqlite3 "$WORK/restored.db" "SELECT COUNT(*) FROM projects;")
TASKS=$(sqlite3 "$WORK/restored.db" "SELECT COUNT(*) FROM tasks;")
REVISION=$(sqlite3 "$WORK/restored.db" "SELECT version_num FROM alembic_version;" 2>/dev/null || echo "unknown")
log "Snapshot contents: $USERS users, $PROJECTS projects, $TASKS tasks, schema $REVISION"

if $DRY_RUN; then
    log "Dry run — snapshot is valid and restorable. Nothing was changed."
    exit 0
fi

if systemctl is-active --quiet syncup-backend; then
    die "syncup-backend is still running. Stop it first: sudo systemctl stop syncup-backend"
fi

if [[ -f "$BACKEND_DIR/app.db" ]]; then
    ASIDE="$BACKEND_DIR/app.db.replaced-$(date +%Y%m%d-%H%M%S)"
    log "Moving current database aside → $ASIDE"
    mv "$BACKEND_DIR/app.db" "$ASIDE"
    # WAL sidecars belong to the old database; leaving them corrupts the new one.
    rm -f "$BACKEND_DIR/app.db-wal" "$BACKEND_DIR/app.db-shm"
fi

cp "$WORK/restored.db" "$BACKEND_DIR/app.db"
chown www-data:www-data "$BACKEND_DIR/app.db"
log "Restored. Start the service: sudo systemctl start syncup-backend"
