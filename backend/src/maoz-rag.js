// שלב 68: חיפוש RAG דינמי של מעוז. אינדקס FTS5 של SQLite (בזיכרון, נבנה מחדש מעצמו כשהמאגר משתנה) על כל מה שהאתר יודע:
// כל הפעולות המפורסמות (כולל שלבים בודדים מתוכן, כדי למצוא "רגע של 5 דקות" גם בתוך פעולה של 45), מתודות (כולל מתודות השבט),
// שוברי קרח, חימומים, סיפורים, אתגרי חינוך וידע האתר. לא נוגע בבסיס הנתונים הקבוע: אין טבלאות חדשות, אין גיבוי נוסף ואין מה לשחזר.
// התוצאות מדורגות לפי bm25 (מילים נדירות מנצחות), עם כותרת ושורשי מילים (קידומות, רבים) ונרדפות מחיפוש המאגר.
import { DatabaseSync } from "node:sqlite";
import { expandToken, norm, skeleton, stems } from "./smart-search.js";
import { rowToActivity } from "./activities.js";
import { METHODS } from "./shared/constants.js";
import { CHALLENGES, STORIES, WARMUPS } from "./content.js";
import { ICEBREAKERS } from "./tools.js";
import { CHALLENGE_KEYS, fold } from "./maoz-intent.js";

const STOP = new Set(
  "איך מה מי איפה אפשר לי לך לכם לנו אותי אותך את של על עם זה זאת האם למה מתי כמה אני אתה תוכל בבקשה צריך צריכה רוצה יש אין הוא היא או גם אם כל מן אל לא כן פה שם איזה אילו לגבי בנושא שלי שלך לעשות אותו אותה הזה הזאת אחד אחת ממש בעצם פשוט תן תני אולי חושב תציע תמליץ תמצא מצא חפש רעיון רעיונות משהו עכשיו כרגע הרגע פעולה פעולות פעילות".split(" ").map(fold),
);

const KINDS = ["activity", "stage", "icebreaker", "warmup", "story", "method", "challenge", "site"];
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** צורות חיפוש של מילה: המילה, שורשיה וחלופות מהנרדפות. אחידות אותיות סופיות. */
export function altsOf(word) {
  const out = new Map();
  for (const [a, w] of expandToken(norm(word))) {
    const f = fold(a);
    if (f.length >= 2 && !out.has(f)) out.set(f, w);
  }
  return out;
}

/** המילים המשמעותיות בשאלה (בלי מילות קישור) */
export const questionTokens = (q) => fold(q).split(" ").filter((t) => t.length >= 2 && !STOP.has(t));

/** ביטוי MATCH בטוח ל-FTS5 מרשימת מילים: כל מילה עם חלופותיה וקידומת, וכולן ב-OR (bm25 מעדיף מסמכים שמכסים יותר מילים) */
export function ftsQuery(tokens) {
  const parts = [];
  for (const t of tokens) {
    const alts = [...altsOf(t)].filter(([a]) => /^[\p{L}\p{N}]+$/u.test(a) && (a.length >= 3 || a === t));
    if (!alts.length) continue;
    parts.push(alts.map(([a]) => (a.length >= 3 ? `"${a}" OR "${a}"*` : `"${a}"`)).join(" OR "));
  }
  return parts.join(" OR ");
}

const termsOf = (text) => {
  const set = new Set();
  for (const w of norm(text).split(" ")) {
    if (w.length < 2) continue;
    for (const s of stems(w)) {
      set.add(fold(s));
      set.add(fold(skeleton(s)));
    }
  }
  return [...set].join(" ");
};

const SCHEMA = `CREATE VIRTUAL TABLE docs USING fts5(
  kind UNINDEXED, ref UNINDEXED, href UNINDEXED, meta UNINDEXED, dur UNINDEXED, energetic UNINDEXED, noequip UNINDEXED, snippet UNINDEXED, label UNINDEXED,
  title, body, terms, tokenize = 'unicode61 remove_diacritics 2'
)`;
const W = "0,0,0,0,0,0,0,0,0,9,1.6,2.6"; // משקלי bm25: כותרת, גוף, שורשים

