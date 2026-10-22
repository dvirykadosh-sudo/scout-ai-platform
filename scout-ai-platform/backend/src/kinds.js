// סוגי פעולה (שיא, תוכן, ערך, מבוא, סיכום, חברה, שטח), יצירה בלי נושא, וכלי שדרוג וקיצור.
import { apportion, generateActivity } from "./ai.js";
import { suggestTopics } from "./topics.js";

const cap = (s, n) => String(s).slice(0, n);

export const KINDS = {
  peak: {
    id: "peak",
    label: "פעולת שיא",
    short: "רגע בלתי נשכח אחד, שכל הפעולה בנויה סביבו.",
    what: "פעולה ארוכה וגדולה יותר, שנבנית בהדרגה אל רגע שיא חזק (משימה, טקס או משחק רחב) ואחריו הדהוד שקט. החניכים זוכרים אותה שנים.",
    when: "פעם בחודש או חודשיים, בחגים, בסוף תקופה או לפני מחנה.",
    structure: ["בניית ציפייה", "הבנייה אל השיא", "רגע השיא", "הדהוד ומשמעות", "חתימה בלתי נשכחת"],
    methods: [
      { name: "השראה", minutes: 8 },
      { name: "משחק תחרות", minutes: 25 },
      { name: "עשייה", minutes: 25 },
      { name: "חשיבה משותפת", minutes: 15 },
      { name: "שיתוף", minutes: 17 },
    ],
    energetic: true,
    scouting: false,
    equipment: "ציוד לרגע השיא (לפי הרעיון), מקום פתוח או חדר גדול, אפשר תאורה ומוזיקה",
    safety: "בפעולת שיא יש הרבה אנרגיה: לקבוע גבולות גזרה, להכין עוזרים מראש ולבדוק את המקום לפני שהחניכים מגיעים.",
    notes: [
      (t) => `בניית ציפייה: אל תגלו מה מחכה להם. סדרו את המקום מראש כך שכשהחניכים נכנסים הם מרגישים שקורה כאן משהו מיוחד על "${t}".`,
      (t, v) => `הבנייה אל השיא: המשחק עולה בהדרגה בקצב ובמתח, וכל סבב מחבר את הקבוצה קצת יותר ל"${v}".`,
      (t) => `רגע השיא: זה הרגע שהחניכים יזכרו. כל הפעולה מכוונת אליו: משימה משותפת אחת וגדולה על "${t}" שכולם חייבים להשתתף בה. תנו לה זמן ואל תמהרו.`,
      (t, v) => `הדהוד: מיד אחרי השיא עוצרים ושואלים: מה קרה לנו כאן, ומה הרגשתם? כאן "${v}" מקבל משמעות אישית.`,
      () => `חתימה: סיום טקסי קצר, כמו משפט אחד שכל אחד אומר או רגע שקט במעגל, שנשאר איתם אחרי הפעולה.`,
    ],
    example: "בניית מגדל משותף שהקבוצה מצליחה להעמיד רק כשכולם מתקשרים בלי מילים.",
  },
  content: {
    id: "content",
    label: "פעולת תוכן",
    short: "לומדים משהו חדש ומתרגלים אותו.",
    what: "פעולה שמטרתה להעביר ידע או מיומנות: הסבר קצר, דוגמה, תרגול ובדיקת הבנה.",
    when: "כשיש נושא שהחניכים צריכים להכיר לפני חג, טקס, טיול או מחנה.",
    structure: ["שאלת סקרנות", "הסבר עם דוגמה", "תרגול ויישום", "העמקה והשוואה", "בדיקת הבנה"],
    methods: [
      { name: "הסבר", minutes: 12 },
      { name: "פירוק", minutes: 10 },
      { name: "התבוננות", minutes: 8 },
      { name: "דיון בשאלה", minutes: 15 },
    ],
    energetic: false,
    scouting: false,
    equipment: "דפים ועטים, לוח או דף גדול",
    safety: "",
    notes: [
      (t) => `שאלת סקרנות: מה אתם כבר יודעים על "${t}"? רושמים את התשובות על הלוח ומחזירים אותן בסוף הפעולה.`,
      (t) => `לב התוכן: הסבר קצר (עד 10 דקות) עם דוגמה אחת שמחברת את "${t}" לחיי החניכים, ואז שאלת הבנה בזוגות.`,
      (t) => `יישום: החניכים מתרגלים בעצמם את מה שלמדו על "${t}", בזוגות או בקבוצות קטנות, עם משימה קונקרטית אחת.`,
      () => `העמקה: מה השתנה ממה שחשבנו בתחילת הפעולה? משווים לתשובות שנרשמו בפתיחה.`,
      (t, v) => `בדיקת הבנה: כל חניך אומר משפט אחד שלמד על "${t}". המדריך מסכם ומחבר ל"${v}".`,
    ],
    example: "פעולה שמסבירה מה זה קשר שמונה ולמה הוא חשוב, ומתרגלת אותו בזוגות.",
  },
  value: {
    id: "value",
    label: "פעולת ערך",
    short: "שיחה והתלבטות סביב ערך אחד.",
    what: "פעולה שבה החניכים נחשפים לדילמה, בוחרים, מקשיבים אחד לשני ויוצאים עם מחויבות קטנה.",
    when: "כשיש מקרה בקבוצה, לפני חג עם ערך, או כשרוצים לדבר על מה שחשוב.",
    structure: ["סיפור או מקרה", "חוויית בחירה", "מבט פנימי", "שיחה מכבדת", "מחויבות קטנה"],
    methods: [
      { name: "השראה", minutes: 7 },
      { name: "משחק הדמייה", minutes: 12 },
      { name: "התבוננות", minutes: 6 },
      { name: "דיון בשאלה", minutes: 15 },
      { name: "שיתוף", minutes: 5 },
    ],
    energetic: false,
    scouting: false,
    equipment: "דפים ועטים, כרטיסי דילמה",
    safety: "בשיחה על ערכים: לשמור על שיח מכבד, לא לחשוף חניכים ולהישאר זמינים לשיחה אישית אחרי הפעולה.",
    notes: [
      (t, v) => `פותחים בסיפור או מקרה קצר שבו "${v}" נבחן, בלי להסביר עדיין מה הערך. הנושא: "${t}".`,
      (t, v) => `חוויית בחירה: מציבים את החניכים בדילמה שבה "${v}" עולה משהו, והם בוחרים מה לעשות לפני שדנים בזה.`,
      (t, v) => `מבט פנימי: כל חניך חושב בשקט על רגע שבו הוא עצמו פעל או לא פעל לפי "${v}", בלי לשתף עדיין.`,
      (t, v) => `שיחה מכבדת: מקשיבים לפני שמגיבים, ואין תשובה נכונה. שואלים מה גורם לנו לפעול לפי "${v}" ומה מקשה.`,
      (t, v) => `מחויבות קטנה: כל אחד בוחר פעולה אחת קטנה שיעשה השבוע ושמבטאת את "${v}".`,
    ],
    example: "דילמה: חבר מבקש שתשקר בשבילו. מה עושים, ואיך זה קשור לערך של אמת?",
  },
  intro: {
    id: "intro",
    label: "פעולת מבוא",
    short: "פותחים נושא, תקופה או שנה חדשה.",
    what: "פעולה קצרה וקלילה שמכניסה את הקבוצה לנושא חדש: היכרות, סקרנות ושאלות לקראת הבא.",
    when: "בתחילת שנה, בתחילת נושא או כשמגיעים חניכים חדשים.",
    structure: ["פתיחה חמה", "משחק היכרות", "גילוי משותף", "אוספים שאלות", "מה בא אחרי"],
    methods: [
      { name: "השראה", minutes: 5 },
      { name: "משחק תחרות", minutes: 12 },
      { name: "שיתוף", minutes: 8 },
      { name: "חשיבה משותפת", minutes: 5 },
    ],
    energetic: true,
    scouting: false,
    equipment: "דפים ועטים, דף גדול לשאלות",
    safety: "",
    notes: [
      (t) => `פתיחה חמה: כל אחד אומר את שמו ומשהו קטן על עצמו שקשור ל"${t}".`,
      (t) => `משחק היכרות או חימום שמכניס את הקבוצה ל"${t}" ומרגיע את החדר.`,
      (t) => `משימה קצרה בקבוצות קטנות שמגלה מה כל אחד כבר יודע או רוצה לדעת על "${t}".`,
      (t) => `אוספים שאלות: מה אנחנו רוצים לגלות על "${t}" בהמשך? רושמים הכול על דף משותף.`,
      (t, v) => `מציגים בקצרה מה הולך לקרות בפעולות הבאות ומה מצפים מכל אחד, כדי ש"${v}" יהיה ברור מההתחלה.`,
    ],
    example: "פעולת פתיחת שנה שבה כל אחד מביא חפץ שמסמל אותו.",
  },
  summary: {
    id: "summary",
    label: "פעולת סיכום",
    short: "מסכמים תקופה, פרויקט או שנה.",
    what: "פעולה שחוזרת על מה שעברנו, יוצרת תוצר משותף ונותנת לכל אחד להודות ולהסיק מסקנות.",
    when: "בסוף תקופה, אחרי מחנה או טיול, או בסוף שנה.",
    structure: ["נזכרים", "משחק זיכרון", "תוצר משותף", "מה למדנו", "סיום חגיגי"],
    methods: [
      { name: "השראה", minutes: 5 },
      { name: "הבעה יצירתית", minutes: 10 },
      { name: "שיתוף", minutes: 10 },
      { name: "דיון בשאלה", minutes: 5 },
    ],
    energetic: false,
    scouting: false,
    equipment: "דפים גדולים, טושים, תמונות מהתקופה אם יש",
    safety: "",
    notes: [
      (t) => `חוזרים לאחור: מה עשינו בתקופה האחרונה על "${t}"? כל אחד נזכר ברגע אחד.`,
      () => `משחק זיכרון קבוצתי: מנחשים אירוע מהתקופה לפי רמזים, ונזכרים יחד.`,
      (t) => `יוצרים תוצר סיכום משותף: קיר רגעים או כרזה שמראים מה עברנו עם "${t}".`,
      (t, v) => `שיחה: מה למדנו על עצמנו ועל הקבוצה, ומה לוקחים איתנו קדימה מתוך "${v}".`,
      () => `סיום חגיגי: תודה לכל אחד במשפט אחד, וברכה לקראת מה שבא.`,
    ],
    example: "קיר זיכרונות של השנה עם תמונות וציטוטים מצחיקים.",
  },
  social: {
    id: "social",
    label: "פעולת חברה",
    short: "מגבשים את הקבוצה, עם הרבה כיף.",
    what: "פעולה שמחזקת שייכות וחברות: משחקים שאי אפשר לנצח בהם לבד, משימה משותפת ומעגל תודות.",
    when: "כשהקבוצה לא מגובשת, אחרי ריב, או כשיש חניכים חדשים.",
    structure: ["כניסה קלילה", "משחק גיבוש", "משימה משותפת", "שיחה על הקבוצה", "מעגל תודות"],
    methods: [
      { name: "משחק תחרות", minutes: 15 },
      { name: "עשייה", minutes: 12 },
      { name: "חשיבה משותפת", minutes: 8 },
      { name: "שיתוף", minutes: 10 },
    ],
    energetic: true,
    scouting: false,
    equipment: "חבלים או סרטים, דפים וטושים",
    safety: "במשחקי גיבוש עם מגע: לוודא שכולם מרגישים בנוח, ואף חניך לא נדחק למרכז או לצד.",
    notes: [
      () => `כניסה קלילה: משחק קצר בלי תחרות קשה, כדי שכולם ירגישו חלק מהקבוצה, גם מי שפחות מכירים.`,
      (t) => `משחק גיבוש: תחרות שאי אפשר לנצח בה לבד אלא רק יחד, סביב "${t}".`,
      (t) => `משימה משותפת: הקבוצה בונה יחד תוצר אחד על "${t}", ולכל חניך יש תפקיד חשוב.`,
      (t, v) => `שיחה על הקבוצה: מה גורם לנו להרגיש שייכים, ומה נרצה לשפר? "${v}" הוא נקודת המוצא.`,
      () => `מעגל תודות: כל אחד מודה לחבר אחד על משהו קונקרטי מהפעולה.`,
    ],
    example: "משחק שבו הקבוצה צריכה להעביר כדור בלי ליפול, כשכל חניך מחזיק קצה של בד.",
  },
  field: {
    id: "field",
    label: "פעולת שטח",
    short: "בחוץ, בתנועה, עם צופיות מעשית.",
    what: "פעולה שמתקיימת בחוץ: משחק שטח, משימות צופיות (קשרים, ניווט, עזרה ראשונה) וסיכום בטבע.",
    when: "כשמזג האוויר מאפשר, לקראת טיול או מחנה, או כשהקבוצה צריכה אוויר.",
    structure: ["סידור ובטיחות", "משחק שטח", "צופיות מעשית", "שיחה בטבע", "איסוף וסיום"],
    methods: [
      { name: "הסבר", minutes: 5 },
      { name: "משחק תחרות", minutes: 15 },
      { name: "עשייה", minutes: 25 },
      { name: "שיתוף", minutes: 15 },
    ],
    energetic: true,
    scouting: true,
    equipment: "ערכת עזרה ראשונה, חבלים, מים, מפה או מצפן, שקיות לאיסוף אשפה",
    safety: "בשטח: למנות אחראי בטיחות, לספור חניכים בתחילת כל שלב ובסופו, לוודא שתייה ולבדוק מזג אוויר לפני היציאה.",
    notes: [
      () => `סידור ובטיחות: סופרים חניכים, מסבירים גבולות גזרה ומסמנים מי אחראי על מה, לפני שיוצאים.`,
      (t) => `משחק שטח סביב "${t}": תחנות או מסלול, בתנועה, עם משימה בכל נקודה.`,
      (t) => `צופיות מעשית בשטח: קשר, ניווט, עזרה ראשונה או הקמה, בתרגול אמיתי שקשור ל"${t}".`,
      (t, v) => `ישיבה בטבע ושיחה: מה למדנו מהשטח על עבודת צוות ועל "${v}"?`,
      () => `איסוף וסיום: מנקים, סופרים שוב את החניכים ומסכמים בקצרה.`,
    ],
    example: "משחק ניווט בין תחנות עם מפה, ובכל תחנה משימת צופיות.",
  },
};

