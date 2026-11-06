// שלב 58 – נתיבי מסך הניהול של הוואטסאפ: /api/admin/wa/*. אדמין ראשי בלבד (accounts.js: "wa" קטע רגיש).
// שום נתיב כאן לא מחזיר את גוף ההודעות מעבר למה שהאדמין צריך לראות, והיומן נשמר בלי תוכן.
import { z } from "zod";
import QRCode from "qrcode";
import * as repo from "./repo.js";
import { createBridge, revokeBridge } from "./bridge-auth.js";
import { clearBreaker, overview, enqueue } from "./queue.js";
import { liveStatus, knownGroups } from "./status.js";
import { loadSettings, saveSettings } from "./settings.js";
import { normalizeWaId, isGroupId, waHint } from "./phone.js";
import { VARIABLES, renderTemplate, sampleValues, validateTemplate, valuesFor } from "./templates.js";
import { describeTools, callTool } from "./tools.js";
import { RULE_KINDS, describeRule, ruleSchemas, runRules } from "./scheduler.js";
import { DEFAULT_TEMPLATES } from "./defaults.js";

const AUDIENCES = ["guides", "parents", "trainees", "other"];
const contactSchema = z.object({
  kind: z.enum(["person", "group"]).default("person"),
  name: z.string().trim().min(1).max(60),
  phone: z.string().max(40).optional(),
  waId: z.string().max(60).optional(),
  battalion: z.string().max(60).optional(),
  role: z.string().max(60).optional(),
  audience: z.enum(AUDIENCES).default("guides"),
  userId: z.number().int().nullable().optional(),
  optedOut: z.boolean().optional(),
  botAllowed: z.boolean().optional(),
  note: z.string().max(200).optional(),
});
const templateSchema = z.object({ name: z.string().trim().min(1).max(60), category: z.string().trim().min(1).max(20).default("general"), body: z.string().min(1).max(4000) });
const csvCell = (v) => {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // מונע הזרקת נוסחאות כשפותחים באקסל
  return `"${safe.replace(/"/g, '""')}"`;
};

