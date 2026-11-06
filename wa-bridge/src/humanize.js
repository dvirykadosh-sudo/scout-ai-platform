// זמנים אנושיים: המתנה עם ביטול, השהיה אקראית וגידול הדרגתי בין ניסיונות.

/** המתנה שאפשר לבטל (בכיבוי הגשר). לא זורקת שגיאה: מחזירה false אם בוטלה. */
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const t = setTimeout(done, Math.max(0, ms));
    function done() { signal?.removeEventListener("abort", stop); resolve(true); }
    function stop() { clearTimeout(t); resolve(false); }
    signal?.addEventListener("abort", stop, { once: true });
  });
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || lo));

/** המתנה גדלה עם ניסיונות (בסיס × 2^ניסיון), עם רעש של עד 25% כדי שלא יהיה קצב קבוע */
export function backoff(attempt, baseMs = 2000, maxMs = 120_000, rand = Math.random) {
  const raw = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.round(raw * (0.85 + rand() * 0.4));
}

/** הזמן שהגשר מדמה "הקלדה" לפני השליחה: ממה שהשרת קבע, בתקרה בטוחה */
export const typingWait = (typingMs) => clamp(typingMs, 0, 20_000);
