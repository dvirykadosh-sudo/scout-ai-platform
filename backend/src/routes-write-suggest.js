// הצעות מתודה בעורך הכתיבה (רעיונות 113–126). הכול מבוסס כללים, בלי מודל שפה.
// המסמך נשלח מהדפדפן כפי שהוא עכשיו, כך שההצעות מתייחסות גם למה שעוד לא נשמר.
import { z } from "zod";
import { rowToActivity } from "./activities.js";
import { GEAR_GROUPS } from "./gear.js";
import { KINDS, metaDefaults } from "./routes-write.js";
import { CATEGORIES, METHOD_CATEGORY_LABEL, PLAYBOOK_METHODS, bridgeBetween, expandMethod, gapsOf, searchMethods, shortVersion, suggestFor, swapForBlock } from "./write-suggest.js";

const blockZ = z.object({
  id: z.string().trim().min(1).max(24),
  title: z.string().max(120).default(""),
  kind: z.enum(KINDS).default("free"),
  minutes: z.number().int().min(0).max(300).nullable().default(null),
  text: z.string().max(20000).default(""),
  note: z.string().max(5000).default(""),
});
const docZ = z.object({
  title: z.string().max(120).default(""),
  meta: z.any().default({}),
  blocks: z.array(blockZ).max(60),
});
const method = z.string().trim().min(1).max(40);
const normDoc = (d) => ({ title: d.title, meta: metaDefaults(d.meta ?? {}), blocks: d.blocks });
const ALL_METHODS = new Set(Object.values(CATEGORIES).flat());

export function registerWriteSuggestRoutes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 120);
  const prefsOf = (uid) => Object.fromEntries(db.prepare("SELECT method, weight FROM write_method_prefs WHERE user_id = ?").all(uid).map((r) => [r.method, r.weight]));
  const noBlock = (res) => res.status(404).json(fail("NO_BLOCK", "השלב לא נמצא במסמך"));
  const badMethod = (res) => res.status(400).json(fail("BAD_METHOD", "מתודה לא מוכרת"));

  app.get("/api/write/method-catalog", requireUser(), (req, res) => {
    res.json({ categories: Object.entries(CATEGORIES).map(([id, methods]) => ({ id, label: METHOD_CATEGORY_LABEL[id] || id, methods })), playbook: PLAYBOOK_METHODS, gear: GEAR_GROUPS.map((g) => ({ id: g.id, label: g.label })) });
  });

  app.post("/api/write/suggest", requireUser(), lim, (req, res) => {
    const v = z.object({ doc: docZ, blockId: z.string().max(24), exclude: z.array(method).max(40).default([]), limit: z.number().int().min(1).max(6).default(3) }).parse(req.body ?? {});
    const r = suggestFor(normDoc(v.doc), v.blockId, { prefs: prefsOf(req.user.id), exclude: v.exclude, limit: v.limit });
    if (!r) return noBlock(res);
    res.json(r);
  });

  app.post("/api/write/swap", requireUser(), lim, (req, res) => {
    const v = z.object({ doc: docZ, blockId: z.string().max(24), method: z.string().trim().max(40).default("") }).parse(req.body ?? {});
    if (v.method && !ALL_METHODS.has(v.method)) return badMethod(res);
    const r = swapForBlock(normDoc(v.doc), v.blockId, v.method, { prefs: prefsOf(req.user.id) });
    if (!r) return noBlock(res);
    res.json(r);
  });

  app.post("/api/write/expand", requireUser(), lim, (req, res) => {
    const v = z.object({ doc: docZ, method, minutes: z.number().int().min(1).max(120).default(15) }).parse(req.body ?? {});
    if (!PLAYBOOK_METHODS.includes(v.method)) return badMethod(res);
    res.json(expandMethod(normDoc(v.doc), v.method, v.minutes));
  });

  app.post("/api/write/short", requireUser(), lim, (req, res) => {
    const v = z.object({ doc: docZ, method }).parse(req.body ?? {});
    if (!PLAYBOOK_METHODS.includes(v.method)) return badMethod(res);
    res.json(shortVersion(normDoc(v.doc), v.method));
  });

  app.post("/api/write/bridge", requireUser(), lim, (req, res) => {
    const v = z.object({ doc: docZ, fromId: z.string().max(24), toId: z.string().max(24) }).parse(req.body ?? {});
    const r = bridgeBetween(normDoc(v.doc), v.fromId, v.toId);
    if (!r) return noBlock(res);
    res.json(r);
  });

  app.post("/api/write/gaps", requireUser(), lim, (req, res) => {
    const v = z.object({ doc: docZ }).parse(req.body ?? {});
    res.json(gapsOf(normDoc(v.doc)));
  });

  app.get("/api/write/prefs", requireUser(), (req, res) => res.json(prefsOf(req.user.id)));
  // weight: 1 = אוהב, -1 = לא, 0 = ניטרלי (מוחק)
  app.put("/api/write/prefs", requireUser(), limiter(60_000, 60), (req, res) => {
    const v = z.object({ method, weight: z.number().int().min(-1).max(1) }).parse(req.body ?? {});
    if (!ALL_METHODS.has(v.method)) return badMethod(res);
    if (v.weight === 0) db.prepare("DELETE FROM write_method_prefs WHERE user_id = ? AND method = ?").run(req.user.id, v.method);
    else db.prepare("INSERT INTO write_method_prefs (user_id, method, weight) VALUES (?,?,?) ON CONFLICT(user_id, method) DO UPDATE SET weight = excluded.weight").run(req.user.id, v.method, v.weight);
    res.json(prefsOf(req.user.id));
  });

  app.get("/api/write/methods/search", requireUser(), lim, (req, res) => {
    const q = z.string().trim().min(1).max(60).safeParse(req.query.q);
    if (!q.success) return res.status(400).json(fail("BAD_QUERY", "כתבו מה לחפש"));
    const activities = db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all().map(rowToActivity);
    const docs = db.prepare("SELECT id, title, blocks_json FROM write_docs WHERE owner_id = ?").all(req.user.id).map((d) => ({ id: d.id, title: d.title, blocks: JSON.parse(d.blocks_json) }));
    res.json(searchMethods(q.data, { activities, docs }));
  });
}
