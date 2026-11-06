// שלב 58 – נקודת הכניסה של מודול הוואטסאפ: רושמת את הנתיבים ומפעילה את התזמון.
import { registerAdminRoutes } from "./routes-admin.js";
import { registerBridgeRoutes } from "./routes-bridge.js";
import { startWaScheduler } from "./scheduler.js";

/** startScheduler=false בבדיקות, כדי שלא יתחילו טיימרים. */
export function registerWaRoutes(app, deps, { startScheduler = true } = {}) {
  registerAdminRoutes(app, deps);
  registerBridgeRoutes(app, deps);
  return startScheduler ? startWaScheduler(deps.db) : () => {};
}
