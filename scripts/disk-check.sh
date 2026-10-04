#!/usr/bin/env bash
# disk-check.sh — warn before uploads fill the disk.
#
# Screenshots land on local disk, so this is a real failure mode: a full disk
# takes the database down with it, since SQLite can't write either.
#
# Hourly cron:
#   0 * * * * /bin/bash /opt/apps/syncup/scripts/disk-check.sh >> /var/log/syncup-backup.log 2>&1
set -euo pipefail

THRESHOLD="${DISK_THRESHOLD:-80}"
BACKEND_DIR="${BACKEND_DIR:-/opt/apps/syncup/backend}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

USED=$(df --output=pcent "$BACKEND_DIR" | tail -1 | tr -dc '0-9')
UPLOADS_SIZE=$(du -sh "$BACKEND_DIR/uploads" 2>/dev/null | cut -f1 || echo "n/a")
UPLOAD_COUNT=$(find "$BACKEND_DIR/uploads" -type f 2>/dev/null | wc -l || echo 0)

STAMP=$(date '+%Y-%m-%d %H:%M:%S')
LINE="[$STAMP] disk ${USED}% used · uploads ${UPLOADS_SIZE} across ${UPLOAD_COUNT} files"

if (( USED >= THRESHOLD )); then
    MSG="SyncUp disk alert: ${USED}% used (threshold ${THRESHOLD}%). Uploads: ${UPLOADS_SIZE} / ${UPLOAD_COUNT} files."
    echo "$LINE  ** OVER THRESHOLD **"
    logger -t syncup-disk "$MSG"
    if [[ -n "$ALERT_EMAIL" ]] && command -v mail >/dev/null; then
        echo "$MSG" | mail -s "SyncUp disk at ${USED}%" "$ALERT_EMAIL"
    fi
    exit 1
fi

echo "$LINE"