export const KIND_IDS = Object.keys(KINDS);
export const KIND_PRIORITY = ["peak", "value", "content", "social", "field", "intro", "summary"];

/** תמהיל שנתי מומלץ: כמה פעולות מכל סוג בשנה של כ-30 מפגשים. */
export const YEAR_MIX = { peak: 4, value: 6, content: 6, social: 5, field: 4, intro: 2, summary: 3 };

export function yearMix(db, userId, now = Date.now()) {
  const since = new Date(now - 365 * 86400000).toISOString();
  const mine = {};
  if (userId) {
    for (const r of db.prepare("SELECT kind, COUNT(*) AS n FROM activities WHERE owner_id = ? AND kind IS NOT NULL AND created_at >= ? GROUP BY kind").all(userId, since)) mine[r.kind] = r.n;
  }
  const items = KIND_IDS.map((id) => ({ id, label: KINDS[id].label, recommended: YEAR_MIX[id] ?? 0, mine: userId ? mine[id] ?? 0 : null }));
  return { total: items.reduce((s, x) => s + x.recommended, 0), items };
}

export const kindMinutes = (k) => k.methods.reduce((s, m) => s + m.minutes, 0);

/** Public description of the kinds (without the template functions). */
export function kindList() {
  return KIND_IDS.map((id) => {
    const k = KINDS[id];
    return { id, label: k.label, short: k.short, what: k.what, when: k.when, structure: k.structure, example: k.example, minutes: kindMinutes(k), methods: k.methods, energetic: k.energetic, scouting: k.scouting };
  });
}

