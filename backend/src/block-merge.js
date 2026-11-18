// שלב 70: מיזוג ברמת שלב (3-way merge) לעריכת צוות בעורך. פונקציות טהורות, בלי תלות במסד.
// הלקוח מחזיק עותק זהה (frontend/src/lib/blockmerge.ts); בדיקה בשרת מריצה את שניהם על אותם תרחישים.
//
// הכלל: כל שלב נבדק מול נקודת המוצא (base: הנוסח שממנו התחיל מי ששומר).
//  • רק אחד שינה  -> נכנס השינוי שלו (גם מחיקה).
//  • שניהם שינו את אותו שלב אחרת -> "מי ששומר" גובר, והשלב מדווח כהתנגשות (השרת שומר את הנוסח השני כגרסה).
//  • שלב חדש משני הצדדים נכנס לפי המקום שבו הוא נוסף.

const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
export const same = (a, b) => canon(a) === canon(b);

/** מיזוג שדות שטוחים (כותרת/מטא): שדה ששמרתי ולא שיניתי לעומת הבסיס נלקח מהצד השני */
export function mergeFields(base, mine, theirs) {
  const out = {};
  for (const k of new Set([...Object.keys(base ?? {}), ...Object.keys(mine ?? {}), ...Object.keys(theirs ?? {})])) out[k] = same(mine?.[k], base?.[k]) ? theirs?.[k] : mine?.[k];
  return out;
}

/**
 * @param {{id:string}[]} base הנוסח שממנו התחיל הכותב
 * @param {{id:string}[]} mine מה שהכותב שולח עכשיו
 * @param {{id:string}[]} theirs הנוסח הנוכחי בשרת (עם שינויי האחרים)
 * @returns {{blocks: object[], conflicts: string[]}}
 */
export function mergeBlocks(base, mine, theirs) {
  const index = (l) => new Map(l.map((b) => [b.id, b]));
  const B = index(base);
  const M = index(mine);
  const T = index(theirs);
  const keep = new Map();
  const conflicts = [];
  for (const id of new Set([...B.keys(), ...M.keys(), ...T.keys()])) {
    const b = B.get(id);
    const m = M.get(id);
    const t = T.get(id);
    if (m && t) {
      if (same(m, t)) keep.set(id, m);
      else if (b && same(m, b)) keep.set(id, t);
      else if (b && same(t, b)) keep.set(id, m);
      else {
        keep.set(id, m);
        conflicts.push(id);
      }
    } else if (m) {
      if (!(b && same(m, b))) keep.set(id, m); // הם מחקו; אם שיניתי אותו, נשאר
    } else if (t) {
      if (!(b && same(t, b))) keep.set(id, t); // אני מחקתי; אם הם שינו אותו, נשאר
    }
  }
  const mi = mine.map((b) => b.id).filter((id) => keep.has(id));
  const ti = theirs.map((b) => b.id).filter((id) => keep.has(id));
  const mineCommon = mine.map((b) => b.id).filter((id) => B.has(id));
  const baseCommon = base.map((b) => b.id).filter((id) => M.has(id));
  const iReordered = mineCommon.join("|") !== baseCommon.join("|");
  const skeleton = iReordered ? mi : ti;
  const other = iReordered ? ti : mi;
  const ids = skeleton.slice();
  const placed = new Set(ids);
  other.forEach((id, i) => {
    if (placed.has(id)) return;
    let p = i - 1;
    while (p >= 0 && !placed.has(other[p])) p--;
    ids.splice(p >= 0 ? ids.indexOf(other[p]) + 1 : 0, 0, id);
    placed.add(id);
  });
  return { blocks: ids.map((id) => keep.get(id)), conflicts };
}

/** זיכרון קטן של נוסחי בסיס לפי גרסה, רק למסמכי צוות. נעלם באיתחול השרת, ואז חוזרים להתנגשות רגילה (409). */
export function createRevCache({ perDoc = 6, maxDocs = 60 } = {}) {
  const docs = new Map(); // docId -> [{rev, title, meta, blocks}]
  return {
    /** @param {{id:number, rev:number, title:string, meta_json:string, blocks_json:string}} d שורת write_docs */
    remember(d) {
      let list = docs.get(d.id);
      if (!list) {
        if (docs.size >= maxDocs) docs.delete(docs.keys().next().value);
        docs.set(d.id, (list = []));
      }
      if (list.some((x) => x.rev === d.rev)) return;
      list.push({ rev: d.rev, title: d.title, meta: JSON.parse(d.meta_json), blocks: JSON.parse(d.blocks_json) });
      if (list.length > perDoc) list.shift();
    },
    at: (docId, rev) => docs.get(docId)?.find((x) => x.rev === rev) ?? null,
    forget: (docId) => void docs.delete(docId),
    size: () => docs.size,
  };
}
