// שלב 50 (336–345): תבניות חג, מיזוג גרסאות, צופים בזמן אמת, פתיחות, כללי משחק, דף תרגום וסדרת המשך.
import crypto from "node:crypto";
import { z } from "zod";
import { KINDS } from "./routes-write.js";
import { keywordsFrom } from "./routes-write-v47.js";

const S = (title, kind, minutes, text) => ({ title, kind, minutes, text });

/** 337: תבניות לחגים ואירועים. אפשר לערוך הכול אחרי ההוספה. */
export const HOLIDAYS = [
  { key: "rosh", name: "ראש השנה", value: "אחריות", stages: [
    S("פתיחה: מה לקחתי מהשנה שעברה", "open", 10, "כל חניך כותב על פתק דבר אחד שהוא גאה בו מהשנה שעברה ודבר אחד שהוא רוצה לשנות. בוחרים 2–3 פתקים (באישור הכותב) ומקריאים."),
    S("חשבון נפש בזוגות", "body", 15, "בזוגות: ספרו על רגע שבו לא נהגתם כמו שרציתם, ומה הייתם עושים אחרת. כללים: מקשיבים בלי לשפוט ולא מחזירים לאף אחד את מה שסופר."),
    S("שיא: ברכה לשנה החדשה", "peak", 15, "כל קבוצה כותבת ברכה אחת לשבט, בשם הערך. מעמידים את הברכות על קיר ומצביעים על האחת שהכי מרגשת."),
    S("סיכום והתחייבות קטנה", "close", 5, "כל אחד בוחר מחויבות אחת קטנה לחודש הקרוב וכותב אותה. מחזירים אותה בפעולה בעוד חודש.") ] },
  { key: "sukkot", name: "סוכות", value: "הכנסת אורחים", stages: [
    S("פתיחה: הבית הזמני", "open", 10, "שאלה: מה אתם לוקחים איתכם אם צריך לגור שבוע בסוכה? מה חיוני ומה אפשר בלי?"),
    S("בניית סוכה קטנה", "body", 20, "כל קבוצה בונה סוכה ממה שיש בחדר (מטפחות, כסאות, בדים). חובה שיהיה בה מקום לאורח. נותנים 12 דקות ובודקים כל סוכה."),
    S("שיא: ארוחת אורחים", "peak", 15, "כל קבוצה מזמינה חבר מקבוצה אחרת, ומציגה לו מה הכינה ולמה הוא מוזמן. האורח מספר איך הרגיש."),
    S("סיכום: מי חסר אצלנו בסוכה", "close", 5, "דיון קצר: מי בשבט היה מרגיש חסר מקום, ומה נעשה השבוע כדי שירגיש בבית.") ] },
  { key: "hanuka", name: "חנוכה", value: "אומץ", stages: [
    S("פתיחה: אור בחדר חשוך", "open", 8, "מכבים אורות, מדליקים נר אחד. שאלה: מה אור קטן מצליח לעשות שאי אפשר לעשות בחושך?"),
    S("מעטים מול רבים: משחק", "body", 20, "משחק תחנות: קבוצה קטנה צריכה להשלים משימה מול קבוצה גדולה (למשל להעביר כדורים בתוך זמן קצר). אחרי כל תחנה שואלים מה עזר לקבוצה הקטנה."),
    S("שיא: אומץ יומיומי", "peak", 15, "כל חניך מספר או כותב מקרה שבו נדרש אומץ קטן (לומר לא, לעזור, להתנצל). מציגים כנרות על הקיר."),
    S("סיכום: נר לשבוע", "close", 7, "כל אחד מדליק נר ואומר משפט אחד על אומץ שהוא יעשה השבוע.") ] },
  { key: "tubishvat", name: 'ט"ו בשבט', value: "אחריות לסביבה", stages: [
    S("פתיחה: סיפור העץ", "open", 8, "מי שותל עץ שהוא לא יספיק לראות גדל? שאלה לדיון קצר ומשם לפעולה."),
    S("שתילה או הכנת שתיל", "body", 20, "שותלים בחצר או מכינים שתילים בעציץ מהחדר. כל חניך אחראי על שתיל אחד וקובע מי ישקה אותו."),
    S("שיא: חמשת הפירות", "peak", 12, "טעימת פירות יבשים וכל טעימה מלווה בשאלה על מה אנחנו מטפחים אצלנו בשבט."),
    S("סיכום: תורנות שתילים", "close", 5, "קובעים לוח השקיה ומחליטים מי מדווח בפעולה הבאה.") ] },
  { key: "purim", name: "פורים", value: "כנות", stages: [
    S("פתיחה: מי מאחורי המסכה", "open", 10, "כל חניך מנסה לתאר את עצמו בשלוש מילים שאף אחד לא יודע עליו. מנחשים של מי."),
    S("מסכות ומה שמתחת", "body", 20, "יוצרים מסכה שמראה צד אחד באישיות, ובצד הפנימי כותבים צד שלא רואים. מי שרוצה, משתף."),
    S("שיא: משלוח מנות", "peak", 15, "כל חניך מכין משלוח קטן (כרטיס ברכה וממתק) למישהו מהקבוצה שפחות מתחבר אליו."),
    S("סיכום", "close", 5, "מה היה נעים לקבל, ומה היה נעים לתת.") ] },
  { key: "pesach", name: "פסח", value: "חופש", stages: [
    S("פתיחה: ארבע שאלות שלנו", "open", 10, "כל קבוצה מנסחת שאלה אחת שהם תמיד רוצים לשאול על חופש. אוספים על הלוח."),
    S("מה משעבד אותנו היום", "body", 18, "דיון בקבוצות: דברים שאנחנו מרגישים שאי אפשר בלעדיהם (טלפון, דעת קהל). איך יוצאים משם בלי לשבור את החיים."),
    S("שיא: יציאה ממצרים קטנה", "peak", 15, "כל חניך כותב התחייבות קטנה לשחרור הרגל אחד לשבוע. מניחים אותה במעטפה."),
    S("סיכום: מי עוזר לי", "close", 7, "כל אחד בוחר חבר שיעזור לו לעמוד בהתחייבות.") ] },
  { key: "atzmaut", name: "יום העצמאות", value: "שייכות", stages: [
    S("פתיחה: מה אני אוהב כאן", "open", 8, "כל חניך אומר מקום או רגע בישראל שהוא אוהב, בלי לחזור על מה שנאמר."),
    S("דברים שאפשר לשפר", "body", 18, "בקבוצות בוחרים דבר אחד בקהילה שרוצים לשפר, וקובעים צעד קטן שאפשר לעשות כבר החודש."),
    S("שיא: מופע קצר", "peak", 15, "כל קבוצה מציגה בשתי דקות את הצעד שלה, בשיר, בהצגה או בציור."),
    S("סיכום", "close", 7, "מצביעים על צעד אחד שעושים יחד כל השבט.") ] },
  { key: "lagbaomer", name: 'ל"ג בעומר', value: "עבודת צוות", stages: [
    S("פתיחה: סיפור המדורה", "open", 8, "ספרו בשתי דקות למה מדליקים מדורות בל\"ג בעומר ושאלו מה הופך אש למשותפת."),
    S("בניית מדורה בטוחה", "body", 22, "כל קבוצה אחראית על תפקיד: איסוף עצים, מקום בטוח, כיבוי. הצוות הבוגר מאשר לפני שמדליקים."),
    S("שיא: סביב האש", "peak", 20, "שירה וסיפור קצר מכל קבוצה. כללי בטיחות נאמרים בקול לפני שמתיישבים."),
    S("סיכום וכיבוי", "close", 10, "מכבים יחד לפי הסדר ושואלים מה עבד בעבודת הצוות.") ] },
];
export const holidayList = () => HOLIDAYS.map((h) => ({ key: h.key, name: h.name, value: h.value, stages: h.stages.length }));

