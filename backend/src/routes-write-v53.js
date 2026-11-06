// שלב 53 (388–422): מעבדת סגנון ופירוק. פירוק פעולה לגורמים, טביעת סגנון, כתיבה לפי הסגנון, פרופילים ובדיקות עומק.
import { z } from "zod";
import { KINDS } from "./routes-write.js";
import { keywordsFrom } from "./routes-write-v47.js";
import { decompose, describe, draftFromSkeleton, fingerprint, mergeFingerprints, review, rewriteTowards, splitText, styleCard, styleScore } from "./style-lab.js";

const blockZ = z.object({ id: z.string().max(24).default("x"), title: z.string().max(120).default(""), kind: z.enum(KINDS).default("free"), minutes: z.number().int().min(0).max(300).nullable().default(null), text: z.string().max(20000).default(""), note: z.string().max(5000).default("") });
const docZ = z.object({ title: z.string().max(120).default(""), meta: z.any().default({}), blocks: z.array(blockZ).max(60) });
const fpZ = z.object({ version: z.literal(1), sentence: z.any(), address: z.any(), register: z.any(), punct: z.any(), signature: z.any(), openers: z.any(), questions: z.any(), format: z.any(), humor: z.any(), speech: z.any(), methods: z.any(), pace: z.any() }).passthrough();
const txt = (n) => z.string().max(n).default("");

const joinDocs = (rows) => ({ title: "", meta: {}, blocks: rows.flatMap((r) => { try { return JSON.parse(r.blocks_json); } catch { return []; } }) });

