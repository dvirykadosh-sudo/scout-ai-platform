// שלב 57 (470–502): עוזר שיחות. ניתוח שיחה עם חניך או עם שכבה, ניסוח תגובות, מעקבים ותוסף לדפדפן.
// עקרונות פרטיות: השיחה לא נשמרת לעולם. היא מוסתרת בזיכרון, מנותחת ונזרקת. נשמרים רק סיכומים בלי טקסט ובלי שמות, ל-30 יום.
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { aiPromptChat, checkReply, buildAnnouncement, groupMessages, outreachStarters, replySuggestions } from "./chat-reply.js";
import { ME, filterRange, maskMessages, parseChat, scrubPII } from "./chat-parse.js";
import { INTENT_LABEL, analyzeChat, classifyIntent, safetyAdvice, safetyScan, toneOf, HOTLINES } from "./chat-analyze.js";
import { cleanDict } from "./human-voice.js";
import { privacyScan } from "./story-build.js";
import { requireAiBudget } from "./ai-budget.js";

const MAX_SAVED = 40, MAX_FOLLOW = 100, MAX_TOKENS = 3, SAVED_DAYS = 30, TOKEN_DAYS = 60;
const nowIso = () => new Date().toISOString();
const sha = (t) => createHash("sha256").update(t).digest("hex");
const gender = z.enum(["m", "f", "n"]).default("n");
const msgIn = z.object({ who: z.string().max(60), ts: z.number().nullable().optional(), text: z.string().max(4000), kind: z.enum(["text", "media", "deleted"]).optional() });
const inputZ = z.object({
  text: z.string().max(2_500_000).optional(),
  messages: z.array(msgIn).max(6000).optional(),
  masked: z.boolean().default(false),
  me: z.string().max(60).default(""),
  extra: z.array(z.string().max(40)).max(12).default([]),
  mode: z.enum(["auto", "one", "group"]).default("auto"),
  lastDays: z.number().int().min(0).max(365).default(0),
  lastN: z.number().int().min(0).max(6000).default(0),
  kid: gender,
  guide: gender,
});