/** Instruction line for the AI, so it builds the activity according to its kind. */
export function kindGuideText(k) {
  return `סוג הפעולה: ${k.label}. ${k.what} מבנה מומלץ לחמשת השלבים לפי הסדר: ${k.structure.join(" | ")}.`;
}

/** Adds the kind to a generated draft. For the offline generator the five stages also get the kind's own opening notes. */
export function applyKind(g, input) {
  const k = KINDS[input.kind];
  if (!k) return g;
  const t = input.topic;
  const v = input.value || input.topic;
  let stages = g.stages;
  if (g.source !== "ai") stages = g.stages.map((s, i) => ({ ...s, content: cap(`${k.notes[i](t, v)}\n${s.content}`, 3000) }));
  if (input.seedText) stages = stages.map((s, i) => (i === 1 ? { ...s, content: cap(`הרעיון המרכזי: ${input.seedText}\n${s.content}`, 3000) } : s));
  const equipment = k.equipment && !g.equipment.includes(k.equipment) ? cap(`${g.equipment}. ${k.id === "peak" || k.id === "field" ? "בנוסף: " + k.equipment : ""}`.replace(/\. $/, ""), 500) : g.equipment;
  const safetyNotes = k.safety && !g.safetyNotes.includes(k.safety) ? cap(`${g.safetyNotes} ${k.safety}`, 1000) : g.safetyNotes;
  const tags = [...new Set([...(g.tags || []), k.label])].slice(0, 20);
  return { ...g, stages, equipment, safetyNotes, tags, kind: k.id };
}

