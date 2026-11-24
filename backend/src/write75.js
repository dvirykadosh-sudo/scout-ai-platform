// שלב 75 (שרת): עוזר הכתיבה והעורך.
//  • הודעות ברורות על מגבלות (60 שלבים, 20,000 תווים לשלב) במקום "הנתונים שנשלחו אינם תקינים".
//  • המרה בטוחה לוואטסאפ: הדגשה, נטייה, כותרות, רשימות וטבלאות, בלי סימנים שמשבשים את ההודעה, ופיצול להודעות לפי שלבים.
//  • תבניות מהרצות מוצלחות של המדריך עצמו (מסמכים שדורגו גבוה, ופעולות שהשתתפות בהן הייתה גבוהה).
//  • נעילת שלב קצרה בעריכה משותפת (נוכחות חיה, ב-lux-presence.js) והנתיב שמבקש אותה.
// הלוגיקה של המגבלות זהה למקבילה בצד הלקוח (frontend/src/lib/write75.ts); בדיקת השרת מריצה את שתיהן על אותם תרחישים.
import crypto from "node:crypto";
import { z } from "zod";
import { nowIso } from "./db.js";
import { getActivity } from "./activities.js";

export const LIMITS = { blocks: 60, blockText: 20000, blockTitle: 120, blockNote: 5000, docTitle: 120, docChars: 400000 };
const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const str = (v) => (typeof v === "string" ? v : "");

/** מקבל גוף בקשה גולמי (גם משובש) ומחזיר רשימת חריגות מהמגבלות, בנוסח שמסביר מה לעשות. */
export function limitProblemsOf(body) {
  const out = [];
  const blocks = Array.isArray(body?.blocks) ? body.blocks : [];
  const title = str(body?.title);
  if (blocks.length > LIMITS.blocks) out.push({ code: "BLOCKS", block: null, length: blocks.length, max: LIMITS.blocks, message: `יש ${blocks.length} שלבים, ואפשר עד ${LIMITS.blocks}. מזגו שלבים קצרים או העבירו חלק מהם למסמך נפרד.` });
  if (title.length > LIMITS.docTitle) out.push({ code: "DOC_TITLE", block: null, length: title.length, max: LIMITS.docTitle, message: `שם המסמך ארוך מדי: ${num(title.length)} תווים, ואפשר עד ${LIMITS.docTitle}.` });
  let chars = 0;
  blocks.forEach((raw, i) => {
    const b = raw && typeof raw === "object" ? raw : {};
    const text = str(b.text);
    const t = str(b.title);
    const note = str(b.note);
    chars += text.length + t.length + note.length;
    if (text.length > LIMITS.blockText) out.push({ code: "BLOCK_TEXT", block: i + 1, length: text.length, max: LIMITS.blockText, message: `שלב ${i + 1} ארוך מדי: ${num(text.length)} תווים, ואפשר עד ${num(LIMITS.blockText)}. כדאי לפצל אותו לשני שלבים (הכפתור "פיצול במיקום הסמן").` });
    if (t.length > LIMITS.blockTitle) out.push({ code: "BLOCK_TITLE", block: i + 1, length: t.length, max: LIMITS.blockTitle, message: `כותרת שלב ${i + 1} ארוכה מדי: ${num(t.length)} תווים, ואפשר עד ${LIMITS.blockTitle}.` });
    if (note.length > LIMITS.blockNote) out.push({ code: "BLOCK_NOTE", block: i + 1, length: note.length, max: LIMITS.blockNote, message: `ההערה האישית בשלב ${i + 1} ארוכה מדי: ${num(note.length)} תווים, ואפשר עד ${num(LIMITS.blockNote)}.` });
  });
  if (chars > LIMITS.docChars) out.push({ code: "DOC_SIZE", block: null, length: chars, max: LIMITS.docChars, message: `המסמך גדול מדי: כ-${num(chars / 1000)} אלף תווים, ואפשר עד ${num(LIMITS.docChars / 1000)} אלף. פצלו אותו לשני מסמכים או קצרו הערות.` });
  return out;
}

/* ───────────────────────── וואטסאפ ───────────────────────── */