/** @param {import("node:sqlite").DatabaseSync} db מסד האתר (קריאה בלבד) @param {{extraDocs?: ()=>any[]}} [opt] */
export function createRag(db, { extraDocs = () => [] } = {}) {
  const idx = new DatabaseSync(":memory:");
  idx.exec(SCHEMA);
  const ins = idx.prepare("INSERT INTO docs (kind, ref, href, meta, dur, energetic, noequip, snippet, label, title, body, terms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  let sig = "";
  let counts = {};
  let vocabTexts = [];

  const signature = () => {
    const a = db.prepare("SELECT COUNT(*) AS c, COALESCE(MAX(updated_at), '') AS m FROM activities WHERE status = 'PUBLISHED'").get();
    let t = { c: 0 };
    try {
      t = db.prepare("SELECT COUNT(*) AS c FROM write_tribe_methods").get();
    } catch {
      /* בלי טבלת מתודות שבט (בדיקות ישנות): מדלגים */
    }
    return `${a.c}|${a.m}|${t.c}`;
  };

  function* allDocs() {
    for (const row of db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all()) {
      const a = rowToActivity(row);
      const meta = [a.ageGroup, a.durationMin ? `${a.durationMin} דקות` : "", a.leadingValue].filter(Boolean).join(" · ");
      const stagesText = (a.stages || []).map((s) => `${s.name || ""} ${clip(s.content, 500)}`).join(" ");
      const noEq = !String(a.equipment || "").replace(/(אין|ללא|בלי)( ציוד)?|^-+$/g, "").trim() ? 1 : 0;
      yield { kind: "activity", ref: String(a.id), href: `/library/${a.id}`, meta, dur: a.durationMin || null, energetic: a.energeticMode ? 1 : 0, noequip: noEq, snippet: clip(a.leadingValue ? `ערך: ${a.leadingValue}. ${(a.tags || []).join(", ")}` : (a.tags || []).join(", "), 120), title: a.title, body: `${a.leadingValue || ""} ${(a.tags || []).join(" ")} ${a.equipment || ""} ${stagesText}` };
      // שלבים קצרים כמסמכים נפרדים: "משהו ל-5 דקות" נמצא גם בתוך פעולה ארוכה
      const stages = a.stages || [];
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        const m = Number(s.minutes) || 0;
        const text = clip(s.content, 700);
        if (m >= 2 && m <= 15 && text.length >= 40) yield { kind: "stage", ref: `${a.id}:${i}`, href: `/library/${a.id}`, meta: `מתוך הפעולה "${clip(a.title, 40)}" · ${m} דקות`, dur: m, energetic: a.energeticMode ? 1 : 0, noequip: noEq, snippet: text, label: `${a.title} · ${s.name || "שלב"}`, title: s.name || "שלב", body: `${text} ${a.title}` };
      }
    }
    for (const m of METHODS) yield { kind: "method", ref: m.name, href: "/methods", meta: "מתודה", dur: null, energetic: null, noequip: null, snippet: clip(m.description, 160), title: m.name, body: `${m.description} ${m.whenToUse} ${m.example}` };
    try {
      for (const r of db.prepare("SELECT name, category, line, steps_json FROM write_tribe_methods").all()) {
        let steps = [];
        try {
          steps = JSON.parse(r.steps_json);
        } catch {
          /* שורה פגומה: ממשיכים */
        }
        yield { kind: "method", ref: `tribe:${r.name}`, href: "/methods", meta: "מתודת שבט", dur: null, energetic: null, noequip: null, snippet: clip(r.line, 160), title: r.name, body: `${r.category || ""} ${r.line || ""} ${[].concat(steps).join(" ")}` };
      }
    } catch {
      /* ראו signature */
    }
    for (const b of ICEBREAKERS) yield { kind: "icebreaker", ref: b.name, href: "/icebreakers", meta: `משחק היכרות · ${b.minutes} דקות${b.equipment ? ` · ${b.equipment}` : " · בלי ציוד"}`, dur: b.minutes, energetic: b.energetic ? 1 : 0, noequip: b.equipment ? 0 : 1, snippet: clip(b.how, 220), title: b.name, body: `${b.how} ${b.equipment} היכרות שובר קרח` };
    for (const w of WARMUPS) yield { kind: "warmup", ref: w.name, href: "/tools", meta: `${w.category} · ${w.minutes} דקות${w.equipment ? ` · ${w.equipment}` : " · בלי ציוד"}`, dur: w.minutes, energetic: w.energetic ? 1 : 0, noequip: w.equipment ? 0 : 1, snippet: clip(w.how, 220), title: w.name, body: `${w.how} ${w.category} ${w.equipment}` };
    for (const s of STORIES) yield { kind: "story", ref: s.id, href: "/tools", meta: `${s.type} · ${s.value}`, dur: 3, energetic: 0, noequip: 1, snippet: clip(s.text, 200), title: s.title, body: `${s.text} ${s.question || ""} ${s.value}` };
    for (const c of CHALLENGES) yield { kind: "challenge", ref: c.id, href: "/challenges", meta: "אתגר חינוכי", dur: null, energetic: null, noequip: null, snippet: clip(c.guidance, 200), title: c.label, vocab: CHALLENGE_KEYS[c.id] || "", body: `${CHALLENGE_KEYS[c.id] || ""} ${c.desc} ${c.guidance} ${c.care || ""} ${c.topic || ""}` };
    for (const x of extraDocs()) yield x;
  }

  function refresh(force = false) {
    const s = signature();
    if (!force && s === sig) return false;
    const c = {};
    const texts = [];
    idx.exec("BEGIN");
    try {
      idx.exec("DELETE FROM docs");
      for (const d of allDocs()) {
        ins.run(d.kind, d.ref, d.href, d.meta || "", d.dur ?? null, d.energetic ?? null, d.noequip ?? null, d.snippet || "", clip(d.label || d.title, 90), fold(norm(d.title)), fold(norm(d.body)), termsOf(`${d.title} ${d.body}`));
        c[d.kind] = (c[d.kind] || 0) + 1;
        texts.push(d.title, d.vocab || "");
      }
      idx.exec("COMMIT");
    } catch (e) {
      idx.exec("ROLLBACK");
      throw e;
    }
    sig = s;
    counts = c;
    vocabTexts = texts;
    return true;
  }

  /**
   * @param {string|string[]} query שאלה חופשית (או רשימת מילים מוכנה)
   * @param {{kinds?: string[], maxMin?: number, noEquip?: boolean, energetic?: boolean|null, limit?: number}} [o]
   * @returns {{hits: {kind:string, ref:string, href:string, title:string, meta:string, snippet:string, dur:number|null, score:number, coverage:number}[], tokens:string[]}}
   */
  function search(query, { kinds = KINDS, maxMin, noEquip, energetic, limit = 6 } = {}) {
    refresh();
    const tokens = Array.isArray(query) ? query.map(fold) : questionTokens(query);
    const match = ftsQuery(tokens);
    if (!match) return { hits: [], tokens };
    const where = [`docs MATCH ?`, `kind IN (${kinds.map(() => "?").join(",")})`];
    const args = [match, ...kinds];
    if (maxMin) {
      where.push("(dur IS NULL OR dur <= ?)");
      args.push(maxMin);
    }
    if (noEquip) where.push("(noequip IS NULL OR noequip = 1)");
    if (energetic === true) where.push("(energetic IS NULL OR energetic = 1)");
    if (energetic === false) where.push("(energetic IS NULL OR energetic = 0)");
    let rows = [];
    try {
      rows = idx.prepare(`SELECT kind, ref, href, meta, dur, snippet, label, title, body, terms, bm25(docs, ${W}) AS rank FROM docs WHERE ${where.join(" AND ")} ORDER BY rank LIMIT ?`).all(...args, limit * 3);
    } catch {
      return { hits: [], tokens }; // ביטוי MATCH לא תקין (לא אמור לקרות אחרי ftsQuery): מתייחסים כאל "לא נמצא"
    }
    const altList = tokens.map((t) => [...altsOf(t)].filter(([a]) => a.length >= 3 || a === t).map(([a]) => a));
    let hits = rows
      .map((r) => {
        const hay = `${r.title} ${r.body} ${r.terms}`;
        const cov = altList.filter((alts) => alts.some((a) => hay.includes(a))).length;
        return { kind: r.kind, ref: r.ref, href: r.href, title: r.label, meta: r.meta, snippet: r.snippet, dur: r.dur, score: -r.rank * (r.kind === "activity" ? 1.6 : 1), coverage: tokens.length ? cov / tokens.length : 0 };
      })
      .sort((a, b) => b.coverage - a.coverage || b.score - a.score);
    // פעולה שלמה עדיפה על שלבים שלה: אם הפעולה עצמה נמצאה, השלבים שלה לא חוזרים כתוצאות נפרדות
    const wholes = new Set(hits.filter((h) => h.kind === "activity").map((h) => h.href));
    hits = hits.filter((h) => h.kind !== "stage" || !wholes.has(h.href)).slice(0, limit);
    return { hits, tokens };
  }

  return {
    search,
    refresh,
    /** כמה מסמכים באינדקס, לפי סוג */
    stats: () => (refresh(), { ...counts, total: Object.values(counts).reduce((s, n) => s + n, 0) }),
    /** טקסטים לבניית אוצר המילים של תיקון שגיאות הקלדה (כותרות + ידע האתר) */
    vocabTexts: () => (refresh(), vocabTexts),
    close: () => idx.close(),
  };
}
