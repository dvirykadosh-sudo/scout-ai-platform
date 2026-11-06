// עוד כלים לעורך הכתיבה (רעיונות 139–150): קטעים שמורים, קישור צפייה בלבד, גיבוי ושחזור,
// בדיקת קריאוּת והצעות לשם.
import crypto from "node:crypto";
import { z } from "zod";
import { audit, nowIso } from "./db.js";
import { requireAdmin } from "./auth.js";
import { KINDS, metaDefaults, trashDoc } from "./routes-write.js";
import { KIND_LABEL } from "./routes-write-export.js";
import { CATEGORIES, catOf, methodsIn } from "./write-suggest.js";
import { topicOf } from "./assist2.js";

const DAY = 86400_000;
const MAX_SNIPPETS = 60;
const sentences = (t) => String(t || "").replace(/[#>*|-]/g, " ").split(/(?<=[.!?:])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const wc = (t) => (String(t || "").match(/\S+/g) || []).length;

/** בדיקת קריאוּת לפי כללים: משפטים ארוכים, פסקאות גדולות, פתיחות חוזרות ושלבים צפופים. */
export function readability(doc) {
  const issues = [];
  const starts = new Map();
  for (const b of doc.blocks) {
    const label = b.title || KIND_LABEL[b.kind];
    for (const s of sentences(b.text)) {
      const n = wc(s);
      if (n > 28) issues.push({ blockId: b.id, kind: "long-sentence", label: `בשלב "${label}" יש משפט של ${n} מילים. כדאי לפצל`, sample: s.slice(0, 80) });
      const first = s.split(/\s+/)[0];
      if (first && first.length > 2) starts.set(first, (starts.get(first) || 0) + 1);
    }
    for (const para of String(b.text || "").split(/\n\s*\n/)) {
      if (wc(para) > 120) issues.push({ blockId: b.id, kind: "long-paragraph", label: `בשלב "${label}" יש פסקה של ${wc(para)} מילים. קשה לקרוא אותה תוך כדי הדרכה`, sample: para.slice(0, 80) });
    }
    if (b.minutes && wc(b.text) / b.minutes > 90) issues.push({ blockId: b.id, kind: "dense", label: `בשלב "${label}" יש הרבה טקסט ביחס ל-${b.minutes} דקות`, sample: "" });
  }
  for (const [w, n] of starts) if (n >= 4) issues.push({ blockId: null, kind: "repeat", label: `${n} משפטים מתחילים במילה "${w}". אפשר לגוון`, sample: w });
  issues.push(...typoIssues(doc));
  return { issues: issues.slice(0, 40), ok: issues.length === 0 };
}

/** הצעות לשם לפעולה מתוך הערך, המתודות והנושא שזוהו. */
export function titleIdeas(doc) {
  const meta = metaDefaults(doc.meta ?? {});
  const all = doc.blocks.map((b) => `${b.title}\n${b.text}`).join("\n");
  const topic = doc.title ? topicOf(doc.title) : "";
  const method = methodsIn(all)[0]?.name;
  const out = [];
  if (meta.value) out.push(`${meta.value}: ממה זה עשוי?`, `מה אני עושה כשצריך ${meta.value}`, `יום אחד של ${meta.value}`);
  if (topic) out.push(`כולנו ב${topic}`, `${topic}: מבט אחר`);
  if (method === "משחק תחרות") out.push("המירוץ הגדול");
  if (method === "השראה") out.push("סיפור שמשאיר סימן");
  if (method === "משחק הדמייה") out.push("מה הייתם עושים במקומי?");
  if (!out.length) out.push("פעולה חדשה", "רגע לפני שמתחילים");
  return [...new Set(out)].slice(0, 5);
}

export function registerWriteMoreRoutes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 60);
  const mine = (id, uid) => db.prepare("SELECT * FROM write_docs WHERE id = ? AND owner_id = ?").get(id, uid);
  const blockZ = z.object({ id: z.string().trim().min(1).max(24).default("x"), title: z.string().max(120).default(""), kind: z.enum(KINDS).default("free"), minutes: z.number().int().min(0).max(300).nullable().default(null), text: z.string().max(20000).default(""), note: z.string().max(5000).default("") });
  const docZ = z.object({ title: z.string().max(120).default(""), meta: z.any().default({}), blocks: z.array(blockZ).max(60) });

  // ── 139: קטעים שמורים ──
  app.get("/api/write/snippets", requireUser(), (req, res) => res.json(db.prepare("SELECT id, name, text FROM write_snippets WHERE owner_id = ? ORDER BY id DESC").all(req.user.id)));
  app.post("/api/write/snippets", requireUser(), lim, (req, res) => {
    const v = z.object({ name: z.string().trim().min(1, "יש לתת שם לקטע").max(60), text: z.string().trim().min(1, "הקטע ריק").max(5000) }).parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM write_snippets WHERE owner_id = ?").get(req.user.id).c >= MAX_SNIPPETS) return res.status(409).json(fail("LIMIT", `אפשר לשמור עד ${MAX_SNIPPETS} קטעים. מחקו ישנים`));
    const r = db.prepare("INSERT INTO write_snippets (owner_id, name, text, created_at) VALUES (?,?,?,?)").run(req.user.id, v.name, v.text, nowIso());
    res.status(201).json({ id: Number(r.lastInsertRowid), name: v.name, text: v.text });
  });
  app.delete("/api/write/snippets/:id", requireUser(), (req, res) => {
    const r = db.prepare("DELETE FROM write_snippets WHERE id = ? AND owner_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return res.status(404).json(fail("NOT_FOUND", "הקטע לא נמצא"));
    res.json({ ok: true });
  });

  // ── 140: קישור צפייה בלבד ──
  app.post("/api/write/docs/:id/share", requireUser(), lim, (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
    const days = z.object({ days: z.number().int().min(1).max(90).default(14) }).parse(req.body ?? {}).days;
    db.prepare("DELETE FROM write_shares WHERE doc_id = ?").run(d.id);
    const token = crypto.randomBytes(18).toString("base64url");
    const at = nowIso();
    db.prepare("INSERT INTO write_shares (token, doc_id, created_at, expires_at) VALUES (?,?,?,?)").run(token, d.id, at, new Date(Date.now() + days * DAY).toISOString());
    audit(db, req.user.username, "write.share", { id: d.id });
    res.status(201).json({ token, days });
  });
  app.get("/api/write/docs/:id/share", requireUser(), (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
    const s = db.prepare("SELECT token, expires_at FROM write_shares WHERE doc_id = ?").get(d.id);
    res.json(s && Date.parse(s.expires_at) > Date.now() ? { token: s.token, expiresAt: s.expires_at } : { token: null });
  });
  app.delete("/api/write/docs/:id/share", requireUser(), (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
    db.prepare("DELETE FROM write_shares WHERE doc_id = ?").run(d.id);
    res.json({ ok: true });
  });
  // ציבורי: בלי התחברות, בלי הערות אישיות
  app.get("/api/write/shared/:token", limiter(60_000, 60), (req, res) => {
    const s = db.prepare("SELECT s.expires_at, d.title, d.meta_json, d.blocks_json, d.updated_at FROM write_shares s JOIN write_docs d ON d.id = s.doc_id WHERE s.token = ?").get(String(req.params.token).slice(0, 40));
    if (!s || Date.parse(s.expires_at) < Date.now()) return res.status(404).json(fail("NOT_FOUND", "הקישור לא קיים או שפג תוקפו"));
    const m = metaDefaults(JSON.parse(s.meta_json));
    res.set("X-Robots-Tag", "noindex").json({ title: s.title, meta: { ageGroup: m.ageGroup, minutes: m.minutes, groupSize: m.groupSize, value: m.value, leader: m.leader, date: m.date }, blocks: JSON.parse(s.blocks_json).map((b) => ({ id: b.id, title: b.title, kind: b.kind, minutes: b.minutes, text: b.text })), updatedAt: s.updated_at, expiresAt: s.expires_at });
  });

  // ── 148: גיבוי ושחזור של כל המסמכים ──
  app.get("/api/write/backup", requireUser(), (req, res) => {
    const rows = db.prepare("SELECT title, meta_json, blocks_json, updated_at FROM write_docs WHERE owner_id = ? ORDER BY id").all(req.user.id);
    const snippets = db.prepare("SELECT name, text FROM write_snippets WHERE owner_id = ?").all(req.user.id);
    res.set({ "Content-Disposition": "attachment; filename=\"write-backup.json\"", "X-Content-Type-Options": "nosniff" }).json({ kind: "scout-write-backup", version: 1, exportedAt: nowIso(), docs: rows.map((r) => ({ title: r.title, meta: JSON.parse(r.meta_json), blocks: JSON.parse(r.blocks_json), updatedAt: r.updated_at })), snippets });
  });
  app.post("/api/write/restore", requireUser(), limiter(15 * 60_000, 10), (req, res) => {
    const v = z.object({ kind: z.literal("scout-write-backup"), docs: z.array(docZ).max(100), snippets: z.array(z.object({ name: z.string().trim().min(1).max(60), text: z.string().trim().min(1).max(5000) })).max(MAX_SNIPPETS).default([]) }).safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_BACKUP", "זה לא קובץ גיבוי תקין של העורך"));
    const have = db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c;
    const room = Math.max(0, 100 - have);
    const at = nowIso();
    let docs = 0;
    for (const d of v.data.docs.slice(0, room)) {
      const ids = new Set(d.blocks.map((b) => b.id));
      if (ids.size !== d.blocks.length) continue;
      const words = (d.title + " " + d.blocks.map((b) => b.title + " " + b.text).join(" ")).match(/\S+/g)?.length ?? 0;
      db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)").run(req.user.id, `${d.title.slice(0, 100)}${d.title ? "" : "מסמך"} (משוחזר)`.slice(0, 120), JSON.stringify(metaDefaults(d.meta ?? {})), JSON.stringify(d.blocks), words, at, at);
      docs++;
    }
    let snippets = 0;
    const have2 = db.prepare("SELECT COUNT(*) AS c FROM write_snippets WHERE owner_id = ?").get(req.user.id).c;
    for (const s of v.data.snippets.slice(0, Math.max(0, MAX_SNIPPETS - have2))) {
      db.prepare("INSERT INTO write_snippets (owner_id, name, text, created_at) VALUES (?,?,?,?)").run(req.user.id, s.name, s.text, at);
      snippets++;
    }
    audit(db, req.user.username, "write.restore", { docs, snippets });
    res.json({ docs, snippets, skipped: v.data.docs.length - docs });
  });

  // ── 143, 150 ──
  app.post("/api/write/readability", requireUser(), lim, (req, res) => res.json(readability(docZ.parse(req.body ?? {}))));
  app.post("/api/write/title-ideas", requireUser(), lim, (req, res) => res.json({ titles: titleIdeas(docZ.parse(req.body ?? {})) }));
}

