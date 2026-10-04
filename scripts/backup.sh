#!/usr/bin/env bash
# backup.sh — snapshot the SyncUp database and uploads, then prune old copies.
#
# Uses `sqlite3 .backup`, not `cp`: it takes a consistent snapshot while the
# app is mid-write, which a file copy of a WAL-mode database does not.
#
#   sudo bash scripts/backup.sh                 # local snapshot only
#   RCLONE_REMOTE=r2:syncup-backups sudo -E bash scripts/backup.sh   # + off-box
#
# Install as a nightly cron job:
#   sudo crontab -e
#   15 2 * * * RCLONE_REMOTE=r2:syncup-backups /bin/bash /opt/apps/syncup/scripts/backup.sh >> /var/log/syncup-backup.log 2>&1
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/opt/apps/syncup/backend}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/syncup}"
KEEP_DAYS="${KEEP_DAYS:-14}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

DB_PATH="$BACKEND_DIR/app.db"
UPLOADS_DIR="$BACKEND_DIR/uploads"
STAMP=$(date +%Y%m%d-%H%M%S)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; exit 1; }

command -v sqlite3 >/dev/null || die "sqlite3 not installed (apt-get install sqlite3)"
[[ -f "$DB_PATH" ]] || die "database not found at $DB_PATH"

mkdir -p "$BACKUP_DIR"

# ---- database ----
DB_OUT="$BACKUP_DIR/app-$STAMP.db"
log "Snapshotting database → $DB_OUT"
sqlite3 "$DB_PATH" ".backup '$DB_OUT'"
# Fail loudly if the snapshot is corrupt — a backup you can't restore is worse
# than none, because you'll trust it.
INTEGRITY=$(sqlite3 "$DB_OUT" "PRAGMA integrity_check;")
[[ "$INTEGRITY" == "ok" ]] || die "snapshot failed integrity check: $INTEGRITY"
gzip -f "$DB_OUT"
log "Database snapshot verified and compressed ($(du -h "$DB_OUT.gz" | cut -f1))"

# ---- uploads ----
if [[ -d "$UPLOADS_DIR" ]]; then
    UP_OUT="$BACKUP_DIR/uploads-$STAMP.tar.gz"
    log "Archiving uploads → $UP_OUT"
    tar -czf "$UP_OUT" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
    log "Uploads archived ($(du -h "$UP_OUT" | cut -f1))"
fi

# ---- off-box copy ----
# A backup on the same disk as the database does not survive the failure it
# exists for.
if [[ -n "$RCLONE_REMOTE" ]]; then
    if command -v rclone >/dev/null; then
        log "Copying to $RCLONE_REMOTE"
        rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include "*-$STAMP.*" \
            && log "Off-box copy complete" \
            || log "WARNING: off-box copy failed — local snapshot is still good"
    else
        log "WARNING: RCLONE_REMOTE set but rclone is not installed — local only"
    fi
else
    log "WARNING: RCLONE_REMOTE unset — this backup lives on the same disk as the database"
fi

# ---- prune ----
log "Pruning snapshots older than $KEEP_DAYS days"
find "$BACKUP_DIR" -name 'app-*.db.gz' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

log "Backup complete: $STAMP"
