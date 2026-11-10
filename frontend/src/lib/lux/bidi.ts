// שלב 61: סדר חזותי לעברית עבור מנועי ציור שאינם מבצעים כיווניות (Satori של תמונות השיתוף).
// המרה מסדר לוגי (כפי שנכתב) לסדר חזותי משמאל לימין, בפסקה בכיוון ימין-לשמאל.
const R = /[֐-׿]/;
const D = /[0-9]/;
const L = /[A-Za-z]/;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };
type K = "R" | "L" | "N";
const kind = (c: string): K => (R.test(c) ? "R" : L.test(c) || D.test(c) ? "L" : "N");

export function visualRtl(text: string): string {
  const runs: { k: K; s: string }[] = [];
  for (const c of text) {
    const k = kind(c);
    const last = runs[runs.length - 1];
    if (last && last.k === k) last.s += c;
    else runs.push({ k, s: c });
  }
  // נייטרלי שמוקף באותו כיוון חזק (למשל "12:30" או מירכאות בתוך מילה) נבלע בו
  const merged: { k: K; s: string }[] = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const prev = merged[merged.length - 1];
    const next = runs[i + 1];
    if (r.k === "N" && prev && next && prev.k !== "N" && prev.k === next.k && !/\s/.test(r.s) && r.s.length <= 2) prev.s += r.s;
    else if (r.k !== "N" && prev && prev.k === r.k) prev.s += r.s;
    else merged.push({ ...r });
  }
  return merged
    .reverse()
    .map((r) => (r.k === "L" ? r.s : [...r.s].reverse().map((c) => MIRROR[c] ?? c).join("")))
    .join("");
}