export function registerAdminRoutes(app, { db, limiter, fail, requireAdmin, audit, publicUrl }) {
  const lim = limiter(60_000, 240);
  const A = requireAdmin();
  const bad = (res, msg, code = 400) => res.status(code).json(fail(code === 404 ? "NOT_FOUND" : "VALIDATION", msg));
  const idOf = (req) => Number(req.params.id);
  const ctx = (req) => ({ db, settings: loadSettings(db), actor: req.user.username });
  let qrCache = { qr: "", svg: "" };

  // ───────────── מצב חי ─────────────
  app.get("/api/admin/wa/status", lim, A, async (req, res) => {
    const live = liveStatus();
    const isImage = !!live.qr?.startsWith("data:image/png;base64,");
    if (live.qr && !isImage && live.qr !== qrCache.qr) qrCache = { qr: live.qr, svg: await QRCode.toString(live.qr, { type: "svg", margin: 1, errorCorrectionLevel: "L" }) };
    const settings = loadSettings(db);
    res.json({
      bridge: { state: live.state, account: live.account, version: live.version, lastSeenMs: live.lastSeenMs, qrSvg: live.qr && !isImage ? qrCache.svg : null, qrImage: isImage ? live.qr : null },
      queue: overview(db, settings),
      settings,
      bridges: repo.listBridges(db),
      publicUrl: publicUrl || null,
    });
  });
  app.put("/api/admin/wa/settings", lim, A, (req, res) => {
    const next = saveSettings(db, req.body);
    audit(db, req.user.username, "wa.settings", { keys: Object.keys(req.body ?? {}) });
    res.json(next);
  });
  app.post("/api/admin/wa/breaker/clear", lim, A, (req, res) => {
    clearBreaker(db);
    audit(db, req.user.username, "wa.breaker.clear", {});
    res.json({ ok: true });
  });

  // ───────────── גשרים ─────────────
  app.get("/api/admin/wa/bridges", lim, A, (req, res) => res.json(repo.listBridges(db)));
  app.post("/api/admin/wa/bridges", lim, A, (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(40).default("המחשב שלי") }).parse(req.body ?? {});
    const r = createBridge(db, { name, by: req.user.username });
    if (r.error) return res.status(409).json(fail("LIMIT", r.error));
    audit(db, req.user.username, "wa.bridge.create", { id: r.id });
    res.status(201).json({ id: r.id, token: r.token, note: "האסימון מוצג פעם אחת בלבד. שמרו אותו בקובץ .env של הגשר." });
  });
  app.delete("/api/admin/wa/bridges/:id", lim, A, (req, res) => {
    if (!revokeBridge(db, idOf(req))) return bad(res, "הגשר לא נמצא", 404);
    audit(db, req.user.username, "wa.bridge.revoke", { id: idOf(req) });
    res.json({ ok: true });
  });

  // ───────────── אנשי קשר ─────────────
  app.get("/api/admin/wa/contacts", lim, A, (req, res) => res.json(repo.listContacts(db, { kind: req.query.kind, audience: req.query.audience, q: req.query.q })));
  app.post("/api/admin/wa/contacts", lim, A, (req, res) => {
    const v = contactSchema.parse(req.body ?? {});
    const waId = normalizeWaId(v.kind === "group" ? v.waId : v.phone);
    if (!waId || isGroupId(waId) !== (v.kind === "group")) return bad(res, v.kind === "group" ? "מזהה קבוצה לא תקין. ייבאו קבוצה מהרשימה שהגשר מדווח עליה." : "מספר טלפון לא תקין. דוגמה: 052-1234567");
    if (repo.getContactByWaId(db, waId)) return res.status(409).json(fail("DUPLICATE", "איש הקשר כבר קיים"));
    if (repo.countContacts(db) >= 500) return res.status(409).json(fail("LIMIT", "אפשר עד 500 אנשי קשר"));
    if (v.userId && !db.prepare("SELECT 1 FROM users WHERE id = ?").get(v.userId)) return bad(res, "המשתמש לא נמצא");
    const id = repo.insertContact(db, { ...v, waId, botAllowed: v.botAllowed && v.audience === "guides" });
    audit(db, req.user.username, "wa.contact.add", { id, kind: v.kind });
    res.status(201).json(repo.getContact(db, id));
  });
  app.put("/api/admin/wa/contacts/:id", lim, A, (req, res) => {
    const cur = repo.getContact(db, idOf(req));
    if (!cur) return bad(res, "איש הקשר לא נמצא", 404);
    const v = contactSchema.partial().parse(req.body ?? {});
    const m = { ...cur, ...v };
    if (m.userId && !db.prepare("SELECT 1 FROM users WHERE id = ?").get(m.userId)) return bad(res, "המשתמש לא נמצא");
    repo.updateContact(db, cur.id, { ...m, botAllowed: m.botAllowed && m.audience === "guides" });
    audit(db, req.user.username, "wa.contact.edit", { id: cur.id });
    res.json(repo.getContact(db, cur.id));
  });
  app.delete("/api/admin/wa/contacts/:id", lim, A, (req, res) => {
    if (!repo.deleteContact(db, idOf(req))) return bad(res, "איש הקשר לא נמצא", 404);
    audit(db, req.user.username, "wa.contact.delete", { id: idOf(req) });
    res.json({ ok: true });
  });
  app.get("/api/admin/wa/groups", lim, A, (req, res) => res.json(knownGroups()));
  app.post("/api/admin/wa/groups/import", lim, A, (req, res) => {
    const { ids, audience } = z.object({ ids: z.array(z.string().max(60)).min(1).max(50), audience: z.enum(AUDIENCES).default("guides") }).parse(req.body ?? {});
    const known = new Map(knownGroups().items.map((g) => [g.id, g]));
    let added = 0;
    for (const id of ids) {
      const g = known.get(id);
      if (!g || !isGroupId(id) || repo.getContactByWaId(db, id)) continue;
      repo.insertContact(db, { kind: "group", name: g.name || "קבוצה", waId: id, audience });
      added++;
    }
    audit(db, req.user.username, "wa.groups.import", { added });
    res.json({ added });
  });

  // ───────────── תבניות ─────────────
  app.get("/api/admin/wa/templates", lim, A, (req, res) => {
    if (!repo.countTemplates(db)) for (const t of DEFAULT_TEMPLATES) repo.insertTemplate(db, t);
    res.json({ templates: repo.listTemplates(db), variables: VARIABLES });
  });
  app.post("/api/admin/wa/templates", lim, A, (req, res) => {
    const v = templateSchema.parse(req.body ?? {});
    const chk = validateTemplate(v.body);
    if (!chk.ok) return bad(res, chk.errors.join(". "));
    try {
      const id = repo.insertTemplate(db, v);
      audit(db, req.user.username, "wa.template.add", { id });
      res.status(201).json(repo.getTemplate(db, id));
    } catch (e) {
      if (/UNIQUE/i.test(String(e?.message))) return res.status(409).json(fail("DUPLICATE", "כבר יש תבנית בשם הזה"));
      throw e;
    }
  });
  app.put("/api/admin/wa/templates/:id", lim, A, (req, res) => {
    const v = templateSchema.parse(req.body ?? {});
    const chk = validateTemplate(v.body);
    if (!chk.ok) return bad(res, chk.errors.join(". "));
    if (!repo.updateTemplate(db, idOf(req), v)) return bad(res, "התבנית לא נמצאה", 404);
    res.json(repo.getTemplate(db, idOf(req)));
  });
  app.delete("/api/admin/wa/templates/:id", lim, A, (req, res) => {
    if (!repo.deleteTemplate(db, idOf(req))) return bad(res, "התבנית לא נמצאה", 404);
    res.json({ ok: true });
  });
  app.post("/api/admin/wa/templates/preview", lim, A, (req, res) => {
    const { body, contactId } = z.object({ body: z.string().max(4000), contactId: z.number().int().optional() }).parse(req.body ?? {});
    const c = contactId ? repo.getContact(db, contactId) : null;
    res.json({ ...renderTemplate(body, c ? valuesFor(c, sampleValues()) : sampleValues()), validation: validateTemplate(body) });
  });

  // ───────────── משימות (שליחה, תזמון, ביטול) ─────────────
  app.get("/api/admin/wa/jobs", lim, A, (req, res) => res.json(repo.listJobs(db, { status: req.query.status ? String(req.query.status).slice(0, 80) : undefined, contactId: req.query.contactId ? Number(req.query.contactId) : undefined, source: req.query.source, limit: Number(req.query.limit) || 100, offset: Number(req.query.offset) || 0 })));
  const toolRoute = (path, tool, event) =>
    app.post(path, lim, A, (req, res) => {
      const out = callTool(ctx(req), tool, req.body);
      if (out.error) return res.status(out.status || 400).json(fail("WA_TOOL", out.error));
      audit(db, req.user.username, event, { jobs: out.result.created?.length ?? (out.result.jobId ? 1 : 0), skipped: out.result.skipped?.length ?? 0 });
      res.status(201).json(out.result);
    });
  toolRoute("/api/admin/wa/jobs/send", "wa_send", "wa.send");
  toolRoute("/api/admin/wa/jobs/broadcast", "wa_broadcast", "wa.broadcast");
  app.post("/api/admin/wa/jobs/:id/cancel", lim, A, (req, res) => {
    if (!repo.cancelJob(db, idOf(req))) return bad(res, "אי אפשר לבטל: ההודעה כבר נשלחה, בטיפול או לא קיימת", 409);
    audit(db, req.user.username, "wa.cancel", { id: idOf(req) });
    res.json({ ok: true });
  });
  app.post("/api/admin/wa/jobs/:id/retry", lim, A, (req, res) => {
    if (!repo.retryJob(db, idOf(req), new Date().toISOString())) return bad(res, "אפשר לנסות שוב רק הודעה שנכשלה", 409);
    audit(db, req.user.username, "wa.retry", { id: idOf(req) });
    res.json({ ok: true });
  });

  // ───────────── יומן וסטטיסטיקה ─────────────
  app.get("/api/admin/wa/log", lim, A, (req, res) => res.json(repo.listLog(db, { status: req.query.status ? String(req.query.status) : undefined, q: req.query.q ? String(req.query.q).slice(0, 60) : undefined, limit: Number(req.query.limit) || 100, offset: Number(req.query.offset) || 0 })));
  app.get("/api/admin/wa/log.csv", lim, A, (req, res) => {
    const { rows } = repo.listLog(db, { limit: 1000 });
    const csv = ["זמן,איש קשר,טלפון,סטטוס,פירוט,מקור", ...rows.map((r) => [r.at, r.contactName, r.hint, r.status, r.detail, r.source].map(csvCell).join(","))].join("\n");
    audit(db, req.user.username, "wa.log.export", { rows: rows.length });
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="whatsapp-log.csv"' }).send("﻿" + csv);
  });
  app.get("/api/admin/wa/stats", lim, A, (req, res) => {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    res.json({ days: repo.statsByDay(db, since), counts: repo.countByStatus(db) });
  });

  // ───────────── כללי אוטומציה ─────────────
  const ruleBody = z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(RULE_KINDS), enabled: z.boolean().default(true), config: z.record(z.string(), z.unknown()) });
  const withInfo = (r) => ({ ...r, summary: describeRule(r) });
  app.get("/api/admin/wa/rules", lim, A, (req, res) => res.json(repo.listRules(db).map(withInfo)));
  app.post("/api/admin/wa/rules", lim, A, (req, res) => {
    const v = ruleBody.parse(req.body ?? {});
    const config = ruleSchemas[v.kind].parse(v.config);
    if (repo.countRules(db) >= 30) return res.status(409).json(fail("LIMIT", "אפשר עד 30 כללים"));
    const id = repo.insertRule(db, { ...v, config, createdBy: req.user.username });
    audit(db, req.user.username, "wa.rule.add", { id, kind: v.kind });
    res.status(201).json(withInfo(repo.getRule(db, id)));
  });
  app.put("/api/admin/wa/rules/:id", lim, A, (req, res) => {
    const cur = repo.getRule(db, idOf(req));
    if (!cur) return bad(res, "הכלל לא נמצא", 404);
    const v = ruleBody.partial().parse(req.body ?? {});
    const config = v.config ? ruleSchemas[cur.kind].parse(v.config) : cur.config;
    repo.updateRule(db, cur.id, { name: v.name ?? cur.name, enabled: v.enabled ?? cur.enabled, config });
    audit(db, req.user.username, "wa.rule.edit", { id: cur.id });
    res.json(withInfo(repo.getRule(db, cur.id)));
  });
  app.delete("/api/admin/wa/rules/:id", lim, A, (req, res) => {
    if (!repo.deleteRule(db, idOf(req))) return bad(res, "הכלל לא נמצא", 404);
    audit(db, req.user.username, "wa.rule.delete", { id: idOf(req) });
    res.json({ ok: true });
  });
  app.post("/api/admin/wa/rules/run", lim, A, (req, res) => res.json({ created: runRules(db) }));

  // ───────────── אישורי הגעה ותיבת נכנסות ─────────────
  app.get("/api/admin/wa/rsvp", lim, A, (req, res) => res.json(repo.rsvpEvents(db)));
  app.get("/api/admin/wa/rsvp/:key", lim, A, (req, res) => res.json(repo.rsvpSummary(db, String(req.params.key).slice(0, 80))));
  app.get("/api/admin/wa/inbox", lim, A, (req, res) => res.json(repo.listInbox(db, { contactId: req.query.contactId ? Number(req.query.contactId) : undefined })));
  app.post("/api/admin/wa/inbox/:id/reply", lim, A, (req, res) => {
    const { text } = z.object({ text: z.string().min(1).max(4000) }).parse(req.body ?? {});
    const c = repo.getContact(db, idOf(req));
    if (!c) return bad(res, "איש הקשר לא נמצא", 404);
    const r = enqueue(db, loadSettings(db), { contact: c, body: text, source: "manual", priority: 2, createdBy: req.user.username });
    if (!r.ok) return bad(res, `לא נוסף לתור: ${r.reason}`, 422);
    audit(db, req.user.username, "wa.reply", { id: r.id });
    res.status(201).json({ jobId: r.id });
  });

  // ───────────── כלים בסגנון MCP ─────────────
  app.get("/api/admin/wa/tools", lim, A, (req, res) => res.json(describeTools()));
  app.post("/api/admin/wa/tools/:name", lim, A, (req, res) => {
    const out = callTool(ctx(req), String(req.params.name), req.body);
    if (out.error) return res.status(out.status || 400).json(fail("WA_TOOL", out.error));
    audit(db, req.user.username, "wa.tool", { name: req.params.name });
    res.json(out.result);
  });

  return { waHint };
}
