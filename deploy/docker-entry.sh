#!/bin/sh
# שלב 64: השרת רץ כמשתמש רגיל (node) ולא כ-root. הסקריפט מתחיל כ-root רק כדי לתת למשתמש הרגיל הרשאה
# לתיקיית הנתונים (דיסק קבוע ב-Render מגיע בבעלות root), ואז עובר למשתמש node.
# אם משהו לא זמין (אין runuser, או שהקונטיינר כבר רץ כמשתמש רגיל) השרת פשוט עולה כמו קודם.
DB="${DB_PATH:-/data/scout.db}"
DIR="$(dirname "$DB")"
mkdir -p "$DIR" 2>/dev/null
mkdir -p /app/frontend/.next/cache 2>/dev/null
if [ "$(id -u)" = "0" ] && command -v runuser >/dev/null 2>&1 && id node >/dev/null 2>&1; then
  chown -R node:node "$DIR" /app/frontend/.next/cache 2>/dev/null
  exec runuser -u node -- node backend/src/all.js
fi
exec node backend/src/all.js
