// ציוד: פירוק שדה הציוד של פעולה לפריטים, והתאמה למה שיש "בארון" של המדריך.
// קובץ טהור, בלי תלות בשאר המערכת, כדי שגם החיפוש במאגר יוכל להשתמש בו.

/** קבוצות ציוד נפוצות שהמדריך מסמן ב"מה יש בארון". */
export const GEAR_GROUPS = [
  { id: "paper", label: "דפים ועטים", words: ["דף", "דפים", "עט", "עטים", "עיפרון", "נייר", "מחברת", "כרטיס", "כרטיסים", "כרטיסיות", "תרחיש", "תרחישים", "פתק", "פתקים", "מודפס", "מודפסים"] },
  { id: "markers", label: "טושים, צבעים ודפים גדולים", words: ["טוש", "טושים", "דף גדול", "דפים גדולים", "לוח", "פלקט", "צבעים", "צבע", "קרטון"] },
  { id: "rope", label: "חבלים וסרטים", words: ["חבל", "חבלים", "סרט", "סרטים", "חוט", "חוטים"] },
  { id: "timer", label: "שעון עצר או טלפון", words: ["שעון", "טיימר", "טלפון", "סטופר"] },
  { id: "ball", label: "כדורים", words: ["כדור", "כדורים", "פריסבי"] },
  { id: "cones", label: "קונוסים וסימון שטח", words: ["קונוס", "קונוסים", "גיר", "סימון"] },
  { id: "blindfold", label: "כיסויי עיניים ומטפחות", words: ["כיסוי עיניים", "כיסויי עיניים", "מטפחת", "מטפחות"] },
  { id: "music", label: "רמקול ומוזיקה", words: ["רמקול", "מוזיקה", "מוסיקה", "תאורה", "מקרן"] },
  { id: "firstaid", label: "ערכת עזרה ראשונה", words: ["עזרה ראשונה", "תחבושת", "תחבושות"] },
  { id: "map", label: "מפות ומצפנים", words: ["מפה", "מפות", "מצפן", "מצפנים"] },
  { id: "water", label: "מים", words: ["מים", "בקבוק", "בקבוקים", "שתייה"] },
  { id: "lights", label: "פנסים ונרות", words: ["פנס", "פנסים", "נר", "נרות", "מדורה"] },
  { id: "blankets", label: "שמיכות ושטיחים", words: ["שמיכה", "שמיכות", "שטיח", "שטיחים", "מחצלת", "מחצלות"] },
  { id: "games", label: "כסף משחק, קלפים וקוביות", words: ["כסף", "מונופול", "קלפים", "קוביה", "קוביות", "משחק קופסה"] },
  { id: "bags", label: "שקיות וכפפות", words: ["שקית", "שקיות", "אשפה", "כפפות"] },
  { id: "tape", label: "נייר דבק ומדבקות", words: ["דבק", "מדבקות", "מדבקה", "סלוטייפ", "סיכות", "מסקינג"] },
];

/** מילים שמסמנות דבר שיש תמיד (מקום, נעליים) ולכן לא נחשב "ציוד שצריך להשיג". */
// (ב-JS אין \b לעברית, לכן גבולות מילה נכתבים ידנית)
const FREE = /נעליים|מקום|חדר|אולם|חצר|מרחב|שטח|גינה|בגדים|(?:^|\s)(?:נעל|אין|ללא|בלי|כלום)(?:\s|$)/;
const OPTIONAL = /(^|\s)(אפשר|אם יש|רצוי|לא חובה|אופציונלי|מומלץ)(\s|$)/;

const stripMarks = (s) => String(s || "").replace(/[֑-ׇ]/g, "").replace(/["'״׳`]/g, "").replace(/\s+/g, " ").trim();

/** פירוק לשלוש רמות: פסקאות (פסיק/נקודה), חלופות ("או"), חלקים ("ו"). */
function splitClauses(text) {
  const t = stripMarks(String(text || "").replace(/\([^)]*\)/g, " ").replace(/^בנוסף:?/g, ""));
  return t
    .split(/[,،;\n]|\.\s|\.$|\sבנוסף:?\s/)
    .map((c) => c.trim().replace(/^בנוסף:?\s*/, ""))
    .filter((c) => c && !/^(אין|ללא|בלי)( ציוד)?$/.test(c));
}

const groupsOf = (part) => GEAR_GROUPS.filter((g) => g.words.some((w) => part.includes(w))).map((g) => g.id);

/** פריטי הציוד של פעולה: [{ text, optional, free, alternatives: [[{ part, groups, free }]] }] */
export function gearItems(equipment) {
  return splitClauses(equipment).map((clause) => {
    const optional = OPTIONAL.test(clause);
    const alternatives = clause
      .split(/\sאו\s/)
      .map((alt) => alt.split(/\sו(?=[א-ת])/).map((x) => x.trim()).filter(Boolean))
      .map((parts) => parts.map((part) => ({ part, groups: groupsOf(part), free: FREE.test(part) })));
    const free = alternatives.some((alt) => alt.every((p) => p.free));
    return { text: clause, optional, free, alternatives };
  });
}

/** כמה פריטים אמיתיים (לא חופשיים ולא רשות) הפעולה דורשת. */
export function gearLoad(equipment) {
  return gearItems(equipment).filter((i) => !i.free && !i.optional).length;
}

const tokensOf = (extra) => stripMarks(extra).split(/[\s,،;]+/).filter((t) => t.length >= 3);

/** האם פריט אחד מכוסה לפי מה שסומן בארון והטקסט החופשי. */
function itemCovered(item, have, extraTokens) {
  if (item.free) return true;
  const partOk = (p) => {
    if (p.free) return true;
    if (p.groups.some((g) => have.has(g))) return true;
    // פריט שלא שייך לאף קבוצה: מכוסה רק אם המדריך כתב אותו בשדה החופשי
    if (p.groups.length === 0) return extraTokens.some((t) => p.part.includes(t) || t.includes(p.part));
    return extraTokens.some((t) => p.part.includes(t));
  };
  return item.alternatives.some((alt) => alt.every(partOk));
}

/** התאמה של פעולה לארון: מה מכוסה ומה חסר. */
export function matchCupboard(equipment, haveIds = [], extra = "") {
  const have = new Set(haveIds);
  const extraTokens = tokensOf(extra);
  const items = gearItems(equipment).map((i) => ({ text: i.text, optional: i.optional, covered: itemCovered(i, have, extraTokens) }));
  const missing = items.filter((i) => !i.covered && !i.optional).map((i) => i.text);
  const optionalMissing = items.filter((i) => !i.covered && i.optional).map((i) => i.text);
  return { items, missing, optionalMissing, total: items.filter((i) => !i.optional).length };
}
