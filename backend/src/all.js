// שירות יחיד לפריסה: ה-API והאתר (Next.js) באותו פורט ובאותה כתובת.
// הרצה: node backend/src/all.js  (אחרי: node run.mjs build-prod)
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { ensureAdmin } from "./auth.js";
import { backupDirFor, startBackupSchedule } from "./backup.js";
import { getActivity } from "./activities.js";
import { assertProductionSafe, config } from "./config.js";
import { openDb } from "./db.js";
import { createMailer } from "./email.js";
import { restoreIfMissing, startPersist } from "./persist.js";
import { applyPendingRestore, startOps } from "./ops.js";
import { seedIfEmpty } from "./seed.js";

process.env.NEXT_DIST_DIR ||= ".next-prod";
const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend");
const require = createRequire(path.join(frontendDir, "package.json"));
const next = require("next");

assertProductionSafe();
if (applyPendingRestore(config.dbPath)) console.log("בוצע שחזור מקובץ שהועלה. הקודם נשמר כ-before-restore.");
await restoreIfMissing(config.dbPath);
const db = openDb();
seedIfEmpty(db);
ensureAdmin(db);
const mailer = createMailer(db, config.smtp);
mailer.start();
startBackupSchedule(db, backupDirFor());
const persist = startPersist(db, config.dbPath);
startOps({ db, dbFile: config.dbPath, config, mailer });
if (persist) {
  const bye = async () => {
    await persist.flush();
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
}

const web = next({ dev: false, dir: frontendDir });
await web.prepare();
const handle = web.getRequestHandler();

const app = createApp({ db, mailer, serveStatic: false, dbFile: config.dbPath });
app.set("restartOnRestore", true);
// שלב 55: עמוד פעולה שלא קיים מחזיר קוד 404 אמיתי (בלי זה גוגל ירשום "200 עם הודעת שגיאה").
// Next.js כבר שלח "200" כשהוא מגלה זאת בתוך מבנה הטעינה, לכן הקוד נקבע כאן, לפני שהוא מתחיל.
const LIB = /^\/library\/([^/?#]+)(?:\/(?:cards|brief))?\/?(?:[?#].*)?$/;
app.use((req, res) => {
  const m = LIB.exec(req.url);
  if (m && m[1] !== "import" && !(/^\d{1,9}$/.test(m[1]) && getActivity(db, Number(m[1])))) res.statusCode = 404;
  return handle(req, res);
});
app.listen(config.port, "0.0.0.0", () => {
  console.log(`האתר פועל על פורט ${config.port}`);
});