const B = "\u0001"; // סימן זמני להדגשה, כדי שהמרת הנטייה לא תיגע בו
const RLM = "‏";
const clean = (s) => String(s ?? "").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter((c, i, a) => c || a.length > 1);

/** טקסט של שלב (Markdown של העורך) לטקסט שנראה נכון בוואטסאפ. */
export function waText(raw) {
  let t = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim());
  const lines = t.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // טבלה: כותרת מודגשת, ושורות כרשימה "תא — תא"
    if (/^\s*\|/.test(l)) {
      const header = i + 1 < lines.length && isSep(lines[i + 1]);
      if (isSep(l)) continue;
      const c = cells(l);
      if (!c.length) continue;
      out.push(header ? `${B}${c.join(" — ")}${B}` : `• ${c.join(" — ")}`);
      if (header) i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) continue; // קו מפריד
    let x = l;
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(x);
    if (h) x = `${B}${h[1].trim()}${B}`;
    else {
      const li = /^\s*[-*•]\s+(.*)$/.exec(x);
      if (li) x = `• ${li[1]}`;
      else {
        const nu = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(x);
        if (nu) x = `${nu[1]}. ${nu[2]}`;
        else if (/^\s*>/.test(x)) x = `> ${x.replace(/^\s*>\s?/, "")}`;
      }
    }
    out.push(x);
  }
  t = out.join("\n");
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
  t = t.replace(/\*\*([^*\n]+?)\*\*/g, (_, x) => (x.trim() ? `${B}${x.trim()}${B}` : "")).replace(/\*{2,}/g, "");
  t = t.replace(/(?<![\w*])\*([^*\s][^*\n]*?)\*(?![\w*])/g, (_, x) => (x.trim() ? `_${x.trim()}_` : ""));
  t = t.replace(/__([^_\n]+?)__/g, (_, x) => (x.trim() ? `_${x.trim()}_` : ""));
  t = t.replace(/~~([^~\n]+?)~~/g, (_, x) => (x.trim() ? `~${x.trim()}~` : ""));
  t = t.replace(/`([^`\n]+)`/g, "$1");
  t = t.split(B).join("*");
  // סימנים בלי זוג מפעילים עיצוב במקומות לא צפויים: מסירים את העודף בכל שורה
  t = t
    .split("\n")
    .map((line) => {
      let s = line.replace(/\s+$/, "");
      for (const ch of ["*", "_", "~"]) {
        const n = s.split(ch).length - 1;
        if (n % 2 === 1) {
          const at = s.lastIndexOf(ch);
          s = s.slice(0, at) + s.slice(at + 1);
        }
      }
      // שורה שמתחילה באות לטינית נקראת משמאל לימין; ספרות הן "חלשות" והכיוון נקבע לפי העברית שאחריהן
      return /^[A-Za-z]/.test(s) ? RLM + s : s;
    })
    .join("\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const splitHard = (s, max) => {
  const out = [];
  let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.4) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
};

/**
 * טקסט מוכן להדבקה בוואטסאפ, ופיצול להודעות לפי שלבים כשהמסמך ארוך מ-max תווים.
 * הערות אישיות לא נכנסות לעולם. marks=true מוסיף "(טרם נבדק)" לכותרת של שלב שסומן.
 */
export function toWhatsApp(doc, { max = 4000, marks = false } = {}) {
  const limit = Math.max(1000, Math.min(20000, Math.round(max)));
  const meta = doc.meta ?? {};
  const head = [`*${clean(doc.title) || "פעולה"}*`];
  const bits = [meta.ageGroup, meta.minutes ? `${meta.minutes} דקות` : "", meta.groupSize ? `${meta.groupSize} חניכים` : "", meta.value ? `ערך: ${clean(meta.value)}` : ""].filter(Boolean);
  if (bits.length) head.push(bits.join(" | "));
  const items = (doc.blocks ?? []).map((b) => {
    const label = clean(b.title) || { open: "פתיחה", body: "גוף", peak: "שיא", close: "סיכום", free: "שלב" }[b.kind] || "שלב";
    const h = `*${label}${b.minutes ? ` (${b.minutes} דק')` : ""}*${marks && b.unchecked ? " (טרם נבדק)" : ""}`;
    const body = waText(b.text);
    return body ? `${h}\n${body}` : h;
  });
  const full = [head.join("\n"), ...items].join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  const parts = [];
  let cur = head.join("\n");
  for (const it of items) {
    const pieces = it.length > limit ? splitHard(it, limit - 80) : [it];
    for (const p of pieces) {
      if (cur && cur.length + 2 + p.length > limit) {
        parts.push(cur);
        cur = "";
      }
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) parts.push(cur);
  const n = parts.length;
  const labelled = n > 1 ? parts.map((p, i) => (i === 0 ? `${p}\n\n_(חלק 1 מתוך ${n})_` : `*${clean(doc.title) || "פעולה"}* _(חלק ${i + 1} מתוך ${n})_\n\n${p}`)) : parts;
  return { text: full, parts: labelled, chars: full.length };
}

/* ───────────────────────── תבניות מהרצות מוצלחות ───────────────────────── */

export function runStats(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const rated = list.filter((r) => Number(r?.rating) > 0);
  const avg = rated.length ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : 0;
  const last = list.map((r) => str(r?.date)).filter(Boolean).sort().pop() ?? "";
  return { runs: list.length, rated: rated.length, avg: Math.round(avg * 10) / 10, last };
}
/** מסמך נחשב מוצלח כשיש לפחות הרצה אחת מדורגת, והממוצע 4 ומעלה (מתוך 5) */
export const isSuccessful = (st) => st.rated >= 1 && st.avg >= 4;
export const successScore = (st) => st.avg * 10 + Math.min(st.runs, 10) * 2;

const firstSentence = (t) => String(t ?? "").replace(/[#>*|_`]/g, " ").replace(/\s+/g, " ").trim().split(/(?<=[.!?:])\s/)[0]?.slice(0, 180) ?? "";
const newId = () => crypto.randomBytes(5).toString("hex");
/** שלד של פעולה: אותם שלבים, סוגים וזמנים, בלי הטקסט. הטקסט המקורי הופך לרמז בשורה אחת. */
export function skeletonOf(blocks) {
  return (blocks ?? []).map((b) => ({ id: newId(), kind: b.kind, title: b.title ?? "", minutes: b.minutes ?? null, text: "", note: "", hint: firstSentence(b.text) || b.hint || undefined, done: false }));
}
const KIND_BY_STAGE = [
  [/^פתיחה/, "open"],
  [/^סיכום/, "close"],
  [/משחק|ציר זמן/, "body"],
];
const kindOfStage = (name) => KIND_BY_STAGE.find(([re]) => re.test(String(name)))?.[1] ?? "body";