/** 338: מיזוג שתי גרסאות של אותה פעולה, שלב מול שלב. */
const tokens = (s) => new Set(String(s || "").replace(/[^א-תa-z0-9\s]/gi, " ").split(/\s+/).filter((w) => w.length > 2));
const jacc = (a, b) => {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
};
export function mergePlan(a, b) {
  const usedB = new Set();
  const rows = [];
  a.forEach((sa, ia) => {
    let best = -1;
    let bestScore = 0;
    b.forEach((sb, ib) => {
      if (usedB.has(ib)) return;
      const score = jacc(tokens(sa.title + " " + sa.text), tokens(sb.title + " " + sb.text)) + (sa.kind === sb.kind ? 0.15 : 0) + (ia === ib ? 0.1 : 0) + jacc(tokens(sa.title), tokens(sb.title)) * 0.5;
      if (score > bestScore) { bestScore = score; best = ib; }
    });
    if (best >= 0 && bestScore >= 0.25) {
      usedB.add(best);
      const sb = b[best];
      const same = sa.text.trim() === sb.text.trim() && sa.title.trim() === sb.title.trim();
      rows.push({ state: same ? "same" : "changed", a: sa, b: sb, similarity: Math.round(Math.min(1, bestScore) * 100) });
    } else rows.push({ state: "onlyA", a: sa, b: null, similarity: 0 });
  });
  b.forEach((sb, ib) => { if (!usedB.has(ib)) rows.push({ state: "onlyB", a: null, b: sb, similarity: 0 }); });
  return rows;
}

