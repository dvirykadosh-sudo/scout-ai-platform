// עורך כתיבה חופשי (רעיונות 101–112): מסמכים של שלבים, שמירה אוטומטית עם בדיקת התנגשות,
// גרסאות לפי שעה, נקודות שמירה ותבניות פתיחה.
import crypto from "node:crypto";
import { z } from "zod";
import { audit, nowIso } from "./db.js";
import { AGE_GROUPS } from "./shared/constants.js";

export const KINDS = ["open", "body", "peak", "close", "free"];
const MAX_DOCS = 100;
const MAX_VERSIONS = 100;
const HOUR = 3600_000;

const blockSchema = z.object({
  id: z.string().trim().min(1).max(24),
  title: z.string().max(120).default(""),
  kind: z.enum(KINDS).default("free"),
  minutes: z.number().int().min(0).max(300).nullable().default(null),
  text: z.string().max(20000).default(""),
  note: z.string().max(5000).default(""),
  hint: z.string().max(200).optional(),
  done: z.boolean().default(false),
});
const metaSchema = z.object({
  ageGroup: z.enum(AGE_GROUPS).or(z.literal("")).default(""),
  minutes: z.number().int().min(0).max(480).nullable().default(null),
  groupSize: z.number().int().min(0).max(200).nullable().default(null),
  value: z.string().trim().max(40).default(""),
  gear: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  leader: z.string().trim().max(60).default(""),
  date: z.string().trim().max(20).default(""),
  pinned: z.boolean().default(false),
  template: z.boolean().default(false),
  archived: z.boolean().default(false),
  runs: z
    .array(z.object({ date: z.string().trim().max(20).default(""), note: z.string().trim().max(600).default(""), rating: z.number().int().min(0).max(5).default(0) }))
    .max(20)
    .default([]),
  equipment: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  review: z.array(z.string().trim().min(1).max(20)).max(12).default([]),
  tags: z.array(z.string().trim().min(1).max(20)).max(8).default([]),
  startTime: z.string().regex(/^(\d{2}:\d{2})?$/).default(""),
});
export const metaDefaults = (m = {}) => metaSchema.parse(m);
const saveSchema = z.object({
  title: z.string().trim().max(120).default(""),
  meta: metaSchema.default({}),
  blocks: z.array(blockSchema).max(60),
  baseRev: z.number().int().min(1).optional(),
});

const newId = () => crypto.randomBytes(5).toString("hex");
const B = (kind, title, minutes, hint) => ({ id: newId(), kind, title, minutes, text: "", note: "", hint });

/** תבניות פתיחה. כל בלוק מקבל id חדש בכל יצירה. */
export const TEMPLATES = [
  { id: "blank", name: "דף ריק", desc: "שלב אחד חופשי, אתם בונים הכול.", minutes: null, blocks: () => [B("free", "", null, "כתבו כאן איך שנוח לכם")] },
  {
    id: "classic",
    name: "פעולה קלאסית",
    desc: "פתיחה, גוף, שיא וסיכום.",
    minutes: 45,
    blocks: () => [B("open", "פתיחה", 5, "משפט תפיסה, שאלה או מעשה קטן שמכניס את החבורה"), B("body", "גוף הפעולה", 20, "הרעיון המרכזי, משחק או הסבר"), B("peak", "שיא", 15, "הרגע שבו הנושא נוגע בהם באמת"), B("close", "סיכום", 5, "מה לוקחים מהפעולה, ומה עושים איתה")],
  },
  {
    id: "value",
    name: "פעולת ערך",
    desc: "מסיפור לדיון ולהחלטה אישית.",
    minutes: 50,
    blocks: () => [B("open", "פתיחה בשאלה", 5, "שאלה שמעוררת מחשבה על הערך"), B("body", "סיפור או מקרה", 10, "סיפור קצר, מקרה אמיתי או סרטון"), B("body", "דיון", 15, "שאלות בקבוצות קטנות ואז במליאה"), B("peak", "החלטה אישית", 15, "כל חניך כותב או אומר מה הוא לוקח על עצמו"), B("close", "סיכום", 5, "משפט סיכום ושיר או ברכה")],
  },
  {
    id: "short30",
    name: "פעולה קצרה, 30 דקות",
    desc: "כשאין הרבה זמן.",
    minutes: 30,
    blocks: () => [B("open", "פתיחה", 5, "פתיחה קצרה וחדה"), B("body", "גוף", 15, "פעילות אחת מרכזית"), B("peak", "שיא וסיכום", 10, "סיום חזק במשפט אחד")],
  },
  {
    id: "young",
    name: "שכבה צעירה, משחקית",
    desc: "הרבה תנועה ומעברים קצרים.",
    minutes: 45,
    blocks: () => [B("open", "חימום בתנועה", 8, "משחק פתיחה שמכניס לאווירה"), B("body", "משחק מרכזי", 15, "משחק עם כללים פשוטים"), B("body", "סיפור קצר", 7, "סיפור בקול, עם שאלה אחת"), B("peak", "יצירה או אתגר", 10, "משימה קבוצתית"), B("close", "סיכום", 5, "מעגל סיום")],
  },
];

