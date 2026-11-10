// שלב 55: עזרים לקידום באתרי חיפוש. אינדוקס פעיל כברירת מחדל; ALLOW_INDEXING=0 סוגר אותו.
import type { Activity } from "./types";

export const INDEXING = process.env.ALLOW_INDEXING !== "0";
export const siteUrl = (): string => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/+$/, "");
/** כתובות שנשארות מחוץ לחיפוש: קישורים סודיים (הזמנה, צפייה בטיוטה) ולוח הבקרה. */
export const PRIVATE_PATHS = ["/api/", "/admin", "/join/", "/write/view/", "/assistant/shared", "/stage/", "/projector/", "/trail", "/insights", "/wrapped", "/comfort"];

const apiBase = () => process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}`;

/** קריאה פנימית ל-API מתוך שרת הדפים. מזוהה במפתח סודי, ולכן לא נספרת כמבקר ולא נחסמת במגבלת הקצב. */
export async function internalGet<T>(path: string): Promise<{ status: number; data: T | null }> {
  try {
    const r = await fetch(`${apiBase()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(4000), headers: { "x-internal-ssr": process.env.INTERNAL_SSR_KEY || "" } });
    return { status: r.status, data: r.ok ? ((await r.json()) as T) : null };
  } catch {
    return { status: 0, data: null };
  }
}

const cache = new Map<string, { at: number; v: { status: number; data: Activity | null } }>();
/** פעולה לפי מספר, עם מטמון של דקה כדי לא לקרוא למסד על כל כניסה. */
export async function loadActivity(id: string): Promise<{ status: number; data: Activity | null }> {
  if (!/^\d{1,9}$/.test(id)) return { status: 404, data: null };
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const v = await internalGet<Activity>(`/api/activities/${id}`);
  if (v.status === 200 || v.status === 404) {
    if (cache.size > 400) cache.clear();
    cache.set(id, { at: Date.now(), v });
  }
  return v;
}

export const describeActivity = (a: Pick<Activity, "ageGroup" | "leadingValue" | "durationMin" | "stages">): string => {
  const s = a.stages?.[0] as { description?: string; text?: string } | undefined;
  const first = (s?.description || s?.text || "").replace(/\s+/g, " ").trim();
  return `פעולה בנושא ${a.leadingValue} לבני ${a.ageGroup}, ${a.durationMin} דקות. ${first}`.trim().slice(0, 200);
};
