import { createApp } from "./app.js";
import { sharedRouter } from "./ai-router.js";
import { backupDirFor, startBackupSchedule } from "./backup.js";
import { ensureAdmin, timingDummyRounds } from "./auth.js";
import { assertProductionSafe, config } from "./config.js";
import { openDb } from "./db.js";
import { createMailer } from "./email.js";
import { seedIfEmpty } from "./seed.js";
import { installProcessGuards } from "./server-errors.js";

assertProductionSafe();

const db = openDb();
const seeded = seedIfEmpty(db);
const adminCreated = ensureAdmin(db);
timingDummyRounds(); // מחשבים מראש את ההשוואה לחשבון לא קיים, כדי שהכניסה הראשונה אחרי עלייה לא תהיה איטית יותר
const mailer = createMailer(db, config.smtp);
mailer.start();
startBackupSchedule(db, backupDirFor());

installProcessGuards({ db, mailer, config });
const app = createApp({ db, mailer });
app.listen(config.port, () => {
  console.log(`\nהשרת פועל: http://localhost:${config.port}`);
  if (seeded) console.log(`נטענו ${seeded} פעולות מוכנות למאגר`);
  if (adminCreated) console.log(`נוצר משתמש אדמין: ${config.admin.username}`);
  {
    const on = sharedRouter().status().filter((p) => p.configured).map((p) => `${p.id} (${p.model})`);
    console.log(on.length ? `מעוז ויצירת פעולות: ${on.join(" ← ")}, ואם הם לא זמינים: מחולל מקומי` : "מעוז ויצירת פעולות: מחולל מקומי חינמי (לא הוגדר מפתח GEMINI_API_KEY, GROQ_API_KEY או ANTHROPIC_API_KEY)");
  }
  console.log(mailer.hasTransport ? `מייל: מוגדר (ערוץ ${mailer.mode})` : "מייל: לא מוגדר (מצב בדיקה, שום מייל לא יוצא)");
});
