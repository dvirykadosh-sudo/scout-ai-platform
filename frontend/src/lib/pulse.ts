// שלב 69: מד דופק פדגוגי. חישוב מקומי בלבד (בלי AI ובלי לשלוח את הטקסט לשום מקום), בפונקציות טהורות שאפשר לבדוק.
// זו הערכה לפי סוג השלב והמילים שבו, לא מדידה של הקבוצה עצמה. התחביר כאן "מחיק" (בלי enum), כדי שגם בדיקות השרת יוכלו לטעון אותו.

export type PulseKind = "open" | "body" | "peak" | "close" | "free";
export type PulseMode = "move" | "create" | "talk" | "calm" | "mixed";
export interface PulseInput {
  id: string;
  title: string;
  kind: PulseKind;
  minutes: number | null;
  text: string;
}
export interface PulsePoint {
  id: string;
  index: number;
  mode: PulseMode;
  minutes: number;
  energy: number;
  attention: number;
}
export type DropKind = "talk-run" | "long-sit" | "low-attention" | "no-movement";
export type Need = "move" | "reset";
export interface PulseDrop {
  kind: DropKind;
  /** אחרי איזה שלב (מספר סידורי מ-0) כדאי להכניס משחק מעבר */
  insertAfter: number;
  need: Need;
  message: string;
}
export type PulseLevel = "empty" | "good" | "watch" | "low";
export interface PulseResult {
  points: PulsePoint[];
  drops: PulseDrop[];
  level: PulseLevel;
  avgEnergy: number;
  minAttention: number;
  /** חלק השלבים שיש בהם מספיק טקסט כדי לנתח (0..1) */
  readyShare: number;
  summary: string;
}
export interface TransitionGame {
  id: string;
  title: string;
  minutes: number;
  need: Need;
  text: string;
}

export const LEVEL_LABEL: Record<PulseLevel, string> = { empty: "אין עדיין תוכן", good: "יציב", watch: "כדאי לבדוק", low: "נפילת קשב" };
export const MODE_LABEL: Record<PulseMode, string> = { move: "תנועה", create: "יצירה", talk: "שיחה", calm: "שקט", mixed: "מעורב" };

const MOVE = /משחק|ריצ|רוצ|תחרות|מירוץ|מרוץ|תופסת|מחבואים|שליחים|קפיצ|תנועה|ספורט|חיפוש|מסלול|סימולציה|תחנות|מתפזר|להתפזר|פסל/g;
const CREATE = /יצירה|ציור|לצייר|בנייה|לבנות|הרכב|מלאכה|הכנת|פוסטר|עיצוב|מחזה|תיאטרון|הצגה|שיר|סקיצה|קולאז/g;
const TALK = /דיון|שיחה|שאלות|שאלה|שיתוף|מעגל|סיפור|הסבר|הרצא|הקראה|סיכום|רפלקציה|נדבר|ננהל|נשב|לשבת|מחשבות|דעות|להקשיב/g;
const CALM = /שקט|מדיטציה|הרהור|התבוננות|מכתב|כתיבה אישית|נשימה/g;

const count = (re: RegExp, s: string): number => (s.match(re) ?? []).length;
const wordsOf = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const minutesOf = (m: number | null): number => clamp(Math.round(Number(m) || 5), 1, 120);

/** מסווג שלב לפי המילים שבו. שלב קצר מדי נשאר "מעורב", כדי לא להתריע על שלב שעוד לא נכתב. */
export function classify(b: PulseInput): PulseMode {
  const s = `${b.title} ${b.text}`.slice(0, 1500);
  if (wordsOf(s) < 4) return "mixed";
  const score: [PulseMode, number][] = [
    ["move", count(MOVE, s) * 1.3],
    ["create", count(CREATE, s)],
    ["talk", count(TALK, s)],
    ["calm", count(CALM, s)],
  ];
  let best: PulseMode | null = null;
  let top = 0;
  for (const [m, v] of score) {
    if (v > top) {
      top = v;
      best = m;
    }
  }
  if (best) return best;
  if (b.kind === "peak") return "talk";
  if (b.kind === "close") return "calm";
  return "mixed";
}

