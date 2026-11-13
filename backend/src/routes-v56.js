// שלב 56 (453–469): סטודיו סיפור אישי. כתיבה אנושית, ספריית זיכרונות, מילון אישי, ליטוש קול וחיבור הסיפור לפעולה.
import { z } from "zod";
import { getActivity, updateActivity } from "./activities.js";
import { DEFAULT_STYLE, styleGuide, styleSchema } from "./style.js";
import { cleanDict, cleanTranscript, detailGaps, dictCheck, findCliches, fixCliches, humanScore, readAloudCheck, shiftRegister, stageDirections, suggestSay, wordDiff } from "./human-voice.js";
import { aiPrompt, ageVersions, allMoments, buildStory, closings, inventionCheck, maskNames, momentsFor, openings, privacyScan, valueFor } from "./story-build.js";
import { requireAiBudget } from "./ai-budget.js";

const txt = (n) => z.string().max(n).default("");
const partsZ = z.object({ situation: txt(1500), turn: txt(1500), feeling: txt(800), learning: txt(800), place: txt(80), person: txt(80), want: txt(300), value: txt(60) }).default({});
const MAX_MEM = 300, MAX_STORY = 100, MAX_VERSIONS = 25, MAX_STAGE = 3000;
const nowIso = () => new Date().toISOString();

