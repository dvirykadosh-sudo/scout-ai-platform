import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";
import { apportion, buildExternalPrompt, generateActivity, normalizeDraft, parseExternal } from "./ai.js";
import { analyzeSample, extractText } from "./style.js";
import { getActivity, insertActivity, rowToActivity, searchActivities, updateActivity } from "./activities.js";
import { checkLock, clearFailures, hashPassword, optionalAuth, optionalUser, registerFailure, requireAdmin, requireUser, signToken, verifyPassword } from "./auth.js";
import { BACKUP_NAME, backupDirFor, createBackup, listBackups } from "./backup.js";
import { styleSchema } from "./style.js";
import { config } from "./config.js";
import { audit, nowIso } from "./db.js";
import { buildDocx } from "./docx.js";
import { activityEmailHtml } from "./email.js";
import { AGE_GROUPS, GRADES, GENDER_GROUPS, METHODS, ROLES, STAGE_LAYERS, STAGE_NAMES, MIDOT } from "./shared/constants.js";
import { adminUserPatchSchema, changePwSchema, duplicateSchema, generateSchema, importSchema, listQuerySchema, loginSchema, ratingSchema, registerSchema, stagesSchema, updateSchema } from "./validate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fail = (code, message, fields) => ({ error: { code, message, ...(fields ? { fields } : {}) } });

