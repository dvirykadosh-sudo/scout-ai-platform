// שלב 61 (רעיון 18): מי צופה עכשיו בטיוטה משותפת ומי מקליד. הכול בזיכרון השרת בלבד, בלי כתיבה למסד ובלי כתובות IP.
// זה סקר (heartbeat) כל כמה שניות ולא חיבור פתוח, כדי שיעבוד גם ב-Render החינמי. נתונים נמחקים אחרי TTL.
export const TTL_MS = 25_000;
const MAX_PER_DOC = 12;
const MAX_DOCS = 400;
const COLORS = ["#f97316", "#a78bfa", "#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#2dd4bf", "#fb7185"];

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
export const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24) || "אורח/ת";

export function createPresence(now = () => Date.now()) {
  const docs = new Map(); // key -> Map(cid -> {name, owner, typing, at})
  const prune = (key) => {
    const m = docs.get(key);
    if (!m) return null;
    const t = now();
    for (const [cid, p] of m) if (t - p.at > TTL_MS) m.delete(cid);
    if (!m.size) {
      docs.delete(key);
      return null;
    }
    return m;
  };
  return {
    /** מעדכן נוכחות ומחזיר את רשימת האנשים. cid: מזהה אקראי של הלשונית (לא נשמר מעבר ל-TTL). */
    beat(key, cid, { name, owner = false, typing = false }) {
      const id = String(cid ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
      if (id.length < 6) return null;
      if (!docs.has(key) && docs.size >= MAX_DOCS) {
        const oldest = docs.keys().next().value;
        docs.delete(oldest);
      }
      const m = prune(key) ?? new Map();
      docs.set(key, m);
      if (!m.has(id) && m.size >= MAX_PER_DOC) return this.list(key, id);
      m.set(id, { name: cleanName(name), owner: !!owner, typing: !!typing, at: now() });
      return this.list(key, id);
    },
    list(key, me) {
      const m = prune(key);
      if (!m) return [];
      return [...m.entries()]
        .map(([cid, p]) => ({ id: (hash(cid) % 1e8).toString(36), name: p.name, owner: p.owner, typing: p.typing, color: COLORS[hash(cid) % COLORS.length], you: cid === me }))
        .sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name, "he"));
    },
    leave(key, cid) {
      const m = docs.get(key);
      if (m) m.delete(String(cid ?? ""));
      prune(key);
    },
    size: () => docs.size,
  };
}
