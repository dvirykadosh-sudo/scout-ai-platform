// שלב 51 (346–366): תובנות על הפעולה: קצב, אנרגיה, ציוד, בהירות, לשון מכלילה, רמזים למדריך, רשימה לפני יציאה, רפלקציה ומשפט לסיום.
import { z } from "zod";
import { KINDS } from "./routes-write.js";

const plain = (t) => String(t || "").replace(/[#>*|_`]/g, " ").replace(/\s+/g, " ").trim();
const sentencesOf = (t) => plain(t).split(/(?<=[.!?:])\s+/).map((s) => s.trim()).filter(Boolean);
const stageName = (b, i) => b.title?.trim() || `שלב ${i + 1}`;

/** 346: בדיקת קצב ואיזון זמנים. */
export function paceCheck(doc) {
  const issues = [];
  const bs = doc.blocks;
  const sum = bs.reduce((s, b) => s + (b.minutes || 0), 0);
  const target = Number(doc.meta?.minutes) || 0;
  if (!bs.length) return { total: 0, target, issues: [{ level: "info", text: "אין עדיין שלבים לבדוק." }] };
  if (target && Math.abs(sum - target) > 5) issues.push({ level: "warn", text: `סך השלבים ${sum} דקות, והיעד ${target}. הפער ${Math.abs(sum - target)} דקות.` });
  bs.forEach((b, i) => {
    const m = b.minutes || 0;
    if (!m) issues.push({ level: "info", text: `ל"${stageName(b, i)}" לא הוגדר זמן.` });
    else if (sum && m / sum > 0.45 && bs.length > 2) issues.push({ level: "warn", text: `"${stageName(b, i)}" תופס ${Math.round((m / sum) * 100)}% מהפעולה. כדאי לפצל או לקצר.` });
    if (b.kind === "open" && sum && m / sum > 0.3) issues.push({ level: "warn", text: `הפתיחה ארוכה (${Math.round((m / sum) * 100)}%). חניכים מאבדים ריכוז אחרי כ-10 דקות.` });
    if (b.kind === "close" && m && m < 3) issues.push({ level: "info", text: `הסיכום קצר מאוד (${m} דקות). לא יישאר זמן לשיחה.` });
  });
  if (!bs.some((b) => b.kind === "peak")) issues.push({ level: "info", text: "אין שלב שיא. אפשר לסמן את השלב הכי חזק כשיא." });
  if (!issues.length) issues.push({ level: "ok", text: "הקצב נראה מאוזן." });
  return { total: sum, target, issues };
}

/** 347: עקומת אנרגיה לפי סוג השלב ומילות המפתח בטקסט. */
const UP = /(רצ|ריצה|משחק|תחרות|מירוץ|שיר|קפיצ|תופ|מחיאות|הפתעה|צעק|קבוצות מתחרות|מדורה)/;
const DOWN = /(דיון|כתיב|כותב|שקט|הקשבה|מעגל|סיפור|התבוננות|חשיבה|מקשיבים|רפלקציה|שיחה)/;
export function energyCurve(doc) {
  const base = { open: 3, body: 3, peak: 5, close: 2, free: 3 };
  const pts = doc.blocks.map((b, i) => {
    const t = `${b.title} ${b.text}`;
    let e = base[b.kind] ?? 3;
    if (UP.test(t)) e += 1;
    if (DOWN.test(t)) e -= 1;
    return { n: i + 1, name: stageName(b, i), energy: Math.max(1, Math.min(5, e)) };
  });
  const advice = [];
  for (let i = 1; i < pts.length; i++) if (pts[i].energy <= 2 && pts[i - 1].energy <= 2) advice.push(`שני שלבים שקטים ברצף (${pts[i - 1].n} ו-${pts[i].n}). כדאי להכניס תנועה ביניהם.`);
  for (let i = 1; i < pts.length; i++) if (pts[i].energy >= 5 && pts[i - 1].energy >= 5) advice.push(`שני שלבים עתירי אנרגיה ברצף (${pts[i - 1].n} ו-${pts[i].n}). אפשר לתת רגע נשימה.`);
  if (pts.length >= 3 && Math.max(...pts.map((p) => p.energy)) < 4) advice.push("אין שיא אנרגיה בפעולה. משחק או אתגר אחד יחיה אותה.");
  if (pts.length && pts[pts.length - 1].energy >= 5) advice.push("הפעולה נגמרת בשיא אנרגיה. כדאי לסיים בהרגעה כדי שאפשר יהיה לסכם.");
  return { points: pts, advice: advice.length ? advice : pts.length ? ["העקומה נראית טבעית: עולה לשיא ויורדת לסיכום."] : [] };
}

/** 349: רשימת ציוד לפי מילים בטקסט וגודל הקבוצה. perTeam/perPerson/fixed. */
const GEAR = [
  ["חבל", "חבל", "team", 1], ["כדור", "כדורים", "team", 1], ["נייר", "דפים", "person", 1], ["פתק", "פתקים", "person", 2], ["עט", "עטים", "person", 1], ["טוש", "טושים", "team", 2],
  ["קונוס", "קונוסים", "fixed", 8], ["דגל", "דגלים", "team", 1], ["מטפחת", "מטפחות", "person", 1], ["כיסא", "כיסאות", "person", 1], ["רמקול", "רמקול", "fixed", 1], ["מוזיקה", "רמקול או טלפון למוזיקה", "fixed", 1],
  ["שעון", "שעון עצר", "fixed", 1], ["טיימר", "שעון עצר", "fixed", 1], ["מים", "בקבוקי מים", "person", 1], ["מדורה", "עצים, גפרורים ודלי מים", "fixed", 1], ["מפה", "מפות", "team", 1], ["מצפן", "מצפנים", "team", 1],
  ["דלי", "דליים", "team", 1], ["כוסות", "כוסות", "person", 1], ["שק", "שקים", "team", 1], ["צבע", "צבעים", "team", 1], ["מספריים", "מספריים", "team", 1], ["דבק", "דבק", "team", 1], ["לוח", "לוח או דפי פלפצ'ארט", "fixed", 1], ["כרטיס", "כרטיסים", "person", 1],
];
export function gearList(doc) {
  const n = Math.max(2, Number(doc.meta?.groupSize) || 20);
  const teams = n >= 24 ? 4 : n >= 12 ? 3 : 2;
  const text = doc.blocks.map((b) => `${b.title} ${b.text}`).join(" ");
  const seen = new Map();
  for (const [kw, item, mode, k] of GEAR) {
    if (!text.includes(kw)) continue;
    const qty = mode === "person" ? n * k : mode === "team" ? teams * k : k;
    if (!seen.has(item) || seen.get(item).qty < qty) seen.set(item, { item, qty, basis: mode === "person" ? `לכל חניך (${n})` : mode === "team" ? `לכל קבוצה (${teams})` : "פעם אחת" });
  }
  return { participants: n, teams, items: [...seen.values()], note: "הכמויות הן הערכה לפי גודל הקבוצה שהוגדר, ולא ספירה מדויקת. עברו על הרשימה." };
}

/** 355: בהירות: משפטים ארוכים ומילים ארוכות מאוד. */
export function clarityCheck(doc) {
  const issues = [];
  doc.blocks.forEach((b, i) => {
    for (const s of sentencesOf(b.text)) {
      const words = s.split(" ").length;
      if (words > 24) issues.push({ stage: i + 1, name: stageName(b, i), text: s.slice(0, 110) + (s.length > 110 ? "…" : ""), why: `משפט של ${words} מילים. כדאי לפצל לשניים.` });
    }
    const long = (plain(b.text).match(/[א-ת]{13,}/g) || []).slice(0, 2);
    for (const w of long) issues.push({ stage: i + 1, name: stageName(b, i), text: w, why: "מילה ארוכה מאוד. אפשר לנסח פשוט יותר?" });
  });
  return { issues: issues.slice(0, 30), ok: issues.length === 0 };
}

/** 356: בדיקת לשון מכלילה (פנייה לשני המינים). */
export function inclusiveCheck(doc) {
  const hits = [];
  const rules = [
    [/(?<![א-ת])חניכים(?!\s*(?:ו|או)\s*חניכות)(?![א-ת])/g, "חניכים", "חניכים וחניכות"],
    [/(?<![א-ת])המדריכים(?![א-ת])/g, "המדריכים", "המדריכים והמדריכות"],
    [/(?<![א-ת])כולם(?![א-ת])/g, "כולם", "כולם וכולן"],
    [/(?<![א-ת])הילדים(?![א-ת])/g, "הילדים", "הילדים והילדות"],
    [/(?<![א-ת])הבנים(?![א-ת])/g, "הבנים", "הבנים והבנות (אם הקבוצה מעורבת)"],
  ];
  doc.blocks.forEach((b, i) => {
    const t = `${b.title} ${b.text}`;
    for (const [re, found, sug] of rules) {
      const m = t.match(re);
      if (m) hits.push({ stage: i + 1, name: stageName(b, i), found, suggest: sug, count: m.length });
    }
  });
  return { hits: hits.slice(0, 30), note: "זו הצעה בלבד. בקבוצה שכולה בני אותו מין לא חייבים לשנות, ובטקסט שמיועד לדיבור אפשר לבחור ניסוח שזורם." };
}

/** 354: רמזים למדריך לכל שלב. */
const TIPS = {
  open: { say: "פתחו בשאלה או במשימה קצרה, לא בהסבר ארוך.", watch: "מי נכנס לפעולה ומי נשאר בצד.", stuck: "אם אין תגובה: בקשו הצבעה ביד או רגליים (מי מסכים, עומד)." },
  body: { say: "הסבירו את הכלל פעם אחת, והראו דוגמה.", watch: "קבוצות שמתפזרות או חניך שמשתלט.", stuck: "אם מסתבכים: עצרו, חזרו על הכלל במשפט אחד, והתחילו סבב מחדש." },
  peak: { say: "הכריזו שזה השלב המרכזי וצרו ציפייה.", watch: "בטיחות, ולחץ יתר מהתחרות.", stuck: "אם האנרגיה נמוכה: קצרו את הסבר והפעילו את המשחק מיד." },
  close: { say: "תנו לחניכים לסכם, לא אתם.", watch: "מי לא דיבר בכל הפעולה, ותנו לו הזדמנות.", stuck: "אם אין זמן: שאלה אחת, כל אחד עונה במשפט." },
  free: { say: "הגדירו מה מצופה בשלב הזה לפני שמתחילים.", watch: "קצב ומצב רוח.", stuck: "אם לא עובד: דלגו, ותחזרו אליו אם נשאר זמן." },
};
export const stageTips = (doc) => doc.blocks.map((b, i) => ({ n: i + 1, name: stageName(b, i), ...(TIPS[b.kind] || TIPS.free) }));

/** 364: רשימה לפני יציאה לפעולה. */
export function preflight(doc) {
  const text = doc.blocks.map((b) => `${b.title} ${b.text}`).join(" ");
  const items = ["תוכנית הפעולה מודפסת או פתוחה בטלפון", "רשימת חניכים ונוכחות", "טלפון טעון ומספר ההורים לשעת חירום", "ערכת עזרה ראשונה זמינה", "ידוע לי על חניכים עם רגישויות או מגבלות"];
  const add = (kw, line) => { if (text.includes(kw) && !items.includes(line)) items.push(line); };
  add("מים", "מים לשתייה לכולם");
  add("מדורה", "מקום בטוח למדורה, דלי מים ומטף");
  add("שביל", "מסלול נבדק ושעת חזרה מוסכמת");
  add("טיול", "אישורי הורים ליציאה");
  add("חוץ", "בדיקת מזג אוויר ותוכנית גיבוי");
  add("אולם", "מפתח לאולם ותאורה תקינה");
  add("מוזיקה", "רמקול טעון ושיר מוכן");
  for (const g of gearList(doc).items.slice(0, 8)) items.push(`ציוד: ${g.item} (${g.qty})`);
  return { items };
}

/** 352: שאלות רפלקציה. */
export function reflection({ value, age }) {
  const v = value || "הערך של היום";
  const young = /^(כיתה|כיתות)\s*[א-ד]/.test(String(age || ""));
  const qs = young
    ? [`מה היה הכי כיף בפעולה?`, `מתי הרגשתם ${v} היום?`, `מה למדתם שלא ידעתם?`, `מה תספרו להורים?`, `מה הייתם רוצים לעשות שוב?`]
    : [`איפה ראיתם היום ${v} בפעולה, ואיפה חסר?`, `מה הפתיע אתכם?`, `מה הייתם משנים בפעולה אילו הייתם המדריכים?`, `איזו החלטה אחת אתם לוקחים איתכם מהפעולה?`, `למי בקבוצה אתם רוצים להודות, ועל מה?`];
  return { questions: qs };
}

/** 365: משפט לסיום. כל המשפטים מקוריים ואינם ציטוטים. */
const LINES = {
  default: ["קבוצה היא לא מקום שבו כולם אותו דבר, אלא מקום שבו כולם נחשבים.", "מה שעושים ביחד נשאר איתנו הרבה אחרי שהפעולה נגמרת.", "גם צעד קטן בכיוון הנכון נחשב."],
  אחריות: ["אחריות מתחילה בשאלה אחת: מה התפקיד שלי כאן?", "מי שלוקח אחריות על דבר קטן יידע לקחת גם על דבר גדול."],
  חברות: ["חבר הוא מי ששם לב כשאתה שקט.", "חברות נבנית מרגעים קטנים, בדיוק כמו הרגע הזה."],
  אומץ: ["אומץ הוא לעשות את הדבר הנכון גם כשהוא לא נוח.", "אפשר לפחד ולעשות. זה בדיוק מה שאומץ."],
  כבוד: ["כבוד מתחיל בהקשבה עד סוף המשפט.", "אפשר לא להסכים וגם לכבד."],
  "עבודת צוות": ["צוות חזק לא מחפש מי אשם, אלא מה עושים עכשיו.", "כשכל אחד מביא קצת, יש בשפע."],
};
export function closingLine({ value }) {
  const pool = LINES[value] || LINES.default;
  return { lines: [...pool, ...(LINES[value] ? LINES.default.slice(0, 1) : [])] };
}

const docZ = z.object({
  title: z.string().max(120).default(""),
  meta: z.any().default({}),
  blocks: z.array(z.object({ id: z.string().max(24).default("x"), title: z.string().max(120).default(""), kind: z.enum(KINDS).default("free"), minutes: z.number().int().min(0).max(300).nullable().default(null), text: z.string().max(20000).default(""), note: z.string().max(5000).default("") })).max(60),
});
const TOOLS = { pace: paceCheck, energy: energyCurve, gear: gearList, clarity: clarityCheck, inclusive: inclusiveCheck, tips: (d) => ({ tips: stageTips(d) }), preflight, reflect: (d) => reflection({ value: d.meta?.value, age: d.meta?.ageGroup }), closing: (d) => closingLine({ value: d.meta?.value }) };

export function registerWriteV51Routes(app, { limiter, requireUser }) {
  const lim = limiter(60_000, 90);
  app.post("/api/write/insights/:tool", requireUser(), lim, (req, res) => {
    const f = TOOLS[req.params.tool];
    if (!f) return res.status(404).json({ error: { code: "NOT_FOUND", message: "הכלי לא נמצא" } });
    res.json(f(docZ.parse(req.body ?? {})));
  });
}
