// לוג פשוט. לא מדפיס אסימונים, טקסט הודעות או מספרי טלפון מלאים.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** secrets: מחרוזות שיוחלפו ב-*** בכל שורה (למשל האסימון). */
export function createLogger({ level = "info", secrets = [], out = console } = {}) {
  const min = LEVELS[level] ?? 20;
  const clean = (s) => secrets.filter(Boolean).reduce((t, x) => t.split(x).join("***"), String(s));
  const stamp = () => new Date().toLocaleTimeString("he-IL", { hour12: false });
  const emit = (lvl, fn) => (...a) => {
    if (LEVELS[lvl] < min) return;
    fn.call(out, `[${stamp()}] ${clean(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" "))}`);
  };
  return { debug: emit("debug", out.log), info: emit("info", out.log), warn: emit("warn", out.warn), error: emit("error", out.error) };
}

export const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** …4567 – הצגה בטוחה של מזהה וואטסאפ ביומן */
export function hint(id) {
  const s = String(id || "");
  if (s.endsWith("@g.us")) return "קבוצה";
  const d = s.replace(/@.*/, "");
  return d.length >= 4 ? `…${d.slice(-4)}` : "…";
}
