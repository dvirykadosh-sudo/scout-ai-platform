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
