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

// ───────────── שלב 60: שליחת מייל עם לוגים מלאים ושגיאות ברורות ─────────────
// שלושה ערוצי שליחה, לפי סדר עדיפות (הראשון שמוגדר מנצח):
//   1. resend – RESEND_API_KEY (HTTPS, עובד גם ב-Render חינמי; לשליחה לכל כתובת צריך דומיין מאומת ב-Resend)
//   2. relay  – MAIL_RELAY_URL + MAIL_RELAY_SECRET (HTTPS אל Google Apps Script שלכם, שולח מה-Gmail שלכם בלי דומיין)
//   3. smtp   – SMTP_HOST/PORT/USER/PASS (ב-Render חינמי פורטים 25/465/587 חסומים; עובד בתוכנית בתשלום)
// שום סוד (סיסמה, מפתח) לא נכתב ללוג.
const quiet = process.env.NODE_ENV === "test" && !process.env.MAIL_DEBUG;
const log = (...a) => { if (!quiet) console.log("[mail]", ...a); };
const logErr = (...a) => { if (!quiet) console.error("[mail]", ...a); };
const maskAddr = (a) => String(a ?? "").replace(/^(.).*(@.*)$/, "$1***$2");
const maskList = (l) => (Array.isArray(l) ? l : [l]).filter(Boolean).map((x) => maskAddr(typeof x === "string" ? x : x?.address)).join(", ");

export class MailError extends Error {
  constructor(code, message, hint = "") {
    super(message);
    this.name = "MailError";
    this.code = code;
    this.hint = hint;
  }
}

/** הסבר בעברית לשגיאה נפוצה, כדי שבלוג של Render יהיה כתוב מה לעשות. */
function hintFor(e, mode) {
  const c = String(e?.code || "");
  const m = String(e?.message || "");
  if (mode === "smtp") {
    if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"].includes(c) || /timed? ?out|ECONN/i.test(m))
      return "החיבור לשרת ה-SMTP נתקע או נחסם. ב-Render בתוכנית החינמית הפורטים 25, 465 ו-587 חסומים, ולכן Gmail SMTP לא יעבוד שם. פתרונות: תוכנית בתשלום, או MAIL_RELAY_URL / RESEND_API_KEY (HTTPS).";
    if (c === "EAUTH" || /535|Invalid login|Username and Password not accepted/i.test(m))
      return "גוגל דחתה את הכניסה. צריך 'סיסמת אפליקציה' (16 תווים בלי רווחים, דורש אימות דו-שלבי בחשבון גוגל) ב-SMTP_PASS, ו-SMTP_USER הוא כתובת ה-Gmail המלאה.";
    if (c === "EENVELOPE" || /550|553|554/.test(m)) return "השרת דחה את הכתובת או את השולח. בדקו את SMTP_FROM ואת כתובת היעד.";
  }
  if ((mode === "relay" || mode === "resend") && /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(`${m} ${c} ${e?.cause?.code || ""}`))
    return mode === "relay" ? "אין חיבור לכתובת הממסר. בדקו את MAIL_RELAY_URL (צריכה להתחיל ב-https://script.google.com/macros/s/ ולהסתיים ב-/exec)." : "אין חיבור ל-api.resend.com.";
  if (mode === "resend" && /403|only send testing emails|domain/i.test(m))
    return "Resend מאפשר לשלוח רק לכתובת של בעל החשבון עד שמאמתים דומיין משלכם ושמים אותו ב-SMTP_FROM.";
  if (mode === "relay" && /bad secret/i.test(m)) return "הסוד ב-Apps Script שונה מ-MAIL_RELAY_SECRET ב-Render.";
  return "";
}

