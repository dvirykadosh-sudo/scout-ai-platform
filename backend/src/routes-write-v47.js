// שלב 47 (326–335): מפת תחנות, הקראה, תרגול קולי, סיפורי פתיחה, חידונים, כרטיסי תפקידים ודפי הדפסה.
import { z } from "zod";
import { KINDS } from "./routes-write.js";

const STOP = new Set("של על את עם אל אני אתה אתם אנחנו הוא היא הם הן זה זו זאת אבל אם או כי גם לא כל כמו מה מי איך למה מתי איפה אחר אחרי לפני בין עוד רק כך כן יש אין היה היו להיות יהיה נהיה כדי שלא שאנחנו שהם הזה הזו האלה אלה אותו אותה אותם אותן ואז אז כאן שם פה לכם לנו להם שלנו שלכם עליו עליה עליהם בו בה בהם ממנו ממנה מהם לאחר ובסוף ובסיום בסוף בהתחלה כולם כולנו אחד אחת שני שתי שלוש שלושה חניכים חניך מדריך מדריכה שלב דקות דקה".split(/\s+/));
const HEB = /[א-ת]/;
// מסירים רק "ו" חיבור. השאר (ה, ב, ל, מ) עלולים לחתוך שורש של מילה ולכן נשארים.
const stripPrefix = (w) => (w.length > 5 && w[0] === "ו" ? w.slice(1) : w);
const sentences = (t) => String(t || "").replace(/[#>*|]/g, " ").split(/(?<=[.!?:])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 12);

/** מילות מפתח עם משפט הקשר, לתשבץ, בינגו, זיכרון וחידונים. */
export function keywordsFrom(doc, max = 16) {
  const text = [doc.title, ...doc.blocks.map((b) => b.text)].join("\n");
  const freq = new Map();
  const first = new Map();
  const ss = sentences(text);
  for (const s of ss) {
    for (const raw of s.replace(/["״'׳,.!?:;()\-–]/g, " ").split(/\s+/)) {
      if (!raw || !HEB.test(raw)) continue;
      const w = stripPrefix(raw.replace(/[^א-ת]/g, ""));
      if (w.length < 4 || w.length > 9 || STOP.has(w) || STOP.has(raw)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
      if (!first.has(w)) first.set(w, s);
    }
  }
  const out = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, max);
  return out.map(([word]) => {
    const s = first.get(word) || "";
    const idx = s.indexOf(word);
    let clue = s;
    if (idx >= 0) clue = (s.slice(0, idx) + "_____" + s.slice(idx + word.length)).replace(/\s+/g, " ");
    else clue = s.replace(new RegExp(`[א-ת]*${word}[א-ת]*`), "_____");
    return { word, clue: clue.slice(0, 120) };
  });
}

const OPENERS = [
  (t) => `דמיינו שאתם מגיעים מחר בבוקר ומגלים שמשהו השתנה לגמרי בכל מה שקשור ל${t}. מה הדבר הראשון שאתם שמים לב אליו?`,
  (t) => `לפני הרבה שנים, בשבט כמו שלנו, ישבה קבוצה סביב מדורה וניסתה להבין מה זה באמת "${t}". כל אחד אמר דבר אחר, ואף אחד לא הסכים. עד שמישהו אמר משפט אחד שהחליף את הכול. בואו נגלה מה הוא אמר.`,
  (t) => `קבלתי הבוקר הודעה מסתורית. כתוב בה רק שתי מילים: "${t}", ומתחת: "תבינו עד הערב". יש לי הרגשה שאתם יכולים לעזור לי לפענח.`,
  (t) => `יש לי שאלה אחת, והיא לא קלה: מתי בפעם האחרונה עשיתם משהו שקשור ל${t}, ולא ידעתם שזה בכלל קשור? הרימו יד אם יש לכם דוגמה.`,
  (t) => `נעשה ניסוי קצר: אני אגיד מילה, ואתם תצעקו את הדבר הראשון שעולה לכם בראש. המילה היא: ${t}.`,
  (t) => `מי מכם שמע פעם את המשפט "${t} זה לא רק מילה"? היום נבין למה מי שאמר אותו צדק.`,
];
export function storyIdeas({ topic, value }) {
  const t = topic || value || "הנושא של היום";
  const start = [...t].reduce((a, c) => a + c.charCodeAt(0), 0) % OPENERS.length;
  return Array.from({ length: 3 }, (_, i) => ({ style: ["שאלת דמיון", "סיפור קצר", "תעלומה", "שאלה אישית", "ניסוי מהיר", "ציטוט"][(start + i) % OPENERS.length], text: OPENERS[(start + i) % OPENERS.length](t) }));
}

/** חידון השלמה מהטקסט: משפט עם חור ושלוש אפשרויות. */
export function quizFrom(doc, n = 5) {
  const kws = keywordsFrom(doc, 24);
  const items = [];
  for (const k of kws) {
    if (!k.clue.includes("_____") || k.clue.length < 25) continue;
    const others = kws.filter((x) => x.word !== k.word && Math.abs(x.word.length - k.word.length) <= 3).map((x) => x.word).slice(0, 2);
    if (others.length < 2) continue;
    const opts = [k.word, ...others].sort((a, b) => (a < b ? -1 : 1));
    items.push({ q: k.clue, options: opts, answer: k.word });
    if (items.length >= n) break;
  }
  return items;
}

const ROLE_SETS = {
  "דיון": ["מנהיג/ה", "מסכם/ת", "מתעקש/ת על שאלות", "מייצג/ת דעה אחרת", "מקשיב/ה ומחבר/ת", "מנהל/ת זמן"],
  "משחק": ["שוטר/ת הכללים", "מאמן/ת", "ספר/ית", "צלם/ת", "מעודד/ת", "מתעד/ת נקודות"],
  "הצגה": ["במאי/ת", "שחקן/ית ראשי/ת", "מספר/ת", "תפאורן/ית", "קול הקהל", "מבקר/ת תיאטרון"],
  "כללי": ["מנהיג/ה", "יוזם/ת", "מסכם/ת", "מתווך/ת", "שואל/ת השאלות", "שומר/ת הזמן"],
};

export function registerWriteV47Routes(app, { limiter, requireUser }) {
  const lim = limiter(60_000, 60);
  const blockZ = z.object({ id: z.string().max(24).default("x"), title: z.string().max(120).default(""), kind: z.enum(KINDS).default("free"), minutes: z.number().int().min(0).max(300).nullable().default(null), text: z.string().max(20000).default(""), note: z.string().max(5000).default("") });
  const docZ = z.object({ title: z.string().max(120).default(""), meta: z.any().default({}), blocks: z.array(blockZ).max(60) });
  app.post("/api/write/keywords", requireUser(), lim, (req, res) => res.json({ words: keywordsFrom(docZ.parse(req.body ?? {})) }));
  app.post("/api/write/story-ideas", requireUser(), lim, (req, res) => {
    const v = z.object({ topic: z.string().trim().max(80).default(""), value: z.string().trim().max(40).default("") }).parse(req.body ?? {});
    res.json({ ideas: storyIdeas(v) });
  });
  app.post("/api/write/quiz", requireUser(), lim, (req, res) => {
    const q = quizFrom(docZ.parse(req.body ?? {}));
    res.json({ items: q, note: q.length ? "" : "אין מספיק טקסט כדי לבנות שאלות. כתבו עוד כמה משפטים בשלבים." });
  });
  app.get("/api/write/role-sets", requireUser(), lim, (_req, res) => res.json(ROLE_SETS));
}
