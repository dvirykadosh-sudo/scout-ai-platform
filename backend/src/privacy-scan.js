// שלב 74 (פריט 20): סריקת פרטיות לפני פרסום במאגר המשותף.
// פעולה שמתפרסמת לכל המדריכים לא צריכה להכיל טלפון, מייל, קישור, מספר זהות, כתובת בית, או שם של חניך עם מידע רפואי.
// שלב 63 כבר מנקה קישורים וטלפונים מפעולות של אורחים. כאן הסריקה רחבה יותר, והיא מראה מה נמצא ואיפה.
// מה שאפשר להסיר בבטחה מוסר בלחיצה. שם של חניך רק מסומן, כי אי אפשר לדעת בוודאות שזה שם (ואולי זו דמות בדויה).
import { CONTACT_MARK, CONTACT_PATTERNS } from "./guest-guard.js";

export const PII_KINDS = {
  phone: { label: "מספר טלפון", auto: true, severity: "high" },
  email: { label: "כתובת מייל", auto: true, severity: "high" },
  link: { label: "קישור לאתר או לקבוצה", auto: true, severity: "medium" },
  id: { label: "מספר שנראה כמו תעודת זהות", auto: true, severity: "high" },
  handle: { label: "שם משתמש ברשת חברתית", auto: true, severity: "medium" },
  address: { label: "כתובת מגורים", auto: true, severity: "high" },
  childHealth: { label: "שם של חניך עם מידע רפואי", auto: false, severity: "high" },
  child: { label: "ייתכן שם של חניך", auto: false, severity: "low" },
};

