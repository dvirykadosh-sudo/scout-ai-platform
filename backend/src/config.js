import "dotenv/config";
import crypto from "node:crypto";

const env = process.env;
const nodeEnv = env.NODE_ENV || "development";
const isProd = nodeEnv === "production";

export const DEFAULT_ADMIN_PASSWORD = "admin123";

export const config = {
  nodeEnv,
  isProd,
  port: Number(env.PORT) || 4000,
  webOrigin: env.WEB_ORIGIN || "http://localhost:3000",
  dbPath: env.DB_PATH || "./data/scout.db",
  jwtSecret: env.JWT_SECRET || (isProd ? "" : crypto.randomBytes(32).toString("hex")),
  tokenHours: Number(env.TOKEN_HOURS) || 8,
  bcryptCost: nodeEnv === "test" ? 4 : 12,
  admin: {
    username: env.ADMIN_USERNAME || "admin",
    password: env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
  },
  smtp: {
    host: env.SMTP_HOST || "",
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.SMTP_FROM || env.SMTP_USER || "noreply@maoz.local",
    adminEmail: env.ADMIN_EMAIL || "",
  },
  ai: {
    key: env.ANTHROPIC_API_KEY || "",
    model: env.AI_MODEL || "claude-sonnet-5-5",
  },
};

/** In production the server refuses to start with unsafe defaults. */
export function assertProductionSafe() {
  if (!config.isProd) return;
  const problems = [];
  if (!env.JWT_SECRET) problems.push("חסר JWT_SECRET");
  if (config.admin.password === DEFAULT_ADMIN_PASSWORD) problems.push("סיסמת האדמין היא ברירת המחדל");
  if (problems.length) {
    console.error("לא ניתן להפעיל במצב production: " + problems.join(", "));
    process.exit(1);
  }
}
