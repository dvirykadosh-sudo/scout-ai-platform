#!/bin/sh
# מריץ כל סבב בדיקות דפדפן על שרת חדש בייצור עם מסד נקי (כמו ב-Render).
# שימוש, מתיקיית e2e:   sh run-fresh.sh e2e-round-o.mjs e2e-round-aq.mjs
# צריך build קודם: node run.mjs build-prod (מתיקיית השורש).
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
PORT=${PORT:-5055}
DB=${FRESH_DB:-/tmp/e2e-fresh.db}   # סבב am דורש FRESH_DB=/tmp/e2e61.db; סבב an דורש PUBLIC_URL, GOOGLE_SITE_VERIFICATION, BING_SITE_VERIFICATION
for f in "$@"; do
  pgrep -f "backend/src/all\.js" | xargs -r kill 2>/dev/null
  sleep 2
  rm -f "$DB"*
  (cd "$ROOT" && PORT=$PORT NODE_ENV=production JWT_SECRET=testsecret1234567890 ADMIN_PASSWORD='Strong#Pass99' SIGNUP_CODE=maoz2026 DB_PATH="$DB" nohup node backend/src/all.js > /tmp/e2e-fresh-server.log 2>&1 &)
  i=0; while [ $i -lt 40 ]; do c=$(curl -s -o /dev/null -w "%{http_code}" "localhost:$PORT/api/health"); [ "$c" = "200" ] && break; sleep 2; i=$((i+1)); done
  echo "=== $f"
  (cd "$HERE" && BASE_URL="http://localhost:$PORT" timeout 420 node "$f" 2>&1 | grep -E "^FAIL|FAILED|ALL OK" )
done
pgrep -f "backend/src/all\.js" | xargs -r kill 2>/dev/null