/** 341: שאלות פתיחה ("הוק") מהנושא ומהטקסט. */
export function hookQuestions({ topic, value, age, words = [] }) {
  const t = topic || value || "הנושא של היום";
  const w = words[0] || t;
  const young = /ג|ד|ה/.test(String(age || "").slice(0, 8)) && /כית/.test(String(age || ""));
  const out = [
    { type: "הצבעה", text: `מי מסכים/ה: "${t}" זה משהו שקורה לנו כל יום? מרימים יד, ועכשיו מחליפים: מי יכול לתת דוגמה?` },
    { type: "בחירה", text: `אם הייתם חייבים לבחור: ${value || "הערך"} או כיף? תעמדו בצד שמסכים עם התשובה שלכם, ותסבירו לצד השני.` },
    { type: "דמיון", text: `מה היה קורה לשבט שלנו אם מחר בבוקר כולם היו שוכחים מה זה "${w}"?` },
    { type: "אישי", text: `ספרו לחבר בשורה אחת על פעם שבה ${value ? `נדרשה מכם ${value}` : `נתקלתם ב${t}`}. ואחר כך החליפו.` },
    { type: "תעלומה", text: `לפני שאתם יודעים על מה הפעולה: אני אגיד שלוש רמזים, ואתם תנחשו את הנושא. הרמז הראשון: ${w}.` },
    { type: "שוברת קרח", text: young ? `קמים ומראים בתנועה אחת מה זה "${t}" בשבילכם. כולם מנחשים.` : `במשפט אחד, בלי לחשוב יותר מדי: מה ההיפך מ"${t}"?` },
  ];
  return out;
}

