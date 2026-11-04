import mammoth from "mammoth";
import { z } from "zod";
import { STYLE_OPTIONS } from "./shared/constants.js";

const keys = (k) => Object.keys(STYLE_OPTIONS[k].options);

export const styleSchema = z
  .object({
    tone: z.enum(keys("tone")).default("warm"),
    address: z.enum(keys("address")).default("students"),
    length: z.enum(keys("length")).default("normal"),
    detail: z.enum(keys("detail")).default("bullets"),
    slang: z.enum(keys("slang")).default("none"),
    extra: z.string().trim().max(500).default(""),
    sample: z.string().trim().max(12000).default(""),
  })
  .default({ tone: "warm", address: "students", length: "normal", detail: "bullets", slang: "none", extra: "", sample: "" });

export const DEFAULT_STYLE = styleSchema.parse(undefined);

// ───────────── sample analysis (no AI needed) ─────────────

const SLANG = new Set(["יאללה", "אחלה", "וואלה", "סבבה", "בקטנה", "חבר׳ה", "חבר'ה", "חברה", "מטורף", "אש", "נו", "פשוט", "בכיף", "כפרה", "אחי", "גבר", "תותח", "מעולה", "חזק"]);
const SECOND = new Set(["אתם", "תעשו", "תגידו", "תבקשו", "שימו", "בואו", "תנו", "תחשבו", "תספרו", "קחו", "תעמדו", "ספרו", "אמרו", "חשבו", "עמדו", "שבו", "תשבו", "תכתבו", "כתבו", "דמיינו", "תדמיינו"]);
const FIRST = new Set(["אני", "אומר", "אבקש", "אציג", "אשאל", "אסביר", "אחלק", "אספר", "אפתח", "אסכם", "נעשה", "אעמיד", "אתחיל"]);
const WE = new Set(["אנחנו", "נעשה", "נשב", "נדבר", "נתחיל", "נבין", "ביחד", "יחד"]);
const IMPERSONAL = new Set(["פותחים", "עומדים", "מחלקים", "מבקשים", "שואלים", "מסבירים", "מחלקים", "מסכמים", "מתחילים", "חוזרים"]);
const HUMOR = /😂|🤣|חחח|הההה|:\)|;\)|XD/i;
const STORY = new Set(["סיפור", "פעם", "היה", "תיאר", "דמיינו", "ספר", "מספר", "חלום", "מסע", "דמות"]);