const BASE_ENERGY: Record<PulseMode, number> = { move: 85, create: 65, mixed: 50, talk: 35, calm: 20 };

function nextAttention(att: number, mode: PulseMode, minutes: number): number {
  switch (mode) {
    case "move":
      return clamp(att + 18, 5, 100);
    case "create":
      return clamp(att + 6, 5, 100);
    case "talk":
      return clamp(att - (10 + 0.8 * minutes), 5, 100);
    case "calm":
      return clamp(att - (5 + 0.4 * minutes), 5, 100);
    default:
      return clamp(att - 2, 5, 100);
  }
}

export function analyzePulse(blocks: PulseInput[]): PulseResult {
  const n = blocks.length;
  const points: PulsePoint[] = [];
  let att = 85;
  let ready = 0;
  blocks.forEach((b, i) => {
    const mode = classify(b);
    const minutes = minutesOf(b.minutes);
    if (wordsOf(`${b.title} ${b.text}`) >= 12) ready++;
    att = nextAttention(att, mode, minutes);
    let energy = BASE_ENERGY[mode];
    if (b.kind === "peak") energy += 8;
    if (b.kind === "open" && energy < 50) energy += 10;
    if (b.kind === "close") energy -= 5;
    points.push({ id: b.id, index: i, mode, minutes, energy: clamp(Math.round(energy), 0, 100), attention: Math.round(att) });
  });

  const readyShare = n ? ready / n : 0;
  const avgEnergy = n ? Math.round(points.reduce((s, p) => s + p.energy, 0) / n) : 0;
  const minAttention = n ? Math.min(...points.map((p) => p.attention)) : 100;
  if (n === 0 || ready === 0) {
    return { points, drops: [], level: "empty", avgEnergy, minAttention, readyShare, summary: "המד מתחיל לעבוד כשיש טקסט בשלבים (לפחות כמה משפטים בכל שלב)." };
  }

  const drops: PulseDrop[] = [];
  const taken = new Set<number>();
  const push = (d: PulseDrop) => {
    if (taken.has(d.insertAfter) || drops.length >= 3) return;
    taken.add(d.insertAfter);
    drops.push(d);
  };
  const isLastClose = (i: number) => i === n - 1 && blocks[i].kind === "close";

  // 1. שני שלבי שיחה ברצף
  for (let i = 1; i < n; i++) {
    if (points[i].mode === "talk" && points[i - 1].mode === "talk" && !isLastClose(i)) {
      push({ kind: "talk-run", insertAfter: i - 1, need: "move", message: `שלבים ${i} ו-${i + 1} הם שניהם שיחה, ובמעבר כזה הקשב נופל בדרך כלל. כדאי להכניס ביניהם רגע של תנועה.` });
    }
  }
  // 2. ישיבה רצופה ארוכה (שיחה ושקט ביחד), בלי סיום הפעולה
  let run = 0;
  for (let i = 0; i < n; i++) {
    const sit = (points[i].mode === "talk" || points[i].mode === "calm") && !isLastClose(i);
    run = sit ? run + points[i].minutes : 0;
    if (run >= 15) {
      push({ kind: "long-sit", insertAfter: Math.max(0, i - 1), need: "move", message: `שלב ${i + 1} מביא את הישיבה הרצופה לכ-${run} דקות. בקבוצות צעירות ובני נוער כדאי להזיז אותם לפני כן.` });
      run = 0;
    }
  }
  // 3. ירידת קשב כללית
  points.forEach((p, i) => {
    if (p.attention >= 40 || p.mode === "move") return;
    if ([...taken].some((t) => Math.abs(t - i) <= 1)) return;
    const at = blocks[i].kind === "close" ? Math.max(0, i - 1) : i;
    push({ kind: "low-attention", insertAfter: at, need: p.mode === "calm" ? "reset" : "move", message: `אחרי שלב ${i + 1} הקשב המוערך יורד מתחת ל-40%.` });
  });
  // 4. פעולה ארוכה בלי שום תנועה או יצירה
  const total = points.reduce((s, p) => s + p.minutes, 0);
  if (n >= 3 && total >= 40 && !points.some((p) => p.mode === "move" || p.mode === "create")) {
    push({ kind: "no-movement", insertAfter: Math.max(0, Math.floor(n / 2) - 1), need: "move", message: `כ-${total} דקות בלי שלב תנועה או יצירה. משחק קצר באמצע ישמור על הקשב.` });
  }
  drops.sort((a, b) => a.insertAfter - b.insertAfter);

  const level: PulseLevel = drops.length === 0 && minAttention >= 55 ? "good" : drops.length >= 2 || minAttention < 35 ? "low" : "watch";
  const summary =
    level === "good"
      ? "הקצב מאוזן: יש חילופי תנועה ושיחה, והקשב המוערך נשאר גבוה."
      : drops.length === 1
        ? "נמצאה נקודה אחת שבה הקשב עלול ליפול."
        : `נמצאו ${drops.length} נקודות שבהן הקשב עלול ליפול.`;
  return { points, drops, level, avgEnergy, minAttention, readyShare, summary };
}