/** 343: מחולל כללי משחק. */
export function gameRules({ name, players, space, goal, style }) {
  const team = style === "teams";
  const solo = style === "solo";
  const coop = style === "coop";
  const nTeams = players >= 24 ? 4 : players >= 12 ? 3 : 2;
  const lines = [];
  lines.push(`# ${name}`);
  lines.push(`**מספר משתתפים:** ${players} · **מקום:** ${space === "outdoor" ? "בחוץ" : space === "hall" ? "אולם" : "חדר"} · **מטרה:** ${goal}`);
  lines.push("");
  lines.push("## הכנה");
  lines.push(team ? `מחלקים ל-${nTeams} קבוצות שוות (בערך ${Math.round(players / nTeams)} בכל אחת). לכל קבוצה שם, צבע וקפטן.` : coop ? "כל המשתתפים בקבוצה אחת מול הזמן או מול המדריכים." : "כל משתתף משחק לבד ומקבל מספר.");
  lines.push(space === "outdoor" ? "מסמנים גבולות משחק ברורים (קונוסים או חבל) ומראים אותם לכולם. בודקים שהקרקע בטוחה." : "מפנים רהיטים וחפצים חדים מאזור המשחק ומסמנים את הגבולות.");
  lines.push("");
  lines.push("## איך משחקים");
  lines.push(`1. המדריך מסביר את המטרה: ${goal}.`);
  lines.push(team ? "2. כל קבוצה מבצעת משימה בתורה. הקבוצה שמסיימת ראשונה מקבלת נקודה." : coop ? "2. הקבוצה מנסה להשלים את המשימה לפני שהזמן נגמר. אפשר להתייעץ בין הסבבים." : "2. כל משתתף מנסה להשלים את המשימה בזמן שהוגדר, ומתקדם לשלב הבא רק אחרי אישור.");
  lines.push("3. מי שעובר על כלל מקבל אזהרה ראשונה, ובפעם השנייה מחכה סבב אחד.");
  lines.push("");
  lines.push("## ניקוד וסיום");
  lines.push(team ? "נקודה על כל משימה, נקודת בונוס על עזרה לקבוצה אחרת. המשחק נגמר אחרי 5 סבבים או כשנגמר הזמן." : coop ? "משתדלים לשבור שיא קבוצתי: כל סבב מדווחים כמה השלמנו, ובסוף משווים לסבב הראשון." : "מי שהשלים הכי הרבה משימות מנצח, ובשוויון מתחרים בסבב קצר אחד.");
  lines.push("");
  lines.push("## בטיחות והוגנות");
  lines.push("אין דחיפות, אין מגע גופני מכוון, ושופט אחד שהחלטתו סופית. בודקים מי נפגע או עצוב לפני שממשיכים.");
  lines.push("");
  lines.push("## וריאציות");
  lines.push(`- ${solo ? "לעבור לזוגות כדי שיהיה פחות לחץ" : "להחליף תפקידים בין הקבוצות באמצע"}`);
  lines.push("- להקל לגיל צעיר: פחות סבבים, כללים בשפה קצרה, ניקוד על השתתפות.");
  lines.push("- להקשות לגיל בוגר: מגבלת זמן, תפקידים סודיים, או מטרה שנחשפת באמצע.");
  return lines.join("\n");
}