const words = (t) => t.split(/[\s,.;:!?()"'״׳\-–—•*/\\]+/).filter(Boolean);

/** Heuristic read of a pasted/uploaded sample: returns traits + suggested style options. */
export function analyzeSample(sampleRaw) {
  const sample = String(sampleRaw || "").trim();
  if (sample.length < 40) return { ok: false, reason: "הדוגמה קצרה מדי. הדביקו לפחות כמה משפטים." };

  const sentences = sample.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => words(s).length >= 2);
  const w = words(sample);
  const n = Math.max(1, sentences.length);
  const avg = Math.round((sentences.reduce((s, x) => s + words(x).length, 0) / n) * 10) / 10;
  const count = (set) => w.filter((x) => set.has(x)).length;
  const questions = (sample.match(/\?/g) || []).length;
  const bulletLines = sample.split("\n").filter((l) => /^\s*([•\-*–]|\d+[.)])\s+/.test(l)).length;
  const lines = Math.max(1, sample.split("\n").filter((l) => l.trim()).length);
  const emoji = (sample.match(/\p{Extended_Pictographic}/gu) || []).length;
  const exclam = (sample.match(/!/g) || []).length;

  const t = {
    avgSentenceWords: avg,
    questionsPer10: Math.round((questions / n) * 100) / 10,
    exclaimPer10: Math.round((exclam / n) * 100) / 10,
    second: count(SECOND),
    first: count(FIRST),
    we: count(WE),
    impersonal: count(IMPERSONAL),
    slang: count(SLANG),
    story: count(STORY),
    emoji,
    humor: HUMOR.test(sample),
    bulletShare: Math.round((bulletLines / lines) * 100) / 100,
    words: w.length,
  };

  const address = t.first > t.second && t.first > t.impersonal ? "script" : t.impersonal > t.second ? "guide" : "students";
  let tone = "warm";
  if (t.humor || t.emoji >= 3) tone = "humor";
  else if (t.slang >= 3) tone = "youth";
  else if (t.story >= 4) tone = "story";
  else if (t.we < 2 && t.exclaimPer10 < 1 && avg > 14) tone = "serious";
  const length = avg < 8 ? "short" : avg > 18 ? "long" : "normal";
  const slang = t.slang >= 6 ? "heavy" : t.slang >= 2 ? "light" : "none";
  const detail = t.bulletShare > 0.4 ? "bullets" : "script";

  const traits = [];
  traits.push(avg < 9 ? "משפטים קצרים וקצביים" : avg > 18 ? "משפטים ארוכים ומפורטים" : "משפטים באורך בינוני");
  if (t.questionsPer10 >= 1.5) traits.push("הרבה שאלות");
  if (t.exclaimPer10 >= 1.5) traits.push("סימני קריאה ואנרגיה");
  if (t.we >= 2) traits.push('לשון "אנחנו" וביחד');
  if (t.slang >= 2) traits.push("סלנג");
  if (t.emoji >= 3) traits.push("אימוג'י");
  if (t.bulletShare > 0.4) traits.push("רשימות קצרות");
  traits.push({ students: "פונה ישירות לחניכים", script: "כתוב בגוף ראשון", guide: "הוראות כלליות למדריך" }[address]);

  return { ok: true, traits, metrics: t, suggested: { tone, address, length, detail, slang } };
}

// ───────────── model instructions ─────────────

const NAMES = (k, v) => STYLE_OPTIONS[k].options[v];

/** Hebrew instructions for the model (or for an external chat) describing the requested voice. */
export function styleGuide(style) {
  const s = { ...DEFAULT_STYLE, ...style };
  const lines = [
    `טון: ${NAMES("tone", s.tone)}.`,
    `למי הטקסט פונה: ${NAMES("address", s.address)}.`,
    `אורך: ${NAMES("length", s.length)}.`,
    `רמת פירוט: ${NAMES("detail", s.detail)}.`,
    `סלנג: ${NAMES("slang", s.slang)}.`,
  ];
  if (s.extra) lines.push(`בקשות נוספות מהמדריך: ${s.extra}`);
  return lines.join("\n");
}

export const HUMAN_RULES = `כתוב כמו מדריך אמיתי שמדבר לחניכים, לא כמו מסמך משרדי.
- משפטים קצרים וטבעיים, עברית מדוברת ולא רשמית יתר על המידה.
- ציין מה המדריך אומר בפועל (בציטוט), לא רק מה "יתבקשו" לעשות.
- בלי ניסוחים כמו "החניכים יתבקשו", "בהתאם לנושא", "במסגרת הפעילות", "לאחר מכן".
- דוגמאות קונקרטיות וקצרות, ושאלות פתוחות שמזמינות תשובה אמיתית.`;

// ───────────── Word / text extraction ─────────────

export async function extractText(buffer, filename = "") {
  const name = String(filename).toLowerCase();
  let text = "";
  if (name.endsWith(".docx")) {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (name.endsWith(".txt") || name.endsWith(".md")) {
    text = buffer.toString("utf8");
  } else {
    const err = new Error("סוג קובץ לא נתמך. אפשר להעלות Word (docx) או טקסט (txt), או להדביק את הטקסט.");
    err.status = 415;
    throw err;
  }
  text = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    const err = new Error("לא נמצא טקסט בקובץ");
    err.status = 422;
    throw err;
  }
  return text.slice(0, 12000);
}
