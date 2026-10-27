// שלב 38 (251–260): פיילוט ומשוב. משימות, שאלון, דיווח תקלה, מפת שימוש, דוח שבועי, הצבעה על מה לבנות.
import { z } from "zod";
import { optionalAuth } from "./auth.js";
import { getSet, putSet } from "./ops.js";

const normPage = (p) => String(p || "").replace(/\/\d+(?=\/|$)/g, "/:id").replace(/\/view\/[^/]+/, "/view/:token").slice(0, 60);

/** 256: ספירת צפיות לפי עמוד ויום, מכותרת X-Page שהדפדפן שולח. בלי פרטים אישיים. */
export function pageCountMiddleware(db) {
  const up = db.prepare("INSERT INTO page_counts (day, page, n) VALUES (?,?,1) ON CONFLICT(day, page) DO UPDATE SET n = n + 1");
  return (req, res, next) => {
    try {
      const raw = req.headers["x-page"];
      if (raw && req.method === "GET" && req.path.startsWith("/api") && !req.path.startsWith("/api/health") && req.path !== "/api/me/pilot") {
        const p = normPage(raw);
        if (/^\/[\w\-./:%~]*$/.test(p)) up.run(new Date().toISOString().slice(0, 10), p);
      }
    } catch {
      /* counting is best effort */
    }
    next();
  };
}

/** 252: משימות פיילוט שאפשר לזהות לבד. */
export function pilotTasks(db, uid) {
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const docs = db.prepare("SELECT blocks_json FROM write_docs WHERE owner_id = ?").all(uid);
  const rich = docs.some((d) => {
    try {
      return JSON.parse(d.blocks_json).filter((b) => String(b.text || "").trim().length > 20).length >= 3;
    } catch {
      return false;
    }
  });
  return [
    { id: "doc", title: "יצירת מסמך חדש בעורך הכתיבה", href: "/write", done: docs.length > 0 },
    { id: "stages", title: "כתיבת לפחות 3 שלבים עם תוכן", href: "/write", done: rich },
    { id: "export", title: "ייצוא קובץ Word או PDF", href: "/write", done: n("SELECT COUNT(*) AS n FROM write_versions v JOIN write_docs d ON d.id = v.doc_id WHERE d.owner_id = ? AND v.note = 'ייצוא קובץ'", uid) > 0 },
    { id: "team", title: "הוספת פעולה ללוח הצוות", href: "/team", done: n("SELECT COUNT(*) AS n FROM team_events WHERE user_id = ?", uid) > 0 },
    { id: "survey", title: "מילוי שאלון קצר על החוויה", href: "/pilot", done: n("SELECT COUNT(*) AS n FROM pilot_surveys WHERE user_id = ?", uid) > 0 },
  ];
}

export function weeklyReport(db) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const s = {
    newUsers: n("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", since),
    newDocs: n("SELECT COUNT(*) AS n FROM write_docs WHERE created_at >= ?", since),
    exports: n("SELECT COUNT(*) AS n FROM write_versions WHERE note = 'ייצוא קובץ' AND saved_at >= ?", since),
    bugsOpen: n("SELECT COUNT(*) AS n FROM bug_reports WHERE status = 'open'"),
    bugsNew: n("SELECT COUNT(*) AS n FROM bug_reports WHERE created_at >= ?", since),
    surveys: n("SELECT COUNT(*) AS n FROM pilot_surveys WHERE created_at >= ?", since),
    requests: n("SELECT COUNT(*) AS n FROM feature_requests WHERE created_at >= ?", since),
  };
  const lines = [`משתמשים חדשים: ${s.newUsers}`, `מסמכים חדשים: ${s.newDocs}`, `ייצואי קבצים: ${s.exports}`, `דיווחי תקלה חדשים: ${s.bugsNew} (פתוחים בסך הכול: ${s.bugsOpen})`, `שאלונים שמולאו: ${s.surveys}`, `הצעות חדשות לפיתוח: ${s.requests}`];
  return { stats: s, text: lines.join("\n"), html: `<div dir="rtl"><h2>דוח שבועי: מחולל הפעולות</h2><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul></div>` };
}

