// עוזר הכתיבה, פריטים 62, 65 ו-70: איזון בין סוגי שיטות, מקומות שנשארו למלא בתבנית,
// והתאמת הטיוטה לפרופיל של הקבוצה. קובץ טהור, בלי תלות בשאר העוזר.

const strip = (s) => String(s || "").replace(/[֑-ׇ]/g, "").replace(/["'״׳]/g, "");

// ───────────── 62. איזון בין סוגי שיטות ─────────────

export const METHOD_KINDS = {
  doing: { label: "עושים ונעים", methods: ["משחק תחרות", "עשייה", "משחק הדמייה", "ייצוג", "הבעה יצירתית"] },
  talking: { label: "חושבים ומדברים", methods: ["דיון בשאלה", "שיתוף", "חשיבה משותפת", "פירוק", "התבוננות"] },
  receiving: { label: "מקבלים מהמדריך", methods: ["הסבר", "השראה"] },
};

/** כמה שיטות מכל סוג זוהו בטיוטה, ומה כדאי לאזן. */
export function methodBalance(methods) {
  const names = new Set((methods || []).map((m) => m.name));
  const count = (k) => METHOD_KINDS[k].methods.filter((n) => names.has(n)).length;
  const doing = count("doing");
  const talking = count("talking");
  const receiving = count("receiving");
  const total = doing + talking + receiving;
  let verdict = "balanced";
  let tip = "יש תמהיל טוב בין עשייה, שיחה והקשבה.";
  if (total === 0) {
    verdict = "none";
    tip = "";
  } else if (total < 2) {
    verdict = "few";
    tip = "זוהתה שיטה אחת בלבד. שיטה נוספת תשמור על עניין לאורך הפעולה.";
  } else if (doing === 0) {
    verdict = "no-doing";
    tip = "רק שיחה והקשבה, בלי עשייה. חניכים זוכרים את מה שעשו, אז כדאי להוסיף משחק או משימה מעשית.";
  } else if (talking === 0) {
    verdict = "no-talking";
    tip = "יש עשייה אבל אין שיחה. בלי דיון או שיתוף קשה לחבר את החוויה לערך.";
  } else if (receiving > doing + talking) {
    verdict = "too-much-receiving";
    tip = "רוב הפעולה היא הסבר והשראה מצד המדריך. תנו לחניכים לעשות ולדבר יותר.";
  }
  return { doing, talking, receiving, total, verdict, tip, kinds: Object.fromEntries(Object.entries(METHOD_KINDS).map(([k, v]) => [k, v.label])) };
}

// ───────────── 65. מקומות למלא בתבנית ─────────────

/** טקסט בסוגריים מרובעים, למשל [נושא], שנשאר בטיוטה ועוד לא מולא. */
export function placeholdersIn(raw) {
  return [...new Set((String(raw || "").match(/\[[^\]\n]{1,40}\]/g) || []).map((s) => s.trim()))].slice(0, 12);
}

// ───────────── 70. פרופיל קבוצה ─────────────

export const TRAITS = [
  { id: "energetic", label: "אנרגטית ותנועתית" },
  { id: "shy", label: "ביישנית, קשה לה לדבר במליאה" },
  { id: "talkative", label: "מדברת הרבה וקשה לעצור" },
  { id: "new", label: "קבוצה חדשה, עוד לא מכירים" },
  { id: "late", label: "מאחרת בדרך כלל" },
  { id: "conflict", label: "יש מתחים בין חניכים" },
  { id: "mixedAges", label: "פער גילאים בקבוצה" },
  { id: "tired", label: "מגיעה עייפה" },
  { id: "strong", label: "קבוצה חזקה, מוכנה לאתגר" },
];
export const TRAIT_IDS = TRAITS.map((t) => t.id);

const RULES = {
  energetic: {
    ok: (a, t) => a.methods.some((m) => ["משחק תחרות", "משחק הדמייה", "עשייה"].includes(m.name)) && /(?:רצים|מירוץ|תופסת|בתנועה|קמים|תחנות)/.test(t),
    tip: "הקבוצה אנרגטית. הוסיפו תנועה אמיתית (מירוץ, תחנות או מעבר בין מקומות), ושמרו את הישיבה לדיון בלבד.",
  },
  shy: {
    ok: (a, t) => /(?:זוגות|בזוג|בשלשות|לפני המליאה|מותר לדלג|בכתב)/.test(t),
    tip: "הקבוצה ביישנית. לפני כל שיחה במליאה תנו דקה בזוגות או כתיבה על פתק, ואמרו שמותר לדלג.",
  },
  talkative: {
    ok: (a, t) => /(?:מקל דיבור|שני משפטים|משפט אחד|תור|כל אחד בתורו|הגבלת)/.test(t),
    tip: "הקבוצה מדברת הרבה. הגבילו כל חניך למשפט או לשניים, או השתמשו במקל דיבור.",
  },
  new: {
    ok: (a, t) => /(?:היכרות|סבב שמות|שם ו|מציגים את עצמם|נפגשים)/.test(t),
    tip: "הקבוצה חדשה. התחילו בסבב שמות או בהיכרות קצרה, לפני שנכנסים לנושא.",
  },
  late: {
    ok: (a, t) => /(?:מצטרפ|מי שמאחר|מגיעים בהדרגה|מי שהגיע)/.test(t),
    tip: "הקבוצה מאחרת. התחילו בפעילות שאפשר להצטרף אליה באמצע, והשאירו את ההסבר החשוב לדקה העשירית.",
  },
  conflict: {
    ok: (a, t) => /(?:חלוקה מראש|מחלקים מראש|קבוצות מעורבות|המדריך מחלק|מחלק את הקבוצות)/.test(t),
    tip: "יש מתחים בקבוצה. חלקו את החניכים לקבוצות מראש, בעצמכם, כדי להפריד בין מי שקשה להם ביחד.",
  },
  mixedAges: {
    ok: (a, t) => /(?:תפקיד|מדריך צעיר|הגדולים עוזרים|זוגות מעורבים|בוגרים)/.test(t),
    tip: "יש פער גילאים. תנו לגדולים תפקיד (שופט, מסביר, מדריך תחנה) ושלבו זוגות מעורבים.",
  },
  tired: {
    ok: (a, t) => /(?:משחק|קמים|בתנועה|רצים|מתחילים בתנועה)/.test(strip(a.stages[0].content)) || a.stages[0].words === 0,
    tip: "הקבוצה מגיעה עייפה. פתחו בתנועה או במשחק קצר, ושמרו את החלקים הכבדים לאמצע הפעולה.",
  },
  strong: {
    ok: (a, t) => /(?:אתגר|בונוס|שלב קשה|מתקדם|שלב נוסף|למי שסיים)/.test(t),
    tip: "הקבוצה חזקה. הוסיפו שלב אתגר או משימת בונוס למי שמסיים מוקדם.",
  },
};

/** בדיקה של הטיוטה מול פרופיל הקבוצה. profile = { name?, size?, traits[] } */
export function profileCheck(raw, a, profile) {
  if (!profile) return null;
  const t = strip(raw);
  const tips = [];
  for (const id of profile.traits || []) {
    const r = RULES[id];
    if (r && !r.ok(a, t)) tips.push({ trait: id, label: TRAITS.find((x) => x.id === id).label, tip: r.tip });
  }
  const size = Number(profile.size) || 0;
  if (size >= 25 && !/קבוצות/.test(t)) tips.push({ trait: "size", label: `${size} חניכים`, tip: `בקבוצה של ${size} חניכים כדאי לחלק לקבוצות קטנות של 5 עד 6, כדי שכל אחד יהיה מעורב.` });
  if (size > 0 && size <= 8 && /(?:קבוצות מתחרות|תחרות בין קבוצות|מירוץ בין קבוצות)/.test(t)) tips.push({ trait: "size", label: `${size} חניכים`, tip: `יש ${size} חניכים בלבד, אז תחרות בין קבוצות לא תעבוד טוב. נסו משימה משותפת מול שעון.` });
  return { name: profile.name || "", size, traits: profile.traits || [], tips: tips.slice(0, 5), checked: (profile.traits || []).length + (size ? 1 : 0) };
}
