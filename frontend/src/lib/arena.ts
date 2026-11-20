// שלב 71: "זירת משחק". הלוגיקה הטהורה: חידון שנבנה מטקסט הפעולה עצמה, גלגל מזל הוגן ולוח ניקוד.
// בלי AI ובלי רשת (0₪): השאלות נוצרות מהמשפטים של הפעולה, והמדריך יכול לדלג, לערוך ולהוסיף שאלות משלו.
// תחביר "מחיק" בלבד (בלי enum), כי בדיקות השרת טוענות את הקובץ ישירות.

export interface QStage {
  name: string;
  minutes: number;
  layer?: string;
  content: string;
}
export interface Question {
  id: string;
  kind: "cloze" | "stage" | "time" | "custom";
  prompt: string;
  options: string[];
  /** אינדקס התשובה הנכונה בתוך options */
  answer: number;
  source: string;
}
export interface BuildOptions {
  /** שלב אחד בלבד (אינדקס), או null לכל הפעולה */
  stageIndex?: number | null;
  count?: number;
  seed?: number;
}
export interface BuildResult {
  questions: Question[];
  /** נאלצנו להרחיב לכל הפעולה כי בשלב אחד אין מספיק טקסט */
  widened: boolean;
}

/** מחולל פסאודו-אקראי עם זרע, כדי שאותו מדריך יקבל אותן שאלות כשהוא חוזר (ושהבדיקות יהיו יציבות). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(list: T[], rnd: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** אקראי אמיתי (crypto) לגלגל המזל. נופל חזרה ל-Math.random רק כשאין crypto. */
export function secureRandom(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    const b = new Uint32Array(1);
    c.getRandomValues(b);
    return b[0] / 4294967296;
  }
  return Math.random();
}

const STOP = new Set(
  "בעזרת אחרי לפני במשך יחד שלהם שלהן שלנו אותם אותן אלה אלו הזאת הזה הזו כאשר בזמן ואחר כך גם כל כולם כולן אחד אחת שני שתי שתיים יכולים יכולות צריכים צריכות חניכים חניכות החניכים החניכות הקבוצה קבוצה קבוצות הקבוצות מדריך המדריך המדריכה מדריכה דקות דקה אפשר רצוי חשוב לאחר ואז עוד מאוד כמה איזה מהם מהן עליהם עליהן אליהם אליהן בסוף בהתחלה במקום ביניהם ביניהן ובסיום לסיום שוב כדי שכל כאן שם".split(" "),
);
const HEB = /^[א-ת]+$/;
const clean = (w: string) => w.replace(/^[^א-תA-Za-z0-9]+|[^א-תA-Za-z0-9]+$/g, "");
const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);

/** פיצול לטקסט משפטים קצרים וקריאים (5–24 מילים). */
export function sentencesOf(text: string): string[] {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter((s) => {
      const n = wordsOf(s).length;
      return n >= 5 && n <= 24;
    });
}

const keywordsOf = (sentence: string): string[] => wordsOf(sentence).map(clean).filter((w) => HEB.test(w) && w.length >= 4 && w.length <= 12 && !STOP.has(w));

const uniq = (a: string[]) => [...new Set(a)];
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

function place(correct: string, wrong: string[], rnd: () => number): { options: string[]; answer: number } {
  const options = shuffle([correct, ...wrong.slice(0, 3)], rnd);
  return { options, answer: options.indexOf(correct) };
}

