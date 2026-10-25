# אתר קבוע בחינם, בלי כרטיס אשראי (Render חינמי + שמירת נתונים ב-GitHub)

מה זה נותן: האתר רץ ב-Render החינמי, והנתונים (משתמשים, פעולות, מסמכים) נשמרים כצילום במאגר פרטי ב-GitHub ומשוחזרים אוטומטית אחרי כל הפעלה מחדש או עדכון. הצילום נשמר כשיש שינוי, לכל היותר אחת ל-3 דקות, וגם בכיבוי השרת. אם השרת קורס פתאום, ייתכן שיאבדו שינויים של כמה דקות אחרונות.

## 1. מאגר פרטי לנתונים
1. ב-GitHub: **New repository**.
2. שם: `scout-data`. חשוב לבחור **Private**.
3. מסמנים **Add a README file** כדי שהמאגר לא יהיה ריק, ויוצרים.

## 2. טוקן גישה
1. GitHub, בפינה למעלה: התמונה שלך, אחר כך **Settings**, בתחתית **Developer settings**, אחר כך **Personal access tokens**, אחר כך **Fine-grained tokens**, אחר כך **Generate new token**.
2. שם: `maoz-data`. תוקף: **No expiration** (או שנה).
3. **Repository access**: Only select repositories, ובוחרים `scout-data`.
4. **Permissions**, **Repository permissions**, **Contents**: **Read and write**.
5. יוצרים ומעתיקים את הטוקן (הוא מוצג פעם אחת בלבד).

## 3. הגדרות ב-Render
בשירות, **Environment**, מוסיפים:
- `DATA_REPO` עם הערך `dvirykadosh-sudo/scout-data`
- `DATA_TOKEN` עם הטוקן שהעתקת
ואז Manual Deploy. ביומן (Logs) יופיע: "שמירת נתונים: נשמר צילום חדש".

## 4. שהאתר לא יירדם
Render החינמי נרדם אחרי 15 דקות בלי כניסות. שירות חינמי כמו UptimeRobot (בלי כרטיס אשראי) בודק את האתר כל 5 דקות ומשאיר אותו ער:
1. נרשמים ב-uptimerobot.com.
2. **Add New Monitor**: סוג **HTTP(s)**, כתובת `https://הכתובת-שלכם.onrender.com/api/health`, מרווח 5 דקות.

## מגבלות
- התחלה ראשונה של שרת אחרי הפעלה מחדש לוקחת עד דקה.
- Render החינמי מגביל לכ-750 שעות בחודש, וזה מספיק לשירות אחד שרץ כל הזמן.
- המאגר ב-GitHub הוא גיבוי שאפשר להוריד: הקובץ `scout.db.gz` הוא מסד הנתונים.
