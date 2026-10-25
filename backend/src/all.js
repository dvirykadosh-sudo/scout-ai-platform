// שירות יחיד לפריסה: ה-API והאתר (Next.js) באותו פורט ובאותה כתובת.
// הרצה: node backend/src/all.js  (אחרי: node run.mjs build-prod)
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { ensureAdmin } from "./auth.js";
import { backupDirFor, startBackupSchedule } from "./backup.js";
import { assertProductionSafe, config } from "./config.js";
import { openDb } from "./db.js";
import { createMailer } from "./email.js";
import { restoreIfMissing, startPersist } from "./persist.js";
import { seedIfEmpty } from "./seed.js";

process.env.NEXT_DIST_DIR ||= ".next-prod";
const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend");
const require = createRequire(path.join(frontendDir, "package.json"));
const next = require("next");

assertProductionSafe();
await restoreIfMissing(config.dbPath);
const db = openDb();
seedIfEmpty(db);
ensureAdmin(db);
const mailer = createMailer(db, config.smtp);
mailer.start();
startBackupSchedule(db, backupDirFor());
const persist = startPersist(db, config.dbPath);
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
app.use((req, res) => handle(req, res));
app.listen(config.port, "0.0.0.0", () => {
  console.log(`האתר פועל על פורט ${config.port}`);
});
