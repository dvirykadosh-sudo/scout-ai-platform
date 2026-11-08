// ממסר מייל של "מחולל פעולות" ב-Google Apps Script.
// שולח מהחשבון שמריץ אותו (ה-Gmail שלכם), דרך HTTPS, ולכן עובד גם מ-Render בתוכנית חינמית (שחוסמת פורטי SMTP).
//
// התקנה (פעם אחת):
// 1. נכנסים ל-script.google.com עם חשבון ה-Gmail ששולח את המיילים ← New project ← מוחקים את הקוד ומדביקים את כל הקובץ הזה.
// 2. מחליפים את SECRET למחרוזת אקראית ארוכה (30 תווים ומעלה, אותיות ומספרים). את אותו ערך שמים ב-Render כ-MAIL_RELAY_SECRET.
//    הסוד נכתב רק כאן וב-Render. לא שולחים אותו בצ'אט.
// 3. Deploy ← New deployment ← סוג: Web app. Execute as: Me. Who has access: Anyone ← Deploy.
//    גוגל תבקש הרשאה לשליחת מייל: Authorize access ← בחירת החשבון ← Advanced ← Go to ... (unsafe). זה הסקריפט שלכם, זה תקין.
// 4. מעתיקים את ה-Web app URL (נגמר ב-/exec) ושמים ב-Render כ-MAIL_RELAY_URL.
// שינוי בקוד אחרי הפריסה: Deploy ← Manage deployments ← עיפרון ← Version: New version ← Deploy (הכתובת נשארת).
//
// מכסה: 100 נמענים ביום בחשבון Gmail רגיל (1,500 ב-Google Workspace). מספיק לקודי אימות של שבט, לא לדיוור המוני.

const SECRET = "החליפו-למחרוזת-סודית-ארוכה";

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET.indexOf("החליפו") === 0) return out({ ok: false, error: "SECRET לא הוחלף בסקריפט" });
    if (!d.secret || d.secret !== SECRET) return out({ ok: false, error: "bad secret" });
    if (!d.to || !d.subject) return out({ ok: false, error: "missing to/subject" });
    const options = { htmlBody: d.html || "", name: d.fromName || "מחולל פעולות" };
    if (d.attachments && d.attachments.length) {
      options.attachments = d.attachments.map(function (a) {
        return Utilities.newBlob(Utilities.base64Decode(a.base64), a.type || "application/octet-stream", a.name);
      });
    }
    MailApp.sendEmail(d.to, d.subject, "ההודעה בפורמט HTML. אם היא לא מוצגת, פתחו אותה בתוכנת דואר רגילה.", options);
    return out({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

// פתיחת הכתובת בדפדפן מראה שהפריסה חיה (לא שולח כלום)
function doGet() {
  return out({ ok: true, hint: "ממסר המייל פעיל. שליחה רק ב-POST." });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