export function registerV56Routes(app, { db, limiter, fail, requireUser, canManage, forbidden, saveVersion, audit, config }) {
  const lim = limiter(60_000, 90);
  const aiLim = limiter(60_000, 12);
  const F = (res, status, code, message) => res.status(status).json(fail(code, message));
  const me = () => requireUser();

  const readStyleJson = (uid) => { try { return JSON.parse(db.prepare("SELECT style_json FROM users WHERE id = ?").get(uid)?.style_json || "{}"); } catch { return {}; } };
  const voiceOf = (uid) => cleanDict(readStyleJson(uid).voice);
  const styleOf = (uid) => { try { return styleSchema.parse(readStyleJson(uid)); } catch { return DEFAULT_STYLE; } };

  // ───── 466: המילים שלי ─────
  app.get("/api/story/dict", me(), lim, (req, res) => res.json(voiceOf(req.user.id)));
  app.put("/api/story/dict", me(), lim, (req, res) => {
    const b = z.object({ say: z.array(z.string()).max(60).default([]), never: z.array(z.string()).max(60).default([]) }).parse(req.body ?? {});
    const voice = cleanDict(b);
    const next = { ...readStyleJson(req.user.id), voice };
    db.prepare("UPDATE users SET style_json = ? WHERE id = ?").run(JSON.stringify(next), req.user.id);
    res.json(voice);
  });

  // ───── 464, 457, 458, 463, 466: ניתוח מלא של טקסט ─────
  app.post("/api/story/analyze", me(), lim, (req, res) => {
    const b = z.object({ text: z.string().max(12000) }).parse(req.body ?? {});
    const dict = voiceOf(req.user.id);
    const hasDict = dict.say.length || dict.never.length;
    res.json({
      score: humanScore(b.text, hasDict ? dict : undefined),
      cliches: findCliches(b.text),
      gaps: detailGaps(b.text),
      read: readAloudCheck(b.text),
      dict: hasDict ? dictCheck(b.text, dict) : { ...dictCheck(b.text, {}), sayHits: [], neverHits: [] },
      suggestSay: suggestSay(b.text),
    });
  });

  // ───── 455, 456, 457, 462: כלי טקסט ─────
  const textIn = z.object({ text: z.string().min(1).max(12000) });
  app.post("/api/story/voice-clean", me(), lim, (req, res) => res.json(cleanTranscript(textIn.parse(req.body ?? {}).text)));
  app.post("/api/story/register", me(), lim, (req, res) => {
    const b = textIn.extend({ level: z.number().int().min(0).max(2).default(2) }).parse(req.body ?? {});
    res.json(shiftRegister(b.text, b.level));
  });
  app.post("/api/story/fix-cliches", me(), lim, (req, res) => res.json(fixCliches(textIn.parse(req.body ?? {}).text)));
  app.post("/api/story/directions", me(), lim, (req, res) => res.json(stageDirections(textIn.parse(req.body ?? {}).text)));
  app.post("/api/story/ages", me(), lim, (req, res) => res.json(ageVersions(textIn.parse(req.body ?? {}).text)));
  app.post("/api/story/diff", me(), lim, (req, res) => {
    const b = z.object({ a: z.string().max(8000).default(""), b: z.string().max(8000).default("") }).parse(req.body ?? {});
    res.json(wordDiff(b.a, b.b));
  });

  // ───── 453, 459, 468, 469: בניית סיפור ─────
  app.post("/api/story/build", me(), lim, (req, res) => {
    const p = partsZ.parse(req.body ?? {});
    const built = buildStory(p);
    res.json({ ...built, openings: openings(p).options, closings: closings(p).options, moment: momentsFor(p.value) });
  });
  app.get("/api/story/moments", me(), lim, (req, res) => {
    const v = typeof req.query.value === "string" ? req.query.value : "";
    if (!v) return res.json({ values: allMoments() });
    const m = momentsFor(v);
    if (!m) return F(res, 404, "NOT_FOUND", "הערך לא נמצא");
    const rows = db.prepare("SELECT id, title, kind, value FROM story_memories WHERE user_id = ? ORDER BY id DESC LIMIT 200").all(req.user.id);
    const mine = rows.filter((r) => { const x = valueFor(r.value || ""); return x && x.id === m.id; }).slice(0, 8).map((r) => ({ id: r.id, title: r.title, kind: r.kind }));
    res.json({ ...m, memories: mine });
  });

  // ───── 454, 467: ספריית זיכרונות וציטוטי חניכים ─────
  const memIn = z.object({
    kind: z.enum(["memory", "quote"]).default("memory"),
    title: z.string().trim().min(1, "חסרה כותרת").max(80),
    body: z.string().trim().min(5, "הטקסט קצר מדי").max(2000),
    value: txt(60),
    tags: z.array(z.string().trim().max(30)).max(8).default([]),
    place: txt(80),
    year: z.number().int().min(1950).max(2100).nullable().default(null),
    consent: z.enum(["self", "anonymous", "approved"]).default("self"),
    maskNames: z.array(z.string().max(40)).max(8).default([]),
  });
  const memRow = (r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, value: r.value, tags: JSON.parse(r.tags || "[]"), place: r.place, year: r.year, consent: r.consent, createdAt: r.created_at, updatedAt: r.updated_at });
  const checkMemory = (b) => {
    if (b.kind === "quote" && b.consent === "self") return { status: 422, code: "CONSENT_REQUIRED", message: "ציטוט של חניך נשמר רק בעילום שם מלא, או אחרי שקיבלתם אישור מהחניך ומההורים. בחרו אחת מהאפשרויות." };
    const masked = maskNames(b.body, b.maskNames);
    const title = maskNames(b.title, b.maskNames).text;
    const scan = privacyScan(`${title}\n${masked.text}`);
    if (scan.pii.length) return { status: 422, code: "PII_FOUND", message: `יש בטקסט פרטים מזהים (${scan.pii.map((p) => p.label).join(", ")}). מחקו אותם לפני השמירה.` };
    if (b.kind === "quote" && scan.sensitive) return { status: 422, code: "SENSITIVE", message: "הציטוט נוגע בנושא רגיש על חניך. לא שומרים אותו כאן. אם זה מדאיג אתכם, דברו עם גורם מקצועי בשבט." };
    return { masked, title, warnings: scan.sensitive ? [`הטקסט נוגע בנושא רגיש ("${scan.sensitive}"). וודאו שאתם רוצים לספר את זה, ושזה לא מזהה אדם אחר.`] : [] };
  };
  app.get("/api/story/memories", me(), lim, (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const kind = req.query.kind === "quote" || req.query.kind === "memory" ? req.query.kind : "";
    const rows = db.prepare("SELECT * FROM story_memories WHERE user_id = ? ORDER BY id DESC LIMIT 400").all(req.user.id).map(memRow);
    const v = typeof req.query.value === "string" && req.query.value ? valueFor(req.query.value) : null;
    res.json(rows.filter((r) => (!kind || r.kind === kind) && (!q || `${r.title} ${r.body} ${r.tags.join(" ")}`.includes(q)) && (!v || valueFor(r.value)?.id === v.id)));
  });
  app.post("/api/story/memories", me(), lim, (req, res) => {
    const b = memIn.parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM story_memories WHERE user_id = ?").get(req.user.id).c >= MAX_MEM) return F(res, 409, "LIMIT", `אפשר לשמור עד ${MAX_MEM} זיכרונות. מחקו ישנים.`);
    const c = checkMemory(b);
    if (c.status) return F(res, c.status, c.code, c.message);
    const t = nowIso();
    const r = db.prepare("INSERT INTO story_memories (user_id, kind, title, body, value, tags, place, year, consent, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(req.user.id, b.kind, c.title, c.masked.text, b.value, JSON.stringify(b.tags), b.place, b.year, b.kind === "quote" ? b.consent : "self", t, t);
    res.status(201).json({ ...memRow(db.prepare("SELECT * FROM story_memories WHERE id = ?").get(r.lastInsertRowid)), warnings: c.warnings, masked: c.masked.map });
  });
  app.put("/api/story/memories/:id", me(), lim, (req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare("SELECT * FROM story_memories WHERE id = ? AND user_id = ?").get(id, req.user.id);
    if (!cur) return F(res, 404, "NOT_FOUND", "הזיכרון לא נמצא");
    const b = memIn.parse({ kind: cur.kind, ...req.body });
    const c = checkMemory(b);
    if (c.status) return F(res, c.status, c.code, c.message);
    db.prepare("UPDATE story_memories SET title=?, body=?, value=?, tags=?, place=?, year=?, consent=?, updated_at=? WHERE id=?")
      .run(c.title, c.masked.text, b.value, JSON.stringify(b.tags), b.place, b.year, cur.kind === "quote" ? b.consent : "self", nowIso(), id);
    res.json({ ...memRow(db.prepare("SELECT * FROM story_memories WHERE id = ?").get(id)), warnings: c.warnings });
  });
  app.delete("/api/story/memories/:id", me(), lim, (req, res) => {
    const r = db.prepare("DELETE FROM story_memories WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return F(res, 404, "NOT_FOUND", "הזיכרון לא נמצא");
    res.status(204).end();
  });

  // ───── 453, 465: הסיפורים שלי, עם גרסאות ─────
  const storyIn = z.object({
    title: z.string().trim().min(1, "חסרה כותרת").max(120),
    value: txt(60),
    age: txt(60),
    parts: partsZ,
    body: txt(8000),
    opening: txt(1500),
    closing: txt(1500),
    versionLabel: txt(40),
    approved: z.boolean().optional(),
    confirm: z.boolean().optional(),
  });
  const storyRow = (r, full = false) => {
    const base = { id: r.id, title: r.title, value: r.value, age: r.age, approved: !!r.approved, words: r.body.split(/\s+/).filter(Boolean).length, updatedAt: r.updated_at, createdAt: r.created_at };
    if (!full) return { ...base, preview: r.body.slice(0, 120) };
    return { ...base, parts: JSON.parse(r.parts_json || "{}"), body: r.body, opening: r.opening, closing: r.closing, versions: JSON.parse(r.versions_json || "[]") };
  };
  const mine = (uid, id) => db.prepare("SELECT * FROM my_stories WHERE id = ? AND user_id = ?").get(id, uid);
  app.get("/api/story/stories", me(), lim, (req, res) => res.json(db.prepare("SELECT * FROM my_stories WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200").all(req.user.id).map((r) => storyRow(r))));
  app.get("/api/story/stories/:id", me(), lim, (req, res) => {
    const r = mine(req.user.id, Number(req.params.id));
    if (!r) return F(res, 404, "NOT_FOUND", "הסיפור לא נמצא");
    res.json(storyRow(r, true));
  });
  app.post("/api/story/stories", me(), lim, (req, res) => {
    const b = storyIn.parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM my_stories WHERE user_id = ?").get(req.user.id).c >= MAX_STORY) return F(res, 409, "LIMIT", `אפשר לשמור עד ${MAX_STORY} סיפורים.`);
    const t = nowIso();
    const versions = b.body ? [{ at: t, label: b.versionLabel || "גרסה ראשונה", text: b.body }] : [];
    const r = db.prepare("INSERT INTO my_stories (user_id, title, value, age, parts_json, body, opening, closing, approved, versions_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,0,?,?,?)")
      .run(req.user.id, b.title, b.value, b.age, JSON.stringify(b.parts), b.body, b.opening, b.closing, JSON.stringify(versions), t, t);
    res.status(201).json(storyRow(mine(req.user.id, Number(r.lastInsertRowid)), true));
  });
  app.put("/api/story/stories/:id", me(), lim, (req, res) => {
    const id = Number(req.params.id);
    const cur = mine(req.user.id, id);
    if (!cur) return F(res, 404, "NOT_FOUND", "הסיפור לא נמצא");
    const b = storyIn.parse(req.body ?? {});
    const t = nowIso();
    const versions = JSON.parse(cur.versions_json || "[]");
    const changed = b.body !== cur.body || b.opening !== cur.opening || b.closing !== cur.closing;
    if (b.body && b.body !== cur.body) { versions.push({ at: t, label: b.versionLabel || `גרסה ${versions.length + 1}`, text: b.body }); while (versions.length > MAX_VERSIONS) versions.shift(); }
    // אישור: מפורש בלבד, ונשלל בכל שינוי בטקסט
    let approved = changed ? 0 : cur.approved;
    if (b.approved === true) {
      if (!b.confirm) return F(res, 422, "CONFIRM_REQUIRED", "כדי לאשר צריך לסמן שקראתם את הסיפור בקול ושהוא נשמע כמוכם.");
      if (b.body.split(/\s+/).filter(Boolean).length < 15) return F(res, 422, "TOO_SHORT", "הסיפור קצר מדי לאישור (פחות מ-15 מילים).");
      approved = 1;
    } else if (b.approved === false) approved = 0;
    db.prepare("UPDATE my_stories SET title=?, value=?, age=?, parts_json=?, body=?, opening=?, closing=?, approved=?, versions_json=?, updated_at=? WHERE id=?")
      .run(b.title, b.value, b.age, JSON.stringify(b.parts), b.body, b.opening, b.closing, approved, JSON.stringify(versions), t, id);
    res.json(storyRow(mine(req.user.id, id), true));
  });
  app.delete("/api/story/stories/:id", me(), lim, (req, res) => {
    const r = db.prepare("DELETE FROM my_stories WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return F(res, 404, "NOT_FOUND", "הסיפור לא נמצא");
    res.status(204).end();
  });

  // ───── 453: סיפורים מתאימים לפעולה, והוספה לפעולה ─────
  app.get("/api/story/suggest", me(), lim, (req, res) => {
    const a = getActivity(db, Number(req.query.activityId));
    if (!a) return F(res, 404, "NOT_FOUND", "הפעולה לא נמצאה");
    const v = valueFor(a.leadingValue);
    const rows = db.prepare("SELECT * FROM my_stories WHERE user_id = ? AND approved = 1 ORDER BY updated_at DESC LIMIT 100").all(req.user.id);
    const score = (r) => (v && valueFor(r.value)?.id === v.id ? 2 : 0) + (r.age && a.ageGroup && a.ageGroup.includes(r.age) ? 1 : 0);
    const list = rows.map((r) => ({ ...storyRow(r), match: score(r), hasOpening: !!r.opening, hasClosing: !!r.closing })).sort((x, y) => y.match - x.match).slice(0, 12);
    res.json({ value: v ? { id: v.id, label: v.label } : null, stories: list, total: db.prepare("SELECT COUNT(*) AS c FROM my_stories WHERE user_id = ?").get(req.user.id).c });
  });
  app.post("/api/activities/:id/add-my-story", me(), lim, (req, res) => {
    const id = Number(req.params.id);
    const a = getActivity(db, id, { includeArchived: true });
    if (!a) return F(res, 404, "NOT_FOUND", "הפעולה לא נמצאה");
    if (!canManage(req.user, a)) return forbidden(res);
    const b = z.object({ storyId: z.number().int(), mode: z.enum(["bookend", "full"]).default("bookend"), stage: z.number().int().min(0).max(4).default(0) }).parse(req.body ?? {});
    const s = mine(req.user.id, b.storyId);
    if (!s) return F(res, 404, "NOT_FOUND", "הסיפור לא נמצא");
    if (!s.approved) return F(res, 422, "NOT_APPROVED", "אפשר להוסיף לפעולה רק סיפור שאישרתם (אחרי קריאה בקול).");
    const stages = a.stages.map((x) => ({ ...x }));
    const last = stages.length - 1;
    const put = (idx, fn) => { stages[idx].content = fn(stages[idx].content); return stages[idx].content.length <= MAX_STAGE; };
    let ok = true;
    if (b.mode === "bookend") {
      if (!s.opening && !s.closing) return F(res, 422, "NO_PARTS", "בסיפור הזה לא נשמרו פתיחה וסיום. בחרו אותם בסטודיו, או הוסיפו את הסיפור במלואו.");
      if (s.opening) ok = put(0, (c) => `פתיחה אישית (${s.title}): ${s.opening}\n${c}`) && ok;
      if (s.closing) ok = put(last, (c) => `${c}\nסיום אישי: ${s.closing}`) && ok;
    } else ok = put(Math.min(b.stage, last), (c) => `${c}\nהסיפור שלי (${s.title}): ${s.body}`);
    if (!ok) return F(res, 422, "TOO_LONG", `השלב ארוך מדי להוספה (מעל ${MAX_STAGE} תווים). קצרו את הסיפור, או בחרו שלב אחר.`);
    saveVersion(id, a, req.user.username, "לפני הוספת סיפור אישי");
    updateActivity(db, id, { ...a, stages });
    audit(db, req.user.username, "activity.addMyStory", { id, story: s.id, mode: b.mode });
    res.json(getActivity(db, id, { includeArchived: true }));
  });

  // ───── 453: ליטוש עם מודל, או הנחיה להעתקה לצ'אט ─────
  app.post("/api/story/ai", me(), aiLim, async (req, res) => {
    const b = z.object({ text: z.string().min(40, "הסיפור קצר מדי לליטוש").max(6000), goal: z.enum(["polish", "shorter", "young", "older"]).default("polish"), age: txt(60), value: txt(60) }).parse(req.body ?? {});
    const p = aiPrompt({ ...b, dict: voiceOf(req.user.id), styleGuide: styleGuide(styleOf(req.user.id)) });
    const prompt = `${p.system}\n\n---\n${p.user}`;
    if (!config.ai?.key) return res.json({ mode: "prompt", prompt, note: "אין מפתח AI באתר. העתיקו את ההנחיה לצ'אט שאתם משתמשים בו, והדביקו את התוצאה בחזרה. בדקו שלא נוספו פרטים." });
    try {
      requireAiBudget();
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": config.ai.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: config.ai.model, max_tokens: 1800, system: p.system, messages: [{ role: "user", content: p.user }] }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!r.ok) throw new Error(`AI HTTP ${r.status}`);
      const out = (await r.json())?.content?.[0]?.text || "";
      const parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
      const text = String(parsed.text || "").trim();
      if (text.length < 20) throw new Error("empty");
      const chk = inventionCheck(b.text, text);
      res.json({ mode: "ai", text, changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 8).map((x) => String(x).slice(0, 200)) : [], warnings: chk.warnings, note: "המודל כתב מחדש. קראו בקול ותקנו כל מה שלא נשמע כמוכם." });
    } catch {
      res.json({ mode: "prompt", prompt, note: "הקריאה למודל נכשלה. אפשר להעתיק את ההנחיה לצ'אט." });
    }
  });
}
