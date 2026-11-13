// שלב 64 (ממצא 23): תקרת הוצאה כללית על קריאות למודל. נקרא לפני כל קריאה ל-Anthropic.
// אורחים יכולים להפעיל חלק מהנקודות, ולכן בלי תקרה כללית אפשר היה להריץ חשבון גבוה. מעבר לתקרה האתר חוזר למחולל המקומי.
import { config } from "./config.js";

let day = "";
let used = 0;
let blockedToday = 0;

const today = () => new Date().toISOString().slice(0, 10);

/** מקצה קריאה אחת. מחזיר false כשהתקרה היומית מוצתה. */
export function takeAiBudget() {
  const d = today();
  if (d !== day) {
    day = d;
    used = 0;
    blockedToday = 0;
  }
  if (used >= config.ai.dailyCap) {
    blockedToday++;
    return false;
  }
  used++;
  return true;
}

export const aiBudgetState = () => ({ day: day || today(), used: day === today() ? used : 0, cap: config.ai.dailyCap, blocked: day === today() ? blockedToday : 0 });

/** זורק שגיאה אם התקרה מוצתה. הקוראים כבר תופסים שגיאות ועוברים לגרסה המקומית. */
export function requireAiBudget() {
  if (!takeAiBudget()) throw new Error("AI daily cap reached");
}
