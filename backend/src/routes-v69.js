// שלב 69: נתיבי סריקת מערך מצולם וחדרי סנכרון צוות למצב שטח.
import express from "express";
import { z } from "zod";
import { AiUnavailable } from "./ai-router.js";
import { CODE_RE, createRooms } from "./field-rooms.js";
import { scanImage, sniffImage } from "./scan-ocr.js";

const roomBody = z.object({ activityId: z.number().int().min(1).max(2_000_000_000) }).strict();
const stateBody = z
  .object({
    cid: z.string().regex(/^[a-f0-9]{16}$/),
    idx: z.number().int().min(0).max(60),
    running: z.boolean(),
    remaining: z.number().int().min(-3600).max(36_000),
  })
  .strict();

export function registerV69Routes(app, { db, limiter, fail, requireUser }) {
  // ───────── סריקת מערך מצולם ─────────
  const rawImage = express.raw({ type: () => true, limit: "3mb" });
  const scanLim = limiter(15 * 60_000, 15);
  app.post("/api/lux/scan", requireUser(), scanLim, rawImage, async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.headers["x-scan-consent"] !== "yes") return res.status(400).json(fail("CONSENT", "כדי לסרוק צריך לאשר שהתמונה נשלחת לתמלול אצל Google"));
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const mime = sniffImage(buf);
    if (!mime) return res.status(400).json(fail("BAD_IMAGE", "הקובץ אינו תמונה נתמכת (JPG, PNG או WebP)"));
    const eagle = app.locals.luxEagle;
    if (!eagle?.router?.configured()) return res.status(503).json(fail("AI_OFF", "הסריקה האוטומטית לא מופעלת בשרת (חסר GEMINI_API_KEY). אפשר להקליד את הטקסט ידנית."));
    if (!eagle.spendAi(req.user.id)) return res.status(429).json(fail("AI_LIMIT", "הסריקה האוטומטית לא זמינה כרגע (מכסה יומית או עומס). אפשר להקליד את הטקסט ידנית."));
    try {
      res.json(await scanImage(eagle.router, { mime, buf }));
    } catch (e) {
      if (e?.code === "NO_TEXT") return res.status(422).json(fail("NO_TEXT", "לא זוהה טקסט בתמונה. נסו לצלם מקרוב, באור טוב ובלי צל."));
      if (e instanceof AiUnavailable) return res.status(503).json(fail("AI_OFF", "השירות האוטומטי לא ענה. אפשר לנסות שוב בעוד רגע או להקליד את הטקסט ידנית."));
      return res.status(500).json(fail("SCAN", "הסריקה נכשלה"));
    }
  });

  // ───────── חדרי סנכרון צוות ─────────
  const rooms = app.locals.fieldRooms ?? (app.locals.fieldRooms = createRooms());
  const createLim = limiter(15 * 60_000, 20);
  const joinLim = limiter(60_000, 40);
  const pushLim = limiter(60_000, 300);
  const code = (req) => String(req.params.code || "").toUpperCase();

  app.post("/api/field/rooms", requireUser(), createLim, (req, res) => {
    const v = roomBody.safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", "פרטי החדר אינם תקינים"));
    if (!db.prepare("SELECT 1 FROM activities WHERE id = ?").get(v.data.activityId)) return res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
    try {
      res.set("Cache-Control", "no-store");
      res.status(201).json(rooms.create({ activityId: v.data.activityId, ownerId: req.user.id }));
    } catch {
      res.status(503).json(fail("FULL", "יש כרגע יותר מדי חדרים פעילים. נסו שוב בעוד כמה דקות."));
    }
  });

  app.get("/api/field/rooms/:code", joinLim, (req, res) => {
    res.set("Cache-Control", "no-store");
    const info = CODE_RE.test(code(req)) ? rooms.info(code(req)) : null;
    if (!info) return res.status(404).json(fail("NOT_FOUND", "החדר לא נמצא"));
    res.json(info);
  });

  app.get("/api/field/rooms/:code/stream", joinLim, (req, res) => {
    const c = code(req);
    const cid = String(req.query.cid || "");
    if (!CODE_RE.test(c) || !/^[a-f0-9]{16}$/.test(cid)) return res.status(404).json(fail("NOT_FOUND", "החדר לא נמצא"));
    const chk = rooms.check(c, cid);
    if (chk === "none") return res.status(404).json(fail("NOT_FOUND", "החדר לא נמצא"));
    if (chk === "full") return res.status(409).json(fail("FULL", "החדר מלא"));
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform", // no-transform: שלב 54 דוחס תשובות, ו-SSE חייב לצאת מיד
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const left = rooms.join(c, cid, res);
    if (typeof left !== "function") {
      res.write(`event: error\ndata: ${JSON.stringify({ code: left })}\n\n`);
      res.end();
      return;
    }
    req.on("close", left);
  });

  app.post("/api/field/rooms/:code/state", pushLim, (req, res) => {
    res.set("Cache-Control", "no-store");
    const v = stateBody.safeParse(req.body ?? {});
    if (!v.success || !CODE_RE.test(code(req))) return res.status(400).json(fail("BAD_REQUEST", "העדכון אינו תקין"));
    const members = rooms.push(code(req), v.data.cid, v.data);
    if (!members) return res.status(409).json(fail("NOT_CONNECTED", "אין חיבור פעיל לחדר"));
    res.json({ ok: true, members });
  });

  app.delete("/api/field/rooms/:code", requireUser(), joinLim, (req, res) => {
    if (!CODE_RE.test(code(req)) || !rooms.has(code(req))) return res.status(404).json(fail("NOT_FOUND", "החדר לא נמצא"));
    if (!rooms.isOwner(code(req), req.user.id)) return res.status(403).json(fail("FORBIDDEN", "רק מי שפתח את החדר יכול לסגור אותו"));
    rooms.close(code(req));
    res.json({ ok: true });
  });
}
