// שלב 54 (450): אומדן עלות לפעולה מתוך רשימת הציוד ורשימת מחירים אישית.
export const DEFAULT_PRICES = {
  דף: 0.15, נייר: 0.15, עט: 3, עיפרון: 2, טוש: 6, צבעים: 20, מספריים: 10, דבק: 8, סלוטייפ: 7, חבל: 15, כדור: 25, בלונים: 0.6, בלון: 0.6,
  נרות: 2, גפרורים: 5, פתקים: 10, קלפים: 12, פלקט: 4, קרטון: 6, בד: 15, סרט: 8, מדבקות: 10, כוסות: 0.5, צלחות: 0.5, פנס: 20, סוללות: 12, עצים: 40, שקית: 0.5, מים: 4, פלייר: 0.5, מדליות: 3, פרסים: 5,
};
const PER_PERSON = /לכל\s*(חניך|חניכה|אחד|אחת|משתתף|ילד|ילדה|איש)|כל\s*חניך|אחד לכל|אחת לכל|לכולם|לכל החניכים/;
const PER_GROUP = /לכל\s*קבוצה|לכל\s*שישייה|כל\s*קבוצה/;
const norm = (s) => String(s || "").replace(/[֑-ׇ]/g, "").replace(/["'׳״]/g, "").trim();

export function splitItems(text) {
  return String(text || "").split(/\n|[,;،]|\s\+\s|\s·\s|\sו(?=\d)/).map((s) => s.replace(/^[\s•\-–*]+/, "").trim()).filter((s) => s.length >= 2).slice(0, 60);
}

/** מחזיר מחיר ליחידה מרשימת המשתמש או מברירות המחדל, לפי מילה שמופיעה בשורה. */
function priceFor(item, mine) {
  const words = norm(item).split(/\s+/);
  for (const [src, table] of [["user", mine], ["default", DEFAULT_PRICES]]) {
    for (const key of Object.keys(table).sort((a, b) => b.length - a.length)) {
      if (words.some((w) => w === key || w.replace(/^[והבכלמש]/, "") === key || (key.length >= 3 && w.startsWith(key)))) return { key, price: table[key], source: src };
    }
  }
  return null;
}

export function estimateCost({ equipment, groupSize = 20, mine = {} }) {
  const size = Math.max(1, Math.min(300, Number(groupSize) || 20));
  const groups = Math.max(1, Math.ceil(size / 6));
  // "דף ועט לכל חניך": הסימון חל על כל הפריטים בשורה
  const entries = splitItems(equipment).flatMap((raw) => raw.split(/\sו(?=[א-ת]{2,})/).map((x) => x.trim()).filter(Boolean).map((item) => ({ item, pp: PER_PERSON.test(raw), pg: PER_GROUP.test(raw) })));
  const lines = entries.slice(0, 80).map(({ item, pp, pg }) => {
    const m = norm(item).match(/(\d+(?:\.\d+)?)/);
    let qty = m ? Number(m[1]) : 1;
    let basis = m ? "כמות מהטקסט" : "יחידה אחת";
    if (pp) { qty = (m ? qty : 1) * size; basis = `לכל חניך (${size})`; }
    else if (pg) { qty = (m ? qty : 1) * groups; basis = `לכל קבוצה (${groups})`; }
    const p = priceFor(item, mine);
    return { item, qty: Math.round(qty * 100) / 100, basis, unitPrice: p?.price ?? null, key: p?.key ?? null, source: p?.source ?? "unknown", total: p ? Math.round(p.price * qty * 100) / 100 : null };
  });
  const known = lines.filter((l) => l.total != null);
  const total = Math.round(known.reduce((s, l) => s + l.total, 0) * 100) / 100;
  return { groupSize: size, lines, total, perParticipant: Math.round((total / size) * 100) / 100, unknown: lines.filter((l) => l.total == null).map((l) => l.item), note: "אומדן גס. המחירים הם ברירת מחדל שאפשר לעדכן ברשימת המחירים שלכם." };
}
