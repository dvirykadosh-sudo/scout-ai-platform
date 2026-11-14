# אינדקס התיעוד

התיעוד נמצא בשורש המאגר ובתיקיית `deploy/`. הטבלה הזו מרכזת אותו לפי מטרה.

| רוצים | קובץ |
|---|---|
| להבין מה האתר עושה ואיך מתקינים | [`README.md`](../README.md) (כולל יומן השלבים) |
| לפרוס ל-Render, בחינם או בתשלום | [`DEPLOY.md`](../DEPLOY.md), [`deploy/FREE.md`](../deploy/FREE.md) |
| דומיין משלכם | [`deploy/DOMAIN.md`](../deploy/DOMAIN.md) |
| שרת וירטואלי (VPS) | [`deploy/VPS.md`](../deploy/VPS.md) |
| להגדיר שליחת מיילים | [`SMTP-SETUP.md`](../SMTP-SETUP.md) |
| אבטחה: ממצאים ותיקונים | [`SECURITY-AUDIT.md`](../SECURITY-AUDIT.md) |
| בדיקת נגישות עם קורא מסך | [`NVDA-CHECKLIST.md`](../NVDA-CHECKLIST.md) |
| פיילוט עם שבט | [`PILOT-KIT.md`](../PILOT-KIT.md) |
| מפרט הבנייה המקורי | [`BUILD_SPEC.md`](../BUILD_SPEC.md) |
| רשימת הנתיבים של ה-API | [`openapi.json`](openapi.json) |
| בדיקת קוד (ESLint) | [`tools/lint/README.md`](../tools/lint/README.md) |

## מפת ה-API

`docs/openapi.json` נוצר אוטומטית מהנתיבים שרשומים בשרת: `npm run docs:api`. הוא מציג נתיבים, שיטות ופרמטרים בכתובת. שדות הגוף מתוארים בסכמות ב-`backend/src/validate.js` ובקבצי `routes-*.js`. אפשר לפתוח אותו ב-Swagger Editor (editor.swagger.io).

## משתני סביבה

הרשימה המלאה עם הסברים: [`backend/.env.example`](../backend/.env.example).

## בדיקות

```
npm test                 # בדיקות השרת (node:test)
npm run typecheck        # TypeScript באתר
npm run lint:setup && npm run lint   # ESLint לשרת
```