export function registerV57Routes(app, { db, limiter, fail, requireUser, audit, config }) {
  const lim = limiter(60_000, 90);
  const heavy = limiter(60_000, 15);
  const aiLim = limiter(60_000, 8);
  const F = (res, status, code, message) => res.status(status).json(fail(code, message));
  const me = () => requireUser();
  const todayIso = () => new Date().toISOString().slice(0, 10);

  const purge = () => {
    db.prepare("DELETE FROM chat_saved WHERE expires_at < ?").run(nowIso());
    db.prepare("DELETE FROM ext_tokens WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?").run(new Date(Date.now() - 90 * 86_400_000).toISOString(), new Date(Date.now() - 90 * 86_400_000).toISOString());
  };
  purge();

  const voiceOf = (uid) => { try { return cleanDict(JSON.parse(db.prepare("SELECT style_json FROM users WHERE id = ?").get(uid)?.style_json || "{}").voice); } catch { return { say: [], never: [] }; } };

  // ───── 498: הזדהות של התוסף. אסימון אישי שנשלח בכותרת, מוגבל לנתיבי עוזר השיחות בלבד ─────
  const chatAuth = (req, res, next) => {
    const raw = req.headers["x-maoz-ext"];
    if (raw === undefined) return me()(req, res, next);
    const bad = () => F(res, 401, "EXT_TOKEN", "האסימון של התוסף לא תקין או שפג תוקפו. צרו אסימון חדש באתר.");
    if (typeof raw !== "string" || !/^mx_[a-f0-9]{48}$/.test(raw)) return bad();
    const r = db.prepare("SELECT t.id, t.user_id, t.expires_at, t.revoked_at, t.last_used_at, u.username, u.role, u.disabled, u.expires_at AS uexp FROM ext_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?").get(sha(raw));
    if (!r || r.revoked_at || Date.parse(r.expires_at) < Date.now() || r.disabled || (r.uexp && Date.parse(r.uexp) < Date.now())) return bad();
    if (!r.last_used_at || Date.now() - Date.parse(r.last_used_at) > 60_000) db.prepare("UPDATE ext_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), r.id);
    req.user = { id: r.user_id, username: r.username, role: r.role, ext: true };
    next();
  };

  app.get("/api/chat/ping", chatAuth, lim, (req, res) => res.json({ ok: true, username: req.user.username, ext: !!req.user.ext }));

  // ───── 470–474: קליטה ופענוח ─────
  const parseInput = (b) => {
    if (b.messages?.length) {
      const messages = b.messages.map((m) => ({ who: m.who, ts: m.ts ?? null, text: m.text, kind: m.kind ?? "text" }));
      const counts = new Map();
      for (const m of messages) counts.set(m.who, (counts.get(m.who) || 0) + 1);
      return { format: "ext", messages, systemCount: 0, participants: [...counts].map(([name, count]) => ({ name, count })), from: null, to: null, truncated: false, warnings: [] };
    }
    if (typeof b.text === "string" && b.text.trim()) return parseChat(b.text);
    return null;
  };

  app.post("/api/chat/parse", chatAuth, heavy, (req, res) => {
    const b = inputZ.parse(req.body ?? {});
    const p = parseInput(b);
    if (!p) return F(res, 422, "NO_INPUT", "לא התקבל טקסט של שיחה.");
    res.json({ format: p.format, count: p.messages.length, systemCount: p.systemCount, participants: p.participants.slice(0, 40), from: p.from, to: p.to, truncated: p.truncated, warnings: p.warnings });
  });

  const runAnalysis = (req, b) => {
    const p = parseInput(b);
    if (!p) return null;
    const ranged = filterRange(p.messages, { lastDays: b.lastDays, lastN: b.lastN });
    const m = maskMessages(ranged, { me: b.me, extra: b.extra, already: b.masked });
    const meAlias = m.meAlias ?? ME;
    const a = analyzeChat(m.messages, { meAlias, mode: b.mode });
    return { p, m, a, meAlias };
  };

  // ───── 475–491: ניתוח מלא ─────
  app.post("/api/chat/analyze", chatAuth, heavy, (req, res) => {
    const b = inputZ.parse(req.body ?? {});
    const r = runAnalysis(req, b);
    if (!r) return F(res, 422, "NO_INPUT", "לא התקבל טקסט של שיחה.");
    const { p, m, a } = r;
    if (!m.messages.length) return F(res, 422, "EMPTY", "לא נמצאו הודעות לניתוח. ייצוא של וואטסאפ נראה כמו \"12.3.2025, 14:05 - שם: הודעה\".");
    const voice = voiceOf(req.user.id);
    let replies = null;
    if (a.safety.level === "urgent") replies = { suppressed: true, reason: "זוהו משפטים שדורשים טיפול מיידי. אנחנו לא מציעים תגובות רגילות. בחרו מהתגובות הבטוחות שלמטה.", safe: a.safety.advice.safeReplies };
    else if (a.pending) replies = replySuggestions({ intent: a.pending.intent.primary, text: a.pending.text, kid: b.kid, guide: b.guide, voice });
    audit(db, req.user.username, "chat.analyze", { mode: a.mode, messages: a.counts.messages, safety: a.safety.level, ext: !!req.user.ext });
    res.json({
      ...a,
      replies,
      parse: { format: p.format, from: p.from, to: p.to, warnings: p.warnings, truncated: p.truncated, systemCount: p.systemCount },
      // השמות המקוריים חוזרים רק למי ששלח אותם (בתוסף הם בכלל לא נשלחו), ולא נשמרים
      aliases: b.masked ? [] : m.aliases,
      scrubbed: m.scrubbed,
      intentLabels: INTENT_LABEL,
    });
  });

  // ───── 477, 481, 482: הודעה בודדת או כוונה שנבחרה ידנית ─────
  app.post("/api/chat/reply", chatAuth, lim, (req, res) => {
    const b = z.object({ message: z.string().max(2000).default(""), intent: z.string().max(20).default(""), name: z.string().max(30).default(""), kid: gender, guide: gender }).parse(req.body ?? {});
    const msg = scrubPII(b.message).text;
    const safety = msg ? safetyScan([{ who: "חניך", text: msg, kind: "text", ts: null }]) : { level: "none", cats: [], items: [], advice: null, hotlines: [] };
    const detected = msg ? classifyIntent(msg) : null;
    const intent = b.intent || detected?.primary || "general";
    const voice = voiceOf(req.user.id);
    const replies = safety.level === "urgent" ? { suppressed: true, reason: "זוהו משפטים שדורשים טיפול מיידי. אנחנו לא מציעים תגובות רגילות.", safe: safety.advice.safeReplies } : replySuggestions({ intent, text: msg, name: b.name, kid: b.kid, guide: b.guide, voice });
    res.json({ detected, tone: msg ? toneOf([{ text: msg, kind: "text" }]) : null, safety, replies, intentLabels: INTENT_LABEL });
  });

  // ───── 483: בדיקת תגובה לפני שליחה ─────
  app.post("/api/chat/check-reply", chatAuth, lim, (req, res) => {
    const b = z.object({ draft: z.string().max(3000), where: z.enum(["private", "group"]).default("private"), intent: z.string().max(20).default(""), hour: z.number().int().min(0).max(23).nullable().default(null), kid: gender }).parse(req.body ?? {});
    res.json(checkReply(b.draft, b));
  });

  // ───── 489, 490, 494: הודעות לשכבה ופתיחת שיחה ─────
  app.post("/api/chat/announce", chatAuth, lim, (req, res) => {
    const b = z.object({ title: z.string().max(80).default(""), date: z.string().max(40).default(""), time: z.string().max(20).default(""), end: z.string().max(40).default(""), place: z.string().max(100).default(""), bring: z.union([z.string().max(300), z.array(z.string().max(60)).max(12)]).default(""), contact: z.string().max(80).default(""), cost: z.string().max(80).default(""), rsvp: z.string().max(40).default(""), emoji: z.boolean().default(true) }).parse(req.body ?? {});
    res.json(buildAnnouncement(b));
  });
  app.get("/api/chat/group-messages", chatAuth, lim, (req, res) => res.json({ items: groupMessages() }));
  app.get("/api/chat/outreach", chatAuth, lim, (req, res) => {
    const q = z.object({ reason: z.string().max(20).default("absent"), name: z.string().max(30).default(""), kid: gender, guide: gender }).parse(req.query ?? {});
    res.json(outreachStarters(q.reason, q));
  });
  app.get("/api/chat/safety-info", chatAuth, lim, (req, res) => res.json({ advice: safetyAdvice("urgent"), hotlines: HOTLINES }));

  // ───── 472, 502: סיכומים שמורים בלי טקסט, ל-30 יום ─────
  const num = (x) => (Number.isFinite(x) ? x : null);
  const str = (x, n = 200) => scrubPII(String(x ?? "")).text.slice(0, n);
  const LEVELS = new Set(["urgent", "high", "normal", "low"]);
  const summarize = (a = {}) => ({
    mode: a.mode === "group" ? "group" : "one",
    counts: { messages: num(a.counts?.messages), speakers: num(a.counts?.speakers) },
    safety: { level: ["none", "attention", "urgent"].includes(a.safety?.level) ? a.safety.level : "none", cats: (Array.isArray(a.safety?.cats) ? a.safety.cats : []).slice(0, 10).map((c) => str(c, 20)) },
    intents: Object.fromEntries(Object.entries(a.intents && typeof a.intents === "object" ? a.intents : {}).slice(0, 12).map(([k, v]) => [str(k, 20), num(v)])),
    tone: (Array.isArray(a.tone?.top) ? a.tone.top : []).slice(0, 3).map((t) => ({ label: str(t?.label, 40), count: num(t?.count) })),
    rhythm: a.rhythm ? { myMedianMinutes: num(a.rhythm.myMedianMinutes), theirMedianMinutes: num(a.rhythm.theirMedianMinutes), answeredSameDay: num(a.rhythm.answeredSameDay), myNightShare: num(a.rhythm.myNightShare) } : null,
    fading: (Array.isArray(a.fading) ? a.fading : []).slice(0, 8).map((f) => ({ who: str(f?.who, 20), kind: f?.kind === "silent" ? "silent" : "drop", was: num(f?.was), now: num(f?.now) })),
    faq: (Array.isArray(a.faq) ? a.faq : []).slice(0, 5).map((f) => ({ label: str(f?.label, 40), count: num(f?.count) })),
    heat: a.heat ? { level: str(a.heat.level, 10), count: num(a.heat.count) } : null,
    plan: (Array.isArray(a.plan) ? a.plan : []).slice(0, 8).map((p) => ({ level: LEVELS.has(p?.level) ? p.level : "normal", text: str(p?.text), why: str(p?.why) })),
  });
  const savedRow = (r) => ({ id: r.id, title: r.title, mode: r.mode, createdAt: r.created_at, expiresAt: r.expires_at, summary: JSON.parse(r.summary_json) });
  app.get("/api/chat/saved", me(), lim, (req, res) => {
    purge();
    res.json({ items: db.prepare("SELECT * FROM chat_saved WHERE user_id = ? ORDER BY id DESC LIMIT 60").all(req.user.id).map(savedRow), days: SAVED_DAYS });
  });
  app.post("/api/chat/saved", me(), lim, (req, res) => {
    const b = z.object({ title: z.string().trim().min(1, "חסרה כותרת").max(60), analysis: z.record(z.string(), z.unknown()) }).parse(req.body ?? {});
    if (privacyScan(b.title).pii.length) return F(res, 422, "PII_FOUND", "בכותרת יש פרטים מזהים. כתבו כינוי, למשל \"שיחה עם חניך א'\".");
    purge();
    if (db.prepare("SELECT COUNT(*) AS c FROM chat_saved WHERE user_id = ?").get(req.user.id).c >= MAX_SAVED) return F(res, 409, "LIMIT", `אפשר לשמור עד ${MAX_SAVED} סיכומים. מחקו ישנים.`);
    const sum = summarize(b.analysis);
    const t = nowIso();
    const r = db.prepare("INSERT INTO chat_saved (user_id, title, mode, summary_json, created_at, expires_at) VALUES (?,?,?,?,?,?)").run(req.user.id, b.title, sum.mode, JSON.stringify(sum), t, new Date(Date.now() + SAVED_DAYS * 86_400_000).toISOString());
    audit(db, req.user.username, "chat.save", { id: Number(r.lastInsertRowid) });
    res.status(201).json(savedRow(db.prepare("SELECT * FROM chat_saved WHERE id = ?").get(r.lastInsertRowid)));
  });
  app.delete("/api/chat/saved/:id", me(), lim, (req, res) => {
    const r = db.prepare("DELETE FROM chat_saved WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return F(res, 404, "NOT_FOUND", "הסיכום לא נמצא");
    res.json({ ok: true });
  });

  // ───── 492, 493: מעקבים ─────
  const followRow = (r) => ({ id: r.id, alias: r.alias, note: r.note, due: r.due, done: !!r.done, overdue: !r.done && !!r.due && r.due < todayIso(), createdAt: r.created_at });
  const checkFollow = (alias, note) => {
    const pii = privacyScan(`${alias}\n${note}`).pii;
    if (pii.length) return { status: 422, code: "PII_FOUND", message: `יש בטקסט פרטים מזהים (${pii.map((p) => p.label).join(", ")}). כתבו כינוי, למשל "חניך א'".` };
    if (privacyScan(note).sensitive || safetyScan([{ who: "x", text: `${alias} ${note}`, kind: "text", ts: null }]).level !== "none") return { status: 422, code: "SENSITIVE", message: "לא שומרים כאן נושאים רגישים או מצוקה. אם יש חשש, דברו עם רכז/ת השבט. כאן כותבים רק משימה, כמו \"לשאול מה שלומו אחרי הפעולה\"." };
    return null;
  };
  const followIn = z.object({ alias: z.string().trim().min(1, "חסר כינוי").max(40), note: z.string().trim().max(140).default(""), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) });
  app.get("/api/chat/followups", me(), lim, (req, res) => {
    const rows = db.prepare("SELECT * FROM chat_followups WHERE user_id = ? ORDER BY done ASC, CASE WHEN due IS NULL THEN 1 ELSE 0 END, due ASC, id DESC LIMIT 200").all(req.user.id).map(followRow);
    res.json({ items: rows, overdue: rows.filter((r) => r.overdue).length });
  });
  app.post("/api/chat/followups", me(), lim, (req, res) => {
    const b = followIn.parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM chat_followups WHERE user_id = ?").get(req.user.id).c >= MAX_FOLLOW) return F(res, 409, "LIMIT", `אפשר עד ${MAX_FOLLOW} מעקבים. סגרו ישנים.`);
    const c = checkFollow(b.alias, b.note);
    if (c) return F(res, c.status, c.code, c.message);
    const r = db.prepare("INSERT INTO chat_followups (user_id, alias, note, due, created_at) VALUES (?,?,?,?,?)").run(req.user.id, b.alias, b.note, b.due, nowIso());
    res.status(201).json(followRow(db.prepare("SELECT * FROM chat_followups WHERE id = ?").get(r.lastInsertRowid)));
  });
  app.patch("/api/chat/followups/:id", me(), lim, (req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare("SELECT * FROM chat_followups WHERE id = ? AND user_id = ?").get(id, req.user.id);
    if (!cur) return F(res, 404, "NOT_FOUND", "המעקב לא נמצא");
    const b = followIn.partial().extend({ done: z.boolean().optional() }).parse(req.body ?? {});
    const next = { alias: b.alias ?? cur.alias, note: b.note ?? cur.note, due: b.due === undefined ? cur.due : b.due, done: b.done === undefined ? cur.done : b.done ? 1 : 0 };
    const c = checkFollow(next.alias, next.note);
    if (c) return F(res, c.status, c.code, c.message);
    db.prepare("UPDATE chat_followups SET alias = ?, note = ?, due = ?, done = ? WHERE id = ?").run(next.alias, next.note, next.due, next.done, id);
    res.json(followRow(db.prepare("SELECT * FROM chat_followups WHERE id = ?").get(id)));
  });
  app.delete("/api/chat/followups/:id", me(), lim, (req, res) => {
    const r = db.prepare("DELETE FROM chat_followups WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return F(res, 404, "NOT_FOUND", "המעקב לא נמצא");
    res.json({ ok: true });
  });

  // ───── 498: אסימוני תוסף (נוצרים רק מתוך האתר, לא מתוך התוסף) ─────
  const tokRow = (r) => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at, expiresAt: r.expires_at, revoked: !!r.revoked_at, active: !r.revoked_at && Date.parse(r.expires_at) > Date.now() });
  app.get("/api/chat/tokens", me(), lim, (req, res) => {
    res.json({ items: db.prepare("SELECT * FROM ext_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 20").all(req.user.id).map(tokRow), days: TOKEN_DAYS, max: MAX_TOKENS });
  });
  app.post("/api/chat/tokens", me(), limiter(60 * 60_000, 10), (req, res) => {
    const b = z.object({ label: z.string().trim().max(40).default("") }).parse(req.body ?? {});
    const active = db.prepare("SELECT COUNT(*) AS c FROM ext_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?").get(req.user.id, nowIso()).c;
    if (active >= MAX_TOKENS) return F(res, 409, "LIMIT", `יש כבר ${MAX_TOKENS} אסימונים פעילים. בטלו אחד כדי ליצור חדש.`);
    const token = `mx_${randomBytes(24).toString("hex")}`;
    const t = nowIso();
    const r = db.prepare("INSERT INTO ext_tokens (user_id, label, token_hash, created_at, expires_at) VALUES (?,?,?,?,?)").run(req.user.id, b.label || "המחשב שלי", sha(token), t, new Date(Date.now() + TOKEN_DAYS * 86_400_000).toISOString());
    audit(db, req.user.username, "chat.token.create", { id: Number(r.lastInsertRowid) });
    res.status(201).json({ ...tokRow(db.prepare("SELECT * FROM ext_tokens WHERE id = ?").get(r.lastInsertRowid)), token, note: "האסימון מוצג פעם אחת בלבד. העתיקו אותו עכשיו לתוסף." });
  });
  app.delete("/api/chat/tokens/:id", me(), lim, (req, res) => {
    const r = db.prepare("UPDATE ext_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL").run(nowIso(), Number(req.params.id), req.user.id);
    if (!r.changes) return F(res, 404, "NOT_FOUND", "האסימון לא נמצא");
    audit(db, req.user.username, "chat.token.revoke", { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  // ───── 481: ניסוח עם מודל. רק שיחה מוסתרת, רק בלי סימני מצוקה, ורק אחרי אישור מפורש ─────
  app.post("/api/chat/ai", chatAuth, aiLim, async (req, res) => {
    const b = inputZ.extend({ confirmExternal: z.boolean().default(false), goal: z.string().max(120).default("") }).parse(req.body ?? {});
    const r = runAnalysis(req, b);
    if (!r || !r.m.messages.length) return F(res, 422, "NO_INPUT", "לא התקבל טקסט של שיחה.");
    if (r.a.safety.level !== "none") return F(res, 409, "SAFETY_NO_AI", "בשיחה יש סימני מצוקה או חשש. לא שולחים אותה לשירות חיצוני. עיינו בהמלצות בניתוח ופנו לרכז/ת השבט.");
    const recent = r.m.messages.filter((m) => m.kind === "text").slice(-20).map((m) => ({ who: m.who, text: m.text.slice(0, 300) }));
    const p = aiPromptChat({ messages: recent, goal: b.goal, kid: b.kid, guide: b.guide, voice: voiceOf(req.user.id) });
    const prompt = `${p.system}\n\n---\n${p.user}`;
    if (!config.ai?.key) return res.json({ mode: "prompt", prompt, note: "אין מפתח AI באתר. ההנחיה כבר מוסתרת משמות ופרטים. אפשר להעתיק אותה לצ'אט שאתם משתמשים בו, ולבדוק את התשובה." });
    if (!b.confirmExternal) return F(res, 428, "CONFIRM_REQUIRED", "הניסוח ישלח את ההודעות האחרונות (מוסתרות משמות ופרטים) לשירות AI חיצוני. אשרו כדי להמשיך.");
    try {
      requireAiBudget();
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": config.ai.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: config.ai.model, max_tokens: 900, system: p.system, messages: [{ role: "user", content: p.user }] }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!resp.ok) throw new Error(`AI HTTP ${resp.status}`);
      const out = (await resp.json())?.content?.[0]?.text || "";
      const parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
      const kept = [], dropped = [];
      for (const x of (Array.isArray(parsed.replies) ? parsed.replies : []).slice(0, 4)) {
        const text = String(x?.text || "").trim().slice(0, 600);
        if (text.length < 3) continue;
        const chk = checkReply(text, { where: "private", intent: r.a.pending?.intent?.primary || "" });
        const red = chk.items.filter((i) => i.level === "red" || i.level === "warn");
        if (red.length) dropped.push({ text, why: red.map((i) => i.text) });
        else kept.push({ label: String(x?.label || "הצעה").slice(0, 30), text, flags: chk.items.map((i) => i.text) });
      }
      if (!kept.length) throw new Error("no usable replies");
      audit(db, req.user.username, "chat.ai", { kept: kept.length, dropped: dropped.length });
      res.json({ mode: "ai", replies: kept, droppedCount: dropped.length, note: "אלה טיוטות. קראו, תקנו ושלחו בעצמכם. ההצעות שנפסלו בבדיקת הניסוח הוסרו." });
    } catch {
      res.json({ mode: "prompt", prompt, note: "הקריאה למודל נכשלה. אפשר להעתיק את ההנחיה לצ'אט." });
    }
  });
}