/** בונה חידון: משפטי השלמה מהטקסט, "באיזה שלב", וזמני השלבים. */
export function buildQuiz(stages: QStage[], { stageIndex = null, count = 8, seed = 1 }: BuildOptions = {}): BuildResult {
  const rnd = mulberry32(seed);
  const all = stages.map((s, i) => ({ s, i }));
  const scoped = stageIndex != null && stages[stageIndex] ? all.filter((x) => x.i === stageIndex) : all;

  // מאגר מילים ממסיחים מכל הפעולה, כדי שגם שלב קצר יקבל מסיחים סבירים
  const pool = uniq(all.flatMap(({ s }) => sentencesOf(s.content).flatMap(keywordsOf)));

  const cloze = (scope: { s: QStage; i: number }[]): Question[] => {
    const out: Question[] = [];
    for (const { s, i } of scope) {
      for (const sent of sentencesOf(s.content)) {
        const ks = keywordsOf(sent);
        if (!ks.length) continue;
        const cands = ks.slice().sort((a, b) => b.length - a.length || (rnd() < 0.5 ? -1 : 1));
        const key = cands.find((k) => sent.split(k).length === 2); // מופיעה פעם אחת בדיוק במשפט
        if (!key) continue;
        const wrong = shuffle(
          pool.filter((p) => p !== key && !sent.includes(p) && Math.abs(p.length - key.length) <= 3),
          rnd,
        ).slice(0, 3);
        if (wrong.length < 3) continue;
        const { options, answer } = place(key, wrong, rnd);
        out.push({ id: `c${i}-${out.length}`, kind: "cloze", prompt: `השלימו: ${sent.replace(key, "_____")}`, options, answer, source: s.name });
      }
    }
    return shuffle(out, rnd);
  };

  const names = uniq(stages.map((s) => s.name));
  const whichStage = (scope: { s: QStage; i: number }[]): Question[] => {
    if (names.length < 3) return [];
    const out: Question[] = [];
    for (const { s, i } of scope) {
      const first = sentencesOf(s.content)[0];
      if (!first) continue;
      const wrong = shuffle(names.filter((n) => n !== s.name), rnd).slice(0, 3);
      const { options, answer } = place(s.name, wrong, rnd);
      out.push({ id: `s${i}`, kind: "stage", prompt: `באיזה שלב עושים: "${clip(first, 110)}"`, options, answer, source: s.name });
    }
    return shuffle(out, rnd);
  };

  const timing = (scope: { s: QStage; i: number }[]): Question[] => {
    const out: Question[] = [];
    for (const { s, i } of scope) {
      if (!(s.minutes > 0)) continue;
      const near = uniq([s.minutes + 5, Math.max(1, s.minutes - 5), s.minutes + 10, s.minutes * 2, ...all.map((x) => x.s.minutes)].filter((m) => m > 0 && m !== s.minutes).map(String));
      const wrong = shuffle(near, rnd).slice(0, 3);
      if (wrong.length < 3) continue;
      const { options, answer } = place(String(s.minutes), wrong, rnd);
      out.push({ id: `t${i}`, kind: "time", prompt: `כמה דקות מוקדשות לשלב "${s.name}"?`, options: options.map((o) => `${o} דקות`), answer, source: s.name });
    }
    return shuffle(out, rnd);
  };

  const mix = (scope: { s: QStage; i: number }[]): Question[] => {
    const c = cloze(scope);
    const w = whichStage(scope);
    const t = timing(scope);
    const out: Question[] = [];
    // קצב: שתי השלמות, שאלת שלב, שאלת זמן וחוזר חלילה
    const order: Question[][] = [c, c, w, c, t];
    let k = 0;
    while (out.length < count && order.some((l) => l.length)) {
      const l = order[k++ % order.length];
      const q = l.shift();
      if (q && !out.some((o) => o.id === q.id)) out.push(q);
    }
    return out;
  };

  let questions = mix(scoped);
  let widened = false;
  if (questions.length < 3 && scoped.length < all.length) {
    widened = true;
    questions = mix(all);
  }
  return { questions: questions.slice(0, count), widened };
}

/**
 * שאלות משלכם. כל שורה: שאלה | תשובה נכונה | שגויה | שגויה | שגויה (שתיים עד שלוש שגויות).
 * השורה הריקה או בלי מפריד מתעלמים ממנה, ומחזירים רשימה של שורות שלא הובנו כדי שנוכל להציג אותן.
 */
