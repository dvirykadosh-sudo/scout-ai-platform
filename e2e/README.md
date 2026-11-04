# בדיקות דפדפן

1. מפעילים את האתר בגרסת ייצור: `node run.mjs build-prod` ואז `PORT=5055 NODE_ENV=production JWT_SECRET=testsecret1234567890 ADMIN_PASSWORD=Strong#Pass99 SIGNUP_CODE=maoz2026 DB_PATH=/tmp/e2e.db node backend/src/all.js`
2. בתיקייה הזאת: `npm install` ואז `BASE_URL=http://localhost:5055 npm run all`
3. אם Chromium במקום אחר: `CHROMIUM_PATH=/path/to/chrome`

הבדיקות נרשמות עם משתמש חדש בכל הרצה, ולכן אפשר להריץ שוב ושוב.