export function createMailer(db, smtp = {}) {
  const mode = smtp.resendKey ? "resend" : smtp.relayUrl && smtp.relaySecret ? "relay" : smtp.host ? "smtp" : "none";
  const port = Number(smtp.port) || 587;
  const secure = port === 465; // 587 = STARTTLS (secure:false), 465 = TLS מלא
  const from = smtp.from || smtp.user || "noreply@maoz.local";

  const transporter =
    mode === "smtp"
      ? nodemailer.createTransport({
          host: smtp.host,
          port,
          secure,
          auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
          // שליחה שמחכים לה חייבת להיכשל מהר ובשגיאה ברורה, לא להיתקע דקות
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 20000,
        })
      : null;

  const hasTransport = mode !== "none";
  /** מצב נוכחי, בלי סודות: ללוג ולאבחון. */
  const describe = () => ({
    mode,
    configured: hasTransport,
    host: mode === "smtp" ? smtp.host : mode === "relay" ? (() => { try { return new URL(smtp.relayUrl).host; } catch { return "כתובת לא תקינה"; } })() : mode === "resend" ? "api.resend.com" : "",
    port: mode === "smtp" ? port : undefined,
    secure: mode === "smtp" ? secure : undefined,
    user: mode === "smtp" ? maskAddr(smtp.user) : undefined,
    from,
    hasPassword: mode === "smtp" ? !!smtp.pass : undefined,
    passwordLength: mode === "smtp" ? String(smtp.pass || "").length : undefined,
    lastVerify,
  });
  let lastVerify = null;

  /** שולח בפועל. מחזיר { ok, mode, id, accepted, rejected, response } או זורק MailError. */
  async function deliverNow({ to, subject, html, attachments }) {
    const toList = Array.isArray(to) ? to : [to];
    if (mode === "none") {
      throw new MailError("MAIL_NOT_CONFIGURED", "אין ספק מייל מוגדר", "הגדירו ב-Render את SMTP_HOST (ועוד), או MAIL_RELAY_URL + MAIL_RELAY_SECRET, או RESEND_API_KEY.");
    }
    if (mode === "smtp") {
      const info = await transporter.sendMail({ from, to, subject, html, attachments });
      const accepted = (info.accepted || []).map((x) => (typeof x === "string" ? x : x.address));
      const rejected = (info.rejected || []).map((x) => (typeof x === "string" ? x : x.address));
      if (!accepted.length || rejected.length) {
        throw new MailError("MAIL_REJECTED", `השרת דחה את הנמענים: ${maskList(rejected.length ? rejected : toList)} (${info.response || "ללא תשובה"})`);
      }
      return { ok: true, mode, id: info.messageId, accepted, rejected, response: info.response };
    }
    const b64 = (a) => ({ name: a.filename, type: a.contentType || "application/octet-stream", base64: Buffer.from(a.content).toString("base64") });
    if (mode === "resend") {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${smtp.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: toList,
          subject,
          html,
          ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: b64(a).base64 })) } : {}),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new MailError("RESEND_FAILED", `Resend ${r.status}: ${body.message || body.name || "שגיאה"}`);
      return { ok: true, mode, id: body.id, accepted: toList, rejected: [], response: `resend ${r.status}` };
    }
    // relay: Google Apps Script שמפעיל MailApp ושולח מה-Gmail שלכם
    const r = await fetch(smtp.relayUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: smtp.relaySecret, to: toList.join(","), subject, html, fromName: smtp.fromName || "מחולל פעולות - שבט מעוז", attachments: (attachments || []).map(b64) }),
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    const raw = await r.text();
    let body = null;
    try { body = JSON.parse(raw); } catch { /* לא JSON: כנראה דף שגיאה של גוגל */ }
    if (!r.ok || !body?.ok) {
      const why = body?.error || (body ? "שגיאה" : `תשובה לא צפויה מהממסר (HTTP ${r.status}): בדקו שהפריסה היא Web app, 'Execute as: Me' ו-'Anyone'`);
      throw new MailError("RELAY_FAILED", `Relay: ${why}`);
    }
    return { ok: true, mode, id: "apps-script", accepted: toList, rejected: [], response: `relay ok, נותרה מכסה יומית: ${body.remaining ?? "?"}` };
  }

  /**
   * שליחה מיידית (עם קבצים מצורפים). מחזיר את תוצאת השליחה, ואחרת זורק MailError עם code ו-hint.
   * כל שלב נכתב ללוג: לפני, אחרי (כולל תשובת השרת) או הכשלון.
   */
  async function sendNow({ to, subject, html, attachments }) {
    const t0 = Date.now();
    log(`שולח | ערוץ=${mode} | אל=${maskList(to)} | נושא="${subject}"${attachments?.length ? ` | קבצים=${attachments.length}` : ""}`);
    try {
      const res = await deliverNow({ to, subject, html, attachments });
      log(`נשלח | ערוץ=${mode} | אל=${maskList(res.accepted)} | id=${res.id} | תשובה="${res.response}" | ${Date.now() - t0}ms`);
      return res;
    } catch (e) {
      // שגיאות רשת של fetch מגיעות כ"fetch failed" עם הסיבה האמיתית ב-cause: מוציאים אותה החוצה
      const why = e?.cause?.code || e?.cause?.message;
      const code = e?.code || (e?.name === "TimeoutError" ? "ETIMEDOUT" : why && /^E[A-Z]+$/.test(String(e.cause?.code)) ? e.cause.code : "MAIL_SEND_FAILED");
      const err = e instanceof MailError ? e : Object.assign(new MailError(code, `${e?.message || String(e)}${why ? ` (${why})` : ""}`), { cause: e });
      if (!err.hint) err.hint = hintFor(e, mode);
      logErr(`נכשל | ערוץ=${mode} | אל=${maskList(to)} | קוד=${err.code} | ${err.message}${e?.responseCode ? ` | SMTP ${e.responseCode}` : ""} | ${Date.now() - t0}ms${err.hint ? `\n[mail] מה לעשות: ${err.hint}` : ""}`);
      throw err;
    }
  }

  function enqueue(subject, html, toAddr) {
    const to = toAddr || smtp.adminEmail || "admin@maoz.local";
    db.prepare("INSERT INTO email_queue (to_addr, subject, html, next_try_at, created_at) VALUES (?,?,?,?,?)").run(to, subject, html, nowIso(), nowIso());
    log(`נכנס לתור | אל=${maskList(to)} | נושא="${subject}"`);
  }

  async function processQueue() {
    const rows = db.prepare("SELECT * FROM email_queue WHERE status = 'PENDING' AND next_try_at <= ? ORDER BY id LIMIT 10").all(nowIso());
    for (const r of rows) {
      try {
        if (hasTransport) {
          await sendNow({ to: r.to_addr, subject: r.subject, html: r.html });
          db.prepare("UPDATE email_queue SET status='SENT', attempts=attempts+1 WHERE id=?").run(r.id);
        } else {
          log(`מצב בדיקה, לא נשלח בפועל | אל=${maskList(r.to_addr)} | נושא="${r.subject}"`);
          db.prepare("UPDATE email_queue SET status='SENT', attempts=attempts+1, last_error='no-smtp (test mode)' WHERE id=?").run(r.id);
        }
      } catch (e) {
        const attempts = r.attempts + 1;
        const failed = attempts >= 5;
        const next = new Date(Date.now() + 2 ** attempts * 60000).toISOString();
        db.prepare("UPDATE email_queue SET attempts=?, status=?, next_try_at=?, last_error=? WHERE id=?").run(attempts, failed ? "FAILED" : "PENDING", next, String(e.message).slice(0, 300), r.id);
        logErr(`הודעה #${r.id} נכשלה (ניסיון ${attempts}/5, ${failed ? "נעצרה" : "ינסה שוב ב-" + next})`);
        audit(db, "system", failed ? "email.failed" : "email.retry", { id: r.id, error: e.message });
      }
    }
  }

  /** בדיקה בעלייה: מדפיס ללוג את ההגדרות (בלי סודות), בודק התחברות ל-SMTP, ואם MAIL_TEST_ON_BOOT מוגדר שולח מייל בדיקה. */
  async function selfCheck({ testTo = "" } = {}) {
    const d = describe();
    log(`הגדרות: ${JSON.stringify({ ...d, lastVerify: undefined })}`);
    if (mode === "none") {
      logErr("אין ספק מייל מוגדר: קודי אימות ואיפוס סיסמה לא יישלחו. הגדירו SMTP_HOST או MAIL_RELAY_URL או RESEND_API_KEY ב-Environment.");
      return;
    }
    if (mode === "smtp") {
      try {
        await transporter.verify();
        lastVerify = { ok: true, at: nowIso() };
        log("verify: החיבור וההתחברות לשרת ה-SMTP הצליחו");
      } catch (e) {
        lastVerify = { ok: false, at: nowIso(), code: e?.code, error: String(e?.message).slice(0, 200) };
        logErr(`verify נכשל | קוד=${e?.code || "-"} | ${e?.message}\n[mail] מה לעשות: ${hintFor(e, mode) || "בדקו את SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS"}`);
      }
    }
    if (testTo) {
      try {
        await sendNow({ to: testTo, subject: "בדיקת מייל - מחולל פעולות", html: `<p dir="rtl">אם הגעתם לכאן, שליחת המיילים באתר עובדת (ערוץ: ${mode}).</p>` });
      } catch { /* כבר נכתב ללוג */ }
    }
  }

  let timer = null;
  return {
    hasTransport,
    mode,
    describe,
    selfCheck,
    sendNow,
    enqueue,
    processQueue,
    start() {
      timer = setInterval(() => processQueue().catch(() => {}), 30_000);
      timer.unref();
      if (process.env.NODE_ENV !== "test") selfCheck({ testTo: process.env.MAIL_TEST_ON_BOOT || "" }).catch(() => {});
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
