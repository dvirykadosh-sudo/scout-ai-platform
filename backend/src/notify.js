// התראות פנימיות באתר: למשתמש מסוים או לכל האדמינים.
import { nowIso } from "./db.js";

export function notify(db, userId, kind, text, link = "") {
  if (!userId) return;
  db.prepare("INSERT INTO notifications (user_id, kind, text, link, read, created_at) VALUES (?,?,?,?,0,?)").run(userId, kind, String(text).slice(0, 300), link, nowIso());
}

export function notifyAdmins(db, kind, text, link = "") {
  for (const u of db.prepare("SELECT id FROM users WHERE role = 'ADMIN' AND disabled = 0").all()) notify(db, u.id, kind, text, link);
}