export function createApp({ db, mailer, serveStatic = true, dbFile = config.dbPath }) {
  const app = express();
  app.disable("x-powered-by");
  // behind a hosting proxy (Render, Fly...) req.ip must be the visitor, not the proxy
  if (config.isProd) app.set("trust proxy", 1);
  // strict headers for the API; pages (Next.js) need inline scripts, so no CSP there
  const apiHelmet = helmet();
  const pageHelmet = helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false });
  app.use((req, res, next) => (req.path.startsWith("/api") ? apiHelmet(req, res, next) : pageHelmet(req, res, next)));
  app.use(cors({ origin: config.webOrigin }));
  app.use(express.json({ limit: "200kb" }));

  const limiter = (windowMs, limit) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => config.nodeEnv === "test",
      handler: (req, res) => res.status(429).json(fail("RATE_LIMIT", "יותר מדי בקשות. נסו שוב בעוד כמה דקות")),
    });

  // ── session tracking (for the admin dashboard) ──
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") && req.path !== "/api/health") {
      const ua = String(req.headers["user-agent"] || "").slice(0, 200);
      const key = crypto.createHash("sha1").update(`${req.ip}|${ua}`).digest("hex");
      const t = nowIso();
      db.prepare(
        `INSERT INTO sessions (key, ip, user_agent, first_seen, last_seen, username) VALUES (?,?,?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET last_seen=excluded.last_seen, username=COALESCE(excluded.username, sessions.username)`,
      ).run(key, req.ip || "", ua, t, t, optionalUser(req));
    }
    next();
  });

  if (serveStatic) app.use(express.static(path.join(here, "..", "public")));

  const signupOpen = () => !!config.signupCode || !config.isProd;
  const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, role: u.role, mustChangePw: !!u.must_change_pw });

  // ── public: meta ──
  app.get("/api/health", (req, res) => res.json({ ok: true, time: nowIso() }));
  app.get("/api/methods", (req, res) => res.json(METHODS));
  app.get("/api/meta", (req, res) =>
    res.json({ ageGroups: AGE_GROUPS, grades: GRADES, genderGroups: GENDER_GROUPS, roles: ROLES, stageNames: STAGE_NAMES, stageLayers: STAGE_LAYERS, midot: MIDOT, aiEnabled: !!config.ai.key, signupOpen: signupOpen(), signupNeedsCode: !!config.signupCode }),
  );

  // ── auth ──
  app.post("/api/auth/login", limiter(15 * 60_000, 30), async (req, res) => {
    const { username, password } = loginSchema.parse(req.body ?? {});
    const key = `${username.toLowerCase()}|${req.ip}`;
    const locked = checkLock(db, key);
    if (locked) {
      audit(db, username, "login.locked", { ip: req.ip });
      return res.status(429).json(fail("LOCKED", `יותר מדי ניסיונות כושלים. נסו שוב בעוד ${locked} דקות`));
    }
    const user = db.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(username);
    const ok = await verifyPassword(password, user?.password_hash);
    if (!user || !ok || user.disabled) {
      registerFailure(db, key);
      audit(db, username, "login.fail", { ip: req.ip });
      return res.status(401).json(fail("BAD_CREDENTIALS", "שם משתמש או סיסמה שגויים"));
    }
    clearFailures(db, key);
    audit(db, username, "login.success", { ip: req.ip });
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  app.post("/api/auth/register", limiter(60 * 60_000, 10), async (req, res) => {
    if (!signupOpen()) return res.status(403).json(fail("SIGNUP_CLOSED", "ההרשמה סגורה. פנו למנהל המערכת שייצור לכם משתמש"));
    const v = registerSchema.parse(req.body ?? {});
    if (config.signupCode && v.signupCode !== config.signupCode) {
      audit(db, v.username, "register.badcode", { ip: req.ip });
      return res.status(403).json(fail("BAD_CODE", "קוד ההרשמה שגוי. בקשו אותו ממנהל השבט"));
    }
    if (db.prepare("SELECT 1 FROM users WHERE lower(username) = lower(?)").get(v.username)) {
      return res.status(409).json(fail("USERNAME_TAKEN", "שם המשתמש תפוס. בחרו שם אחר"));
    }
    const r = db
      .prepare("INSERT INTO users (username, password_hash, role, must_change_pw, created_at, display_name) VALUES (?,?,?,?,?,?)")
      .run(v.username, await hashPassword(v.password), "INSTRUCTOR", 0, nowIso(), v.displayName);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(r.lastInsertRowid));
    audit(db, user.username, "register", { ip: req.ip });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  });

  app.get("/api/auth/me", requireUser({ allowMustChange: true }), (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!u || u.disabled) return res.status(401).json(fail("UNAUTHORIZED", "החשבון אינו פעיל"));
    res.json({ user: publicUser(u) });
  });

  // ── my account: own activities + saved writing style ──
  app.get("/api/me/activities", requireUser(), (req, res) => {
    const rows = db.prepare("SELECT * FROM activities WHERE owner_id = ? ORDER BY created_at DESC, id DESC LIMIT 200").all(req.user.id);
    res.json(rows.map(rowToActivity));
  });
  app.get("/api/me/style", requireUser(), (req, res) => {
    const u = db.prepare("SELECT style_json FROM users WHERE id = ?").get(req.user.id);
    res.json({ style: u?.style_json ? JSON.parse(u.style_json) : null });
  });
  app.put("/api/me/style", requireUser(), (req, res) => {
    const style = styleSchema.parse(req.body?.style ?? undefined);
    db.prepare("UPDATE users SET style_json = ? WHERE id = ?").run(JSON.stringify(style), req.user.id);
    res.json({ style });
  });

  app.post("/api/auth/change-password", requireUser({ allowMustChange: true }), async (req, res) => {
    const { currentPassword, newPassword } = changePwSchema.parse(req.body ?? {});
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      return res.status(400).json(fail("BAD_PASSWORD", "הסיסמה הנוכחית שגויה"));
    }
    db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?").run(await hashPassword(newPassword), user.id);
    audit(db, user.username, "password.changed");
    res.json({ token: signToken({ ...user, must_change_pw: 0 }) });
  });

  // ── activities: public read ──
  app.get("/api/activities", (req, res) => {
    const f = listQuerySchema.parse(req.query);
    res.json(searchActivities(db, f));
  });

  app.get("/api/activities/:id", (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    res.json({ ...a, rating: ratingSummary(a.id) });
  });

  app.get("/api/activities/:id/export/docx", async (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    const buf = await buildDocx(a);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="activity-${a.id}.docx"; filename*=UTF-8''${encodeURIComponent(a.title)}.docx`);
    res.send(buf);
  });

  // ── ratings ──
  const ratingSummary = (id) => {
    const r = db.prepare("SELECT COUNT(*) AS count, AVG(stars) AS avg FROM ratings WHERE activity_id = ?").get(id);
    return { count: r.count, average: r.count ? Math.round(r.avg * 10) / 10 : 0 };
  };

  app.get("/api/activities/:id/ratings", (req, res) => {
    const id = Number(req.params.id);
    if (!getActivity(db, id)) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    const items = db
      .prepare("SELECT id, stars, comment, author, age_used AS ageUsed, created_at AS createdAt FROM ratings WHERE activity_id = ? ORDER BY id DESC LIMIT 100")
      .all(id);
    res.json({ ...ratingSummary(id), items });
  });

  app.post("/api/activities/:id/ratings", limiter(15 * 60_000, 20), (req, res) => {
    const id = Number(req.params.id);
    if (!getActivity(db, id)) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    const r = ratingSchema.parse(req.body ?? {});
    db.prepare("INSERT INTO ratings (activity_id, stars, comment, author, age_used, created_at) VALUES (?,?,?,?,?,?)").run(
      id,
      r.stars,
      r.comment || null,
      r.author || null,
      r.ageUsed ?? null,
      nowIso(),
    );
    audit(db, optionalUser(req), "rating.create", { id, stars: r.stars });
    res.status(201).json(ratingSummary(id));
  });

  app.delete("/api/ratings/:ratingId", requireAdmin(), (req, res) => {
    const rid = Number(req.params.ratingId);
    const row = db.prepare("SELECT activity_id FROM ratings WHERE id = ?").get(rid);
    if (!row) return res.status(404).json(fail("NOT_FOUND", "התגובה לא נמצאה"));
    db.prepare("DELETE FROM ratings WHERE id = ?").run(rid);
    audit(db, req.user.username, "rating.delete", { id: row.activity_id, ratingId: rid });
    res.json({ ok: true });
  });

  // ── activities: generate (public) ──
  const saveGenerated = (input, g, req, action) => {
    const who = optionalAuth(req);
    const activity = {
      ownerId: who?.id ?? null,
      title: g.title,
      durationMin: g.durationMin,
      author: input.instructor,
      instructor: input.instructor,
      instructorRole: input.role,
      tribe: input.tribe,
      battalion: input.battalion,
      ageGroup: input.ageGroup,
      groupSize: input.participants,
      leadingValue: g.leadingValue,
      equipment: g.equipment,
      safetyNotes: g.safetyNotes,
      conclusionNote: g.conclusionNote,
      activeScouting: input.activeScouting,
      energeticMode: input.energeticMode,
      tags: g.tags,
      methods: input.methods,
      stages: g.stages,
    };
    const id = insertActivity(db, activity);
    audit(db, who?.username ?? "anonymous", action, { id, title: activity.title, source: g.source, ip: req.ip });
    const saved = getActivity(db, id);
    mailer?.enqueue(`פעולה חדשה: ${saved.title}`, activityEmailHtml(saved));
    return { ...saved, source: g.source };
  };

  app.post("/api/activities/generate", limiter(15 * 60_000, 20), async (req, res) => {
    const input = generateSchema.parse(req.body ?? {});
    const g = await generateActivity(input);
    res.status(201).json(saveGenerated(input, g, req, "activity.generate"));
  });

  // a ready-to-paste prompt for any chat AI (Claude, ChatGPT...) in the user's own style
  app.post("/api/activities/prompt", limiter(15 * 60_000, 60), (req, res) => {
    const input = generateSchema.parse(req.body ?? {});
    res.json({ prompt: buildExternalPrompt(input) });
  });

  // saves the reply that the chat AI wrote, as a normal activity
  app.post("/api/activities/import", limiter(15 * 60_000, 20), (req, res) => {
    const { input, text } = importSchema.parse(req.body ?? {});
    let parsed;
    try {
      parsed = parseExternal(text);
    } catch (e) {
      return res.status(e.status || 422).json(fail("PARSE", e.message));
    }
    const draft = normalizeDraft({ ...parsed, title: input.topic }, input);
    res.status(201).json(saveGenerated(input, { ...draft, source: "external" }, req, "activity.import"));
  });

  // ── writing style: sample analysis + Word/text extraction ──
  app.post("/api/style/analyze", limiter(15 * 60_000, 60), (req, res) => {
    res.json(analyzeSample(req.body?.sample));
  });
  app.post("/api/style/extract", limiter(15 * 60_000, 30), express.raw({ type: () => true, limit: "3mb" }), async (req, res) => {
    try {
      const name = String(req.query.name || "");
      const text = await extractText(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), name);
      res.json({ text, analysis: analyzeSample(text) });
    } catch (e) {
      res.status(e.status || 422).json(fail("EXTRACT", e.status ? e.message : "לא הצלחתי לקרוא את הקובץ. נסו להדביק את הטקסט."));
    }
  });

  app.post("/api/activities/:id/duplicate", limiter(15 * 60_000, 40), (req, res) => {
    const src = getActivity(db, Number(req.params.id));
    if (!src) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    const o = duplicateSchema.parse(req.body ?? {});
    let stages = src.stages;
    let durationMin = src.durationMin;
    if (o.durationMin && o.durationMin !== durationMin) {
      const mins = apportion(stages.map((s) => s.minutes), o.durationMin);
      stages = stages.map((s, i) => ({ ...s, minutes: mins[i] }));
      durationMin = o.durationMin;
    }
    const id = insertActivity(db, {
      ...src,
      title: o.title || `העתק של ${src.title}`,
      ageGroup: o.ageGroup || src.ageGroup,
      durationMin,
      stages,
      isSeed: false,
      ownerId: optionalAuth(req)?.id ?? null,
    });
    audit(db, optionalUser(req), "activity.duplicate", { from: src.id, id });
    res.status(201).json(getActivity(db, id));
  });

  // ── activities: write (owner or admin) ──
  const canManage = (user, a) => user.role === "ADMIN" || (!a.isSeed && a.ownerId != null && a.ownerId === user.id);
  const forbidden = (res) => res.status(403).json(fail("FORBIDDEN", "אפשר לערוך רק פעולות שיצרתם. אדמין יכול לערוך הכול"));

  app.put("/api/activities/:id", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    const existing = getActivity(db, id, { includeArchived: true });
    if (!existing) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (!canManage(req.user, existing)) return forbidden(res);
    const patch = updateSchema.parse(req.body ?? {});
    const merged = { ...existing, ...patch };
    if (patch.stages) {
      stagesSchema.parse(patch.stages);
      merged.durationMin = patch.stages.reduce((s, x) => s + x.minutes, 0);
    }
    updateActivity(db, id, merged);
    audit(db, req.user.username, "activity.update", { id, fields: Object.keys(patch) });
    res.json(getActivity(db, id, { includeArchived: true }));
  });

  app.delete("/api/activities/:id", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    const a = getActivity(db, id, { includeArchived: true });
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (!canManage(req.user, a)) return forbidden(res);
    if (a.isSeed && req.query.confirm !== "yes") {
      return res.status(409).json(fail("SEED_CONFIRM", "זו פעולה מובנית של המערכת. כדי למחוק יש לאשר במפורש (confirm=yes)"));
    }
    db.prepare("UPDATE activities SET status = 'ARCHIVED', updated_at = ? WHERE id = ?").run(nowIso(), id);
    audit(db, req.user.username, "activity.archive", { id, title: a.title });
    res.json({ ok: true, undo: `/api/activities/${id}/restore` });
  });

  app.post("/api/activities/:id/restore", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    const a = getActivity(db, id, { includeArchived: true });
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (!canManage(req.user, a)) return forbidden(res);
    db.prepare("UPDATE activities SET status = 'PUBLISHED', updated_at = ? WHERE id = ?").run(nowIso(), id);
    audit(db, req.user.username, "activity.restore", { id });
    res.json(getActivity(db, id));
  });

  // ── admin dashboard data ──
  app.get("/api/admin/sessions", requireAdmin(), (req, res) => {
    const rows = db.prepare("SELECT ip, user_agent AS userAgent, first_seen AS firstSeen, last_seen AS lastSeen, username FROM sessions ORDER BY last_seen DESC LIMIT 200").all();
    res.json(rows);
  });

  app.get("/api/admin/logs", requireAdmin(), (req, res) => {
    const action = typeof req.query.action === "string" ? req.query.action : "";
    const rows = action
      ? db.prepare("SELECT id, at, actor, action, details FROM audit_log WHERE action LIKE ? ORDER BY id DESC LIMIT 300").all(`${action}%`)
      : db.prepare("SELECT id, at, actor, action, details FROM audit_log ORDER BY id DESC LIMIT 300").all();
    res.json(rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })));
  });

  app.get("/api/admin/stats", requireAdmin(), (req, res) => {
    const all = db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all().map(rowToActivity);
    const count = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    res.json({
      total: all.length,
      byAgeGroup: count(all.map((a) => a.ageGroup)),
      byValue: count(all.map((a) => a.leadingValue)),
      byMethod: count(all.flatMap((a) => a.methods.map((m) => m.name))),
      generatedLast7Days: db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action IN ('activity.generate','activity.import') AND at >= ?").get(weekAgo).c,
      emailQueue: db.prepare("SELECT status, COUNT(*) AS c FROM email_queue GROUP BY status").all(),
    });
  });

  // ── admin: users ──
  app.get("/api/admin/users", requireAdmin(), (req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.disabled, u.created_at AS createdAt,
                (SELECT COUNT(*) FROM activities a WHERE a.owner_id = u.id AND a.status = 'PUBLISHED') AS activities
         FROM users u ORDER BY u.id`,
      )
      .all();
    res.json(rows.map((r) => ({ ...r, disabled: !!r.disabled })));
  });
  app.patch("/api/admin/users/:id", requireAdmin(), async (req, res) => {
    const id = Number(req.params.id);
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!target) return res.status(404).json(fail("NOT_FOUND", "המשתמש לא נמצא"));
    const p = adminUserPatchSchema.parse(req.body ?? {});
    if (id === req.user.id && (p.disabled || (p.role && p.role !== "ADMIN"))) {
      return res.status(400).json(fail("SELF", "אי אפשר להשבית או להוריד הרשאות לעצמכם"));
    }
    let tempPassword;
    if (p.disabled !== undefined) db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(p.disabled ? 1 : 0, id);
    if (p.role) db.prepare("UPDATE users SET role = ? WHERE id = ?").run(p.role, id);
    if (p.resetPassword) {
      tempPassword = crypto.randomBytes(6).toString("base64url");
      db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?").run(await hashPassword(tempPassword), id);
    }
    audit(db, req.user.username, "user.update", { id, username: target.username, ...p });
    res.json({ ok: true, ...(tempPassword ? { tempPassword } : {}) });
  });

  // ── admin: backups ──
  const bdir = backupDirFor(dbFile);
  app.get("/api/admin/backups", requireAdmin(), (req, res) => res.json({ dir: bdir, items: listBackups(bdir) }));
  app.post("/api/admin/backups", requireAdmin(), (req, res) => {
    const b = createBackup(db, bdir);
    audit(db, req.user.username, "backup.create", { name: b.name });
    res.status(201).json(b);
  });
  app.get("/api/admin/backups/:name", requireAdmin(), (req, res) => {
    const name = String(req.params.name);
    if (!BACKUP_NAME.test(name) || !listBackups(bdir).some((b) => b.name === name)) return res.status(404).json(fail("NOT_FOUND", "הגיבוי לא נמצא"));
    audit(db, req.user.username, "backup.download", { name });
    res.download(path.join(bdir, name), name);
  });

  // ── errors ──
  app.use("/api", (req, res) => res.status(404).json(fail("NOT_FOUND", "הכתובת לא נמצאה")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ZodError) {
      const fields = {};
      for (const i of err.issues) (fields[i.path.join(".") || "_"] ||= []).push(i.message);
      return res.status(400).json(fail("VALIDATION", "הנתונים שנשלחו אינם תקינים", fields));
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json(fail("BAD_JSON", "גוף הבקשה אינו JSON תקין"));
    if (err?.type === "entity.too.large") return res.status(413).json(fail("TOO_LARGE", "הבקשה גדולה מדי"));
    console.error(err);
    res.status(500).json(fail("SERVER_ERROR", "אירעה שגיאה בשרת"));
  });

  return app;
}