export function registerWrite75Routes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 60);
  const live = () => app.locals.liveDocs;
  const MAX_DOCS = 100;
  const visible = (a, uid) => !!a && (a.status === "PUBLISHED" || a.ownerId === uid);

  /** תבניות שנבנו מהעבודה שלי: מסמכים שדורגו גבוה בהרצות, ופעולות מהמאגר שההשתתפות בהן הייתה גבוהה */
  app.get("/api/write/templates/mine", requireUser(), lim, (req, res) => {
    const docs = [];
    for (const d of db.prepare("SELECT id, title, meta_json, blocks_json FROM write_docs WHERE owner_id = ?").all(req.user.id)) {
      let meta;
      try {
        meta = JSON.parse(d.meta_json);
      } catch {
        continue;
      }
      const st = runStats(meta.runs);
      if (!isSuccessful(st)) continue;
      const last = [...(meta.runs ?? [])].reverse().find((r) => str(r.note).trim());
      docs.push({ id: d.id, title: d.title || "מסמך ללא שם", ageGroup: meta.ageGroup || "", minutes: meta.minutes ?? null, stages: JSON.parse(d.blocks_json).length, runs: st.runs, avgRating: st.avg, lastRun: st.last, lastNote: str(last?.note).slice(0, 160), score: successScore(st) });
    }
    docs.sort((a, b) => b.score - a.score || b.id - a.id);
    const activities = [];
    const rows = db.prepare("SELECT activity_id AS id, COUNT(*) AS n, MAX(ran_on) AS last FROM runs WHERE user_id = ? AND engagement = 3 GROUP BY activity_id ORDER BY n DESC, last DESC LIMIT 12").all(req.user.id);
    for (const r of rows) {
      const a = getActivity(db, r.id);
      if (!visible(a, req.user.id)) continue;
      activities.push({ id: a.id, title: a.title, ageGroup: a.ageGroup || "", minutes: a.durationMin ?? null, stages: (a.stages ?? []).length, runs: r.n, lastRun: r.last });
      if (activities.length >= 8) break;
    }
    res.json({ docs: docs.slice(0, 12), activities });
  });

  /** יוצר מסמך חדש מהרצה מוצלחת: משלד של מסמך שלי, או משלבים של פעולה שהרצתי */
  app.post("/api/write/docs/from-run", requireUser(), limiter(15 * 60_000, 30), (req, res) => {
    const v = z
      .object({ docId: z.number().int().positive().optional(), activityId: z.number().int().positive().optional(), skeleton: z.boolean().default(true), title: z.string().trim().max(120).default("") })
      .strict()
      .refine((x) => (x.docId === undefined) !== (x.activityId === undefined), { message: "יש לבחור מסמך או פעולה" })
      .safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", v.error.issues[0]?.message || "הבקשה אינה תקינה"));
    if (db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c >= MAX_DOCS) return res.status(409).json(fail("LIMIT", `אפשר לשמור עד ${MAX_DOCS} מסמכים. מחקו ישנים`));
    let title = "";
    let meta;
    let blocks;
    if (v.data.docId !== undefined) {
      const d = db.prepare("SELECT * FROM write_docs WHERE id = ? AND owner_id = ?").get(v.data.docId, req.user.id);
      if (!d) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
      const m = JSON.parse(d.meta_json);
      title = d.title;
      meta = { ...m, runs: [], date: "", leader: m.leader ?? "", template: false, archived: false, pinned: false };
      const src = JSON.parse(d.blocks_json);
      blocks = v.data.skeleton ? skeletonOf(src) : src.map((b) => ({ ...b, id: newId(), note: "", done: false, unchecked: undefined }));
    } else {
      const a = getActivity(db, v.data.activityId);
      if (!visible(a, req.user.id)) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
      title = a.title;
      meta = { ageGroup: a.ageGroup || "", minutes: a.durationMin ?? null, value: str(a.leadingValue).slice(0, 40) };
      blocks = (a.stages ?? []).slice(0, LIMITS.blocks).map((s) => ({
        id: newId(),
        kind: kindOfStage(s.name),
        title: str(s.name).slice(0, 120),
        minutes: Number.isInteger(s.minutes) ? Math.min(300, Math.max(0, s.minutes)) : null,
        text: v.data.skeleton ? "" : str(s.content).slice(0, LIMITS.blockText),
        note: "",
        hint: v.data.skeleton ? firstSentence(s.content) || undefined : undefined,
        done: false,
      }));
    }
    const at = nowIso();
    const r = db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,0,?,?)").run(req.user.id, (v.data.title || title || "פעולה חדשה").slice(0, 120), JSON.stringify(meta), JSON.stringify(blocks), at, at);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  /** נעילת שלב קצרה (20 שניות, מתחדשת בהקלדה) בעריכה משותפת. בלי block משחררים. */
  app.post("/api/write/docs/:id/live/lock", requireUser(), limiter(60_000, 240), (req, res) => {
    const id = Number(req.params.id);
    const d = db.prepare("SELECT id, owner_id FROM write_docs WHERE id = ?").get(id);
    const allowed = d && (d.owner_id === req.user.id || db.prepare("SELECT 1 FROM write_doc_editors WHERE doc_id = ? AND user_id = ?").get(id, req.user.id));
    if (!allowed) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
    const v = z.object({ cid: z.string().regex(/^[a-f0-9]{16}$/), block: z.string().max(24).nullable() }).strict().safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", "הבקשה אינה תקינה"));
    const r = live()?.lock(id, v.data.cid, req.user.id, v.data.block) ?? { ok: false, reason: "NOT_CONNECTED" };
    if (r.reason === "NOT_CONNECTED") return res.status(409).json(fail("NOT_CONNECTED", "אין חיבור פעיל למסמך"));
    res.json(r.ok ? { ok: true, until: r.until ?? null } : { ok: false, by: r.by });
  });
}
