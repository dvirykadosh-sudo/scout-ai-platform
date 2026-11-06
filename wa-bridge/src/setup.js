// אשף הגדרה חד-פעמי: שואל כתובת אתר ואסימון וכותב קובץ .env בתיקיית המשתמש (מחוץ לפרויקט).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { ConfigError, cleanSiteUrl, defaultDataDir } from "./config.js";

const TOKEN = /^wb_[0-9a-f]{48}$/;

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nהגדרת גשר הוואטסאפ של שבט מעוז\n");
  console.log("1. באתר: מרכז וואטסאפ > גשר > 'יצירת אסימון'. העתיקו אותו (הוא מוצג פעם אחת).");
  console.log("2. הדביקו אותו כאן. האסימון נשמר רק במחשב הזה.\n");
  try {
    const siteUrl = cleanSiteUrl((await rl.question("כתובת האתר [https://shevet-maoz-app.onrender.com]: ")).trim() || "https://shevet-maoz-app.onrender.com");
    const token = (await rl.question("אסימון הגשר (wb_...): ")).trim();
    if (!TOKEN.test(token)) throw new ConfigError("האסימון לא נראה תקין (wb_ ואחריו 48 תווים). נסו שוב.");
    const dir = process.env.DATA_DIR || defaultDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, ".env");
    fs.writeFileSync(file, `SITE_URL=${siteUrl}\nBRIDGE_TOKEN=${token}\nADAPTER=openwa\nSHOW_BROWSER=false\n`, { mode: 0o600 });
    console.log(`\nנשמר ב: ${file}\nעכשיו הריצו את start-bridge.bat\n`);
  } catch (e) {
    console.error(`\n${e instanceof ConfigError ? e.message : e}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
