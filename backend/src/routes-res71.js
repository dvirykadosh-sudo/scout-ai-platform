// שלב 71: בדיקת התנגשות חדר וציוד ביומן (חיה, בזמן מילוי הטופס) ותפוסת המשאבים של השבט.
import { z } from "zod";
import { isRealDate } from "./organizer.js";
import { clashesFor, clashText, reservations } from "./resources.js";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const checkBody = z
  .object({
    date: z.string().refine(isRealDate, "תאריך לא תקין"),
    time: z.union([z.string().regex(timeRe), z.literal("")]).optional(),
    durationMin: z.number().int().min(5).max(600).nullable().optional(),
    activityId: z.number().int().min(1).nullable().optional(),
    room: z.string().trim().max(60).optional(),
    gear: z.array(z.string().max(24)).max(20).optional(),
    excludeId: z.number().int().min(1).optional(),
  })
  .strict();

export function registerResourceRoutes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 120);

  app.post("/api/me/schedule/check", requireUser(), lim, (req, res) => {
    const v = checkBody.parse(req.body ?? {});
    res.set("Cache-Control", "no-store");
    if (!v.time) return res.json({ clashes: [], skipped: "no-time", messages: [] });
    let dur = v.durationMin ?? null;
    if (dur == null && v.activityId) dur = db.prepare("SELECT duration_min FROM activities WHERE id = ?").get(v.activityId)?.duration_min ?? null;
    const clashes = clashesFor(db, { userId: req.user.id, date: v.date, time: v.time, durationMin: dur, room: v.room, gear: v.gear, excludeId: v.excludeId });
    res.json({ clashes, skipped: null, messages: clashes.map(clashText) });
  });

  app.get("/api/me/reservations", requireUser(), lim, (req, res) => {
    const from = isRealDate(String(req.query.from)) ? String(req.query.from) : null;
    const to = isRealDate(String(req.query.to)) ? String(req.query.to) : null;
    if (!from || !to || to < from || (Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) return res.status(400).json(fail("VALIDATION", "בחרו טווח תאריכים של עד חודשיים"));
    res.set("Cache-Control", "no-store").json(reservations(db, req.user.id, from, to));
  });
}
