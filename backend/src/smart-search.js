// שלב 54 (444): חיפוש חכם בעברית. נרמול ניקוד, כתיב מלא/חסר, קידומות, נרדפות ותיקון שגיאות כתיב.
const NIQQUD = /[֑-ׇ]/g;
export const norm = (s) => String(s || "").replace(NIQQUD, "").replace(/[׳'`´"״]/g, "").replace(/[-–—_/\\,.;:!?()[\]{}]+/g, " ").replace(/\s+/g, " ").toLowerCase().trim();
/** כתיב מלא/חסר: מסירים ו/י שאינן האות הראשונה. */
export const skeleton = (w) => (w.length <= 3 ? w : w[0] + w.slice(1).replace(/[וי]/g, ""));
const PREFIXES = ["וה", "וב", "ול", "ומ", "וכ", "וש", "ה", "ו", "ב", "כ", "ל", "מ", "ש"];
export const stems = (w) => {
  const out = new Set([w]);
  for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 3) out.add(w.slice(p.length));
  // רבים וסיומות נפוצות
  for (const t of [...out]) for (const suf of ["ים", "ות", "ה", "ת"]) if (t.endsWith(suf) && t.length - suf.length >= 3) out.add(t.slice(0, -suf.length));
  return [...out];
};

const GROUPS = [
  ["משחק", "משחקים", "תחרות", "מירוץ", "אתגר"], ["מדורה", "אש", "מדורת", "להבה"], ["שיר", "שירה", "זמר", "שירים"],
  ["טיול", "מסע", "הליכה", "שביל", "טבע"], ["חברות", "ידידות", "חבר", "חברים", "חברי"], ["אחריות", "אחראי", "מחויבות"],
  ["צוות", "שיתוף", "קבוצה", "יחד", "ביחד"], ["דיון", "שיחה", "שאלה", "מעגל"], ["היכרות", "הכרות", "היכרויות", "קרח"],
  ["יצירה", "אומנות", "ציור", "יצירתי"], ["חושך", "לילה", "לילי", "כוכבים"], ["מים", "גשם", "בריכה", "ים"],
  ["הקשבה", "שמיעה", "מקשיבים", "הקשבת"], ["מנהיגות", "הנהגה", "מנהיג", "מנהיגים"], ["כבוד", "סובלנות", "קבלה", "אחר"],
  ["התמדה", "מאמץ", "התמודדות", "חוסן", "עמידות"], ["ציונות", "מולדת", "ישראל", "ארץ"], ["זיכרון", "שואה", "זכרון", "הנצחה"],
  ["אלימות", "בריונות", "פגיעה", "בריון"], ["בטיחות", "זהירות", "סיכון", "סכנה"], ["סיפור", "סיפורים", "מעשייה", "משל"],
  ["אמון", "אמונה", "נאמנות", "ביטחון"], ["שבת", "שבתות", "מנוחה"], ["חג", "חגים", "מועד", "מועדים"],
];
const SYN = new Map();
for (const g of GROUPS) for (const w of g) SYN.set(skeleton(norm(w)), g.map((x) => norm(x)));

export function lev(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** מרחיב מילת חיפוש לרשימת חלופות עם משקל (1 = מדויק). */
export function expandToken(t) {
  const alts = new Map([[t, 1]]);
  for (const s of stems(t)) if (!alts.has(s)) alts.set(s, 0.9);
  for (const a of [...alts.keys()]) {
    const k = skeleton(a);
    if (!alts.has(k)) alts.set(k, 0.85);
    for (const syn of SYN.get(k) || []) if (!alts.has(syn)) alts.set(syn, 0.6);
  }
  return alts;
}

const flat = (a) => norm([a.title, a.leadingValue, a.author, (a.tags || []).join(" ")].join(" "));
const textOf = (a) => norm([a.equipment, a.safetyNotes, a.conclusionNote, ...(a.stages || []).map((s) => [s.title, s.description, s.text, ...(Array.isArray(s.steps) ? s.steps : [])].filter(Boolean).join(" "))].join(" "));

function prepare(activities) {
  return activities.map((a) => {
    const title = norm(a.title), value = norm(a.leadingValue), tags = norm((a.tags || []).join(" ")), rest = textOf(a);
    const sk = (s) => s.split(" ").map(skeleton).join(" ");
    return { a, title, value, tags, rest, skTitle: sk(title), skValue: sk(value), skTags: sk(tags), skRest: sk(rest) };
  });
}
const has = (hay, skHay, needle) => hay.includes(needle) || skHay.includes(skeleton(needle));

function scoreOne(p, tokens) {
  let total = 0, matched = 0;
  const why = [];
  for (const alts of tokens) {
    let best = 0, via = "";
    for (const [alt, w] of alts) {
      if (alt.length < 2) continue;
      const fields = [[p.title, p.skTitle, 6], [p.value, p.skValue, 4], [p.tags, p.skTags, 4], [p.rest, p.skRest, 1.5]];
      for (const [h, sk, fw] of fields) if (has(h, sk, alt) && fw * w > best) { best = fw * w; via = w < 0.7 ? alt : ""; }
    }
    if (best > 0) { matched++; total += best; if (via) why.push(via); }
  }
  return { total, matched, why };
}

let vocabCache = { at: 0, words: new Map() };
function vocabulary(prepared) {
  if (Date.now() - vocabCache.at < 60_000 && vocabCache.n === prepared.length) return vocabCache.words;
  const m = new Map();
  for (const p of prepared) for (const w of `${p.title} ${p.value} ${p.tags}`.split(" ")) if (w.length >= 3) m.set(w, (m.get(w) || 0) + 1);
  vocabCache = { at: Date.now(), words: m, n: prepared.length };
  return m;
}

/** חיפוש חכם. מחזיר תוצאות מדורגות, המונחים שהורחבו, והצעת תיקון. */
export function smartSearch(activities, q, limit = 30) {
  const nq = norm(q);
  const words = nq.split(" ").filter(Boolean).slice(0, 8);
  if (!words.length) return { q: nq, results: [], expanded: [], didYouMean: null };
  const prepared = prepare(activities);
  const run = (ws) => {
    const tokens = ws.map(expandToken);
    const need = Math.max(1, Math.ceil(ws.length * 0.6));
    const res = [];
    for (const p of prepared) {
      const s = scoreOne(p, tokens);
      if (s.matched >= need) res.push({ id: p.a.id, title: p.a.title, value: p.a.leadingValue, ageGroup: p.a.ageGroup, minutes: p.a.durationMin, score: Math.round((s.total + s.matched * 2) * 10) / 10, via: [...new Set(s.why)].slice(0, 3) });
    }
    return res.sort((a, b) => b.score - a.score || b.id - a.id).slice(0, limit);
  };
  let results = run(words);
  const expanded = [...new Set(words.flatMap((w) => [...expandToken(w).entries()].filter(([a, wt]) => wt <= 0.6 && a !== w).map(([a]) => a)))].slice(0, 10);
  let didYouMean = null;
  if (results.length < 3) {
    const vocab = vocabulary(prepared);
    const fixed = words.map((w) => {
      if (vocab.has(w) || prepared.some((p) => has(p.title + " " + p.value + " " + p.tags, p.skTitle + " " + p.skValue + " " + p.skTags, w))) return w;
      let best = null, bd = 99;
      const max = w.length > 5 ? 2 : 1;
      for (const [v, c] of vocab) {
        const d = lev(w, v, max);
        if (d <= max && (d < bd || (d === bd && c > (vocab.get(best) || 0)))) { best = v; bd = d; }
      }
      return best || w;
    });
    const fixedQ = fixed.join(" ");
    if (fixedQ !== nq) {
      const again = run(fixed);
      if (again.length) { didYouMean = fixedQ; if (!results.length) results = again; }
    }
  }
  return { q: nq, results, expanded, didYouMean };
}
export { flat as _flat };