export function registerPilotRoutes(app, { db, mailer, config, limiter, fail, requireUser, requireAdmin, audit }) {
  const lim = limiter(60_000, 60);

  // 252, 259
  app.get("/api/me/pilot", requireUser(), lim, (req, res) => {
    const tasks = pilotTasks(db, req.user.id);
    const u = db.prepare("SELECT created_at FROM users WHERE id = ?").get(req.user.id);
    res.json({ tasks, done: tasks.filter((t) => t.done).length, next: tasks.find((t) => !t.done) ?? null, accountAgeDays: Math.floor((Date.now() - Date.parse(u?.created_at || new Date().toISOString())) / 86400000) });
  });

  // 253
  const surveyZ = z.object({ ease: z.number().int().min(1).max(5), missing: z.string().trim().max(600).default(""), wouldUse: z.boolean() });
  app.post("/api/me/survey", requireUser(), limiter(60 * 60_000, 10), (req, res) => {
    const v = surveyZ.parse(req.body ?? {});
    db.prepare("INSERT INTO pilot_surveys (user_id, ease, missing, would_use, created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET ease=excluded.ease, missing=excluded.missing, would_use=excluded.would_use, created_at=excluded.created_at").run(req.user.id, v.ease, v.missing, v.wouldUse ? 1 : 0, new Date().toISOString());
    res.json({ ok: true });
  });
  app.get("/api/me/survey", requireUser(), lim, (req, res) => {
    const r = db.prepare("SELECT ease, missing, would_use AS wouldUse FROM pilot_surveys WHERE user_id = ?").get(req.user.id);
    res.json(r ? { ...r, wouldUse: !!r.wouldUse } : null);
  });

  // 254: משהו לא עובד. אפשר גם בלי התחברות, עם הגבלת קצב.
  const bugZ = z.object({ text: z.string().trim().min(3, "תארו בקצרה מה קרה").max(800), page: z.string().max(100).default(""), device: z.string().max(200).default("") });
  app.post("/api/report", limiter(60 * 60_000, 15), (req, res) => {
    const v = bugZ.parse(req.body ?? {});
    const who = optionalAuth(req);
    const uid = who?.id ?? null, uname = who?.username ?? null;
    db.prepare("INSERT INTO bug_reports (user_id, username, page, text, device, created_at) VALUES (?,?,?,?,?,?)").run(uid, uname, v.page, v.text, v.device, new Date().toISOString());
    res.status(201).json({ ok: true });
  });

  // 255, 256, 257: לוח "מה אומרים עלינו"
  app.get("/api/admin/pilot", requireAdmin(), (req, res) => {
    const sv = db.prepare("SELECT ease, missing, would_use AS wouldUse, created_at AS createdAt FROM pilot_surveys ORDER BY created_at DESC").all();
    const bugs = db.prepare("SELECT id, username, page, text, device, status, created_at AS createdAt FROM bug_reports ORDER BY (status='open') DESC, id DESC LIMIT 100").all();
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const pages = db.prepare("SELECT page, SUM(n) AS n FROM page_counts WHERE day >= ? GROUP BY page ORDER BY n DESC LIMIT 25").all(since);
    const firsts = db.prepare("SELECT u.created_at AS joined, (SELECT MIN(created_at) FROM write_docs d WHERE d.owner_id = u.id) AS firstDoc FROM users u WHERE u.role != 'ADMIN'").all();
    const mins = firsts.filter((r) => r.firstDoc).map((r) => Math.max(0, Math.round((Date.parse(r.firstDoc) - Date.parse(r.joined)) / 60000))).sort((a, b) => a - b);
    const users = db.prepare("SELECT id, username, display_name AS displayName, created_at AS createdAt FROM users WHERE role != 'ADMIN' ORDER BY id DESC LIMIT 60").all().map((u) => ({ ...u, tasksDone: pilotTasks(db, u.id).filter((t) => t.done).length }));
    res.json({
      surveys: { n: sv.length, avgEase: sv.length ? +(sv.reduce((s, x) => s + x.ease, 0) / sv.length).toFixed(1) : null, wouldUsePct: sv.length ? Math.round((100 * sv.filter((x) => x.wouldUse).length) / sv.length) : null, comments: sv.filter((x) => x.missing).slice(0, 30).map((x) => ({ text: x.missing, at: x.createdAt })) },
      bugs, pages,
      firstDoc: { users: mins.length, medianMinutes: mins.length ? mins[Math.floor(mins.length / 2)] : null, neverWrote: firsts.length - mins.length },
      users,
      report: weeklyReport(db),
    });
  });
  app.patch("/api/admin/bugs/:id", requireAdmin(), (req, res) => {
    const { status } = z.object({ status: z.enum(["open", "done"]) }).parse(req.body ?? {});
    db.prepare("UPDATE bug_reports SET status = ? WHERE id = ?").run(status, Number(req.params.id));
    res.json({ ok: true });
  });
  // 258: שליחת הדוח עכשיו
  app.post("/api/admin/pilot/report", requireAdmin(), limiter(60 * 60_000, 10), (req, res) => {
    const to = config.smtp.adminEmail;
    if (!mailer?.hasTransport || !to) return res.status(400).json(fail("NO_MAIL", "המייל לא מוגדר (SMTP_HOST ו-ADMIN_EMAIL)"));
    mailer.enqueue("דוח שבועי: מחולל הפעולות", weeklyReport(db).html, to);
    audit(db, req.user.username, "pilot.report", {});
    res.json({ queued: true });
  });

  // 260: הצבעה על מה לבנות
  const reqZ = z.object({ title: z.string().trim().min(4, "כתבו לפחות כמה מילים").max(100) });
  app.get("/api/feature-requests", requireUser(), lim, (req, res) => {
    const rows = db.prepare("SELECT r.id, r.title, r.status, r.user_id AS userId, (SELECT COUNT(*) FROM feature_votes v WHERE v.request_id = r.id) AS votes, EXISTS(SELECT 1 FROM feature_votes v WHERE v.request_id = r.id AND v.user_id = ?) AS voted FROM feature_requests r ORDER BY (r.status='open') DESC, votes DESC, r.id DESC LIMIT 100").all(req.user.id);
    res.json(rows.map((r) => ({ id: r.id, title: r.title, status: r.status, votes: r.votes, voted: !!r.voted, mine: r.userId === req.user.id })));
  });
  app.post("/api/feature-requests", requireUser(), limiter(60 * 60_000, 20), (req, res) => {
    const v = reqZ.parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM feature_requests WHERE user_id = ? AND status = 'open'").get(req.user.id).c >= 3) return res.status(409).json(fail("LIMIT", "אפשר להציע עד 3 רעיונות פתוחים. הצביעו על רעיונות אחרים."));
    const r = db.prepare("INSERT INTO feature_requests (user_id, title, created_at) VALUES (?,?,?)").run(req.user.id, v.title, new Date().toISOString());
    db.prepare("INSERT OR IGNORE INTO feature_votes (request_id, user_id) VALUES (?,?)").run(Number(r.lastInsertRowid), req.user.id);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.post("/api/feature-requests/:id/vote", requireUser(), lim, (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare("SELECT 1 FROM feature_requests WHERE id = ?").get(id)) return res.status(404).json(fail("NOT_FOUND", "הרעיון לא נמצא"));
    const had = db.prepare("SELECT 1 FROM feature_votes WHERE request_id = ? AND user_id = ?").get(id, req.user.id);
    if (had) db.prepare("DELETE FROM feature_votes WHERE request_id = ? AND user_id = ?").run(id, req.user.id);
    else db.prepare("INSERT INTO feature_votes (request_id, user_id) VALUES (?,?)").run(id, req.user.id);
    res.json({ voted: !had });
  });
  app.patch("/api/admin/feature-requests/:id", requireAdmin(), (req, res) => {
    const { status } = z.object({ status: z.enum(["open", "planned", "done", "declined"]) }).parse(req.body ?? {});
    db.prepare("UPDATE feature_requests SET status = ? WHERE id = ?").run(status, Number(req.params.id));
    res.json({ ok: true });
  });
}

/** דוח שבועי אוטומטי למייל של האדמין (אם המייל מוגדר). נקרא מהלולאה של ops. */
export function sendWeeklyReportIfDue(db, mailer, config) {
  const to = config.smtp.adminEmail;
  if (!mailer?.hasTransport || !to) return false;
  if (Date.now() - Number(getSet(db, "lastWeeklyReport", "0")) < 7 * 86400000) return false;
  mailer.enqueue("דוח שבועי: מחולל הפעולות", weeklyReport(db).html, to);
  putSet(db, "lastWeeklyReport", Date.now());
  return true;
}
