// הסתרת פרטים במחשב שלכם, לפני שמשהו נשלח לאתר. פונקציות טהורות, נבדקות ב-node.
const SCRUB = [
  [/(?<!\d)(?:\+?972[-\s]?|0)(?:5\d|[2-4]|[7-9])[-\s]?\d{3}[-\s]?\d{4}(?!\d)/g, "[טלפון]"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[מייל]"],
  [/https?:\/\/[^\s,;)]+|www\.[^\s,;)]+/g, "[קישור]"],
  [/(?<!\d)\d{9}(?!\d)/g, "[מספר]"],
  [/(?:רחוב|רח'|שדרות|שד'|שדרת)\s+[א-ת"']+(?:\s+[א-ת"']+)?\s+\d+/g, "[כתובת]"],
  [/(?<![\w.])@[A-Za-z0-9_.]{3,}/g, "[משתמש]"],
];
export const scrubPII = (t) => SCRUB.reduce((s, [rx, rep]) => s.replace(rx, rep), String(t ?? ""));

const LETTERS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", "י'", "כ'", "ל'", "מ'", "נ'", "ס'", "ע'", "פ'", "צ'", "ק'", "ר'", "ש'", "ת'"];
export const aliasFor = (i) => `חניך ${LETTERS[i] ?? i + 1}`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const namePattern = (name) => new RegExp(`(?<![א-ת\\w])(${name.length >= 3 ? "[ובהלמכש]{0,2}" : ""})${esc(name)}(?![א-ת\\w])`, "g");
const tokens = (name) => {
  const out = new Set();
  if (/\p{L}/u.test(name) && !/\d{5,}/.test(name)) {
    out.add(name.trim());
    for (const w of name.split(/[\s'’"׳״.-]+/)) if (w.length >= 2 && /^\p{L}+$/u.test(w)) out.add(w);
  }
  return [...out].sort((a, b) => b.length - a.length);
};

/** סדר יום/חודש: מספר ראשון מעל 12 הוא יום; שני מעל 12 הפוך; ברירת מחדל ישראלית יום/חודש. */
export function resolveTimes(rows) {
  const dm = rows.filter((r) => r.a > 12).length, md = rows.filter((r) => r.b > 12).length;
  const monthFirst = md > dm;
  return rows.map((r) => {
    let h = r.h;
    if (r.ap) h = /^p/i.test(r.ap) ? (h % 12) + 12 : h % 12;
    const y = r.y < 100 ? 2000 + r.y : r.y;
    return Date.UTC(y, (monthFirst ? r.a : r.b) - 1, monthFirst ? r.b : r.a, h, r.mi);
  });
}

/**
 * מקבל שורות שנקראו מהמסך ({who, mine, a, b, y, h, mi, ap, text}) ומחזיר הודעות מוסתרות לשליחה.
 * aliasMap נשאר במחשב בלבד ומשמש להצגת שמות אמיתיים בחלון התוסף.
 */
export function prepare(rows, { extra = [] } = {}) {
  const ts = resolveTimes(rows);
  const counts = new Map();
  const mine = new Set();
  for (const r of rows) { if (r.mine) mine.add(r.who); else counts.set(r.who, (counts.get(r.who) || 0) + 1); }
  const others = [...counts].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const aliasMap = {};
  const subs = [];
  others.forEach((n, i) => { aliasMap[aliasFor(i)] = n; for (const t of tokens(n)) subs.push([namePattern(t), aliasFor(i)]); });
  for (const n of mine) for (const t of tokens(n)) subs.push([namePattern(t), "המדריך"]);
  for (const x of extra.map((s) => String(s).trim()).filter((s) => s.length >= 2)) subs.push([namePattern(x), "[שם]"]);
  subs.sort((p, q) => q[0].source.length - p[0].source.length);
  const messages = rows.map((r, i) => {
    let t = String(r.text).slice(0, 1800);
    for (const [rx, rep] of subs) t = t.replace(rx, (_, p) => `${p}${rep}`);
    t = scrubPII(t).replace(/@⁨?[^\s@]{1,30}⁩?/g, (m) => (/^@(?:חניך|המדריך)/.test(m) ? m : "@[שם]"));
    return { who: r.mine ? "אני" : aliasFor(others.indexOf(r.who)), ts: ts[i], text: t, kind: "text" };
  });
  return { messages, aliasMap, count: messages.length };
}

/** הודעה בודדת שסומנה או הודבקה. */
export function prepareText(text, { extra = [] } = {}) {
  let t = scrubPII(String(text ?? "").slice(0, 2000));
  for (const x of extra.map((s) => String(s).trim()).filter((s) => s.length >= 2)) t = t.replace(namePattern(x), (_, p) => `${p}[שם]`);
  return { messages: [{ who: "חניך א'", ts: null, text: t.trim(), kind: "text" }], aliasMap: {}, count: 1 };
}