/** 344: דף ביטויים ותרגום כותרות. זה מילון, לא תרגום חופשי של הטקסט. */
const LANG = {
  en: {
    name: "English",
    kinds: { open: "Opening", body: "Main activity", peak: "Peak", close: "Closing", free: "Stage" },
    phrases: [["שלום וברוכים הבאים", "Hello and welcome"], ["מתחילים", "Let's begin"], ["שבו במעגל", "Please sit in a circle"], ["הקשיבו", "Listen, please"], ["שומרים על כללים", "Let's follow the rules"], ["זהירות", "Careful"], ["כל הכבוד", "Well done"], ["קבוצות של ארבעה", "Groups of four"], ["נחזור בעוד חמש דקות", "We'll be back in five minutes"], ["מי רוצה להוסיף", "Who wants to add something"], ["סיימנו, תודה", "We're done, thank you"]],
    words: [["חניכים", "participants"], ["מדריך", "leader"], ["קבוצה", "group"], ["משחק", "game"], ["דיון", "discussion"], ["סיכום", "summary"], ["ציוד", "equipment"], ["בטיחות", "safety"], ["שבט", "troop"], ["מעגל", "circle"], ["פתיחה", "opening"], ["תחנה", "station"], ["ערך", "value"], ["אחריות", "responsibility"], ["חברות", "friendship"], ["כבוד", "respect"]],
  },
  ru: {
    name: "Русский",
    kinds: { open: "Начало", body: "Основная часть", peak: "Кульминация", close: "Завершение", free: "Этап" },
    phrases: [["שלום וברוכים הבאים", "Здравствуйте и добро пожаловать"], ["מתחילים", "Начинаем"], ["שבו במעגל", "Садитесь в круг"], ["הקשיבו", "Послушайте, пожалуйста"], ["שומרים על כללים", "Соблюдаем правила"], ["זהירות", "Осторожно"], ["כל הכבוד", "Молодцы"], ["קבוצות של ארבעה", "Группы по четыре человека"], ["נחזור בעוד חמש דקות", "Вернёмся через пять минут"], ["מי רוצה להוסיף", "Кто хочет добавить"], ["סיימנו, תודה", "Мы закончили, спасибо"]],
    words: [["חניכים", "участники"], ["מדריך", "вожатый"], ["קבוצה", "группа"], ["משחק", "игра"], ["דיון", "обсуждение"], ["סיכום", "итоги"], ["ציוד", "оборудование"], ["בטיחות", "безопасность"], ["שבט", "отряд"], ["מעגל", "круг"], ["פתיחה", "начало"], ["תחנה", "станция"], ["ערך", "ценность"], ["אחריות", "ответственность"], ["חברות", "дружба"], ["כבוד", "уважение"]],
  },
};
export function translateSheet(lang, doc) {
  const L = LANG[lang];
  const text = [doc.title, ...doc.blocks.map((b) => `${b.title} ${b.text}`)].join(" ");
  const found = L.words.filter(([he]) => text.includes(he));
  return {
    language: L.name,
    stages: doc.blocks.map((b, i) => ({ n: i + 1, kind: L.kinds[b.kind] || L.kinds.free, minutes: b.minutes, original: b.title || "" })),
    phrases: L.phrases.map(([he, tr]) => ({ he, tr })),
    glossary: found.map(([he, tr]) => ({ he, tr })),
    note: "זה דף עזר: כותרות השלבים, ביטויים שימושיים ומילון למילים שמופיעות בפעולה. הטקסט החופשי לא מתורגם אוטומטית.",
  };
}

/** 345: הצעת סדרה: מה עושים בפעולה הבאה. */
export function nextSeries({ title, value, age, words = [] }) {
  const t = title || value || "הנושא";
  const w = words.slice(0, 3).join(", ");
  return {
    series: `סדרה: ${t}`,
    items: [
      { step: "העמקה", title: `${t}: מה זה אומר בפועל`, goal: `להפוך את מה שדיברנו עליו ל${value || "ערך"} שאפשר לראות בהתנהגות${w ? ` (נקודות לעיבוד: ${w})` : ""}`, stages: ["open", "body", "close"], text: "פתיחה בשאלה אישית, דיון בקבוצות קטנות על מקרים אמיתיים מהשבט, וסיכום במשפט אחד לכל קבוצה." },
      { step: "תרגול", title: `${t} בשטח`, goal: "ללמוד דרך חוויה: משחק או משימה שבהם הערך נבחן בפועל", stages: ["open", "body", "peak", "close"], text: "משימה קבוצתית שבה מתעוררת דילמה אמיתית, ואחריה שיחה קצרה על מה קרה ולמה." },
      { step: "מחויבות", title: `${t}: מה אנחנו עושים מעכשיו`, goal: "לסגור מעגל בהתחייבות מעשית של כל חניך ושל הקבוצה", stages: ["open", "peak", "close"], text: "מחזירים את מה שהתחייבו בפעולה הקודמת, בודקים מה קרה, ובוחרים התחייבות קבוצתית אחת לחודש." },
    ],
    age: age || "",
  };
}

// ── 339: נוכחות צופים בזמן אמת (בזיכרון בלבד, נעלמת אחרי 40 שניות) ──
const presence = new Map();
const TTL = 40_000;
const sweep = (docId) => {
  const m = presence.get(docId);
  if (!m) return [];
  const now = Date.now();
  for (const [k, v] of m) if (now - v.t > TTL) m.delete(k);
  if (!m.size) presence.delete(docId);
  return [...m.values()];
};

