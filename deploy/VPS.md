# אתר קבוע בשרת משלכם (בלי Render)

מתאים כשרוצים שהאתר יהיה זמין 24 שעות ביממה לכל מדריכי השבט, מהטלפון, עם כתובת מאובטחת, והנתונים נשמרים.
עלות: כ-4 עד 6 דולר בחודש לשרת, ועוד כ-40 שקלים בשנה לדומיין.

## 1. קונים שרת
- בספק כמו Hetzner, DigitalOcean או Contabo: שרת **Ubuntu 24.04** קטן (2 ליבות, 2GB זיכרון מספיקים).
- מקבלים כתובת IP וסיסמה (או מפתח SSH) במייל.

## 2. קונים דומיין ומכוונים אותו
- בספק הדומיינים מוסיפים רשומת **A** שמצביעה על כתובת ה-IP של השרת (למשל activities.שם-הדומיין).
- ההפצה לוקחת בין דקות לכמה שעות.

## 3. מתחברים לשרת
ב-Windows פותחים PowerShell ומקלידים:
```
ssh root@כתובת-ה-IP
```

## 4. מתקינים Docker ומורידים את האתר
```
curl -fsSL https://get.docker.com | sh
git clone https://github.com/dvirykadosh-sudo/scout-ai-platform.git
cd scout-ai-platform
cp .env.example .env
nano .env
```
ב-`nano` משנים את הערכים (DOMAIN, PUBLIC_URL, JWT_SECRET, ADMIN_PASSWORD, SIGNUP_CODE). שמירה: Ctrl+O ואז Enter. יציאה: Ctrl+X.
את JWT_SECRET אפשר לייצר עם: `openssl rand -hex 32`

## 5. מפעילים
```
docker compose up -d --build
```
אחרי כמה דקות נכנסים ל-`https://הדומיין-שלכם`. הנתונים נשמרים בתיקייה `data` בשרת ולא נמחקים בעדכון.

## 6. עדכון גרסה
מעלים את הקוד החדש ל-GitHub כמו תמיד, ואז בשרת:
```
cd scout-ai-platform
git pull
docker compose up -d --build
```

## 7. גיבוי
```
crontab -e
```
ומוסיפים שורה:
```
0 3 * * 0 /root/scout-ai-platform/deploy/backup.sh
```
זה שומר גיבוי שבועי ב-`/root/backups` (8 אחרונים). מומלץ להוריד מדי פעם עותק למחשב שלכם.

## בעיות נפוצות
- האתר לא נפתח ב-https: לוודא שרשומת ה-A מצביעה לשרת ושפורטים 80 ו-443 פתוחים בחומת האש של הספק.
- לראות מה קורה: `docker compose logs -f app`