const VALUES = ["אחריות", "אומץ", "חברות", "יושרה", "כבוד", "נתינה", "התנדבות", "ערבות הדדית", "הגינות", "אהבת הארץ", "עבודת צוות", "סבלנות", "הקשבה", "התמדה"];
const CAT_LABEL = { game: "עשייה ומשחק", talk: "שיחה", take: "קבלה והתבוננות" };

// שאלות לדיון לפי ערך ושכבה (רעיון 156). חלק כלליות, חלק לפי הערך.
const Q_GENERIC = ["מתי הרגשתם לאחרונה ש{v} היה חשוב?", "מה קשה בלהיות {v} בחבורה שלנו?", "איך נדע שמישהו מתנהג לפי {v}?"];
const Q_OLD = ["מה המחיר של {v}, ומי משלם אותו?", "מתי {v} מתנגש בערך אחר, ומה בוחרים?"];
const Q_YOUNG = ["מי היה פעם {v} כלפיכם? ספרו בקצרה.", "מה אפשר לעשות השבוע כדי להיות {v}?"];
export function questionsFor(value, ageGroup) {
  const v = value || "הערך";
  const grade = /כיתה\s+([א-י]+)['׳]/.exec(ageGroup || "")?.[1] || "";
  const old = ["ח", "ט", "י", "יא", "יב"].includes(grade);
  const young = ["ג", "ד", "ה"].includes(grade);
  return [...Q_GENERIC, ...(old ? Q_OLD : []), ...(young ? Q_YOUNG : [])].map((q) => q.replaceAll("{v}", v));
}

// typos (167)
export function typoIssues(doc) {
  const out = [];
  for (const b of doc.blocks) {
    const label = b.title || KIND_LABEL[b.kind];
    const text = String(b.text || "");
    const dbl = text.match(/(?:^|\s)([\u05D0-\u05EA]{2,})\s+\1(?=\s|[.,!?:;]|$)/);
    if (dbl) out.push({ blockId: b.id, kind: "double-word", label: `בשלב "${label}" המילה "${dbl[1]}" חוזרת פעמיים ברצף`, sample: dbl[0].trim() });
    if (/[^\S\n]{2,}/.test(text.replace(/^[^\S\n]+/gm, ""))) out.push({ blockId: b.id, kind: "double-space", label: `בשלב "${label}" יש רווחים כפולים`, sample: "" });
    if (/\s+[,.!?:;](?=\s|$)/.test(text)) out.push({ blockId: b.id, kind: "space-before-punct", label: `בשלב "${label}" יש רווח לפני סימן פיסוק`, sample: "" });
  }
  return out;
}
/** ניקוי אוטומטי: רווחים כפולים ורווח לפני פיסוק. לא נוגע במילים. */
export const cleanText = (t) => String(t || "").replace(/([^\n\s])[^\S\n]{2,}(?=\S)/g, "$1 ").replace(/[^\S\n]+([,.!?:;])(?=\s|$)/g, "$1");

export function registerWriteStatsRoutes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 60);

  // ── 151–152: סטטיסטיקה אישית ──
  app.get("/api/write/stats", requireUser(), lim, (req, res) => {
    const rows = db.prepare("SELECT title, meta_json, blocks_json, words, updated_at FROM write_docs WHERE owner_id = ?").all(req.user.id);
    const methods = {};
    const cats = { game: 0, talk: 0, take: 0 };
    const values = {};
    let words = 0;
    let minutes = 0;
    let runs = 0;
    const last = {};
    for (const r of rows) {
      const meta = metaDefaults(JSON.parse(r.meta_json));
      const blocks = JSON.parse(r.blocks_json);
      words += r.words;
      runs += meta.runs.length;
      minutes += blocks.reduce((s, b) => s + (b.minutes || 0), 0);
      if (meta.value) {
        values[meta.value] = (values[meta.value] || 0) + 1;
        if (!last[meta.value] || r.updated_at > last[meta.value]) last[meta.value] = r.updated_at;
      }
      const seen = new Set();
      for (const b of blocks) for (const m of methodsIn(`${b.title}\n${b.text}`).slice(0, 2)) seen.add(m.name);
      for (const m of seen) {
        methods[m] = (methods[m] || 0) + 1;
        const c = catOf(m);
        if (c) cats[c]++;
      }
    }
    const all = Object.values(CATEGORIES).flat();
    const total = Object.values(cats).reduce((s, x) => s + x, 0);
    const usedMethods = Object.entries(methods).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
    const untouched = VALUES.filter((v) => !values[v]);
    res.json({
      docs: rows.length,
      words,
      minutes,
      runs,
      methods: usedMethods,
      unusedMethods: all.filter((m) => !methods[m]),
      categories: Object.entries(cats).map(([id, n]) => ({ id, label: CAT_LABEL[id], n, pct: total ? Math.round((n / total) * 100) : 0 })),
      values: Object.entries(values).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
      nextValues: untouched.slice(0, 5),
      tip: !rows.length ? "עוד אין מסמכים. התחילו פעולה ראשונה." : total && cats.game / total > 0.6 ? "רוב הפעולות שלכם מבוססות משחק. נסו להוסיף שיחה או התבוננות." : total && cats.talk / total > 0.6 ? "רוב הפעולות שלכם מבוססות שיחה. נסו להוסיף משחק או עשייה." : untouched.length ? `עוד לא כתבתם פעולה על ${untouched[0]}.` : "יש לכם מגוון יפה.",
    });
  });

  // ── 156: שאלות לדיון ──
  app.get("/api/write/questions", requireUser(), lim, (req, res) => {
    const q = z.object({ value: z.string().trim().max(40).default(""), age: z.string().trim().max(40).default("") }).parse(req.query ?? {});
    res.json({ questions: questionsFor(q.value, q.age) });
  });

  // ── 159: פעולות על כמה מסמכים ──
  app.post("/api/write/bulk", requireUser(), limiter(60_000, 20), (req, res) => {
    const v = z.object({ ids: z.array(z.number().int()).min(1).max(100), action: z.enum(["delete", "archive", "unarchive", "tag"]), tag: z.string().trim().min(1).max(20).optional() }).parse(req.body ?? {});
    if (v.action === "tag" && !v.tag) return res.status(400).json(fail("NO_TAG", "יש להזין תגית"));
    let n = 0;
    for (const id of new Set(v.ids)) {
      const d = db.prepare("SELECT * FROM write_docs WHERE id = ? AND owner_id = ?").get(id, req.user.id);
      if (!d) continue;
      if (v.action === "delete") {
        trashDoc(db, d);
        db.prepare("DELETE FROM write_docs WHERE id = ?").run(d.id);
      }
      else if (v.action === "tag") {
        const m = JSON.parse(d.meta_json);
        const tags = [...new Set([...(m.tags ?? []), v.tag])].slice(0, 8);
        db.prepare("UPDATE write_docs SET meta_json = ?, rev = rev + 1, updated_at = ? WHERE id = ?").run(JSON.stringify({ ...m, tags }), nowIso(), d.id);
      } else db.prepare("UPDATE write_docs SET meta_json = ?, rev = rev + 1, updated_at = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse(d.meta_json), archived: v.action === "archive" }), nowIso(), d.id);
      n++;
    }
    if (v.action === "delete") audit(db, req.user.username, "write.bulkdelete", { n });
    res.json({ changed: n });
  });
}

