// שלב 70: מיזוג ברמת שלב בצד הלקוח. עותק זהה בלוגיקה ל-backend/src/block-merge.js (בדיקת השרת מריצה את שניהם על אותם תרחישים).
// תחביר "מחיק" בלבד (בלי enum), כי בדיקות השרת טוענות את הקובץ ישירות.

const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
export const same = (a: unknown, b: unknown): boolean => canon(a) === canon(b);

export function mergeFields<T extends object>(base: T, mine: T, theirs: T): T {
  const b = (base ?? {}) as Record<string, unknown>;
  const m = (mine ?? {}) as Record<string, unknown>;
  const t = (theirs ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) out[k] = same(m[k], b[k]) ? t[k] : m[k];
  return out as T;
}

export function mergeBlocks<T extends { id: string }>(base: T[], mine: T[], theirs: T[]): { blocks: T[]; conflicts: string[] } {
  const index = (l: T[]) => new Map<string, T>(l.map((b) => [b.id, b]));
  const B = index(base);
  const M = index(mine);
  const T_ = index(theirs);
  const keep = new Map<string, T>();
  const conflicts: string[] = [];
  for (const id of new Set([...B.keys(), ...M.keys(), ...T_.keys()])) {
    const b = B.get(id);
    const m = M.get(id);
    const t = T_.get(id);
    if (m && t) {
      if (same(m, t)) keep.set(id, m);
      else if (b && same(m, b)) keep.set(id, t);
      else if (b && same(t, b)) keep.set(id, m);
      else {
        keep.set(id, m);
        conflicts.push(id);
      }
    } else if (m) {
      if (!(b && same(m, b))) keep.set(id, m);
    } else if (t) {
      if (!(b && same(t, b))) keep.set(id, t);
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
  return { blocks: ids.map((id) => keep.get(id) as T), conflicts };
}