const HANDLE = /(?<![\w@.])@[A-Za-z0-9_.]{3,30}(?![\w])/g;
const ADDRESS = /[בלמ]?(?:רחוב|רח'|רח׳|שדרות|שד'|שד׳|דרך|סמטת|כיכר)\s+[א-ת"'׳״-]+(?:\s+[א-ת"'׳״-]+)?\s+\d{1,3}[א-ת]?(?![\d])/g;
const ID9 = /(?<![\d-])\d{9}(?![\d-])/g;
const HEALTH_AFTER = "(?:סובל|סובלת|אלרגי|אלרגית|חולה|מאובחן|מאובחנת|לוקח|לוקחת|מטופל|מטופלת|בעל|בעלת|עם)";
const NAME = "([א-ת]{2,10})";
const CHILD_HEALTH = new RegExp(`(?:החניך|החניכה|הילד|הילדה)\\s+${NAME}\\s+${HEALTH_AFTER}(?![א-ת])`, "g");
const CHILD = new RegExp(`(?:החניך|החניכה|הילד|הילדה)\\s+${NAME}(?![א-ת])`, "g");
// מילים שבאות אחרי "החניך" ואינן שם: תואר, פועל, מילת יחס
const NOT_NAME = new Set(["הראשון", "השני", "השלישי", "האחרון", "הבא", "הזה", "הזאת", "המוביל", "המנצח", "המבוגר", "שנבחר", "שמוביל", "שלא", "שיש", "אשר", "אחד", "אחת", "כל", "יקבל", "יקבלו", "מקבל", "מקבלת", "יכול", "יכולה", "יבחר", "יתחיל", "צריך", "צריכה", "רוצה", "מוביל", "חדש", "חדשה", "ייתן", "תתחיל", "מתחיל", "בוחר", "בוחרת", "יוצא", "יוצאת", "נכנס", "נכנסת", "עומד", "עומדת", "יושב", "יושבת", "מספר", "מספרת", "ראשון", "שנייה", "שני", "מי", "מה", "עושה", "עושים", "בתפקיד", "בקבוצה", "בעל", "בעלת", "עם", "את", "אל", "על", "גם", "רק", "לא", "אם", "אז", "ואז", "כך", "פשוט", "פותח", "פותחת", "סוגר", "סוגרת", "מקריא", "מקריאה"]);

/** תעודת זהות ישראלית: ספרת ביקורת לפי אלגוריתם לון (1,2,1,2...). */
export function validIsraeliId(s) {
  if (!/^\d{9}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(s[i]) * (i % 2 === 0 ? 1 : 2);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

function* matches(text) {
  for (const re of CONTACT_PATTERNS.email) for (const m of text.matchAll(re)) yield { kind: "email", index: m.index, match: m[0] };
  for (const re of CONTACT_PATTERNS.link) for (const m of text.matchAll(re)) yield { kind: "link", index: m.index, match: m[0] };
  for (const re of CONTACT_PATTERNS.phone) for (const m of text.matchAll(re)) yield { kind: "phone", index: m.index, match: m[0] };
  for (const m of text.matchAll(ID9)) if (validIsraeliId(m[0])) yield { kind: "id", index: m.index, match: m[0] };
  for (const m of text.matchAll(HANDLE)) yield { kind: "handle", index: m.index, match: m[0] };
  for (const m of text.matchAll(ADDRESS)) yield { kind: "address", index: m.index, match: m[0] };
  for (const m of text.matchAll(CHILD_HEALTH)) if (!NOT_NAME.has(m[1]) && !/^[הש]/.test(m[1])) yield { kind: "childHealth", index: m.index, match: m[0] };
  for (const m of text.matchAll(CHILD)) if (!NOT_NAME.has(m[1]) && !/^[הש]/.test(m[1])) yield { kind: "child", index: m.index, match: m[0] };
}

const PRIORITY = ["phone", "email", "link", "id", "address", "handle", "childHealth", "child"];

/** כל הממצאים בטקסט אחד, בלי חפיפות (טלפון קודם למספר זהות, ושם עם מידע רפואי קודם לשם סתם). */
export function scanText(text) {
  const t = String(text ?? "");
  if (t.length < 5) return [];
  const all = [...matches(t)].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || a.index - b.index);
  const taken = [];
  const out = [];
  for (const f of all) {
    const end = f.index + f.match.length;
    if (taken.some(([s, e]) => f.index < e && end > s)) continue;
    taken.push([f.index, end]);
    const k = PII_KINDS[f.kind];
    out.push({ kind: f.kind, label: k.label, severity: k.severity, auto: k.auto, match: f.match, index: f.index, context: t.slice(Math.max(0, f.index - 20), end + 20).replace(/\s+/g, " ") });
  }
  return out.sort((a, b) => a.index - b.index);
}

const FIELDS = [
  ["title", "שם הפעולה"],
  ["leadingValue", "ערך מוביל"],
  ["equipment", "ציוד"],
  ["safetyNotes", "בטיחות"],
  ["conclusionNote", "סיכום"],
];

/** סריקה של כל שדות הטקסט של פעולה. */
export function privacyScan(a) {
  const findings = [];
  const add = (field, label, text) => {
    for (const f of scanText(text)) findings.push({ field, fieldLabel: label, ...f });
  };
  for (const [k, label] of FIELDS) add(k, label, a[k]);
  (a.stages || []).forEach((s, i) => add(`stages.${i}`, `שלב ${i + 1}: ${s.name}`, s.content));
  (a.tags || []).forEach((t, i) => add(`tags.${i}`, "תגית", t));
  return { findings, count: findings.length, autoCount: findings.filter((f) => f.auto).length, high: findings.filter((f) => f.severity === "high").length, ok: findings.length === 0 };
}

const REPLACEMENT = { address: "[כתובת הוסרה]" };

/** מסיר מהטקסט את כל מה שאפשר להסיר בבטחה. שם של חניך נשאר ומסומן בלבד. */
export function redactText(text) {
  const t = String(text ?? "");
  const found = scanText(t).filter((f) => f.auto);
  if (!found.length) return t;
  let out = "";
  let at = 0;
  for (const f of found) {
    out += t.slice(at, f.index) + (REPLACEMENT[f.kind] ?? CONTACT_MARK);
    at = f.index + f.match.length;
  }
  return out + t.slice(at);
}

/** הפעולה אחרי הסרה: רק השדות שהשתנו, מוכנים ל-updateActivity. changed = כמה שדות השתנו. */
export function redactActivity(a) {
  const patch = {};
  let changed = 0;
  for (const [k] of FIELDS) {
    const v = redactText(a[k]);
    if (v !== (a[k] ?? "")) {
      patch[k] = v;
      changed++;
    }
  }
  const stages = (a.stages || []).map((s) => {
    const c = redactText(s.content);
    if (c !== s.content) changed++;
    return c === s.content ? s : { ...s, content: c };
  });
  if (stages.some((s, i) => s !== a.stages[i])) patch.stages = stages;
  const tags = (a.tags || []).map((x) => redactText(x));
  if (tags.some((x, i) => x !== a.tags[i])) {
    patch.tags = tags;
    changed++;
  }
  return { patch, changed };
}
