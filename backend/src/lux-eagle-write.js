// שלב 62ב: מעוז עוזר לכתוב. הכול מחובר לכלים שכבר קיימים באתר ועובד בלי מפתח ובלי מודל: מחולל הפעולות,
// העורך, שאלות לדיון, משחקי פתיחה וחימום, סיפורים וכותרות. מעוז לא כותב "מהראש": הוא מבין מה ביקשתם,
// מסדר את הפרטים ומוביל אתכם לכלי הנכון, ומציג מיד את מה שהמאגרים הקיימים יודעים לתת.
// הפונקציה מחזירה null כשהשאלה אינה בקשת כתיבה, ואז המנוע הרגיל ממשיך.
import { apportion } from "./ai.js";
import { STORIES, VALUES } from "./content.js";
import { STAGE_NAMES } from "./shared/constants.js";
import { norm, stems } from "./smart-search.js";
import { pickIcebreakers } from "./tools.js";
import { pickWarmups } from "./content.js";
import { titleIdeas } from "./routes-write-more.js";

const L = (label, href) => ({ label, href });
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// ───────────── זיהוי כוונה ─────────────
const MSG = /(הודעה|הודעת|נוסח)\s*(ל?(חניכים|הורים|קבוצה|וואטסאפ|בוואטסאפ|לפני הפעולה)|תזכורת)|תנסח לי הודעה|תכתוב לי הודעה/;
const QUESTIONS = /(שאלות (לדיון|לשיחה|להעמקה|לסיכום)|שאלה לדיון|שאלות לקבוצה)/;
const GAMES = /(משחק(ים)? (היכרות|הכרות|פתיחה|חימום|קצר|למעבר|לשקט|לסיום|להכרות)|שבירת קרח|שוברי קרח|משחק להיכרות|לחמם את הקבוצה|משחק מעבר|משחק לחימום)/;
const STORY = /((תן לי|יש לך|תציע|תמליץ|רעיון ל|מחפש|צריך|אפשר)[^.?]{0,24}(סיפור|משל))|((סיפור|משל) (על|ל|בנושא|קצר))/;
const TITLES = /(שם לפעולה|כותרת לפעולה|שמות לפעולה|כותרות לפעולה|רעיון לשם|איך לקרוא לפעולה|תן לי שם)/;
const WRITE = /((תכתוב|תכתבי|כתוב|תכין|תכיני|תבנה|תבני|תיצור|תצור|צור|תכנן|תתכנן)[^.?]{0,24}פעולה)|((תעזור|עזור|תעזרי|עזרי) לי (ל?כתוב|ל?הכין|ל?בנות|ל?תכנן)[^.?]{0,24})|((רוצה|צריך|צריכה|מעוניין|מעוניינת) (ל?כתוב|ל?הכין|ל?בנות|ל?תכנן)[^.?]{0,24}פעולה)/;

