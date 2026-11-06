// קריאת ההגדרות. סדר עדיפות: משתני סביבה > ~/.maoz-wa-bridge/.env > wa-bridge/.env
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class ConfigError extends Error {}

const TOKEN = /^wb_[0-9a-f]{48}$/;
const ADAPTERS = new Set(["openwa", "mock"]);

export const defaultDataDir = () => path.join(os.homedir(), ".maoz-wa-bridge");

/** פענוח קובץ .env פשוט: KEY=VALUE, שורות # הן הערות, גרשיים אופציונליים */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

function readEnvFile(file) {
  try { return parseEnv(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

/** כתובת האתר: https בלבד, חוץ מ-localhost (בדיקות). האסימון לא יוצא בחיבור לא מוצפן. */
export function cleanSiteUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { throw new ConfigError("SITE_URL לא תקין. דוגמה: https://shevet-maoz-app.onrender.com"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new ConfigError("SITE_URL חייב להתחיל ב-https:// (כדי שהאסימון לא ייחשף ברשת)");
  return u.origin;
}

/** בונה את ההגדרות. env מוזרק לבדיקות. */
export function loadConfig({ env = process.env, bridgeDir = process.cwd(), dataDirOverride } = {}) {
  const dataDir = dataDirOverride || env.DATA_DIR || defaultDataDir();
  const merged = { ...readEnvFile(path.join(bridgeDir, ".env")), ...readEnvFile(path.join(dataDir, ".env")) };
  for (const k of ["SITE_URL", "BRIDGE_TOKEN", "ADAPTER", "SHOW_BROWSER", "CHROME_PATH", "LOG_LEVEL"]) if (env[k]) merged[k] = env[k];

  if (!merged.BRIDGE_TOKEN || !merged.SITE_URL) throw new ConfigError("חסרות הגדרות. הריצו את setup-bridge.bat");
  if (!TOKEN.test(merged.BRIDGE_TOKEN)) throw new ConfigError("BRIDGE_TOKEN לא תקין. הוא אמור להתחיל ב-wb_ ולהיות באורך 51 תווים. צרו אסימון חדש באתר");
  const adapter = (merged.ADAPTER || "openwa").toLowerCase();
  if (!ADAPTERS.has(adapter)) throw new ConfigError("ADAPTER חייב להיות openwa או mock");

  return {
    siteUrl: cleanSiteUrl(merged.SITE_URL),
    token: merged.BRIDGE_TOKEN,
    adapter,
    headless: String(merged.SHOW_BROWSER || "false").toLowerCase() !== "true",
    chromePath: merged.CHROME_PATH || "",
    logLevel: merged.LOG_LEVEL || "info",
    dataDir,
    sessionDir: path.join(dataDir, "session"),
    outboxFile: path.join(dataDir, "outbox.json"),
  };
}