export async function generateKinded(input) {
  const k = KINDS[input.kind];
  if (!k) return generateActivity(input);
  const g = await generateActivity({ ...input, kindGuide: kindGuideText(k) });
  return applyKind(g, input);
}

// ───────────── מאגר נושאים, כשאין נושא ─────────────

const T = (topic, value) => ({ topic, value });
export const TOPIC_BANK = [
  T("אחריות אישית", "אחריות"),
  T("חברות אמיתית", "רעות"),
  T("בריונות ואיך עוצרים אותה", "אומץ אזרחי"),
  T("מנהיגות בקבוצה", "מנהיגות"),
  T("הקשבה ושיח מכבד", "כבוד"),
  T("עבודת צוות", "שיתוף פעולה"),
  T("לעזור בלי שיבקשו", "נתינה"),
  T("להתמודד עם כישלון", "התמדה"),
  T("אמת וכנות", "אמת"),
  T("קבלת השונה", "סובלנות"),
  T("שמירה על הטבע", "אחריות לסביבה"),
  T("חיבור לארץ ולנוף", "שייכות"),
  T("לשמור על מילה", "אמינות"),
  T("מסע ומפגש עם הלא נודע", "אומץ"),
  T("בחירה בין נוח לנכון", "יושרה"),
  T("להודות ולהעריך", "הכרת הטוב"),
  T("מחשבה לפני שמדברים ברשת", "אחריות דיגיטלית"),
  T("זיכרון וסיפורים של סבא וסבתא", "מסורת"),
  T("מה אני יכול לתרום לקהילה", "מעורבות"),
  T("סבלנות ולהמתין לתור", "סבלנות"),
  T("להיות צופה בבית ובבית ספר", "דוגמה אישית"),
  T("חופש ומה שמגביל אותו", "חופש"),
  T("מתנדבים ועושים טוב", "התנדבות"),
  T("אנרגיה, הומור ושמחה", "שמחה"),
];