const DAY_MS = 86400_000;
const TRASH_DAYS = 30;

export function registerWriteCommunityRoutes(app, { db, limiter, fail, requireUser }) {
  const mine = (id, uid) => db.prepare("SELECT * FROM write_docs WHERE id = ? AND owner_id = ?").get(id, uid);
  const nf = (res) => res.status(404).json(fail("NOT_FOUND", "לא נמצא"));

  // ── 164: הערות של מי שקיבל קישור צפייה ──
  const shareDoc = (token) => db.prepare("SELECT s.doc_id, s.expires_at, d.blocks_json FROM write_shares s JOIN write_docs d ON d.id = s.doc_id WHERE s.token = ?").get(String(token).slice(0, 40));
  app.get("/api/write/shared/:token/comments", limiter(60_000, 60), (req, res) => {
    const s = shareDoc(req.params.token);
    if (!s || Date.parse(s.expires_at) < Date.now()) return nf(res);
    res.json(db.prepare("SELECT id, block_id AS blockId, author, text, created_at AS createdAt FROM write_comments WHERE doc_id = ? AND resolved = 0 ORDER BY id").all(s.doc_id));
  });
  app.post("/api/write/shared/:token/comments", limiter(10 * 60_000, 8), (req, res) => {
    const s = shareDoc(req.params.token);
    if (!s || Date.parse(s.expires_at) < Date.now()) return nf(res);
    const v = z.object({ author: z.string().trim().min(1, "יש להזין שם").max(40), text: z.string().trim().min(1, "ההערה ריקה").max(600), blockId: z.string().trim().max(24).optional() }).parse(req.body ?? {});
    if (v.blockId && !JSON.parse(s.blocks_json).some((b) => b.id === v.blockId)) return res.status(400).json(fail("BAD_BLOCK", "השלב לא נמצא"));
    if (db.prepare("SELECT COUNT(*) AS c FROM write_comments WHERE doc_id = ?").get(s.doc_id).c >= 100) return res.status(409).json(fail("LIMIT", "הגענו למספר ההערות המרבי במסמך"));
    const r = db.prepare("INSERT INTO write_comments (doc_id, block_id, author, text, created_at) VALUES (?,?,?,?,?)").run(s.doc_id, v.blockId ?? null, v.author, v.text, nowIso());
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  // הבעלים
  app.get("/api/write/docs/:id/comments", requireUser(), (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return nf(res);
    res.json(db.prepare("SELECT id, block_id AS blockId, author, text, resolved, created_at AS createdAt FROM write_comments WHERE doc_id = ? ORDER BY id").all(d.id));
  });
  app.patch("/api/write/docs/:id/comments/:cid", requireUser(), (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return nf(res);
    const v = z.object({ resolved: z.boolean() }).parse(req.body ?? {});
    const r = db.prepare("UPDATE write_comments SET resolved = ? WHERE id = ? AND doc_id = ?").run(v.resolved ? 1 : 0, Number(req.params.cid), d.id);
    if (!r.changes) return nf(res);
    res.json({ ok: true });
  });
  app.delete("/api/write/docs/:id/comments/:cid", requireUser(), (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return nf(res);
    const r = db.prepare("DELETE FROM write_comments WHERE id = ? AND doc_id = ?").run(Number(req.params.cid), d.id);
    if (!r.changes) return nf(res);
    res.json({ ok: true });
  });

  // ── 165: תבניות של השבט ──
  app.get("/api/write/tribe-templates", requireUser(), (req, res) => {
    res.json(db.prepare("SELECT id, title, blocks_json, created_by AS createdBy FROM write_tribe_templates ORDER BY id DESC").all().map((t) => ({ id: t.id, title: t.title, stages: JSON.parse(t.blocks_json).length, createdBy: t.createdBy })));
  });
  app.post("/api/admin/write-templates", requireAdmin(), (req, res) => {
    const v = z.object({ docId: z.number().int(), title: z.string().trim().max(120).default("") }).parse(req.body ?? {});
    const d = mine(v.docId, req.user.id);
    if (!d) return nf(res);
    if (db.prepare("SELECT COUNT(*) AS c FROM write_tribe_templates").get().c >= 30) return res.status(409).json(fail("LIMIT", "אפשר עד 30 תבניות שבט. מחקו ישנות"));
    const meta = { ...JSON.parse(d.meta_json), runs: [], date: "", leader: "", template: false, archived: false, pinned: false };
    const blocks = JSON.parse(d.blocks_json).map((b) => ({ ...b, note: "", done: false }));
    const r = db.prepare("INSERT INTO write_tribe_templates (title, meta_json, blocks_json, created_by, created_at) VALUES (?,?,?,?,?)").run(v.title || d.title || "תבנית", JSON.stringify(meta), JSON.stringify(blocks), req.user.username, nowIso());
    audit(db, req.user.username, "write.tribe-template", { id: Number(r.lastInsertRowid) });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.delete("/api/admin/write-templates/:id", requireAdmin(), (req, res) => {
    const r = db.prepare("DELETE FROM write_tribe_templates WHERE id = ?").run(Number(req.params.id));
    if (!r.changes) return nf(res);
    res.json({ ok: true });
  });
  app.get("/api/admin/write-usage", requireAdmin(), (req, res) => {
    const c = (q, ...a) => db.prepare(q).get(...a).c;
    const d7 = new Date(Date.now() - 7 * DAY_MS).toISOString();
    const d30 = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const methods = {};
    let stages = 0;
    let words = 0;
    let n = 0;
    for (const r of db.prepare("SELECT blocks_json, words FROM write_docs ORDER BY id DESC LIMIT 2000").all()) {
      const blocks = JSON.parse(r.blocks_json);
      stages += blocks.length;
      words += r.words;
      n++;
      const seen = new Set();
      for (const b of blocks) for (const m of methodsIn(`${b.title}\n${b.text}`).slice(0, 2)) seen.add(m.name);
      for (const m of seen) methods[m] = (methods[m] || 0) + 1;
    }
    const feedback = db.prepare("SELECT feature, SUM(vote = 1) AS up, SUM(vote = -1) AS down, COUNT(*) AS n FROM feature_feedback GROUP BY feature ORDER BY n DESC").all();
    res.json({
      docs: c("SELECT COUNT(*) AS c FROM write_docs"),
      writers: c("SELECT COUNT(DISTINCT owner_id) AS c FROM write_docs"),
      shares: c("SELECT COUNT(*) AS c FROM write_shares"),
      comments: c("SELECT COUNT(*) AS c FROM write_comments"),
      templates: c("SELECT COUNT(*) AS c FROM write_tribe_templates"),
      created7: c("SELECT COUNT(*) AS c FROM write_docs WHERE created_at >= ?", d7),
      created30: c("SELECT COUNT(*) AS c FROM write_docs WHERE created_at >= ?", d30),
      active30: c("SELECT COUNT(DISTINCT owner_id) AS c FROM write_docs WHERE updated_at >= ?", d30),
      avgStages: n ? Math.round((stages / n) * 10) / 10 : 0,
      avgWords: n ? Math.round(words / n) : 0,
      topMethods: Object.entries(methods).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, k]) => ({ name, n: k })),
      feedback,
    });
  });

  // ── 166: סל מחזור ──
  const purge = () => db.prepare("DELETE FROM write_trash WHERE deleted_at < ?").run(new Date(Date.now() - TRASH_DAYS * DAY_MS).toISOString());
  app.get("/api/write/trash", requireUser(), (req, res) => {
    purge();
    res.json(db.prepare("SELECT id, title, words, deleted_at AS deletedAt FROM write_trash WHERE owner_id = ? ORDER BY id DESC").all(req.user.id).map((r) => ({ ...r, title: r.title || "מסמך ללא שם", daysLeft: Math.max(0, TRASH_DAYS - Math.floor((Date.now() - Date.parse(r.deletedAt)) / DAY_MS)) })));
  });
  app.post("/api/write/trash/:id/restore", requireUser(), (req, res) => {
    const t = db.prepare("SELECT * FROM write_trash WHERE id = ? AND owner_id = ?").get(Number(req.params.id), req.user.id);
    if (!t) return nf(res);
    if (db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c >= 100) return res.status(409).json(fail("LIMIT", "אפשר לשמור עד 100 מסמכים. מחקו ישנים"));
    const at = nowIso();
    const r = db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)").run(req.user.id, t.title, t.meta_json, t.blocks_json, t.words, at, at);
    db.prepare("DELETE FROM write_trash WHERE id = ?").run(t.id);
    res.json({ id: Number(r.lastInsertRowid) });
  });
  app.delete("/api/write/trash/:id", requireUser(), (req, res) => {
    const r = db.prepare("DELETE FROM write_trash WHERE id = ? AND owner_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return nf(res);
    res.json({ ok: true });
  });

  // ── 167: ניקוי טקסט ──
  app.post("/api/write/clean", requireUser(), limiter(60_000, 60), (req, res) => {
    const v = z.object({ text: z.string().max(20000) }).parse(req.body ?? {});
    const text = cleanText(v.text);
    res.json({ text, changed: text !== v.text });
  });
}

const tokens = (t) => new Set((String(t || "").replace(/[^\u05D0-\u05EAa-zA-Z0-9\s]/g, " ").match(/\S{3,}/g) || []));
/** דמיון בין שני טקסטים (Jaccard על מילים). */
export function similarity(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / (x.size + y.size - n);
}

export function registerWriteSearchRoutes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 60);
  // ── 176: חיפוש בכל המסמכים שלי ──
  app.get("/api/write/search", requireUser(), lim, (req, res) => {
    const q = z.object({ q: z.string().trim().min(2, "הקלידו לפחות שתי אותיות").max(60) }).safeParse(req.query ?? {});
    if (!q.success) return res.status(400).json(fail("BAD_QUERY", q.error.issues[0].message));
    const needle = q.data.q.toLowerCase();
    const out = [];
    for (const r of db.prepare("SELECT id, title, blocks_json FROM write_docs WHERE owner_id = ? ORDER BY updated_at DESC").all(req.user.id)) {
      const hits = [];
      if (r.title.toLowerCase().includes(needle)) hits.push({ where: "שם המסמך", snippet: r.title });
      for (const b of JSON.parse(r.blocks_json)) {
        const text = `${b.title}\n${b.text}`;
        const i = text.toLowerCase().indexOf(needle);
        if (i >= 0) hits.push({ where: b.title || "שלב", snippet: text.slice(Math.max(0, i - 30), i + needle.length + 50).replace(/\s+/g, " ").trim() });
        if (hits.length >= 3) break;
      }
      if (hits.length) out.push({ id: r.id, title: r.title || "מסמך ללא שם", hits: hits.slice(0, 3) });
      if (out.length >= 20) break;
    }
    res.json({ results: out });
  });

  // ── 185: מסמכים דומים ──
  app.post("/api/write/similar", requireUser(), lim, (req, res) => {
    const v = z.object({ title: z.string().max(120).default(""), text: z.string().max(60000).default(""), excludeId: z.number().int().optional() }).parse(req.body ?? {});
    const mine = `${v.title}\n${v.text}`;
    const list = [];
    for (const r of db.prepare("SELECT id, title, blocks_json FROM write_docs WHERE owner_id = ?").all(req.user.id)) {
      if (r.id === v.excludeId) continue;
      const other = `${r.title}\n${JSON.parse(r.blocks_json).map((b) => `${b.title}\n${b.text}`).join("\n")}`;
      const sim = similarity(mine, other);
      if (sim >= 0.25) list.push({ id: r.id, title: r.title || "מסמך ללא שם", percent: Math.round(sim * 100) });
    }
    res.json({ similar: list.sort((a, b) => b.percent - a.percent).slice(0, 3) });
  });
}
