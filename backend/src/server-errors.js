// שלב 64 (ממצאים 57–59): שגיאות שרת שלא נתפסו לא מפילות את האתר בשקט, ולא נעלמות.
// כל שגיאה נרשמת בלוג, נשמרת ברשימה קצרה שמוצגת באדמין, ושולחת התראה (באתר ובמייל אם מוגדר) לכל היותר פעם בשעה לאותה שגיאה.
// ההתראה כוללת רק סוג, הודעה ושורת מקור: בלי תוכן בקשות ובלי פרטי משתמשים.
import { notifyAdmins } from "./notify.js";

const recent = [];
const lastAlert = new Map();
let alertsToday = { day: "", n: 0 };
const MAX_RECENT = 30;
const ALERT_GAP_MS = 60 * 60_000;
const MAX_ALERTS_PER_DAY = 10;

const firstFrame = (e) => (String(e?.stack || "").split("\n").find((l) => /^\s+at /.test(l)) || "").trim().slice(0, 200);

export function recordServerError(ctx, kind, err, extra = {}) {
  const { db, mailer, config, log = console } = ctx || {};
  const message = String(err?.message ?? err ?? "שגיאה לא ידועה").slice(0, 300);
  const where = firstFrame(err);
  const sig = `${kind}|${message.slice(0, 80)}|${where}`;
  const now = Date.now();
  const entry = { at: new Date(now).toISOString(), kind, message, where, ...extra };
  const same = recent.find((r) => r.sig === sig);
  if (same) {
    same.count++;
    same.at = entry.at;
  } else {
    recent.unshift({ ...entry, sig, count: 1 });
    if (recent.length > MAX_RECENT) recent.pop();
  }
  log.error?.(`[server-error] ${kind}: ${message}${where ? ` (${where})` : ""}`);
  // התראה: פעם בשעה לכל חתימה, ועד 10 ביום בסך הכול
  const day = new Date(now).toISOString().slice(0, 10);
  if (alertsToday.day !== day) alertsToday = { day, n: 0 };
  if (now - (lastAlert.get(sig) ?? 0) < ALERT_GAP_MS || alertsToday.n >= MAX_ALERTS_PER_DAY) return entry;
  lastAlert.set(sig, now);
  alertsToday.n++;
  try {
    if (db) notifyAdmins(db, "error", `שגיאת שרת (${kind}): ${message}`.slice(0, 240), "/admin");
    const to = config?.smtp?.adminEmail;
    if (to && mailer?.hasTransport) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
      mailer.enqueue(`התראה: שגיאת שרת (${kind})`, `<p dir="rtl">אירעה שגיאה בשרת שלא טופלה.</p><p dir="ltr"><code>${esc(message)}<br>${esc(where)}</code></p><p dir="rtl">פירוט נוסף: אדמין ← מצב המערכת. ההתראה נשלחת לכל היותר פעם בשעה לאותה שגיאה.</p>`, to);
    }
  } catch {
    /* ההתראה עצמה לא תפיל את האתר */
  }
  return entry;
}

export const recentServerErrors = () => recent.map(({ sig, ...r }) => r);
export const resetServerErrors = () => {
  recent.length = 0;
  lastAlert.clear();
  alertsToday = { day: "", n: 0 };
};

/** מתעד unhandledRejection (ממשיך לעבוד) ו-uncaughtException (מתעד, שומר ויוצא, ו-Render מפעיל מחדש). */
export function installProcessGuards(ctx, { shutdown } = {}) {
  process.on("unhandledRejection", (reason) => {
    recordServerError(ctx, "unhandledRejection", reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on("uncaughtException", (err) => {
    recordServerError(ctx, "uncaughtException", err);
    // מצב התהליך אחרי חריגה לא נתפסת אינו מובטח. שומרים את הנתונים ויוצאים, וההפעלה מחדש מתבצעת אוטומטית.
    if (shutdown) void shutdown(1);
    else setTimeout(() => process.exit(1), 500).unref?.();
  });
}