export function registerWriteV50Routes(app, { db, limiter, requireUser }) {
  const lim = limiter(60_000, 60);
  const blockZ = z.object({ id: z.string().max(24).default("x"), title: z.string().max(120).default(""), kind: z.enum(KINDS).default("free"), minutes: z.number().int().min(0).max(300).nullable().default(null), text: z.string().max(20000).default(""), note: z.string().max(5000).default("") });
  const docZ = z.object({ title: z.string().max(120).default(""), meta: z.any().default({}), blocks: z.array(blockZ).max(60) });

  app.get("/api/write/holidays", requireUser(), lim, (_req, res) => res.json(holidayList()));
  app.get("/api/write/holidays/:key", requireUser(), lim, (req, res) => {
    const h = HOLIDAYS.find((x) => x.key === req.params.key);
    if (!h) return res.status(404).json({ error: { code: "NOT_FOUND", message: "החג לא נמצא" } });
    res.json(h);
  });
  app.post("/api/write/merge-plan", requireUser(), lim, (req, res) => {
    const v = z.object({ a: z.array(blockZ).max(60), b: z.array(blockZ).max(60) }).parse(req.body ?? {});
    res.json({ rows: mergePlan(v.a, v.b) });
  });
  app.post("/api/write/hooks", requireUser(), lim, (req, res) => {
    const d = docZ.parse(req.body ?? {});
    const words = keywordsFrom(d, 6).map((k) => k.word);
    res.json({ hooks: hookQuestions({ topic: d.title, value: d.meta?.value, age: d.meta?.ageGroup, words }) });
  });
  app.post("/api/write/game-rules", requireUser(), lim, (req, res) => {
    const v = z.object({ name: z.string().trim().min(2, "כתבו שם למשחק").max(60), players: z.number().int().min(2).max(120).default(16), space: z.enum(["outdoor", "hall", "room"]).default("outdoor"), goal: z.string().trim().min(3, "כתבו מטרה בקצרה").max(160), style: z.enum(["teams", "solo", "coop"]).default("teams") }).parse(req.body ?? {});
    res.json({ text: gameRules(v) });
  });
  app.post("/api/write/translate-sheet", requireUser(), lim, (req, res) => {
    const v = z.object({ lang: z.enum(["en", "ru"]), doc: docZ }).parse(req.body ?? {});
    res.json(translateSheet(v.lang, v.doc));
  });
  app.post("/api/write/next-series", requireUser(), lim, (req, res) => {
    const d = docZ.parse(req.body ?? {});
    res.json(nextSeries({ title: d.title, value: d.meta?.value, age: d.meta?.ageGroup, words: keywordsFrom(d, 4).map((k) => k.word) }));
  });

  // נוכחות: הצופה בקישור הציבורי מדווח באיזה שלב הוא נמצא; הבעלים רואה.
  app.post("/api/write/shared/:token/presence", limiter(60_000, 40), (req, res) => {
    const v = z.object({ cid: z.string().min(6).max(40), name: z.string().trim().max(30).default("צופה"), blockId: z.string().max(24).default("") }).parse(req.body ?? {});
    const s = db.prepare("SELECT doc_id, expires_at FROM write_shares WHERE token = ?").get(String(req.params.token).slice(0, 40));
    if (!s || Date.parse(s.expires_at) < Date.now()) return res.status(404).json({ error: { code: "NOT_FOUND", message: "הקישור לא קיים" } });
    let m = presence.get(s.doc_id);
    if (!m) presence.set(s.doc_id, (m = new Map()));
    if (m.size < 30 || m.has(v.cid)) m.set(v.cid, { cid: crypto.createHash("sha256").update(v.cid).digest("hex").slice(0, 8), name: v.name || "צופה", blockId: v.blockId, t: Date.now() });
    res.json({ ok: true });
  });
  app.get("/api/write/docs/:id/presence", requireUser(), limiter(60_000, 40), (req, res) => {
    const d = db.prepare("SELECT id FROM write_docs WHERE id = ? AND owner_id = ?").get(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json({ error: { code: "NOT_FOUND", message: "המסמך לא נמצא" } });
    res.json({ viewers: sweep(d.id).map(({ cid, name, blockId }) => ({ cid, name, blockId })) });
  });
}