/** בנק משחקי מעבר: קצרים, בלי ציוד, בלי הדחה ובלי ביוש. תמיד זמינים, גם בלי חיבור. */
export const GAMES: TransitionGame[] = [
  { id: "snake", title: "הנחש החי", minutes: 3, need: "move", text: "כולם עומדים בטור וידם על הכתף של מי שלפניהם. הראש מוביל את הנחש בתנועות גדולות (מתכופפים, מסתובבים, קופצים) והטור לא נשבר. כל חצי דקה הראש עובר לסוף הטור, ומי שהיה שני הופך לראש." },
  { id: "swap", title: "החלפת מקומות", minutes: 3, need: "move", text: "המדריך קורא ״כל מי ש...״ (לבש היום כחול, אוהב פיצה, יודע לשרוק). כל מי שזה נכון לגביו קם, הולך במהירות ומתיישב במקום של מישהו אחר. אחרי חמישה סיבובים חוזרים לשבת ולהמשיך." },
  { id: "statues", title: "פסלים של ערך", minutes: 4, need: "move", text: "הקבוצה מתחלקת לשלשות או רביעיות. בתוך חצי דקה כל קבוצה בונה בגוף שלה פסל שמבטא את הערך של הפעולה. כל קבוצה מציגה, והאחרים מנחשים מה הם רואים." },
  { id: "bunches", title: "חבורות של מספר", minutes: 3, need: "move", text: "המדריך קורא מספר, וכולם מתחלקים לחבורות בגודל הזה כמה שיותר מהר. מי שנשאר בחוץ מצטרף לחבורה הקרובה ושופט את הסיבוב הבא." },
  { id: "count", title: "סופרים בלי לדבר", minutes: 3, need: "reset", text: "הקבוצה סופרת מ-1 עד 20. כל אחד אומר מספר אחד בלי סדר מוסכם ובלי מבטים משדרים. אם שניים אמרו יחד, מתחילים שוב מ-1. זה מחדד קשב ומחבר את הקבוצה." },
  { id: "stretch", title: "מתיחה ונשימה", minutes: 2, need: "reset", text: "עומדים. שלוש נשימות עמוקות, מתיחה למעלה, ניעור ידיים ורגליים, ואז חוזרים לשבת במקום חדש ליד מישהו אחר." },
  { id: "mirror", title: "מראה בזוגות", minutes: 3, need: "reset", text: "בזוגות, אחד מוביל תנועות איטיות והשני משקף אותן כמו מראה. אחרי דקה מחליפים. בסוף כל זוג מתאר במילה אחת איך הרגיש." },
  { id: "circle", title: "מעגל תנועה", minutes: 3, need: "reset", text: "במעגל, כל אחד בתורו מראה תנועה קטנה אחת, כולם חוזרים עליה יחד, ועוברים הלאה עם כיוון השעון." },
];

/** בוחר משחק מעבר מתאים. seed משנה את הבחירה כדי שלא יוצע שוב ושוב אותו משחק. */
export function transitionFor(drop: PulseDrop, seed = 0): TransitionGame {
  const pool = GAMES.filter((g) => g.need === drop.need);
  return pool[Math.abs(seed + drop.insertAfter) % pool.length];
}
