// שלב 58: הגנה מפני "פצצת zip" (קובץ קטן שמתנפח לגיגות בזיכרון).
// קובץ docx הוא zip. לפני שמעבירים אותו לספריית הקריאה, פורסים כל רכיב בנפרד עם תקרה קשיחה,
// ולא סומכים על הגדלים שהקובץ מצהיר על עצמו (הם יכולים לשקר).
import zlib from "node:zlib";

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

export const ZIP_LIMITS = Object.freeze({ maxEntries: 500, maxEntryBytes: 8_000_000, maxTotalBytes: 24_000_000 });

const bad = (msg) => Object.assign(new Error(msg), { status: 422, code: "ZIP_UNSAFE" });
const TOO_BIG = "הקובץ גדול מדי אחרי פתיחה, או שהוא פגום. אפשר להדביק את הטקסט במקום.";

/** מאתר את רשומת הסיום של ה-zip (בסוף הקובץ). */
function findEocd(buf) {
  const from = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= from; i--) if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  return -1;
}

/**
 * בודק שה-zip בטוח לפתיחה. זורק שגיאה (status 422) אם לא.
 * מחזיר סיכום: { entries, totalBytes }.
 */
export function assertSafeZip(buf, limits = ZIP_LIMITS) {
  if (!Buffer.isBuffer(buf) || buf.length < 22 || buf.readUInt32LE(0) !== SIG_LOC) throw bad("הקובץ אינו קובץ Word תקין.");
  const e = findEocd(buf);
  if (e < 0) throw bad("הקובץ אינו קובץ Word תקין.");
  const count = buf.readUInt16LE(e + 10);
  const cdSize = buf.readUInt32LE(e + 12);
  const cdOff = buf.readUInt32LE(e + 16);
  if (count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) throw bad(TOO_BIG);
  if (count > limits.maxEntries) throw bad(TOO_BIG);
  if (cdOff + cdSize > buf.length) throw bad("הקובץ פגום.");

  let p = cdOff;
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CEN) throw bad("הקובץ פגום.");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commLen;
    if (name.endsWith("/")) continue;
    if (flags & 1) throw bad("קובץ מוצפן אינו נתמך.");
    if (csize === 0xffffffff || lho === 0xffffffff) throw bad(TOO_BIG);
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== SIG_LOC) throw bad("הקובץ פגום.");
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    if (start + csize > buf.length) throw bad("הקובץ פגום.");
    const data = buf.subarray(start, start + csize);
    let size;
    if (method === 0) size = data.length;
    else if (method === 8) {
      try {
        size = zlib.inflateRawSync(data, { maxOutputLength: limits.maxEntryBytes + 1 }).length;
      } catch (err) {
        throw bad(err?.code === "ERR_BUFFER_TOO_LARGE" ? TOO_BIG : "הקובץ פגום.");
      }
    } else throw bad("הקובץ בפורמט דחיסה שאינו נתמך.");
    if (size > limits.maxEntryBytes) throw bad(TOO_BIG);
    total += size;
    if (total > limits.maxTotalBytes) throw bad(TOO_BIG);
  }
  return { entries: count, totalBytes: total };
}
