// שלב 63: הגנות על תוכן שנוצר בלי התחברות.
// פעולה של אורח לא מופיעה במאגר, אבל מי שיש לו את הקישור רואה אותה, לכן גם בה לא נשארים קישורים,
// כתובות מייל ומספרי טלפון שהוקלדו בשדות חופשיים (אי אפשר לדעת של מי הם, ואולי של קטינים).

const MARK = "[הוסר]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_SCHEME = /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"')\]]+/gi;
const URL_SHORT = /\b(?:wa\.me|t\.me|bit\.ly|tinyurl\.com|chat\.whatsapp\.com|instagram\.com|facebook\.com|tiktok\.com|youtu\.be|youtube\.com|discord\.gg|linktr\.ee)\/?[^\s<>"')\]]*/gi;
const URL_BARE = /\b[a-z0-9][a-z0-9-]{1,40}(?:\.[a-z0-9-]{2,30})*\.(?:com|co\.il|org\.il|ac\.il|org|net|il|io|me|ly|gl|link|xyz|ru|info|app|dev)\b(?:\/[^\s<>"')\]]*)?/gi;
// 05X-XXXXXXX, 0X-XXXXXXX, +972..., וגם 10 ספרות ויותר רצופות
const PHONE_IL = /(?<![\d])(?:\+?972[\s-]?|0)\(?(?:5\d|[2-4689]|7\d)\)?[\s-]?\d{3}[\s-]?\d{4}(?![\d])/g;
const PHONE_GROUPS = /(?<![\d])\d{3}[\s-]\d{3}[\s-]\d{4}(?![\d])/g;
const LONG_DIGITS = /(?<![\d])\d{10,}(?![\d])/g;

/** מסיר מטקסט קישורים, מיילים ומספרי טלפון. אם אין מה להסיר, מחזיר את אותו הטקסט. */
export function scrubContact(s) {
  if (typeof s !== "string" || s.length < 5) return s;
  return s
    .replace(EMAIL, MARK)
    .replace(URL_SCHEME, MARK)
    .replace(URL_SHORT, MARK)
    .replace(URL_BARE, MARK)
    .replace(PHONE_IL, MARK)
    .replace(PHONE_GROUPS, MARK)
    .replace(LONG_DIGITS, MARK);
}

/** עובר על כל המחרוזות באובייקט (בעומק מוגבל) ומנקה אותן. לא משנה את המבנה ולא את המפתחות. */
export function scrubDeep(v, depth = 0) {
  if (depth > 6) return v;
  if (typeof v === "string") return scrubContact(v);
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x, depth + 1));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = scrubDeep(x, depth + 1);
    return out;
  }
  return v;
}