// ───────────── חילוץ פרטים מהבקשה ─────────────
const GRADE_ORDER = ["ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב"];
export function parseAge(q) {
  const m = /(?:כיתה|כיתות|שכבת|שכבה|לכיתה|לשכבת)\s*([א-י]{1,2})(?![א-ת])['׳’"]?/.exec(q) || /(?:^|\s)ל(?:כיתה\s*)?([ג-י]|י[אב])['׳’"](?![א-ת])/.exec(q);
  const g = m?.[1];
  if (!g || !GRADE_ORDER.includes(g)) return "";
  const sex = /בנות/.test(q) ? "בנות" : /בנים/.test(q) ? "בנים" : "מעורב";
  return `כיתה ${g}' - ${sex}`;
}
export function parseMinutes(q) {
  if (/שעה וחצי/.test(q)) return 90;
  if (/חצי שעה/.test(q)) return 30;
  if (/(?:^|\s)שעה(?![א-ת])/.test(q) && !/\d+\s*שעות?/.test(q)) return 60;
  const m = /(\d{1,3})\s*דקות?/.exec(q);
  const n = m ? Number(m[1]) : 0;
  return n >= 5 && n <= 180 ? n : 0;
}
/** ערך לפי כל מילה משמעותית בשמו ("חברות" ← "אחווה וחברות"), גם עם קידומת ("לאחריות"). */
const GENERIC = new Set(["פעולה", "פעולות"]);
export function valueAny(q) {
  const toks = norm(q).split(" ").filter(Boolean);
  const forms = new Set(toks.flatMap((t) => [t, ...stems(t)]));
  return (
    VALUES.find((v) =>
      norm(v.label)
        .split(" ")
        .map((w) => (w.startsWith("ו") && w.length > 4 ? w.slice(1) : w))
        .some((w) => w.length >= 4 && !GENERIC.has(w) && forms.has(w)),
    ) || null
  );
}

/** מוריד מהשאלה את מילות הבקשה, הגיל והזמן, וממנו נשאר הנושא החופשי. */
const NOISE = new Set(
  "תכתוב תכתבי כתוב תכין תכיני תבנה תבני תיצור תצור צור תכנן תתכנן תעזור עזור תעזרי עזרי לי לכתוב להכין לבנות לתכנן רוצה צריך צריכה פעולה פעולות על בנושא עם של את אני אתה לכיתה כיתה כיתות שכבת שכבה דקות דקה שעה חצי וחצי בנים בנות מעורב מעורבת תן יש לך רעיון רעיונות שאלות לדיון משחק משחקים הודעה סיפור משל שם כותרת קצר קצרה קצרים בבקשה בלי ציוד ללא להורים לחניכים לקבוצה בוואטסאפ הורים חניכים וואטסאפ בנושא טיוטה".split(" ").map((w) => norm(w)),
);
export function parseTopic(q) {
  return norm(q)
    .replace(/\d+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !NOISE.has(w) && !/^[א-י]{1,2}['׳]?$/.test(w))
    .join(" ")
    .trim();
}

// ───────────── תשובות ─────────────
const youngOf = (age) => ["ג", "ד", "ה"].includes(/כיתה ([א-י]+)'/.exec(age)?.[1] || "");
const oldOf = (age) => ["ח", "ט", "י", "יא", "יב"].includes(/כיתה ([א-י]+)'/.exec(age)?.[1] || "");

/** שאלות לדיון בשלוש רמות (אישית, קבוצתית, ערכית), מותאמות לגיל אם צוין. */
export function discussionSet(subject, value, age) {
  const s = `"${subject}"`;
  const out = [
    youngOf(age) ? `ספרו על פעם אחת שבה פגשתם ${s}. מה קרה ומה עשיתם?` : `מתי בשבוע האחרון נתקלתם ב${s}? מה עשיתם, ומה הייתם עושים אחרת?`,
    `איפה בקבוצה שלנו רואים ${s}, ואיפה הוא חסר?`,
    `אם ${s} חשוב לנו, מה צעד אחד קטן שכל אחד יכול לעשות השבוע?`,
  ];
  if (oldOf(age)) out.push(`מתי ${s} מתנגש במשהו חשוב אחר, כמו חברות או נוחות? איך מחליטים?`);
  for (const t of (value?.topics || []).slice(0, 2)) out.push(`על "${t}": מה זה אומר עלינו כקבוצה?`);
  return out.slice(0, 6);
}

function gameLine(g) {
  return `${g.name} (${g.minutes} ${g.minutes === 1 ? "דקה" : "דקות"}${g.equipment ? `, ציוד: ${g.equipment}` : ", בלי ציוד"}): ${g.how}`;
}

function skeleton(minutes) {
  const parts = apportion([1, 3, 3, 2, 1], minutes);
  return STAGE_NAMES.map((n, i) => `${n} ${parts[i]}`).join(" · ");
}

/**
 * @param {string} q
 * @param {{ db: any, user: {id:number}|null, valueHit: (q:string)=>any, kindHit: (q:string)=>any, methodHit: (q:string)=>any, findActivities: Function, rng?: ()=>number }} env
 */
export function writeHelp(q, env) {
  const { db, user, valueHit, kindHit, methodHit, findActivities, rng = () => Math.floor(Math.random() * 1e9) } = env;
  const nq = norm(q);
  const value = valueHit(q) || valueAny(q);
  const age = parseAge(q);
  const minutes = parseMinutes(q);
  const topic = value ? value.label : parseTopic(q);

  // הודעה לחניכים או להורים, בנוסח שמשלימים בו את הפרטים
  if (MSG.test(nq) || MSG.test(q)) {
    const forParents = /הורים/.test(q);
    const about = topic ? `"${topic}"` : '"[נושא הפעולה]"';
    const lines = forParents
      ? ["שלום רב,", `ביום [יום] בשעה [שעה] ב[מקום] תתקיים פעולה בנושא ${about}.`, "מה להביא: [ציוד, בגדים, אוכל].", "איסוף בשעה [שעה]. לשאלות אפשר לפנות אליי.", "בברכה, [שם המדריך/ה]"]
      : ["שלום לכולם!", `ביום [יום] בשעה [שעה] ב[מקום] נפגשים לפעולה בנושא ${about}.`, "מה להביא: [ציוד, בגדים].", "מי שלא יכול/ה להגיע, שיכתוב לי מראש.", "נתראה! [שם המדריך/ה]"];
    return {
      answer: "זו הודעה מוכנה להעתקה. את מה שבסוגריים מרובעים צריך להשלים, כי אני לא יודע את היום, השעה והמקום.",
      items: lines,
      links: [L("לעורך הכתיבה", "/write")],
      cards: [],
      topic: "write-message",
      suggestions: ["הודעה להורים", "שאלות לדיון על אחריות"],
    };
  }

  if (QUESTIONS.test(nq) || QUESTIONS.test(q)) {
    if (!topic) return { answer: "על איזה ערך או נושא לכתוב שאלות לדיון? למשל: שאלות לדיון על אחריות.", links: [], cards: [], topic: "write-questions", suggestions: ["שאלות לדיון על אחריות", "שאלות לדיון על כבוד הדדי", "שאלות לדיון על יושר"] };
    return {
      answer: `שאלות לדיון על "${topic}"${age ? `, ${age.replace(" - מעורב", "")}` : ""}, מהאישי אל הקבוצתי והערכי:`,
      items: discussionSet(topic, value, age),
      links: [L("לעורך הכתיבה", "/write"), L("לכל שאלות הדיון", "/stories")],
      cards: [],
      topic: "write-questions",
      suggestions: [`סיפור על ${topic}`, `משחק פתיחה`],
    };
  }

  if (GAMES.test(nq) || GAMES.test(q)) {
    const noEq = /בלי ציוד|ללא ציוד/.test(q);
    const energetic = /אנרגטי|תנועה|ריצה|לפרוק|לחמם/.test(q) ? true : /שקט|רגוע|רגועה/.test(q) ? false : undefined;
    const cat = /לשקט|איסוף|להשקיט/.test(q) ? "איסוף ושקט" : /מעבר/.test(q) ? "מעבר בין שלבים" : /לסיום|סיום/.test(q) ? "סיום קצר" : null;
    const items = cat ? pickWarmups({ category: cat, n: 3, seed: rng(), energetic, noEquipment: noEq }) : /חימום|לחמם/.test(q) ? pickWarmups({ category: "חימום", n: 3, seed: rng(), energetic, noEquipment: noEq }) : pickIcebreakers({ n: 3, energetic, noEquipment: noEq, seed: rng() });
    return {
      answer: `שלושה רעיונות${noEq ? " בלי ציוד" : ""}. אם אף אחד לא מתאים, אפשר לבקש עוד:`,
      items: items.map(gameLine),
      links: [L("לכל משחקי ההיכרות", "/icebreakers"), L("לכל משחקי החימום והמעבר", "/warmups")],
      cards: [],
      topic: "write-games",
      suggestions: ["עוד משחק היכרות בלי ציוד", "משחק חימום אנרגטי", "משחק לשקט ואיסוף"],
    };
  }

  if (STORY.test(nq) || STORY.test(q)) {
    if (!value && !topic) return { answer: "על איזה ערך או נושא לחפש סיפור? למשל: סיפור על אחריות.", links: [L("לספריית הסיפורים", "/stories")], cards: [], topic: "write-story", suggestions: ["סיפור על אחריות", "סיפור על יושר"] };
    const key = norm(value ? value.label.split(" ")[0] : topic);
    const exact = STORIES.filter((s) => norm(s.value).includes(key) || key.includes(norm(s.value.split(" ")[0])));
    const pick = (exact.length ? exact : STORIES).slice(0, 2);
    return {
      answer: exact.length ? `סיפורים קצרים לערך "${topic}":` : `אין לי סיפור שמתאים בדיוק ל"${topic}", הנה כמה אחרים מהספרייה:`,
      items: pick.map((s) => `${s.title} (${s.type}): ${clip(s.text, 170)}`),
      links: [L("לספריית הסיפורים", "/stories")],
      cards: [],
      topic: "write-story",
    };
  }

  if (TITLES.test(nq) || TITLES.test(q)) {
    const ideas = titleIdeas({ title: topic, meta: { value: value?.label || "" }, blocks: [] });
    const own = (value?.topics || []).slice(0, 2);
    return {
      answer: topic ? `רעיונות לשם לפעולה על "${topic}":` : "רעיונות כלליים לשם לפעולה. אם תגידו על מה היא, אתאים:",
      items: [...new Set([...ideas, ...own])].slice(0, 6),
      links: [L("לעורך הכתיבה", "/write")],
      cards: [],
      topic: "write-titles",
    };
  }

  if (WRITE.test(nq) || WRITE.test(q)) {
    if (!topic) {
      return { answer: "אשמח לעזור. על איזה נושא או ערך תהיה הפעולה? אפשר גם להוסיף שכבה וזמן, למשל: פעולה על אחריות לכיתה ו' 45 דקות.", links: [], cards: [], topic: "write-activity", suggestions: ["תכתוב לי פעולה על אחריות לכיתה ו' 45 דקות", "תכתוב לי פעולה על יושר לכיתה ח' 30 דקות", "תכתוב לי פעולה על כבוד הדדי לכיתה ה' 40 דקות"] };
    }
    const kind = kindHit(q);
    let method = methodHit(q);
    if (method && value && norm(value.label).includes(norm(method.name))) method = null; // "שיתוף פעולה" הוא ערך, לא מתודה
    const qs = new URLSearchParams({ topic: topic.slice(0, 120) });
    if (value) qs.set("value", value.label);
    if (kind) qs.set("kind", kind.id);
    if (method) qs.set("method", method.name);
    if (age) qs.set("age", age);
    const title = `פעולה על ${topic}`.slice(0, 120);
    const parts = [`הבנתי: פעולה על "${topic}"${age ? `, ${age.replace(" - מעורב", "")}` : ""}${minutes ? `, ${minutes} דקות` : ""}.`];
    if (minutes >= 10) parts.push(`חלוקת זמן מוצעת לחמשת השלבים (דקות): ${skeleton(minutes)}.`);
    parts.push("המחולל בונה מזה פעולה מלאה בחמישה שלבים, ואחר כך אפשר לערוך אותה.");
    const missing = [!age && "שכבת גיל", !minutes && "משך"].filter(Boolean);
    if (missing.length) parts.push(`לא ציינתם ${missing.join(" ו")}, אפשר להשלים במחולל.`);
    const actions = [{ label: "פתחו במחולל עם הפרטים", href: `/?${qs.toString()}` }];
    if (user) actions.push({ label: "צרו טיוטה בעורך", draft: { title, ageGroup: age, minutes: minutes || null, value: value?.label || "" } });
    else parts.push("אחרי התחברות אפשר גם ליצור טיוטה ריקה בעורך עם הפרטים האלה.");
    const cards = findActivities(db, topic, 3);
    return {
      answer: parts.join(" "),
      actions,
      links: cards.length ? [L("לכל המאגר", "/library")] : [],
      cards,
      note: cards.length ? "להשראה, פעולות שכבר קיימות במאגר על הנושא:" : undefined,
      topic: "write-activity",
      suggestions: [`שאלות לדיון על ${topic}`, "משחק פתיחה בלי ציוד", `רעיונות לשם לפעולה על ${topic}`],
    };
  }
  return null;
}
