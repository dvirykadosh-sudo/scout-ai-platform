#!/bin/sh
# גיבוי שבועי של מסד הנתונים. מוסיפים ל-cron:  0 3 * * 0 /root/scout-ai-platform/deploy/backup.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p /root/backups
tar czf "/root/backups/scout-$(date +%F).tar.gz" data
ls -1t /root/backups/scout-*.tar.gz | tail -n +9 | xargs -r rm
