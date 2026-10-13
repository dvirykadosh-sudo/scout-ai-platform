import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";
import { apportion, generateActivity } from "./ai.js";
import { getActivity, insertActivity, rowToActivity, searchActivities, updateActivity } from "./activities.js";
import { checkLock, clearFailures, hashPassword, optionalUser, registerFailure, requireAdmin, signToken, verifyPassword } from "./auth.js";
import { config } from "./config.js";
import { audit, nowIso } from "./db.js";
import { buildDocx } from "./docx.js";
import { activityEmailHtml } from "./email.js";
import { AGE_GROUPS, GRADES, GENDER_GROUPS, METHODS, ROLES, STAGE_LAYERS, STAGE_NAMES, MIDOT } from "./shared/constants.js";
import { changePwSchema, duplicateSchema, generateSchema, listQuerySchema, loginSchema, stagesSchema, updateSchema } from "./validate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fail = (code, message, fields) => ({ error: { code, message, ...(fields ? { fields } : {}) } });

export function createApp({ db, mailer }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
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

  app.use(express.static(path.join(here, "..", "public")));

  // ── public: meta ──
  app.get("/api/health", (req, res) => res.json({ ok: true, time: nowIso() }));
  app.get("/api/methods", (req, res) => res.json(METHODS));
  app.get("/api/meta", (req, res) =>
    res.json({ ageGroups: AGE_GROUPS, grades: GRADES, genderGroups: GENDER_GROUPS, roles: ROLES, stageNames: STAGE_NAMES, stageLayers: STAGE_LAYERS, midot: MIDOT, aiEnabled: !!config.ai.key }),
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
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    const ok = await verifyPassword(password, user?.password_hash);
    if (!user || !ok) {
      registerFailure(db, key);
      audit(db, username, "login.fail", { ip: req.ip });
      return res.status(401).json(fail("BAD_CREDENTIALS", "שם משתמש או סיסמה שגויים"));
    }
    clearFailures(db, key);
    audit(db, username, "login.success", { ip: req.ip });
    res.json({ token: signToken(user), user: { username: user.username, role: user.role, mustChangePw: !!user.must_change_pw } });
  });

  app.get("/api/auth/me", requireAdmin({ allowMustChange: true }), (req, res) => res.json({ user: req.user }));

  app.post("/api/auth/change-password", requireAdmin({ allowMustChange: true }), async (req, res) => {
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
    res.json(a);
  });

  app.get("/api/activities/:id/export/docx", async (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    const buf = await buildDocx(a);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="activity-${a.id}.docx"; filename*=UTF-8''${encodeURIComponent(a.title)}.docx`);
    res.send(buf);
  });

  // ── activities: generate (public) ──
  app.post("/api/activities/generate", limiter(15 * 60_000, 20), async (req, res) => {
    const input = generateSchema.parse(req.body ?? {});
    const g = await generateActivity(input);
    const activity = {
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
    audit(db, "anonymous", "activity.generate", { id, title: activity.title, source: g.source, ip: req.ip });
    const saved = getActivity(db, id);
    mailer?.enqueue(`פעולה חדשה: ${saved.title}`, activityEmailHtml(saved));
    res.status(201).json({ ...saved, source: g.source });
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
    });
    audit(db, optionalUser(req), "activity.duplicate", { from: src.id, id });
    res.status(201).json(getActivity(db, id));
  });

  // ── activities: admin write ──
  app.put("/api/activities/:id", requireAdmin(), (req, res) => {
    const id = Number(req.params.id);
    const existing = getActivity(db, id, { includeArchived: true });
    if (!existing) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
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

  app.delete("/api/activities/:id", requireAdmin(), (req, res) => {
    const id = Number(req.params.id);
    const a = getActivity(db, id, { includeArchived: true });
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (a.isSeed && req.query.confirm !== "yes") {
      return res.status(409).json(fail("SEED_CONFIRM", "זו פעולה מובנית של המערכת. כדי למחוק יש לאשר במפורש (confirm=yes)"));
    }
    db.prepare("UPDATE activities SET status = 'ARCHIVED', updated_at = ? WHERE id = ?").run(nowIso(), id);
    audit(db, req.user.username, "activity.archive", { id, title: a.title });
    res.json({ ok: true, undo: `/api/activities/${id}/restore` });
  });

  app.post("/api/activities/:id/restore", requireAdmin(), (req, res) => {
    const id = Number(req.params.id);
    const a = getActivity(db, id, { includeArchived: true });
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
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
      generatedLast7Days: db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'activity.generate' AND at >= ?").get(weekAgo).c,
      emailQueue: db.prepare("SELECT status, COUNT(*) AS c FROM email_queue GROUP BY status").all(),
    });
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
