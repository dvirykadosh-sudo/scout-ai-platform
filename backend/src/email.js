import nodemailer from "nodemailer";
import { audit, nowIso } from "./db.js";

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function activityEmailHtml(a) {
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#b9a6e6">${k}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`;
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#130E26;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#1E1245;border:1px solid #5D2FA3;border-radius:14px;padding:24px;color:#ffffff">
<h2 style="color:#c9a8ff;margin-top:0">פעולה חדשה נוצרה במחולל</h2>
<p style="font-size:18px;margin:0 0 12px"><b>${escapeHtml(a.title)}</b></p>
<table style="width:100%;border-collapse:collapse;font-size:15px">
${row("משך", `${a.durationMin} דקות`)}${row("מדריך/ה", a.instructor || a.author || "-")}
${row("שבט", `${a.tribe}${a.battalion ? " | גדוד " + a.battalion : ""}`)}${row("שכבת גיל", a.ageGroup)}
${row("משתתפים", a.groupSize)}${row("ערך מוביל", a.leadingValue)}
</table>
<p style="color:#9d86cf;font-size:12px;margin-bottom:0">${escapeHtml(new Date().toLocaleString("he-IL"))}</p>
</div></body></html>`;
}

export function createMailer(db, smtp) {
  const isTest = process.env.NODE_ENV === "test";
  const canCreate = Boolean(smtp.host && (smtp.pass || isTest));

  const transporter = canCreate
    ? nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        family: 4,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      })
    : null;

  if (!isTest) {
    if (transporter) {
      console.log(`[mail] חיבור SMTP הוגדר: host=${smtp.host}, port=${smtp.port}, user=${smtp.user}, from=${smtp.from}`);
    } else {
      console.warn(`[mail] אזהרה: חיבור SMTP אינו פעיל! ודאו שמוגדר SMTP_PASS במשתני הסביבה ב-Render.`);
    }
  }

  function enqueue(subject, html, toAddr) {
    const to = toAddr || smtp.adminEmail || "admin@maoz.local";
    db.prepare("INSERT INTO email_queue (to_addr, subject, html, next_try_at, created_at) VALUES (?,?,?,?,?)").run(
      to,
      subject,
      html,
      nowIso(),
      nowIso(),
    );
  }

  async function processQueue() {
    const rows = db.prepare("SELECT * FROM email_queue WHERE status = 'PENDING' AND next_try_at <= ? ORDER BY id LIMIT 10").all(nowIso());
    for (const r of rows) {
      try {
        if (transporter) {
          await transporter.sendMail({ from: smtp.from, to: r.to_addr, subject: r.subject, html: r.html });
          db.prepare("UPDATE email_queue SET status='SENT', attempts=attempts+1 WHERE id=?").run(r.id);
        } else {
          console.log(`[מייל - מצב בדיקה, לא נשלח בפועל] אל: ${r.to_addr} | נושא: ${r.subject}`);
          db.prepare("UPDATE email_queue SET status='SENT', attempts=attempts+1, last_error='no-smtp (test mode)' WHERE id=?").run(r.id);
        }
      } catch (e) {
        const attempts = r.attempts + 1;
        const failed = attempts >= 5;
        const next = new Date(Date.now() + 2 ** attempts * 60000).toISOString();
        db.prepare("UPDATE email_queue SET attempts=?, status=?, next_try_at=?, last_error=? WHERE id=?").run(
          attempts,
          failed ? "FAILED" : "PENDING",
          next,
          String(e.message).slice(0, 300),
          r.id,
        );
        audit(db, "system", failed ? "email.failed" : "email.retry", { id: r.id, error: e.message });
      }
    }
  }

  /** שליחה מיידית (עם קבצים מצורפים). מחזיר true רק אם נשלח בפועל. */
  async function sendNow({ to, subject, html, attachments }) {
    if (!transporter) {
      console.error(`[mail] לא ניתן לשלוח מייל אל ${to} ("${subject}") כי transporter=null (בדקו ש-SMTP_PASS מוגדר ב-Render).`);
      return false;
    }
    if (!isTest) console.log(`[mail] שולח מייל אל ${to} | נושא: "${subject}"...`);
    const info = await transporter.sendMail({ from: smtp.from, to, subject, html, attachments });
    if (!isTest) console.log(`[mail] המייל נשלח בהצלחה אל ${to} | תשובת שרת: ${info?.response || info?.messageId || "OK"}`);
    return true;
  }

  let timer = null;
  return {
    hasTransport: !!transporter,
    sendNow,
    enqueue,
    processQueue,
    start() {
      timer = setInterval(() => processQueue().catch(() => {}), 30_000);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}