// הסוג הטבעי לכל חג, כשמציעים פעולה לפי התאריך
const EVENT_KIND = {
  "ראש השנה": "value",
  "יום כיפור": "value",
  "סוכות": "social",
  "שמחת תורה": "summary",
  "חנוכה": "peak",
  "ט\"ו בשבט": "field",
  "פורים": "peak",
  "פסח": "content",
  "יום השואה": "value",
  "יום הזיכרון": "value",
  "יום העצמאות": "peak",
  "ל\"ג בעומר": "field",
  "יום ירושלים": "content",
  "שבועות": "value",
  "ט\"ו באב": "social",
};

/** Deterministic pseudo-random pick, so the weekly suggestions stay stable for the whole week. */
const mix = (n) => {
  let x = (Math.imul(n | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
};
export const pickFrom = (arr, seed) => arr[mix(seed) % arr.length];

// ───────────── מה חסר לי ─────────────

/** For each kind: when the user last created or ran one. Suggests the kind that is missing the longest. */
export function computeGaps(db, userId, now = Date.now()) {
  const last = Object.fromEntries(KIND_IDS.map((id) => [id, null]));
  if (userId) {
    const made = db.prepare("SELECT kind, MAX(created_at) AS at FROM activities WHERE owner_id = ? AND kind IS NOT NULL GROUP BY kind").all(userId);
    for (const r of made) if (last[r.kind] !== undefined) last[r.kind] = r.at;
    const ran = db
      .prepare("SELECT a.kind AS kind, MAX(u.ran_on) AS at FROM runs u JOIN activities a ON a.id = u.activity_id WHERE u.user_id = ? AND a.kind IS NOT NULL GROUP BY a.kind")
      .all(userId);
    for (const r of ran) if (last[r.kind] !== undefined && (!last[r.kind] || r.at > last[r.kind])) last[r.kind] = r.at;
  }
  const kinds = KIND_IDS.map((id) => {
    const at = last[id];
    const daysAgo = at ? Math.max(0, Math.floor((now - new Date(at).getTime()) / 86400000)) : null;
    return { id, label: KINDS[id].label, lastAt: at, daysAgo };
  });
  const order = (g) => (g.daysAgo === null ? 100000 - KIND_PRIORITY.indexOf(g.id) : g.daysAgo);
  const sorted = [...kinds].sort((a, b) => order(b) - order(a));
  const top = sorted[0];
  const message =
    top.daysAgo === null
      ? `עוד לא יצרת או הפעלת ${top.label}. כדאי להתחיל בה.`
      : top.daysAgo >= 14
        ? `לא הפעלת ${top.label} כבר ${Math.round(top.daysAgo / 7)} שבועות.`
        : `אתה מגוון יפה. הסוג שהכי מזמן לא היה הוא ${top.label}.`;
  return { kinds, suggest: top.id, message };
}

// ───────────── הצעות לשבוע ─────────────

export function weekSuggestions(db, userId, { now = new Date(), seed } = {}) {
  const wk = Math.floor(now.getTime() / (7 * 86400000));
  const s0 = seed ?? wk * 131 + (userId || 0);
  const out = [];
  const used = new Set();
  const add = (o) => {
    if (used.has(o.topic) || out.length >= 3) return;
    used.add(o.topic);
    out.push(o);
  };
  const tp = suggestTopics(now, 14);
  const ev = tp.events[0];
  if (ev) {
    const sug = pickFrom(ev.suggestions, s0);
    const when = ev.inDays === 0 ? "היום" : ev.inDays === 1 ? "מחר" : `בעוד ${ev.inDays} ימים`;
    add({ topic: sug.topic, value: sug.value, kind: EVENT_KIND[ev.name] || "content", reason: `${ev.name} (${when})` });
  }
  const gaps = computeGaps(db, userId, now.getTime());
  const gapTopic = pickFrom(TOPIC_BANK, s0 + 7);
  add({ topic: gapTopic.topic, value: gapTopic.value, kind: gaps.suggest, reason: gaps.message });
  const seasonal = tp.seasonal[0]?.suggestions;
  if (seasonal) {
    const sug = pickFrom(seasonal, s0 + 3);
    add({ topic: sug.topic, value: sug.value, kind: pickFrom(KIND_PRIORITY, s0 + 3), reason: `עונה: ${tp.seasonal[0].name}` });
  }
  for (let i = 0; out.length < 3 && i < 20; i++) {
    const sug = pickFrom(TOPIC_BANK, s0 + 11 + i * 5);
    add({ topic: sug.topic, value: sug.value, kind: pickFrom(KIND_PRIORITY, s0 + i), reason: "נושא שתמיד רלוונטי" });
  }
  return out;
}

/** Topic + value + kind for a surprise activity (random each call). */
export function surprise(db, userId, { kind, now = new Date(), seed = Date.now() } = {}) {
  const gaps = computeGaps(db, userId, now.getTime());
  const k = kind && KINDS[kind] ? kind : gaps.suggest;
  const near = suggestTopics(now, 10).events[0];
  const useEvent = near && !kind && mix(seed) % 3 === 0;
  if (useEvent) {
    const sug = pickFrom(near.suggestions, seed);
    return { topic: sug.topic, value: sug.value, kind: EVENT_KIND[near.name] || k, reason: near.name };
  }
  const sug = pickFrom(TOPIC_BANK, seed);
  return { topic: sug.topic, value: sug.value, kind: k, reason: kind ? KINDS[k].label : gaps.message };
}

// ───────────── שדרוג לפעולת שיא ─────────────

export function upgradeToPeak(a) {
  const k = KINDS.peak;
  const t = a.title;
  const v = a.leadingValue || a.title;
  const extra = 20;
  const stages = a.stages.map((s, i) => ({
    ...s,
    minutes: i === 1 || i === 2 ? s.minutes + extra / 2 : s.minutes,
    content: cap(`${k.notes[i](t, v)}\n${s.content}`, 3000),
  }));
  return {
    title: cap(`${t} (גרסת שיא)`, 120),
    durationMin: a.durationMin + extra,
    equipment: cap(`${a.equipment}. בנוסף: ${k.equipment}`, 500),
    safetyNotes: cap(`${a.safetyNotes} ${k.safety}`, 1000),
    tags: [...new Set([...a.tags, k.label])].slice(0, 20),
    stages,
    kind: "peak",
    methods: a.methods,
  };
}

// ───────────── קיצור פעולה ─────────────

const isBullet = (l) => l.trim().startsWith("•");
const isNumbered = (l) => /^\d+\.\s/.test(l.trim());

export function shortenActivity(a, target = 20) {
  const total = Math.max(10, Math.min(target, Math.max(10, a.durationMin - 1)));
  const minutes = apportion([1, 3, 2, 3, 1], total);
  const keptMethods = new Map();
  const stages = a.stages.map((s, i) => {
    const lines = s.content.split("\n");
    let kept;
    if (i === 3) {
      const nums = lines.filter(isNumbered);
      const keepNums = new Set(nums.length > 2 ? [nums[0], nums[nums.length - 1]] : nums);
      let seenBullet = 0;
      kept = lines.filter((l) => (isNumbered(l) ? keepNums.has(l) : !isBullet(l) || ++seenBullet <= 1));
      let n = 0;
      kept = kept.map((l) => (isNumbered(l) ? l.replace(/^\s*\d+\./, `${++n}.`) : l));
    } else if (i === 0 || i === 4) {
      kept = lines.filter((l) => !isBullet(l));
      if (!kept.length) kept = lines.slice(0, 1);
    } else {
      let seen = 0;
      kept = lines.filter((l) => !isBullet(l) || ++seen <= 1);
    }
    // the one method line that stays takes the whole (shorter) stage time
    kept = kept.map((l) =>
      l.replace(/^(\s*•\s*)(.+?) \((\d+) דק'\)/, (m, pre, name) => {
        keptMethods.set(name, minutes[i]);
        return `${pre}${name} (${minutes[i]} דק')`;
      }),
    );
    return { ...s, minutes: minutes[i], content: cap(kept.join("\n").trim() || s.content, 3000) };
  });
  const methods = a.methods.filter((m) => keptMethods.has(m.name)).map((m) => ({ ...m, minutes: keptMethods.get(m.name) }));
  return {
    title: cap(`${a.title} (${total} דק')`, 120),
    durationMin: total,
    tags: [...new Set([...a.tags, "גרסה מקוצרת"])].slice(0, 20),
    stages: stages.map((s, i) => (i === 1 ? { ...s, content: cap(`גרסה מקוצרת: משאירים רק את הפעילות המרכזית. ${s.content}`, 3000) } : s)),
    methods: methods.length ? methods : a.methods,
  };
}

// ───────────── מאגר רעיונות לשיאים ─────────────

export const PEAK_IDEAS = [
  { id: "camp-night", category: "מחנה", title: "לילה בלי מסכים", value: "חברות", minutes: 90, equipment: "פנסים, שמיכות, מדורה או נרות מוגנים", how: "הקבוצה מעבירה ערב שלם בלי טלפונים: משחקי חושך, סיפורי אש ושיחה על חברות אמיתית. השיא: כל חניך מקבל מכתב קצר מחבר בקבוצה ופותח אותו לבד באור הפנס." },
  { id: "camp-quest", category: "מחנה", title: "מסע חיפוש אוצר של השבט", value: "שיתוף פעולה", minutes: 120, equipment: "מפה מצוירת, רמזים, קופסת אוצר", how: "הקבוצות מחפשות אוצר לפי רמזים שדורשים כישורי צופיות (קשר, מצפן, עזרה ראשונה). השיא: האוצר נפתח רק כשכל הקבוצות נמצאות יחד." },
  { id: "camp-sunrise", category: "מחנה", title: "זריחה משותפת", value: "התפעלות", minutes: 75, equipment: "בגדים חמים, מתקן לשתייה חמה", how: "קמים מוקדם, עולים לנקודה גבוהה בשקט, ושותים משהו חם. השיא: דקה של שקט מוחלט בזמן שהשמש עולה, ואחריה כל אחד אומר מילה אחת." },
  { id: "ceremony-torch", category: "טקס", title: "טקס העברת לפיד", value: "מסורת", minutes: 60, equipment: "לפיד בטוח, פנס או נר בכוס, מקום חשוך", how: "השכבה הבוגרת מעבירה לצעירה אור, ואומרת לה מה היא מאחלת לה. השיא: כל חניך אומר מה הוא מבטיח לשבט." },
  { id: "ceremony-promise", category: "טקס", title: "טקס הבטחה אישית", value: "מחויבות", minutes: 60, equipment: "פתקים, קופסה, נרות", how: "כל חניך כותב הבטחה אחת לעצמו או לקבוצה, מניח אותה בקופסה, והמדריך סוגר אותה עד סוף השנה. השיא: הקופסה נחתמת בטקס בליווי שיר." },
  { id: "ceremony-memory", category: "טקס", title: "מעגל זיכרון", value: "זיכרון", minutes: 50, equipment: "נרות בכוסות, תמונות", how: "טקס שקט ומכבד: מדליקים נרות, מספרים סיפור אחד ויוצרים שתיקה משותפת. השיא: כל אחד מניח נר ואומר שם או מילה." },
  { id: "mission-build", category: "משימה גדולה", title: "בניית מבנה אחד לכל השבט", value: "עבודת צוות", minutes: 90, equipment: "חבלים, מקלות, בדים", how: "כל קבוצה בונה חלק אחד, ובסוף מחברים את הכול למבנה אחד גדול. השיא: כולם נכנסים יחד פנימה." },
  { id: "mission-good", category: "משימה גדולה", title: "יום מעשה טוב בשכונה", value: "נתינה", minutes: 120, equipment: "כפפות, שקיות, ציוד לפי משימה", how: "הקבוצה בוחרת מעשה טוב אחד לשכונה (ניקיון, פינוק לקשישים או צביעה) ומבצעת אותו. השיא: מפגש עם מי שנהנה מהמעשה." },
  { id: "mission-film", category: "משימה גדולה", title: "סרט קצר של הקבוצה", value: "יצירתיות", minutes: 100, equipment: "טלפון לצילום, תחפושות פשוטות", how: "הקבוצה כותבת, מצלמת ומחברת סרט קצר על ערך אחד. השיא: הקרנה חגיגית עם פופקורן והורים אם רוצים." },
  { id: "game-city", category: "משחק רחב", title: "משחק עיר: כיבוש נקודות", value: "תושייה", minutes: 100, equipment: "מפה, כרטיסי נקודות, עוזרים בכל נקודה", how: "הקבוצות נעות בין נקודות בשכונה וצוברות נקודות במשימות. השיא: משימה אחרונה שכל הקבוצות חייבות לפתור יחד." },
  { id: "game-colors", category: "משחק רחב", title: "מלחמת צבעים", value: "משחק הוגן", minutes: 80, equipment: "סרטים בצבעים, שטח רחב", how: "משחק תפיסה בין צבעים עם כללי הוגנות. השיא: ברגע האחרון הקבוצות מתאחדות לצבע אחד." },
  { id: "game-escape", category: "משחק רחב", title: "חדר בריחה של השבט", value: "הקשבה", minutes: 70, equipment: "מנעולים, פתקים, תחנות", how: "סדרת חידות שאי אפשר לפתור בלי שכולם מקשיבים ותורמים. השיא: הדלת האחרונה נפתחת רק בשיתוף פעולה מלא." },
];

export const PEAK_CATEGORIES = [...new Set(PEAK_IDEAS.map((i) => i.category))];
