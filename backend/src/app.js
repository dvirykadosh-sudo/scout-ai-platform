import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";
import { apportion, buildExternalPrompt, generateActivity, normalizeDraft, parseExternal } from "./ai.js";
import { analyzeSample, extractText } from "./style.js";
import { getActivity, insertActivity, rowToActivity, searchActivities, snapshotOf, updateActivity } from "./activities.js";
import { buildPlan } from "./plan.js";
import { newActivityStatus, registerExtraRoutes } from "./routes-extra.js";
import { generateKinded } from "./kinds.js";
import { registerContentRoutes } from "./routes-content.js";
import { registerOrganizerRoutes } from "./routes-organizer.js";
import { registerCareRoutes } from "./routes-care.js";
import { registerCommunityRoutes } from "./routes-community.js";
import { registerAssistRoutes } from "./routes-assist.js";
import { registerAccountRoutes } from "./routes-accounts.js";
import { registerSecurityRoutes } from "./routes-security.js";
import { registerWriteRoutes } from "./routes-write.js";
import { registerWriteSuggestRoutes } from "./routes-write-suggest.js";
import { findLogo, registerWriteExportRoutes } from "./routes-write-export.js";
import { registerWriteFinalRoutes } from "./routes-write-final.js";
import { registerWriteV36Routes } from "./routes-write-v36.js";
import { registerOpsRoutes } from "./routes-ops.js";
import { registerWriteV39Routes } from "./routes-write-v39.js";
import { pageCountMiddleware, registerPilotRoutes } from "./routes-pilot.js";
import { maintenanceGuard, maintenanceMessage } from "./ops.js";
import { registerWriteSearchRoutes, registerWriteCommunityRoutes, registerWriteMoreRoutes, registerWriteStatsRoutes } from "./routes-write-more.js";
import { ipHash, isBlocked, logAccess, pageFrom, purgeOld, readSettings } from "./security.js";
import { registerKindRoutes } from "./routes-kinds.js";
import { EMERGENCY_METHODS, buildEmergencyDraft, parseLooseDoc, pickIcebreakers, regenerateStage } from "./tools.js";
import { checkQuality } from "./quality.js";
import { checkLock, clearFailures, hashPassword, optionalAuth, optionalUser, registerFailure, requireAdmin, requireUser, signToken, verifyPassword } from "./auth.js";
import { BACKUP_NAME, backupDirFor, createBackup, listBackups } from "./backup.js";
import { styleSchema } from "./style.js";
import { config } from "./config.js";
import { audit, nowIso } from "./db.js";
import { buildBookletDocx, buildDocx } from "./docx.js";
import { setWatermarkSource } from "./watermark.js";
import { registerSystemRoutes, startedAt as bootedAt } from "./routes-system.js";
import { activityEmailHtml } from "./email.js";
import { AGE_GROUPS, GRADES, GENDER_GROUPS, METHODS, ROLES, STAGE_LAYERS, STAGE_NAMES, MIDOT } from "./shared/constants.js";
import { emergencySchema, importParsedSchema, regenSchema, adminUserPatchSchema, bookletSchema, changePwSchema, duplicateSchema, generateSchema, importSchema, listQuerySchema, loginSchema, planSchema, qualitySchema, ratingSchema, registerSchema, runSchema, stagesSchema, updateSchema } from "./validate.js";

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
  app.use(maintenanceGuard(db));
  app.use(pageCountMiddleware(db));
  // האימות מול מסד הנתונים (חיבורים מבוטלים, תפקידים) קורא את המסד דרך הבקשה
  app.use((req, res, next) => {
    req.db = db;
    next();
  });

  const limiter = (windowMs, limit) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => config.nodeEnv === "test",
      handler: (req, res) => res.status(429).json(fail("RATE_LIMIT", "יותר מדי בקשות. נסו שוב בעוד כמה דקות")),
    });

  // ── כתובות חסומות: לפני כל השאר, גם לדפים וגם ל-API ──
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/health") && isBlocked(db, req.ip)) {
      return req.path.startsWith("/api") ? res.status(403).json(fail("BLOCKED", "הגישה מהכתובת הזו נחסמה. אם זו טעות, פנו למנהל המערכת")) : res.status(403).type("text/plain; charset=utf-8").send("הגישה מהכתובת הזו נחסמה. אם זו טעות, פנו למנהל המערכת.");
    }
    next();
  });

  // ── מעקב מבקרים (ללוח האדמין): חיבור לפי כתובת ודפדפן, ורישום "ביקור" אחד בכל 30 דקות ──
  const visitSeen = new Map();
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") && !req.path.startsWith("/api/health")) {
      const ua = String(req.headers["user-agent"] || "").slice(0, 200);
      const hash = ipHash(req.ip);
      const shown = readSettings(db).visitorIpMode === "hashed" ? `h:${hash.slice(0, 10)}` : req.ip || "";
      const key = crypto.createHash("sha1").update(`${hash}|${ua}`).digest("hex");
      const t = nowIso();
      db.prepare(
        `INSERT INTO sessions (key, ip, user_agent, first_seen, last_seen, username) VALUES (?,?,?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET last_seen=excluded.last_seen, ip=excluded.ip, username=COALESCE(excluded.username, sessions.username)`,
      ).run(key, shown, ua, t, t, optionalUser(req));
      const last = visitSeen.get(key) ?? 0;
      if (Date.now() - last > 30 * 60_000) {
        if (visitSeen.size > 5000) visitSeen.clear();
        visitSeen.set(key, Date.now());
        logAccess(db, req, "visit", { username: optionalUser(req), page: pageFrom(req) });
      } else visitSeen.set(key, last);
    }
    next();
  });

  if (serveStatic) app.use(express.static(path.join(here, "..", "public")));

  const signupOpen = () => !!config.signupCode || !config.isProd;

  // ── לוגו השבט: מועלה על ידי האדמין, נשמר כקובץ ליד מסד הנתונים ──
  const logoFile = dbFile === ":memory:" ? null : path.join(path.dirname(path.resolve(dbFile)), "logo.bin");
  const sniff = (b) =>
    b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? "image/png"
      : b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
        ? "image/jpeg"
        : b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP"
          ? "image/webp"
          : null;
  const makeLogo = (buf) => (buf && sniff(buf) ? { buf, type: sniff(buf), v: crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10) } : null);
  let logo = null;
  try {
    if (logoFile && fs.existsSync(logoFile)) logo = makeLogo(fs.readFileSync(logoFile));
  } catch {
    logo = null;
  }

  setWatermarkSource(() => findLogo(() => logo && /png|jpeg/.test(logo.type) ? logo : null));

  // ── public: meta ──
  app.get("/api/health", (req, res) => res.json({ ok: true, time: nowIso(), startedAt: bootedAt.toISOString(), maintenance: maintenanceMessage(db) }));
  app.get("/api/methods", (req, res) => res.json(METHODS));
  app.get("/api/meta", (req, res) =>
    res.json({ ageGroups: AGE_GROUPS, grades: GRADES, genderGroups: GENDER_GROUPS, roles: ROLES, stageNames: STAGE_NAMES, stageLayers: STAGE_LAYERS, midot: MIDOT, aiEnabled: !!config.ai.key, signupOpen: signupOpen(), signupNeedsCode: !!config.signupCode, logoVersion: logo?.v ?? null }),
  );

  app.get("/api/logo", (req, res) => {
    if (!logo) return res.status(404).json(fail("NOT_FOUND", "אין לוגו"));
    res.set({ "Content-Type": logo.type, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" }).send(logo.buf);
  });
  app.post("/api/admin/logo", requireAdmin(), express.raw({ type: () => true, limit: "700kb" }), (req, res) => {
    const next = makeLogo(Buffer.isBuffer(req.body) ? req.body : null);
    if (!next) return res.status(415).json(fail("BAD_IMAGE", "הקובץ חייב להיות תמונה מסוג PNG, JPG או WebP, עד 700KB"));
    logo = next;
    if (logoFile) fs.writeFileSync(logoFile, next.buf);
    audit(db, optionalUser(req), "logo.set", { type: next.type, size: next.buf.length });
    res.json({ ok: true, logoVersion: next.v });
  });
  app.delete("/api/admin/logo", requireAdmin(), (req, res) => {
    logo = null;
    if (logoFile) fs.rmSync(logoFile, { force: true });
    audit(db, optionalUser(req), "logo.clear", {});
    res.json({ ok: true });
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
      status: newActivityStatus(db, who),
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
      kind: g.kind ?? input.kind ?? null,
      tags: g.tags,
      methods: input.methods,
      stages: g.stages,
    };
    const id = insertActivity(db, activity);
    audit(db, who?.username ?? "anonymous", action, { id, title: activity.title, source: g.source });
    const saved = getActivity(db, id);
    mailer?.enqueue(`פעולה חדשה: ${saved.title}`, activityEmailHtml(saved));
    return { ...saved, source: g.source };
  };

  app.post("/api/activities/generate", limiter(15 * 60_000, 20), async (req, res) => {
    const input = generateSchema.parse(req.body ?? {});
    const g = await generateKinded(input);
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
      status: newActivityStatus(db, optionalAuth(req)),
    });
    audit(db, optionalUser(req), "activity.duplicate", { from: src.id, id });
    res.status(201).json(getActivity(db, id));
  });

  // ── activities: write (owner or admin) ──
  // canOwn: הבעלים או אדמין (מחיקה, שיתוף). canManage: גם שותף לעריכה (עריכה, גרסאות, הוספת סיפור)
  const canOwn = (user, a) => user.role === "ADMIN" || (!a.isSeed && a.ownerId != null && a.ownerId === user.id);
  const isCollaborator = (user, a) => !a.isSeed && !!db.prepare("SELECT 1 FROM activity_collaborators WHERE activity_id = ? AND user_id = ?").get(a.id, user.id);
  const canManage = (user, a) => canOwn(user, a) || isCollaborator(user, a);
  const forbidden = (res) => res.status(403).json(fail("FORBIDDEN", "אפשר לערוך רק פעולות שיצרתם או שמישהו שיתף איתכם. אדמין יכול לערוך הכול"));

  app.put("/api/activities/:id", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    const existing = getActivity(db, id, { includeArchived: true });
    if (!existing) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (!canManage(req.user, existing)) return forbidden(res);
    // הגנה על עריכה משותפת: אם מישהו שמר אחרי שפתחתם את הפעולה, לא דורסים בשקט
    const base = req.body?.baseUpdatedAt;
    if (typeof base === "string" && base !== existing.updatedAt && req.body?.force !== true) {
      const last = db.prepare("SELECT actor FROM audit_log WHERE action = 'activity.update' AND details LIKE ? ORDER BY id DESC LIMIT 1").get(`{"id":${id},%`);
      return res.status(409).json(fail("EDIT_CONFLICT", `${last?.actor && last.actor !== req.user.username ? last.actor : "מישהו"} שמר/ה שינויים בפעולה אחרי שפתחתם אותה. אפשר לרענן ולראות אותם, או לשמור בכל זאת ולדרוס אותם`));
    }
    const patch = updateSchema.parse(req.body ?? {});
    const merged = { ...existing, ...patch };
    if (patch.stages) {
      stagesSchema.parse(patch.stages);
      merged.durationMin = patch.stages.reduce((s, x) => s + x.minutes, 0);
    }
    saveVersion(id, existing, req.user.username, "לפני עריכה");
    updateActivity(db, id, merged);
    audit(db, req.user.username, "activity.update", { id, fields: Object.keys(patch) });
    res.json(getActivity(db, id, { includeArchived: true }));
  });

  app.delete("/api/activities/:id", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    const a = getActivity(db, id, { includeArchived: true });
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (!canOwn(req.user, a)) return forbidden(res);
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
    if (!canOwn(req.user, a)) return forbidden(res);
    db.prepare("UPDATE activities SET status = ?, updated_at = ? WHERE id = ?").run(newActivityStatus(db, req.user), nowIso(), id);
    audit(db, req.user.username, "activity.restore", { id });
    res.json(getActivity(db, id));
  });

  // ── version history (owner or admin) ──
  const MAX_VERSIONS = 30;
  function saveVersion(activityId, activity, editor, note) {
    db.prepare("INSERT INTO activity_versions (activity_id, snapshot_json, editor, note, saved_at) VALUES (?,?,?,?,?)").run(activityId, JSON.stringify(snapshotOf(activity)), editor, note, nowIso());
    db.prepare("DELETE FROM activity_versions WHERE activity_id = ? AND id NOT IN (SELECT id FROM activity_versions WHERE activity_id = ? ORDER BY id DESC LIMIT ?)").run(activityId, activityId, MAX_VERSIONS);
  }

  app.get("/api/activities/:id/versions", requireUser(), (req, res) => {
    const a = getActivity(db, Number(req.params.id), { includeArchived: true });
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (!canManage(req.user, a)) return forbidden(res);
    const items = db.prepare("SELECT id, snapshot_json, editor, note, saved_at FROM activity_versions WHERE activity_id = ? ORDER BY id DESC").all(a.id);
    res.json({ current: snapshotOf(a), items: items.map((v) => ({ id: v.id, editor: v.editor, note: v.note, savedAt: v.saved_at, snapshot: JSON.parse(v.snapshot_json) })) });
  });

  app.post("/api/activities/:id/versions/:vid/restore", requireUser(), (req, res) => {
    const a = getActivity(db, Number(req.params.id), { includeArchived: true });
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (!canManage(req.user, a)) return forbidden(res);
    const v = db.prepare("SELECT * FROM activity_versions WHERE id = ? AND activity_id = ?").get(Number(req.params.vid), a.id);
    if (!v) return res.status(404).json(fail("NOT_FOUND", "הגרסה לא נמצאה"));
    saveVersion(a.id, a, req.user.username, "לפני שחזור גרסה");
    updateActivity(db, a.id, { ...a, ...JSON.parse(v.snapshot_json) });
    audit(db, req.user.username, "activity.restoreVersion", { id: a.id, version: v.id });
    res.json(getActivity(db, a.id, { includeArchived: true }));
  });

  // ── private run log ("יומן הפעלות") ──
  const runRow = (r) => ({ id: r.id, activityId: r.activity_id, ranOn: r.ran_on, groupLabel: r.group_label || "", worked: r.worked || "", changeNext: r.change_next || "", notes: r.notes || "", engagement: r.engagement ?? null, timing: r.timing ?? null, createdAt: r.created_at, ...(r.title ? { title: r.title } : {}) });

  app.get("/api/activities/:id/runs", requireUser(), (req, res) => {
    const rows = db.prepare("SELECT * FROM runs WHERE activity_id = ? AND user_id = ? ORDER BY ran_on DESC, id DESC").all(Number(req.params.id), req.user.id);
    res.json(rows.map(runRow));
  });
  app.post("/api/activities/:id/runs", requireUser(), (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    const v = runSchema.parse(req.body ?? {});
    const r = db.prepare("INSERT INTO runs (activity_id, user_id, ran_on, group_label, worked, change_next, notes, engagement, timing, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(a.id, req.user.id, v.ranOn, v.groupLabel, v.worked, v.changeNext, v.notes, v.engagement ?? null, v.timing ?? null, nowIso());
    res.status(201).json(runRow(db.prepare("SELECT * FROM runs WHERE id = ?").get(Number(r.lastInsertRowid))));
  });
  app.delete("/api/runs/:id", requireUser(), (req, res) => {
    const r = db.prepare("DELETE FROM runs WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return res.status(404).json(fail("NOT_FOUND", "הרישום לא נמצא"));
    res.json({ ok: true });
  });
  app.get("/api/me/runs", requireUser(), (req, res) => {
    const rows = db.prepare("SELECT runs.*, activities.title AS title FROM runs JOIN activities ON activities.id = runs.activity_id WHERE runs.user_id = ? ORDER BY ran_on DESC, runs.id DESC LIMIT 200").all(req.user.id);
    res.json(rows.map(runRow));
  });

  // ── booklet (several activities in one Word file), quality check, periodic plan ──
  app.post("/api/export/booklet", limiter(15 * 60_000, 20), async (req, res) => {
    const { ids, title } = bookletSchema.parse(req.body ?? {});
    const list = ids.map((id) => getActivity(db, id)).filter(Boolean);
    if (!list.length) return res.status(404).json(fail("NOT_FOUND", "לא נמצאו פעולות"));
    const buf = await buildBookletDocx(list, title);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="booklet.docx"`);
    res.send(buf);
  });

  app.post("/api/quality", limiter(15 * 60_000, 120), (req, res) => {
    const { items } = qualitySchema.parse(req.body ?? {});
    res.json(checkQuality(items));
  });


  // ── סבב א': שלב בודד מחדש, חירום, היכרות, ייבוא קבצים ──
  app.post("/api/activities/:id/stages/:index/regenerate", limiter(15 * 60_000, 60), async (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    const index = Number(req.params.index);
    if (!a) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    if (!Number.isInteger(index) || index < 0 || index > 4) return res.status(400).json(fail("VALIDATION", "מספר שלב לא תקין"));
    const o = regenSchema.parse(req.body ?? {});
    res.json(await regenerateStage(a, index, o));
  });

  app.post("/api/activities/emergency", limiter(15 * 60_000, 30), (req, res) => {
    const o = emergencySchema.parse(req.body ?? {});
    const input = generateSchema.parse({ ...o, methods: EMERGENCY_METHODS });
    const draft = normalizeDraft(buildEmergencyDraft(input, o.seed), input);
    res.status(201).json(saveGenerated(input, { ...draft, tags: ["חירום", "בלי ציוד", "10 דקות"], source: "emergency" }, req, "activity.emergency"));
  });

  app.get("/api/icebreakers", (req, res) => {
    const q = req.query;
    res.json(
      pickIcebreakers({
        n: Math.min(8, Math.max(1, Number(q.n) || 3)),
        energetic: q.energetic === "1" ? true : q.energetic === "0" ? false : undefined,
        noEquipment: q.noEquipment === "1",
        maxMinutes: Number(q.maxMinutes) || undefined,
        seed: Number(q.seed) || Date.now(),
      }),
    );
  });

  app.post("/api/activities/import-file", limiter(15 * 60_000, 40), express.raw({ type: () => true, limit: "3mb" }), async (req, res) => {
    try {
      const name = String(req.query.name || "");
      const text = await extractText(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), name);
      res.json(parseLooseDoc(text, name));
    } catch (e) {
      res.status(e.status || 422).json(fail("EXTRACT", e.status ? e.message : "לא הצלחתי לקרוא את הקובץ"));
    }
  });

  app.post("/api/activities/import-parsed", limiter(15 * 60_000, 60), (req, res) => {
    const o = importParsedSchema.parse(req.body ?? {});
    const who = optionalAuth(req);
    const id = insertActivity(db, {
      ownerId: who?.id ?? null,
      status: newActivityStatus(db, who),
      title: o.title,
      durationMin: o.stages.reduce((a, s) => a + s.minutes, 0),
      author: o.instructor,
      instructor: o.instructor,
      instructorRole: "מדריך",
      tribe: o.tribe,
      battalion: "",
      ageGroup: o.ageGroup,
      groupSize: 20,
      leadingValue: o.leadingValue || o.title,
      equipment: o.equipment || "לא צוין ציוד",
      safetyNotes: o.safetyNotes || "לא צוינו הערות בטיחות. כדאי להשלים לפני ההפעלה.",
      conclusionNote: null,
      activeScouting: false,
      energeticMode: false,
      tags: ["יובא מקובץ"],
      methods: [],
      stages: o.stages,
    });
    audit(db, who?.username ?? "anonymous", "activity.import-file", { id, title: o.title });
    res.status(201).json(getActivity(db, id));
  });

  app.post("/api/plan", limiter(15 * 60_000, 60), (req, res) => {
    res.json(buildPlan(db, planSchema.parse(req.body ?? {})));
  });

  registerExtraRoutes(app, { db, limiter, fail, requireUser, requireAdmin, optionalAuth, optionalUser });
  registerKindRoutes(app, { db, limiter, fail, requireAdmin, optionalAuth, optionalUser, saveGenerated });
  registerContentRoutes(app, { db, limiter, fail, requireUser, optionalAuth, canManage, forbidden, saveVersion, runRow });
  registerOrganizerRoutes(app, { db, limiter, fail, requireUser, optionalAuth, canOwn, isCollaborator });
  registerCareRoutes(app, { db, dbFile, limiter, fail, requireUser, requireAdmin, optionalAuth, canManage, forbidden, saveVersion });
  registerCommunityRoutes(app, { db, limiter, fail, requireUser, requireAdmin, optionalAuth });
  registerAssistRoutes(app, { db, limiter, optionalAuth, fail, requireUser });
  registerSecurityRoutes(app, { db, limiter, fail, requireUser, requireAdmin });
  registerWriteRoutes(app, { db, limiter, fail, requireUser });
  registerWriteSuggestRoutes(app, { db, limiter, fail, requireUser });
  registerWriteMoreRoutes(app, { db, limiter, fail, requireUser });
  registerWriteStatsRoutes(app, { db, limiter, fail, requireUser });
  registerWriteCommunityRoutes(app, { db, limiter, fail, requireUser });
  registerWriteSearchRoutes(app, { db, limiter, fail, requireUser });
  registerWriteFinalRoutes(app, { db, limiter, fail, requireUser });
  registerWriteV36Routes(app, { db, limiter, fail, requireUser });
  registerWriteV39Routes(app, { db, limiter, fail, requireUser });
  registerPilotRoutes(app, { db, mailer, config, limiter, fail, requireUser, requireAdmin, audit });
  registerOpsRoutes(app, { db, dbFile, config, mailer, fail, requireUser, requireAdmin, audit, limiter });
  registerWriteExportRoutes(app, { limiter, fail, requireUser, getLogo: () => logo, db, publicUrl: config.publicUrl });
  registerAccountRoutes(app, { db, mailer, limiter, fail, requireUser, requireAdmin, signupOpen });

  // מחיקה אוטומטית של יומני כניסות, מבקרים וחיבורים ישנים (לפי ההגדרה), פעם בכמה שעות
  try {
    purgeOld(db);
  } catch {
    /* מסד חדש מאוד */
  }
  const purgeTimer = setInterval(() => { try { purgeOld(db); } catch { /* ignore */ } }, 6 * 3600_000);
  purgeTimer.unref();

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

  registerSystemRoutes(app, { db, dbFile, config, fail, requireAdmin, audit });

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
