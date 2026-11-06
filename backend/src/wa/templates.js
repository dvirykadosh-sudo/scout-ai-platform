// שלב 58 – תבניות הודעה חכמות: משתנים דינמיים בצורה {{שם}} או {{שם|ברירת מחדל}}.
// החלפה בטוחה: מעבר אחד בלבד על הטקסט (בלי הערכה ובלי רקורסיה), וערכים לא יכולים להחדיר משתנים חדשים.

export const MAX_BODY = 4000;

/** משתנים נתמכים. שם בעברית → מפתח פנימי. כמה שמות יכולים להצביע על אותו מפתח. */
const ALIAS = {
  שם: "name", שם_מדריך: "name", שם_פרטי: "name",
  שם_מלא: "fullName",
  גדוד: "battalion", שם_הגדוד: "battalion", שכבה: "battalion",
  תפקיד: "role",
  תאריך: "date", תאריך_הפעולה: "date",
  יום: "day",
  שעה: "time", שעת_הפעולה: "time",
  שם_פעולה: "activity", שם_הפעולה: "activity", פעולה: "activity",
  אירוע: "event", שם_האירוע: "event",
  מקום: "place",
  הערה: "note",
  ימים_עד: "daysUntil",
  קישור: "link",
};

/** מידע להצגה בממשק: שם מומלץ, הסבר ודוגמה. */
export const VARIABLES = [
  { name: "שם_מדריך", key: "name", help: "שם פרטי של מקבל ההודעה", sample: "נועה" },
  { name: "שם_מלא", key: "fullName", help: "שם מלא של מקבל ההודעה", sample: "נועה כהן" },
  { name: "שם_הגדוד", key: "battalion", help: "הגדוד או השכבה של איש הקשר", sample: "גדוד נעורים" },
  { name: "תפקיד", key: "role", help: "התפקיד של איש הקשר", sample: "רכזת שכבה" },
  { name: "שם_הפעולה", key: "activity", help: "שם הפעולה (בתזכורות מלוח השנה)", sample: "אחריות אישית" },
  { name: "שעת_הפעולה", key: "time", help: "שעת התחלה", sample: "17:30" },
  { name: "תאריך", key: "date", help: "התאריך", sample: "יום חמישי, 5.11" },
  { name: "יום", key: "day", help: "היום בשבוע", sample: "חמישי" },
  { name: "אירוע", key: "event", help: "שם האירוע (ישיבה, טיול, שכב\"ג)", sample: "ישיבת שכב\"ג" },
  { name: "מקום", key: "place", help: "מקום המפגש", sample: "המועדון" },
  { name: "הערה", key: "note", help: "הערה חופשית", sample: "להביא תעודת זהות" },
  { name: "ימים_עד", key: "daysUntil", help: "כמה ימים עד האירוע", sample: "2" },
];
const KEYS = new Set(Object.values(ALIAS));
const RX = /\{\{\s*([^{}|]{1,40}?)\s*(?:\|\s*([^{}]{0,80}?)\s*)?\}\}/g;

/** מנקה טקסט לפני שליחה: בלי תווי בקרה, שורות מנורמלות, אורך מוגבל. */
export function cleanText(s) {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_BODY);
}

const norm = (n) => n.replace(/\s+/g, "_");

/** כל המשתנים בתבנית: [{ token, key, fallback }]. key=null אם המשתנה לא מוכר. */
export function extractVars(body) {
  return [...String(body ?? "").matchAll(RX)].map((m) => ({ token: m[0], name: norm(m[1]), key: ALIAS[norm(m[1])] ?? null, fallback: m[2] ?? null }));
}

/** בדיקת תבנית לפני שמירה: אורך, משתנים לא מוכרים. */
export function validateTemplate(body) {
  const text = String(body ?? "");
  const errors = [];
  if (!text.trim()) errors.push("התבנית ריקה");
  if (text.length > MAX_BODY) errors.push(`התבנית ארוכה מדי (עד ${MAX_BODY} תווים)`);
  const unknown = [...new Set(extractVars(text).filter((v) => !v.key).map((v) => v.name))];
  if (unknown.length) errors.push(`משתנים לא מוכרים: ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
  if ((text.match(/\{\{/g) || []).length !== extractVars(text).length) errors.push("יש סוגריים מסולסלים שלא נסגרו כמו שצריך");
  return { ok: errors.length === 0, errors, unknown };
}

/**
 * מחליף משתנים. values: { name, fullName, ... }. משתנה בלי ערך ובלי ברירת מחדל נרשם ב-missing,
 * וההודעה לא אמורה להישלח (כדי שלא יישלח "{{שם}}" כמו שהוא).
 */
export function renderTemplate(body, values = {}) {
  const missing = new Set();
  const out = String(body ?? "").replace(RX, (_, rawName, fallback) => {
    const key = ALIAS[norm(rawName)];
    const v = key ? String(values[key] ?? "").replace(/\{\{|\}\}/g, "").trim() : "";
    if (v) return v;
    if (fallback) return fallback;
    missing.add(norm(rawName));
    return "";
  });
  return { text: cleanText(out), missing: [...missing] };
}

/** ערכי המשתנים לפי איש קשר: שם פרטי, שם מלא, גדוד, תפקיד. extra מוסיף נתוני אירוע. */
export function valuesFor(contact, extra = {}) {
  const full = String(contact?.name ?? "").trim();
  return { name: full.split(/\s+/)[0] || "", fullName: full, battalion: contact?.battalion || "", role: contact?.role || "", ...extra };
}

/** ערכי דוגמה לתצוגה מקדימה בממשק. */
export const sampleValues = () => Object.fromEntries(VARIABLES.map((v) => [v.key, v.sample]));