const words = (title, blocks) => {
  const all = [title, ...blocks.flatMap((b) => [b.title, b.text])].join(" ");
  const m = all.match(/\S+/g);
  return m ? m.length : 0;
};

export const trashDoc = (db, d) => db.prepare("INSERT INTO write_trash (owner_id, title, meta_json, blocks_json, words, deleted_at) VALUES (?,?,?,?,?,?)").run(d.owner_id, d.title, d.meta_json, d.blocks_json, d.words, nowIso());

export function registerWriteRoutes(app, { db, limiter, fail, requireUser }) {
  const parse = (row) => ({ meta: metaDefaults(JSON.parse(row.meta_json)), blocks: JSON.parse(row.blocks_json) });
  const out = (d) => ({ id: d.id, title: d.title, ...parse(d), rev: d.rev, words: d.words, createdAt: d.created_at, updatedAt: d.updated_at });
  const mine = (id, uid) => db.prepare("SELECT * FROM write_docs WHERE id = ? AND owner_id = ?").get(id, uid);
  const toTrash = (d) => db.prepare("INSERT INTO write_trash (owner_id, title, meta_json, blocks_json, words, deleted_at) VALUES (?,?,?,?,?,?)").run(d.owner_id, d.title, d.meta_json, d.blocks_json, d.words, nowIso());
  const notFound = (res) => res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
  const idOf = (req) => Number(req.params.id);

  /** שומר את מצב המסמך הנוכחי כגרסה. ישן מ-100 גרסאות נמחק. */
  const snapshot = (d, note, at) => {
    db.prepare("INSERT INTO write_versions (doc_id, title, meta_json, blocks_json, words, note, saved_at) VALUES (?,?,?,?,?,?,?)").run(d.id, d.title, d.meta_json, d.blocks_json, d.words, note, at);
    db.prepare("DELETE FROM write_versions WHERE doc_id = ? AND id NOT IN (SELECT id FROM write_versions WHERE doc_id = ? ORDER BY id DESC LIMIT ?)").run(d.id, d.id, MAX_VERSIONS);
  };

  app.get("/api/write/templates", (req, res) => res.json(TEMPLATES.map((t) => ({ id: t.id, name: t.name, desc: t.desc, minutes: t.minutes, stages: t.blocks().length }))));

  app.get("/api/write/docs", requireUser(), (req, res) => {
    const rows = db.prepare("SELECT id, title, words, meta_json, blocks_json, updated_at FROM write_docs WHERE owner_id = ? ORDER BY updated_at DESC, id DESC").all(req.user.id);
    res.json(rows.map((d) => ({ id: d.id, title: d.title || "מסמך ללא שם", words: d.words, stages: JSON.parse(d.blocks_json).length, ageGroup: JSON.parse(d.meta_json).ageGroup || "", pinned: !!JSON.parse(d.meta_json).pinned, template: !!JSON.parse(d.meta_json).template, archived: !!JSON.parse(d.meta_json).archived, tags: JSON.parse(d.meta_json).tags ?? [], updatedAt: d.updated_at })));
  });

  app.post("/api/write/docs", requireUser(), limiter(15 * 60_000, 60), (req, res) => {
    const v = z.object({ template: z.string().max(30).default("blank"), title: z.string().trim().max(120).default(""), fromDoc: z.number().int().optional(), tribeTemplate: z.number().int().optional() }).parse(req.body ?? {});
    const t = TEMPLATES.find((x) => x.id === v.template);
    if (v.tribeTemplate !== undefined) {
      const tt = db.prepare("SELECT * FROM write_tribe_templates WHERE id = ?").get(v.tribeTemplate);
      if (!tt) return notFound(res);
      if (db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c >= MAX_DOCS) return res.status(409).json(fail("LIMIT", `אפשר לשמור עד ${MAX_DOCS} מסמכים. מחקו ישנים`));
      const at1 = nowIso();
      const blocks1 = JSON.parse(tt.blocks_json).map((b) => ({ ...b, id: newId(), done: false }));
      const r1 = db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,0,?,?)").run(req.user.id, v.title || tt.title, JSON.stringify({ ...JSON.parse(tt.meta_json), template: false, archived: false, pinned: false, runs: [], date: "" }), JSON.stringify(blocks1), at1, at1);
      return res.status(201).json(out(mine(Number(r1.lastInsertRowid), req.user.id)));
    }
    if (v.fromDoc !== undefined) {
      const src = mine(v.fromDoc, req.user.id);
      if (!src) return notFound(res);
      if (db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c >= MAX_DOCS) return res.status(409).json(fail("LIMIT", `אפשר לשמור עד ${MAX_DOCS} מסמכים. מחקו ישנים`));
      const m = { ...parse(src).meta, template: false, archived: false, pinned: false, runs: [], date: "" };
      const blocks = parse(src).blocks.map((b) => ({ ...b, id: newId(), done: false }));
      const at0 = nowIso();
      const r0 = db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)").run(req.user.id, v.title || src.title, JSON.stringify(m), JSON.stringify(blocks), src.words, at0, at0);
      return res.status(201).json(out(mine(Number(r0.lastInsertRowid), req.user.id)));
    }
    if (!t) return res.status(400).json(fail("BAD_TEMPLATE", "תבנית לא מוכרת"));
    if (db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c >= MAX_DOCS) return res.status(409).json(fail("LIMIT", `אפשר לשמור עד ${MAX_DOCS} מסמכים. מחקו ישנים`));
    const blocks = t.blocks();
    const meta = metaDefaults({ ageGroup: "", minutes: t.minutes });
    const at = nowIso();
    const r = db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)").run(req.user.id, v.title, JSON.stringify(meta), JSON.stringify(blocks), 0, at, at);
    res.status(201).json(out(mine(Number(r.lastInsertRowid), req.user.id)));
  });

  app.get("/api/write/docs/:id", requireUser(), (req, res) => {
    const d = mine(idOf(req), req.user.id);
    if (!d) return notFound(res);
    res.json(out(d));
  });

  // שמירה אוטומטית. baseRev מונע דריסה כששתי לשוניות עורכות את אותו מסמך.
  app.put("/api/write/docs/:id", requireUser(), limiter(60_000, 240), (req, res) => {
    const d = mine(idOf(req), req.user.id);
    if (!d) return notFound(res);
    const v = saveSchema.parse(req.body ?? {});
    if (v.baseRev !== undefined && v.baseRev !== d.rev) return res.status(409).json({ ...fail("CONFLICT", "המסמך עודכן במקום אחר (בלשונית או במכשיר אחר). טענו אותו מחדש כדי לא לאבד שינויים"), current: out(d) });
    const ids = new Set(v.blocks.map((b) => b.id));
    if (ids.size !== v.blocks.length) return res.status(400).json(fail("DUP_BLOCK", "מזהי שלבים כפולים"));
    const meta = JSON.stringify(v.meta);
    const blocks = JSON.stringify(v.blocks);
    if (meta === d.meta_json && blocks === d.blocks_json && v.title === d.title) return res.json(out(d));
    if (JSON.stringify(v.blocks).length > 400_000) return res.status(413).json(fail("TOO_BIG", "המסמך גדול מדי"));
    const at = nowIso();
    // גרסה אוטומטית של המצב הקודם, לכל היותר אחת בשעה
    const last = db.prepare("SELECT saved_at FROM write_versions WHERE doc_id = ? ORDER BY id DESC LIMIT 1").get(d.id);
    if (!last || Date.parse(at) - Date.parse(last.saved_at) >= HOUR) snapshot(d, "אוטומטי", d.updated_at);
    db.prepare("UPDATE write_docs SET title = ?, meta_json = ?, blocks_json = ?, words = ?, rev = rev + 1, updated_at = ? WHERE id = ?").run(v.title, meta, blocks, words(v.title, v.blocks), at, d.id);
    res.json(out(mine(d.id, req.user.id)));
  });

  app.delete("/api/write/docs/:id", requireUser(), (req, res) => {
    const old = mine(idOf(req), req.user.id);
    if (!old) return notFound(res);
    toTrash(old);
    const r = db.prepare("DELETE FROM write_docs WHERE id = ? AND owner_id = ?").run(idOf(req), req.user.id);
    if (!r.changes) return notFound(res);
    audit(db, req.user.username, "write.delete", { id: idOf(req) });
    res.json({ ok: true });
  });

  app.post("/api/write/docs/:id/duplicate", requireUser(), limiter(15 * 60_000, 30), (req, res) => {
    const d = mine(idOf(req), req.user.id);
    if (!d) return notFound(res);
    if (db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c >= MAX_DOCS) return res.status(409).json(fail("LIMIT", `אפשר לשמור עד ${MAX_DOCS} מסמכים. מחקו ישנים`));
    const at = nowIso();
    const r = db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)").run(req.user.id, `${d.title || "מסמך"} (עותק)`.slice(0, 120), d.meta_json, d.blocks_json, d.words, at, at);
    res.status(201).json(out(mine(Number(r.lastInsertRowid), req.user.id)));
  });

  // ───── גרסאות ─────
  app.get("/api/write/docs/:id/versions", requireUser(), (req, res) => {
    const d = mine(idOf(req), req.user.id);
    if (!d) return notFound(res);
    res.json(db.prepare("SELECT id, title, words, note, saved_at AS savedAt FROM write_versions WHERE doc_id = ? ORDER BY id DESC").all(d.id));
  });
  app.get("/api/write/docs/:id/versions/:vid", requireUser(), (req, res) => {
    const d = mine(idOf(req), req.user.id);
    if (!d) return notFound(res);
    const v = db.prepare("SELECT * FROM write_versions WHERE id = ? AND doc_id = ?").get(Number(req.params.vid), d.id);
    if (!v) return notFound(res);
    res.json({ id: v.id, title: v.title, ...parse(v), words: v.words, note: v.note, savedAt: v.saved_at });
  });
  app.post("/api/write/docs/:id/snapshot", requireUser(), limiter(15 * 60_000, 60), (req, res) => {
    const d = mine(idOf(req), req.user.id);
    if (!d) return notFound(res);
    const { label } = z.object({ label: z.string().trim().max(60).default("") }).parse(req.body ?? {});
    snapshot(d, label || "נקודת שמירה", nowIso());
    res.status(201).json({ ok: true });
  });
  app.post("/api/write/docs/:id/versions/:vid/restore", requireUser(), limiter(15 * 60_000, 60), (req, res) => {
    const d = mine(idOf(req), req.user.id);
    if (!d) return notFound(res);
    const v = db.prepare("SELECT * FROM write_versions WHERE id = ? AND doc_id = ?").get(Number(req.params.vid), d.id);
    if (!v) return notFound(res);
    const at = nowIso();
    snapshot(d, "לפני שחזור", at); // כדי שאפשר יהיה לחזור
    db.prepare("UPDATE write_docs SET title = ?, meta_json = ?, blocks_json = ?, words = ?, rev = rev + 1, updated_at = ? WHERE id = ?").run(v.title, v.meta_json, v.blocks_json, v.words, at, d.id);
    res.json(out(mine(d.id, req.user.id)));
  });
}
