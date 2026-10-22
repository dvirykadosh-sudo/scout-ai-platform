// בודק איכות: מסמן ניסוחים משרדיים או רובוטיים ומציע החלפה בעברית מדוברת.
// עובד על כל טקסט, גם בלי AI.

const YES = {
  "יש לוודא": "תוודאו",
  "יש להקפיד": "תקפידו",
  "יש לדאוג": "תדאגו",
  "יש לשים לב": "שימו לב",
  "יש להסביר": "תסבירו",
  "יש לבקש": "תבקשו",
  "יש לחלק": "תחלקו",
  "יש להכין": "תכינו",
};

// fix: מחרוזת להחלפה (או null אם אפשר רק להצביע). הביטויים קבועים כדי שההחלפה תהיה בטוחה.
const RULES = [
  { re: /במסגרת (?:ה)?(?:פעילות|פעולה)/g, why: "ניסוח משרדי", fix: "בפעולה" },
  { re: /לאחר מכן/g, why: "ניסוח רשמי", fix: "אחר כך" },
  { re: /על מנת ל/g, why: "ניסוח רשמי", fix: "כדי ל" },
  { re: /ניתן ל(?=\S)/g, why: "ניסוח רשמי", fix: "אפשר ל" },
  { re: /בהתאם ל/g, why: "ניסוח משרדי", fix: "לפי " },
  { re: /באמצעות/g, why: "ניסוח רשמי", fix: "בעזרת" },
  { re: /ישנ[םן]/g, why: "ניסוח רשמי", fix: "יש" },
  { re: /החניכים (?:יתבקשו|מתבקשים) ל/g, why: "לשון סביל. המדריך מדבר, לא הנהלה", fix: "תבקשו מהחניכים ל" },
  { re: /יש ל(?:וודא|הקפיד|דאוג|שים לב|הסביר|בקש|חלק|הכין)/g, why: "לשון הוראה יבשה", fixFn: (m) => YES[m] || null },
  { re: /(?:יבוצע|תבוצע|מבוצע|מבוצעת|יתבצע|תתבצע)/g, why: "לשון סביל. מי עושה? כתבו מי עושה מה", fix: null },
  { re: /הנ"ל|כאמור|לעיל/g, why: "ניסוח משפטי", fix: null },
];

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

/** items: [{ label, text }] -> { score, issues } */
export function checkQuality(items) {
  const issues = [];
  for (const { label, text } of items) {
    const t = String(text ?? "");
    for (const rule of RULES) {
      for (const m of t.matchAll(rule.re)) {
        const fix = rule.fixFn ? rule.fixFn(m[0]) : rule.fix;
        issues.push({ label, phrase: m[0], why: rule.why, fix, index: m.index, context: t.slice(Math.max(0, m.index - 25), m.index + m[0].length + 30).replace(/\s+/g, " ") });
      }
    }
    for (const s of t.split(/(?<=[.!?])\s+|\n+/)) {
      if (wordCount(s) > 28) issues.push({ label, phrase: s.slice(0, 40) + "…", why: `משפט ארוך (${wordCount(s)} מילים). קל יותר להקריא משפטים קצרים`, fix: null, index: t.indexOf(s), context: s.slice(0, 70) });
    }
  }
  const score = Math.max(0, 100 - issues.length * 7);
  return { score, issues };
}

/** Applies every safe fix (exact phrase replacements only) and returns the new text. */
export function applyFixes(text) {
  let out = String(text ?? "");
  for (const rule of RULES) {
    if (rule.fix === null) continue;
    out = out.replace(rule.re, (m) => (rule.fixFn ? rule.fixFn(m) : rule.fix) ?? m);
  }
  return out;
}

// ───────────── בדיקת מבנה אוטומטית ─────────────
// בדיקה גסה לפי מילים ומספרים. היא לא מחליפה שיקול דעת של מדריך, אבל תופסת מה שחסר.

const any = (text, re) => re.test(text);

/** מקבל פעולה ומחזיר רשימת בדיקות עם הצעה לכל אחת. */
export function reviewActivity(a) {
  const stages = a.stages || [];
  const all = stages.map((s) => s.content).join("\n");
  const total = stages.reduce((s, x) => s + x.minutes, 0) || 1;
  const words = (t) => String(t).split(/\s+/).filter(Boolean).length;
  const activeStages = stages.filter((s) => any(s.content, /בזוגות|בקבוצות|משחק|עושים|בונים|מציגים|רצים|כל אחד|כולם|מתחלקים|משימה/)).length;
  const longest = stages.reduce((m, s) => (s.minutes > m.minutes ? s : m), stages[0] || { minutes: 0, name: "" });
  const discussion = stages.find((s) => /דיון/.test(s.name)) || stages[3];
  const last = stages[stages.length - 1];
  const risky = a.energeticMode || a.activeScouting || a.kind === "field" || any(all, /ריצה|רצים|מים|אש|מדורה|סכין|טיפוס|חוץ|שביל/);
  const checks = [
    { id: "peak", label: "יש רגע מרכזי או משימה גדולה", ok: any(all, /שיא|משימה (?:משותפת|גדולה|מרכזית)|אתגר|טקס|הצגה|מופע|בונים|בנייה|מירוץ/), tip: "הוסיפו רגע אחד שהפעולה מכוונת אליו, למשל משימה משותפת גדולה או טקס קצר." },
    { id: "surprise", label: "יש הפתעה או סקרנות בפתיחה", ok: any(all, /הפתע|סוד|בלי לגלות|לא יודעים|תעלומה|מכתב|גילוי|פתאום|סקרנות/), tip: "התחילו במשהו שהחניכים לא מצפים לו, כמו חפץ מסתורי או שאלה שאי אפשר לנחש." },
    { id: "active", label: "החניכים פעילים ולא רק מקשיבים", ok: activeStages >= 3, tip: "לפחות שלושה שלבים צריכים לכלול עשייה: משחק, משימה בזוגות או בקבוצות." },
    { id: "balance", label: "הזמנים מאוזנים", ok: longest.minutes / total <= 0.45 && stages.every((s) => s.minutes >= 3), tip: `שלב "${longest.name}" תופס יותר מדי מהפעולה. כדאי לקצר אותו או לפצל.` },
    { id: "discussion", label: "יש זמן מספיק לדיון", ok: !!discussion && discussion.minutes >= 8, tip: "הדיון צריך לפחות 8 דקות, כדי שיהיה מקום לשאלה פתוחה ולא רק למענה קצר." },
    { id: "question", label: "יש שאלה פתוחה בדיון", ok: !!discussion && any(discussion.content, /\?/), tip: "הוסיפו שאלה אחת שאין לה תשובה אחת, ושמתחילה במילה 'למה' או 'איך'." },
    { id: "clear", label: "לכל שלב יש הסבר מספיק", ok: stages.every((s) => words(s.content) >= 20), tip: "יש שלב קצר מדי. כתבו מה המדריך אומר, מה החניכים עושים ומתי עוברים הלאה." },
    { id: "safety", label: "יש הערת בטיחות כשצריך", ok: !risky || words(a.safetyNotes) >= 4, tip: "בפעולה עם תנועה או חוץ צריך משפט בטיחות מפורש: גבולות גזרה, מים ואחראי." },
    { id: "closing", label: "יש סיום וחתימה", ok: !!last && any(last.content, /כל אחד|משפט|מעגל|חתימה|מחויבות|סיכום|לסיום/), tip: "סיימו ברגע קצר שכולם משתתפים בו, כמו משפט אחד במעגל." },
  ];
  const ok = checks.filter((c) => c.ok).length;
  return { score: Math.round((ok / checks.length) * 100), ok, total: checks.length, checks };
}
