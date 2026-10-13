import { createApp } from "./app.js";
import { ensureAdmin } from "./auth.js";
import { assertProductionSafe, config } from "./config.js";
import { openDb } from "./db.js";
import { createMailer } from "./email.js";
import { seedIfEmpty } from "./seed.js";

assertProductionSafe();

const db = openDb();
const seeded = seedIfEmpty(db);
const adminCreated = ensureAdmin(db);
const mailer = createMailer(db, config.smtp);
mailer.start();

const app = createApp({ db, mailer });
app.listen(config.port, () => {
  console.log(`\nהשרת פועל: http://localhost:${config.port}`);
  if (seeded) console.log(`נטענו ${seeded} פעולות מוכנות למאגר`);
  if (adminCreated) console.log(`נוצר משתמש אדמין: ${config.admin.username}`);
  console.log(config.ai.key ? `יצירת פעולות: Claude (${config.ai.model})` : "יצירת פעולות: מחולל תבניות מובנה (אין ANTHROPIC_API_KEY)");
  console.log(config.smtp.host ? "מייל: SMTP מוגדר" : "מייל: מצב בדיקה (נרשם בלוג בלבד)");
});