export function parseCustom(text: string, seed = 7): { questions: Question[]; bad: number[] } {
  const rnd = mulberry32(seed);
  const questions: Question[] = [];
  const bad: number[] = [];
  String(text ?? "")
    .split(/\n+/)
    .forEach((line, i) => {
      if (!line.trim()) return;
      const p = line.split("|").map((x) => x.trim());
      const [prompt, right, ...wrong] = p;
      const w = uniq(wrong.filter(Boolean)).filter((x) => x !== right).slice(0, 3);
      if (!prompt || !right || w.length < 2) return void bad.push(i + 1);
      const { options, answer } = place(right, w, rnd);
      questions.push({ id: `u${i}`, kind: "custom", prompt, options, answer, source: "שאלה שלכם" });
    });
  return { questions, bad };
}

/* ───────── גלגל מזל ───────── */

export const pickWinner = (n: number, rnd: () => number = secureRandom): number => Math.min(n - 1, Math.floor(rnd() * n));

/** זווית הסיבוב הסופית (במעלות, עם כיוון השעון) שבה המצביע שבראש הגלגל נעצר באמצע הפלח של הנבחר, עם סטייה קטנה. */
export function spinTarget(n: number, winner: number, turns = 5, jitter = 0): number {
  const seg = 360 / n;
  const j = Math.max(-0.35, Math.min(0.35, jitter));
  return turns * 360 - (winner + 0.5 + j) * seg;
}
/** איזה פלח נמצא מתחת למצביע בזווית נתונה. */
export function landing(rotation: number, n: number): number {
  const seg = 360 / n;
  const angle = (((-rotation % 360) + 360) % 360);
  return Math.min(n - 1, Math.floor(angle / seg));
}

/** משימות מוכנות לגלגל. כולן בטוחות לשכבת גיל צעירה, בלי מגע ובלי חשיפה אישית. */
export const WHEEL_TASKS = [
  "פנטומימה של מילה מהפעולה",
  "לשיר שורה משיר שבט",
  "להמציא קריאת עידוד לקבוצה",
  "לעמוד על רגל אחת עד הסיבוב הבא",
  "לתאר חפץ בלי להגיד את שמו",
  "לספר בדיחה נקייה",
  "להצביע על מי שנראה הכי מרוכז",
  "לעשות שלוש קפיצות ולהגיד ״הנה אני״",
  "לבחור חבר שיענה על השאלה הבאה",
  "לחקות חיה שהקבוצה מנחשת",
];

/* ───────── לוח ניקוד ───────── */

export interface Team {
  id: string;
  name: string;
  color: string;
  score: number;
}
export const TEAM_COLORS = ["#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#ec4899"];
export const MAX_TEAMS = 6;

export function newTeams(n = 3): Team[] {
  return Array.from({ length: Math.max(2, Math.min(MAX_TEAMS, n)) }, (_, i) => ({ id: `t${i + 1}`, name: `קבוצה ${i + 1}`, color: TEAM_COLORS[i % TEAM_COLORS.length], score: 0 }));
}
export const award = (teams: Team[], id: string, pts: number): Team[] => teams.map((t) => (t.id === id ? { ...t, score: Math.max(0, t.score + pts) } : t));

/** דירוג עם תיקו: שתי קבוצות באותו ניקוד חולקות מקום. ממוינות מהגבוהה לנמוכה. */
export function rank(teams: Team[]): (Team & { place: number })[] {
  const sorted = teams.slice().sort((a, b) => b.score - a.score);
  return sorted.map((t, i) => ({ ...t, place: i > 0 && sorted[i - 1].score === t.score ? 0 : i + 1 })).reduce<(Team & { place: number })[]>((acc, t) => {
    acc.push({ ...t, place: t.place || acc[acc.length - 1].place });
    return acc;
  }, []);
}
