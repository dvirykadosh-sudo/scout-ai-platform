# דומיין משלכם (למשל maoz.co.il)

1. קונים דומיין אצל חברת אחסון דומיינים (בישראל: דומיין ב-ISOC או חברות כמו Upress, Domain.co.il; מחיר שנתי סביב 50–80 ש"ח לדומיין .co.il).
2. ב-Render: השירות `shevet-maoz-app` ← Settings ← Custom Domains ← Add Custom Domain, וכותבים את הדומיין (למשל `www.maoz.co.il`).
3. Render מציג רשומת DNS: בדרך כלל `CNAME` מהשם `www` אל `shevet-maoz-app.onrender.com`. מוסיפים אותה בהגדרות ה-DNS של חברת הדומיינים.
4. מחכים בין כמה דקות לשעות. Render מוציא לבד תעודת HTTPS.
5. ב-Render, ב-Environment, מגדירים `PUBLIC_URL=https://www.maoz.co.il` (כדי שקודי ה-QR והקישורים בקובצי Word יצביעו על הכתובת החדשה), ועושים Manual Deploy.
6. ב-UptimeRobot מעדכנים את כתובות הניטור לדומיין החדש.

דומיין ללא `www` (maoz.co.il) דורש רשומת `ALIAS`/`ANAME` או הפניה מהחברה. הדרך הפשוטה: להשתמש ב-`www` ולהגדיר הפניה מהדומיין החשוף אל `www`.
