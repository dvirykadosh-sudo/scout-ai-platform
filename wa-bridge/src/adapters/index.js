// בחירת מתאם לפי ההגדרות.
import { MockAdapter } from "./mock.js";
import { OpenWaAdapter } from "./openwa.js";

export function createAdapter(config, log) {
  if (config.adapter === "mock") return new MockAdapter({ autoScanMs: 4000 }); // הדמיה: מתחבר לבד אחרי 4 שניות
  return new OpenWaAdapter({ sessionDir: config.sessionDir, headless: config.headless, chromePath: config.chromePath, log });
}
