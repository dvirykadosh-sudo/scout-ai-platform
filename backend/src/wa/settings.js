// שלב 58 – טעינה ושמירה של הגדרות הוואטסאפ (מכסות, שעות שקט, בוט). האימות והתקרות ב-rate-policy.js.
import { kvGet, kvSet, storedSettings } from "./repo.js";
import { mergeSettings, settingsSchema } from "./rate-policy.js";

/** ההגדרות בפועל: ברירות מחדל + מה ששמור. */
export const loadSettings = (db) => mergeSettings(storedSettings(db));

/** שומר שינוי חלקי אחרי אימות. זורק ZodError אם הערכים לא תקינים. */
export function saveSettings(db, patch) {
  const clean = settingsSchema.parse(patch ?? {});
  const next = mergeSettings({ ...storedSettings(db), ...clean });
  kvSet(db, "settings", JSON.stringify(next));
  return next;
}

// מצב ריצה קבוע: מתי מותר לשלוח הבא, עצירת חירום, ספירת כשלונות, ומתי נשלחה הראשונה (לחימום)
export const numKv = (db, key) => {
  const v = Number(kvGet(db, key));
  return Number.isFinite(v) && v > 0 ? v : 0;
};
export const setNumKv = (db, key, n) => kvSet(db, key, Math.round(n));
