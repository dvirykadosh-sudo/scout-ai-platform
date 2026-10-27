// פתיחת גיבוי מוצפן שהגיע במייל: node deploy/decrypt-backup.mjs קובץ.maozb הסיסמה
import fs from "node:fs";
import { decryptBackup } from "../backend/src/ops.js";
const [file, pass] = process.argv.slice(2);
if (!file || !pass) {
  console.log("שימוש: node deploy/decrypt-backup.mjs <קובץ.maozb> <הסיסמה>");
  process.exit(1);
}
const out = file.replace(/\.maozb$/, "") + ".db";
fs.writeFileSync(out, decryptBackup(fs.readFileSync(file), pass));
console.log("נוצר:", out);
