// שלב 58 – נתיבים שהגשר המקומי קורא להם: /api/wa/bridge/*. האימות באסימון גשר (כותרת X-Maoz-Bridge),
// לא בחשבון משתמש. הגשר רק שואב משימות ומדווח; כל ההחלטות (קצב, מכסות, בוט) נעשות כאן בשרת.
import { z } from "zod";
import { verifyBridge, touchBridge } from "./bridge-auth.js";
import { completeJob, leaseNext } from "./queue.js";
import { handleInbound } from "./bot.js";
import { liveStatus, reportGroups, reportState } from "./status.js";
import { loadSettings } from "./settings.js";

// QR: מחרוזת הקוד הגולמית (עד 4000 תווים) או תמונת PNG כ-data URL (עד 90KB), שמקורה בספריית הוואטסאפ של הגשר
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const qrField = z.string().max(90_000).refine((v) => v.length <= 4000 || PNG_URL.test(v), { message: "QR לא תקין" });
const heartbeat = z.object({
  state: z.string().max(20),
  qr: qrField.optional(),
  account: z.object({ hint: z.string().max(12).optional(), name: z.string().max(40).optional() }).optional(),
  version: z.string().max(20).optional(),
});
const result = z.object({ jobId: z.number().int(), ok: z.boolean(), error: z.string().max(300).optional(), permanent: z.boolean().optional() });
const inbound = z.object({ id: z.string().max(120).optional(), from: z.string().max(60), isGroup: z.boolean().optional(), groupId: z.string().max(60).optional(), text: z.string().max(4000), name: z.string().max(60).optional() });
const groups = z.object({ groups: z.array(z.object({ id: z.string().max(60), name: z.string().max(80).optional(), size: z.number().optional() })).max(300) });

export function registerBridgeRoutes(app, { db, limiter, fail, audit, notifyAdmins, publicUrl }) {
  const lim = limiter(60_000, 240);

  /** מאמת גשר לפי הכותרת. מציב req.bridge. */
  const bridgeAuth = (req, res, next) => {
    const b = verifyBridge(db, req.headers["x-maoz-bridge"]);
    if (!b) return res.status(401).json(fail("UNAUTHORIZED", "אסימון גשר לא תקין או שבוטל"));
    req.bridge = b;
    next();
  };

  app.post("/api/wa/bridge/heartbeat", lim, bridgeAuth, (req, res) => {
    const v = heartbeat.parse(req.body ?? {});
    const st = reportState(req.bridge.id, v);
    touchBridge(db, req.bridge.id, { state: st.state, phoneHint: st.account?.hint, version: st.version });
    const s = loadSettings(db);
    res.json({ ok: true, pollMs: 3000, serverTime: Date.now(), sendingEnabled: s.enabled });
  });

  app.get("/api/wa/bridge/next", lim, bridgeAuth, (req, res) => {
    const live = liveStatus();
    // לא חוכרים משימות כשוואטסאפ לא מחובר: הן נשארות בתור
    if (live.state !== "connected" || live.bridgeId !== req.bridge.id) return res.json({ job: null, retryInMs: 5000, reason: "not_connected" });
    const out = leaseNext(db, loadSettings(db), { bridgeId: req.bridge.id });
    res.json(out);
  });

  app.post("/api/wa/bridge/result", lim, bridgeAuth, (req, res) => {
    const v = result.parse(req.body ?? {});
    const r = completeJob(db, loadSettings(db), {
      ...v,
      bridgeId: req.bridge.id,
      onBreaker: (min, fails) => notifyAdmins?.(db, "wa", `שליחת הוואטסאפ נעצרה אוטומטית ל-${min} דקות אחרי ${fails} כשלונות רצופים. כדאי לבדוק את החיבור.`, "/whatsapp"),
    });
    if (!r.ok) return res.status(409).json(fail("NOT_LEASED", "המשימה לא חכורה לגשר הזה"));
    res.json(r);
  });

  app.post("/api/wa/bridge/inbound", lim, bridgeAuth, (req, res) => {
    const v = inbound.parse(req.body ?? {});
    const out = handleInbound(db, loadSettings(db), { id: v.id, from: v.from, isGroup: !!v.isGroup, groupId: v.groupId, text: v.text }, { publicUrl });
    if (out.handled === "optout") audit(db, "wa-bot", "wa.optout", {});
    res.json({ handled: out.handled });
  });

  app.post("/api/wa/bridge/groups", lim, bridgeAuth, (req, res) => {
    reportGroups(groups.parse(req.body ?? {}).groups);
    res.json({ ok: true });
  });
}