export function registerWriteV53Routes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 60);
  const F = (res, status, code, message) => res.status(status).json(fail(code, message));
  const now = () => new Date().toISOString();
  const need = (doc) => { if (!doc.blocks.some((b) => b.text.trim().length > 20)) throw Object.assign(new Error("EMPTY"), { empty: true }); };
  const wrap = (fn) => (req, res) => { try { fn(req, res); } catch (e) { if (e?.empty) return res.status(422).json(fail("TOO_SHORT", "אין מספיק טקסט לניתוח. כתבו עוד כמה משפטים בשלבים.")); throw e; } };
  const libraryOf = () => {
    const rows = db.prepare("SELECT id, title, duration_min, stages_json FROM activities WHERE status = 'PUBLISHED' LIMIT 300").all();
    const sets = [], st = [], mi = [];
    for (const r of rows) {
      let stages = [];
      try { stages = JSON.parse(r.stages_json); } catch { /* ignore */ }
      const doc = { title: r.title, blocks: stages.map((s) => ({ title: s.title || s.name || "", text: [s.description, s.text, ...(Array.isArray(s.steps) ? s.steps : [])].filter(Boolean).join(" "), kind: "body" })) };
      sets.push({ id: r.id, title: r.title, words: new Set(keywordsFrom(doc, 20).map((k) => k.word)) });
      st.push(stages.length); mi.push(r.duration_min || 0);
    }
    const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0);
    return { sets, stats: rows.length ? { stages: avg(st), minutes: avg(mi), perStage: avg(st.map((n, i) => (n ? mi[i] / n : 0))) } : null };
  };
  const profiles = (uid) => db.prepare("SELECT id, name, fp_json, card, created_at FROM style_profiles WHERE user_id = ? ORDER BY id DESC").all(uid);
  const getProfile = (uid, id) => db.prepare("SELECT * FROM style_profiles WHERE id = ? AND user_id = ?").get(id, uid);

  // 388–402 + 407: פירוק מלא וטביעת סגנון
  app.post("/api/write/lab/analyze", requireUser(), lim, wrap((req, res) => {
    const doc = docZ.parse(req.body ?? {}); need(doc);
    const fp = fingerprint(doc);
    res.json({ decomposition: decompose(doc), fingerprint: fp, description: describe(fp), card: styleCard(doc, fp) });
  }));

  // 403: נאמנות לסגנון שמור
  app.post("/api/write/lab/score", requireUser(), lim, wrap((req, res) => {
    const b = z.object({ doc: docZ, profileId: z.number().int().optional(), fingerprint: fpZ.optional() }).parse(req.body ?? {});
    need(b.doc);
    let target = b.fingerprint;
    if (b.profileId) { const p = getProfile(req.user.id, b.profileId); if (!p) return F(res, 404, "NOT_FOUND", "הפרופיל לא נמצא"); target = JSON.parse(p.fp_json); }
    if (!target) { const rows = db.prepare("SELECT blocks_json FROM write_docs WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 12").all(req.user.id); const mine = joinDocs(rows); if (!mine.blocks.length) return F(res, 422, "NO_STYLE", "אין עדיין סגנון שמור. נתחו פעולה ושמרו פרופיל."); target = fingerprint(mine); }
    res.json(styleScore(target, fingerprint(b.doc)));
  }));

  // 404 + 422: שכתוב לסגנון, עם הפרשי מילים
  app.post("/api/write/lab/rewrite", requireUser(), lim, (req, res) => {
    const b = z.object({ text: z.string().min(10).max(12000), profileId: z.number().int().optional(), fingerprint: fpZ.optional() }).parse(req.body ?? {});
    let target = b.fingerprint;
    if (b.profileId) { const p = getProfile(req.user.id, b.profileId); if (!p) return F(res, 404, "NOT_FOUND", "הפרופיל לא נמצא"); target = JSON.parse(p.fp_json); }
    if (!target) return F(res, 422, "NO_STYLE", "בחרו פרופיל סגנון או נתחו פעולה קודם.");
    const r = rewriteTowards(target, b.text);
    const a = b.text.split(/\s+/), c = r.text.split(/\s+/), set = new Set(a);
    res.json({ ...r, diff: c.map((w) => ({ w, added: !set.has(w) })).slice(0, 1500), before: fingerprint({ blocks: [{ text: b.text, kind: "free", title: "", minutes: null }] }).sentence, after: fingerprint({ blocks: [{ text: r.text, kind: "free", title: "", minutes: null }] }).sentence });
  });

  // 405: טיוטה חדשה משלד + סגנון
  app.post("/api/write/lab/draft", requireUser(), lim, wrap((req, res) => {
    const b = z.object({ doc: docZ, topic: txt(80), value: txt(40), profileId: z.number().int().optional() }).parse(req.body ?? {});
    need(b.doc);
    let fp = fingerprint(b.doc);
    if (b.profileId) { const p = getProfile(req.user.id, b.profileId); if (!p) return F(res, 404, "NOT_FOUND", "הפרופיל לא נמצא"); fp = JSON.parse(p.fp_json); }
    const out = draftFromSkeleton(decompose(b.doc), fp, b);
    res.json({ ...out, note: "הטיוטה נבנית משלד הפעולה ומהסגנון שנמדד, בלי מודל שפה. לטקסט חופשי מלא הפעילו מפתח AI והשתמשו בכרטיס הסגנון." });
  }));

  // 406: פרופילים שמורים
  app.get("/api/write/lab/profiles", requireUser(), (req, res) => res.json({ profiles: profiles(req.user.id).map((p) => ({ id: p.id, name: p.name, createdAt: p.created_at, fingerprint: JSON.parse(p.fp_json), card: p.card })) }));
  app.post("/api/write/lab/profiles", requireUser(), lim, wrap((req, res) => {
    const b = z.object({ name: z.string().trim().min(1).max(40), doc: docZ.optional(), fingerprint: fpZ.optional(), card: txt(3000) }).parse(req.body ?? {});
    if (profiles(req.user.id).length >= 10) return F(res, 409, "LIMIT", "אפשר לשמור עד 10 פרופילים. מחקו אחד קודם.");
    let fp = b.fingerprint, card = b.card;
    if (b.doc) { need(b.doc); fp = fingerprint(b.doc); card = styleCard(b.doc, fp); }
    if (!fp) return F(res, 422, "NO_STYLE", "חסר מקור לפרופיל");
    const r = db.prepare("INSERT INTO style_profiles (user_id, name, fp_json, card, created_at) VALUES (?,?,?,?,?)").run(req.user.id, b.name, JSON.stringify(fp), card, now());
    res.status(201).json({ id: Number(r.lastInsertRowid), name: b.name });
  }));
  app.delete("/api/write/lab/profiles/:id", requireUser(), (req, res) => {
    const r = db.prepare("DELETE FROM style_profiles WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return F(res, 404, "NOT_FOUND", "הפרופיל לא נמצא");
    res.json({ ok: true });
  });
  app.post("/api/write/lab/profiles/merge", requireUser(), lim, (req, res) => {
    const b = z.object({ a: z.number().int(), b: z.number().int(), weight: z.number().min(0).max(1).default(0.5), name: z.string().trim().min(1).max(40) }).parse(req.body ?? {});
    const pa = getProfile(req.user.id, b.a), pb = getProfile(req.user.id, b.b);
    if (!pa || !pb) return F(res, 404, "NOT_FOUND", "פרופיל לא נמצא");
    if (profiles(req.user.id).length >= 10) return F(res, 409, "LIMIT", "אפשר לשמור עד 10 פרופילים.");
    const fp = mergeFingerprints(JSON.parse(pa.fp_json), JSON.parse(pb.fp_json), b.weight);
    const r = db.prepare("INSERT INTO style_profiles (user_id, name, fp_json, card, created_at) VALUES (?,?,?,?,?)").run(req.user.id, b.name, JSON.stringify(fp), b.weight >= 0.5 ? pb.card : pa.card, now());
    res.status(201).json({ id: Number(r.lastInsertRowid), fingerprint: fp, description: describe(fp) });
  });

  // 407: החלת כרטיס הסגנון על הסגנון של המשתמש (נשלח כהנחיה למודל AI)
  app.post("/api/write/lab/apply-card", requireUser(), lim, (req, res) => {
    const b = z.object({ profileId: z.number().int().optional(), card: txt(3000), clear: z.boolean().default(false) }).parse(req.body ?? {});
    let card = b.clear ? "" : b.card;
    if (!b.clear && b.profileId) { const p = getProfile(req.user.id, b.profileId); if (!p) return F(res, 404, "NOT_FOUND", "הפרופיל לא נמצא"); card = p.card; }
    let cur = {};
    try { cur = JSON.parse(db.prepare("SELECT style_json FROM users WHERE id = ?").get(req.user.id)?.style_json || "{}"); } catch { /* ignore */ }
    const next = { ...cur, card: card.slice(0, 3000) };
    db.prepare("UPDATE users SET style_json = ? WHERE id = ?").run(JSON.stringify(next), req.user.id);
    res.json({ ok: true, active: !!next.card });
  });

  // 408–416: בדיקות עומק
  app.post("/api/write/lab/review", requireUser(), lim, wrap((req, res) => {
    const doc = docZ.parse(req.body ?? {}); need(doc);
    const lib = libraryOf();
    res.json(review(doc, lib.stats, lib.sets));
  }));

  // 417: פירוק טקסט חופשי למסמך כתיבה
  app.post("/api/write/lab/from-text", requireUser(), lim, (req, res) => {
    const b = z.object({ text: z.string().min(30).max(40000), title: txt(120) }).parse(req.body ?? {});
    const doc = splitText(b.text, b.title);
    res.json({ ...doc, decomposition: decompose({ ...doc, meta: {} }) });
  });

  // 418–419: הסגנון המצטבר שלי ומגמה
  app.get("/api/write/lab/my-style", requireUser(), (req, res) => {
    const rows = db.prepare("SELECT id, title, blocks_json, updated_at FROM write_docs WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 30").all(req.user.id);
    const used = rows.filter((r) => { try { return JSON.parse(r.blocks_json).some((b) => String(b.text || "").length > 40); } catch { return false; } });
    if (!used.length) return res.json({ docs: 0, fingerprint: null, trend: [], description: [] });
    const fp = fingerprint(joinDocs(used));
    const trend = used.slice().reverse().map((r) => { const f = fingerprint(joinDocs([r])); return { id: r.id, title: r.title, at: r.updated_at, avgSentence: f.sentence.avg, exclaim: f.punct.exclaimPer10, questions: f.questions.perStage, words: f.words }; });
    res.json({ docs: used.length, fingerprint: fp, description: describe(fp), trend });
  });

  // 420: ייצוא וייבוא טביעת סגנון
  app.get("/api/write/lab/profiles/:id/export", requireUser(), (req, res) => {
    const p = getProfile(req.user.id, Number(req.params.id));
    if (!p) return F(res, 404, "NOT_FOUND", "הפרופיל לא נמצא");
    res.json({ kind: "scout-style-profile", name: p.name, fingerprint: JSON.parse(p.fp_json), card: p.card });
  });
  app.post("/api/write/lab/profiles/import", requireUser(), lim, (req, res) => {
    const b = z.object({ kind: z.literal("scout-style-profile"), name: z.string().trim().min(1).max(40), fingerprint: fpZ, card: txt(3000) }).parse(req.body ?? {});
    if (profiles(req.user.id).length >= 10) return F(res, 409, "LIMIT", "אפשר לשמור עד 10 פרופילים.");
    const r = db.prepare("INSERT INTO style_profiles (user_id, name, fp_json, card, created_at) VALUES (?,?,?,?,?)").run(req.user.id, b.name, JSON.stringify(b.fingerprint), b.card, now());
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  // 421: השוואה בין שתי פעולות
  app.post("/api/write/lab/compare", requireUser(), lim, wrap((req, res) => {
    const b = z.object({ a: docZ, b: docZ }).parse(req.body ?? {});
    need(b.a); need(b.b);
    const fa = fingerprint(b.a), fb = fingerprint(b.b);
    res.json({ a: describe(fa), b: describe(fb), similarity: styleScore(fa, fb), fingerprints: { a: fa, b: fb } });
  }));
}
