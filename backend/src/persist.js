// שמירת הנתונים מחוץ ל-Render החינמי: צילום של מסד הנתונים נשמר במאגר פרטי ב-GitHub (חינם, בלי כרטיס אשראי)
// ומשוחזר אוטומטית כשהשרת עולה בלי קובץ נתונים. הגדרה: DATA_REPO=בעלים/שם-מאגר ו-DATA_TOKEN (טוקן עם הרשאת Contents: Read and write).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const cfg = (env) => ({
  repo: env.DATA_REPO || "",
  token: env.DATA_TOKEN || "",
  branch: env.DATA_BRANCH || "main",
  file: env.DATA_FILE || "scout.db.gz",
  api: (env.DATA_API_URL || "https://api.github.com").replace(/\/+$/, ""),
});
export const persistConfigured = (env = process.env) => Boolean(cfg(env).repo && cfg(env).token);

const headers = (c, accept) => ({ Authorization: `Bearer ${c.token}`, Accept: accept, "User-Agent": "maoz-activity-generator", "X-GitHub-Api-Version": "2022-11-28" });
const url = (c) => `${c.api}/repos/${c.repo}/contents/${encodeURIComponent(c.file)}`;

/** כשאין קובץ נתונים מקומי, מנסה להוריד את הצילום האחרון. */
export async function restoreIfMissing(dbFile, { env = process.env, fetchFn = fetch, log = console.log } = {}) {
  const c = cfg(env);
  if (!c.repo || !c.token || dbFile === ":memory:") return "off";
  try {
    if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) return "exists";
    const r = await fetchFn(`${url(c)}?ref=${encodeURIComponent(c.branch)}`, { headers: headers(c, "application/vnd.github.raw+json") });
    if (r.status === 404) {
      log("שמירת נתונים: עדיין אין צילום שמור, מתחילים ממסד חדש");
      return "none";
    }
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const data = zlib.gunzipSync(Buffer.from(await r.arrayBuffer()));
    fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
    fs.writeFileSync(dbFile, data);
    log(`שמירת נתונים: שוחזר מסד נתונים (${Math.round(data.length / 1024)}KB)`);
    return "restored";
  } catch (e) {
    log(`שמירת נתונים: השחזור נכשל (${e.message})`);
    return "error";
  }
}

/** בודק כל דקה אם המסד השתנה, ושומר צילום (לכל היותר אחת ל-3 דקות). שומר גם בכיבוי השרת. */
export function startPersist(db, dbFile, { env = process.env, fetchFn = fetch, log = console.log, pollMs = 60_000, minGapMs = 180_000 } = {}) {
  const c = cfg(env);
  if (!c.repo || !c.token || dbFile === ":memory:") return null;
  let lastHash = null, sha = null, lastPush = 0, busy = false;
  const snapshot = () => {
    const tmp = path.join(os.tmpdir(), `scout-snap-${process.pid}-${Date.now()}.db`);
    try {
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      return fs.readFileSync(tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  };
  const getSha = async () => {
    const r = await fetchFn(`${url(c)}?ref=${encodeURIComponent(c.branch)}`, { headers: headers(c, "application/vnd.github+json") });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return (await r.json()).sha;
  };
  const put = async (content) => {
    const body = () => JSON.stringify({ message: `גיבוי ${new Date().toISOString()}`, content: content.toString("base64"), branch: c.branch, ...(sha ? { sha } : {}) });
    let r = await fetchFn(url(c), { method: "PUT", headers: { ...headers(c, "application/vnd.github+json"), "Content-Type": "application/json" }, body: body() });
    if (r.status === 409 || r.status === 422) {
      sha = await getSha();
      r = await fetchFn(url(c), { method: "PUT", headers: { ...headers(c, "application/vnd.github+json"), "Content-Type": "application/json" }, body: body() });
    }
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    sha = (await r.json()).content?.sha ?? sha;
  };
  const push = async ({ force = false } = {}) => {
    if (busy) return false;
    busy = true;
    try {
      const raw = snapshot();
      const hash = crypto.createHash("sha1").update(raw).digest("hex");
      if (hash === lastHash) return false;
      if (!force && Date.now() - lastPush < minGapMs) return false;
      if (sha === null) sha = await getSha();
      await put(zlib.gzipSync(raw));
      lastHash = hash;
      lastPush = Date.now();
      log("שמירת נתונים: נשמר צילום חדש");
      return true;
    } catch (e) {
      log(`שמירת נתונים: השמירה נכשלה (${e.message})`);
      return false;
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void push(), pollMs);
  timer.unref?.();
  const flush = async () => {
    clearInterval(timer);
    while (busy) await new Promise((r) => setTimeout(r, 100));
    return push({ force: true });
  };
  setTimeout(() => void push({ force: true }), 15_000).unref?.();
  return { push, flush };
}
