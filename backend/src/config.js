import "dotenv/config";
import crypto from "node:crypto";

const env = process.env;
const nodeEnv = env.NODE_ENV || "development";
const isProd = nodeEnv === "production";

export const DEFAULT_ADMIN_PASSWORD = "admin123";

// שלב 63: TRUST_PROXY = כמה שרתי ביניים (פרוקסי) יושבים לפני האפליקציה. ברירת מחדל 1.
// מספר, או "loopback" וכדומה. "true" מותר אבל פותח את הדלת לזיוף כתובת, ולכן נחשב לא בטוח.
const parseTrust = (v) => {
  const t = String(v ?? "").trim();
  if (!t) return 1;
  if (/^\d+$/.test(t)) return Number(t);
  if (t === "true") return true;
  if (t === "false") return false;
  return t;
};

export const config = {
  nodeEnv,
  isProd,
  // שלב 63: בדיקות "זמן אנושי" (אסימון טופס, שאלת חשבון). פעילות בפרודקשן; הבדיקות האוטומטיות מדליקות אותה במקום שהן בודקות אותה.
  strictTiming: isProd || env.STRICT_TIMING === "1",
  port: Number(env.PORT) || 4000,
  // שלב 64: בפרודקשן בלי WEB_ORIGIN לא מתירים אף מקור חיצוני (האתר והשרת על אותו דומיין, ואין צורך ב-CORS)
  webOrigin: env.WEB_ORIGIN || (isProd ? "" : "http://localhost:3000"),
  // הכתובת הציבורית של האתר (למשל https://maoz.example.co.il), לקישורים בקבצי יומן
  publicUrl: (env.PUBLIC_URL || "").replace(/\/+$/, ""),
  dbPath: env.DB_PATH || "./data/scout.db",
  jwtSecret: env.JWT_SECRET || (isProd ? "" : crypto.randomBytes(32).toString("hex")),
  // שלב 63: החלפת מפתח בלי לנתק את כולם: שמים את הישן ב-JWT_SECRET_PREVIOUS והחדש ב-JWT_SECRET (הישן רק נבדק, לא חותם).
  jwtSecretPrevious: env.JWT_SECRET_PREVIOUS || "",
  // מפתח נפרד להצפנת סודות ה-2FA (אופציונלי). אם לא הוגדר, משתמשים ב-JWT_SECRET כמו קודם.
  totpKey: env.TOTP_KEY || "",
  trustProxy: parseTrust(env.TRUST_PROXY),
  // שם כותרת שהפלטפורמה מציבה עם כתובת המבקר (למשל cf-connecting-ip). להגדיר רק אחרי בדיקה בעמוד האדמין.
  clientIpHeader: /^[A-Za-z][A-Za-z0-9-]{2,40}$/.test(env.CLIENT_IP_HEADER || "") ? String(env.CLIENT_IP_HEADER).toLowerCase() : "",
  tokenHours: Number(env.TOKEN_HOURS) || 8,
  instructorTokenDays: Number(env.INSTRUCTOR_TOKEN_DAYS) || 30,
  signupCode: env.SIGNUP_CODE || "",
  backupDir: env.BACKUP_DIR || "",
  backupKeep: Number(env.BACKUP_KEEP) || 14,
  backupEveryHours: env.BACKUP_EVERY_HOURS === undefined ? 24 : Number(env.BACKUP_EVERY_HOURS),
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
    // ערוצי שליחה ב-HTTPS (עובדים גם ב-Render חינמי, שחוסם פורטי SMTP)
    relayUrl: env.MAIL_RELAY_URL || "",
    relaySecret: env.MAIL_RELAY_SECRET || "",
    resendKey: env.RESEND_API_KEY || "",
    fromName: env.MAIL_FROM_NAME || "",
  },
  // שליחת SMS: כתובת webhook כללית (Make, Zapier, פונקציית Twilio וכו') שמקבלת {to, message}
  sms: { webhook: env.SMS_WEBHOOK_URL || "", token: env.SMS_WEBHOOK_TOKEN || "" },
  ai: {
    key: env.ANTHROPIC_API_KEY || "",
    model: env.AI_MODEL || "claude-sonnet-5-5",
    // שלב 64: תקרת קריאות למודל לכל האתר ביום (כולל אורחים). מעבר לה כולם עוברים למחולל המקומי, בלי עלות.
    dailyCap: Math.max(0, Number(env.AI_DAILY_CAP ?? 400) || 0),
  },
  // שלב 64: כמה פעולות בלי התחברות מותר ליצור מכל כתובת ביום (בנוסף למכסה הכללית)
  guestDailyPerIp: Math.max(1, Number(env.GUEST_DAILY_PER_IP ?? 40) || 40),
};

/** מפתח משנה לשימוש מסוים (HKDF), כדי שאסימון שנוצר לצורך אחד לא יתקבל בצורך אחר. */
export const deriveKey = (purpose) => Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, "maoz-keys-v1", String(purpose), 32));

/** אזהרות הגדרה שמוצגות בעמוד האדמין (לא מפילות את השרת). */
export function configWarnings() {
  const w = [];
  if (config.isProd) {
    if (config.jwtSecret.length < 32) w.push(`JWT_SECRET קצר (${config.jwtSecret.length} תווים). מומלץ מחרוזת אקראית של 32 תווים ומעלה. החלפה מנתקת את כל המחוברים; כדי להימנע מזה שימו את הישן ב-JWT_SECRET_PREVIOUS.`);
    if (config.trustProxy === true) w.push("TRUST_PROXY=true מאפשר לכל מבקר לזייף את כתובת ה-IP שלו. עדיף מספר (למשל 1).");
    // שלב 64 (ממצא 36): שם משתמש ברירת מחדל מקל על ניחוש. אפשר להגדיר ADMIN_USERNAME אחר (החשבון הקיים לא משתנה אוטומטית).
    if (config.admin.username === "admin") w.push("שם המשתמש של האדמין הוא \"admin\", וזה השם הראשון שמנחשים. אפשר לשנות אותו בהגדרות החשבון, או להגדיר ADMIN_USERNAME לפני יצירת מסד חדש.");
  }
  return w;
}

/** In production the server refuses to start with unsafe defaults. */
export function assertProductionSafe() {
  if (!config.isProd) return;
  const problems = [];
  if (!env.JWT_SECRET) problems.push("חסר JWT_SECRET");
  else if (env.JWT_SECRET.length < 16) problems.push("JWT_SECRET קצר מדי (פחות מ-16 תווים): אפשר לנחש אותו ולזייף התחברות אדמין. צרו מחרוזת אקראית של 32 תווים ומעלה");
  else if (env.JWT_SECRET.length < 32) console.warn("אזהרת אבטחה: JWT_SECRET קצר מ-32 תווים. מומלץ להחליף במחרוזת אקראית ארוכה");
  if (config.trustProxy === true) console.warn("אזהרת אבטחה: TRUST_PROXY=true מאפשר זיוף כתובת IP. עדיף מספר.");
  if (config.admin.password === DEFAULT_ADMIN_PASSWORD) problems.push("סיסמת האדמין היא ברירת המחדל");
  if (problems.length) {
    console.error("לא ניתן להפעיל במצב production: " + problems.join(", "));
    process.exit(1);
  }
}
