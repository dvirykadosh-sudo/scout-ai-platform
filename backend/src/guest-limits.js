// שלב 64: מכסות יומיות לפי כתובת (IP) למי שלא מחובר. נוספות להגבלות הקצב הקיימות (שמתאפסות כל שעה או כל 15 דקות).
// הן נועדו לכך שמתחבר אחד לא ימלא את תור הדיווחים, הדירוגים או טבלת השגיאות. נספרות בזיכרון ומתאפסות בחצות UTC.
import { config } from "./config.js";
import { optionalAuth } from "./auth.js";

let day = "";
const counts = new Map();

// בבדיקות האוטומטיות המכסות כבויות, אלא אם הוגדר DAILY_CAPS=1
const active = () => config.nodeEnv !== "test" || process.env.DAILY_CAPS === "1";

/** מוסיף 1 למונה ומחזיר false אם עברנו את המקסימום. */
export function takeDaily(label, key, max) {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) {
    day = d;
    counts.clear();
  }
  const k = `${label}|${key}`;
  const n = (counts.get(k) || 0) + 1;
  counts.set(k, n);
  if (counts.size > 20000) counts.clear(); // הגנה על הזיכרון
  return n <= max;
}

/** middleware: מגביל לכל IP (ורק אורחים אם guestsOnly) מספר פניות ליום. keyExtra מאפשר לספור לפי יעד (למשל לפי פעולה). */
export function guestDailyCap({ label, max, guestsOnly = true, keyExtra = () => "", message = "הגעתם למכסה היומית של הפעולה הזו. נסו שוב מחר, או התחברו." }) {
  return (req, res, next) => {
    if (!active()) return next();
    if (guestsOnly && optionalAuth(req)) return next();
    if (takeDaily(label, `${req.ip || ""}|${keyExtra(req)}`, max)) return next();
    return res.status(429).json({ error: { code: "DAILY_CAP", message } });
  };
}
