// מפעיל את כל המערכת (שרת + אתר) בפקודה אחת.
//   node run.mjs          התקנה (אם צריך), בנייה (אם צריך) והפעלה
//   node run.mjs dev      הפעלה במצב פיתוח
//   node run.mjs setup    התקנה ובנייה בלבד
//   node run.mjs --open   פותח את הדפדפן כשהאתר מוכן
//   node run.mjs build-prod   בנייה לפריסה ציבורית (שירות יחיד, כתובת API יחסית)
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const args = process.argv.slice(2);
const setupOnly = args.includes("setup");
const dev = args.includes("dev");
const openBrowser = args.includes("--open");
const buildProd = args.includes("build-prod");
const isWin = process.platform === "win32";
const BACKEND_PORT = Number(process.env.PORT) || 4000;
const FRONTEND_PORT = 3000;

const say = (m) => console.log(m);
const die = (m) => {
  console.error(`\nשגיאה: ${m}\n`);
  process.exit(1);
};

// Node 22.5+ is needed for the built-in SQLite
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 5)) die(`נדרשת גרסת Node 22.5 ומעלה. מותקנת אצלך ${process.versions.node}. אפשר להוריד מ-nodejs.org`);

function run(cmd, cmdArgs, cwd, label, env = {}) {
  say(`\n> ${label}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit", shell: isWin, env: { ...process.env, ...env } });
  if (r.status !== 0) die(`הפעולה "${label}" נכשלה. שלחו צילום של הטרמינל.`);
}
const npm = isWin ? "npm.cmd" : "npm";

// upgrade safety: older versions kept pages directly under src/app
const appDir = path.join(frontend, "src", "app");
if (fs.existsSync(path.join(appDir, "(site)"))) {
  for (const legacy of ["page.tsx", "admin", "library", "methods"]) {
    const lp = path.join(appDir, legacy);
    if (fs.existsSync(lp)) {
      fs.rmSync(lp, { recursive: true, force: true });
      say(`הוסר קובץ ישן שהוחלף בגרסה החדשה: src/app/${legacy}`);
    }
  }
}

const depsInstalled = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).every((d) => fs.existsSync(path.join(dir, "node_modules", d)));
};
const newestMtime = (dir) => {
  let newest = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const q = path.join(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestMtime(q) : fs.statSync(q).mtimeMs);
  }
  return newest;
};

if (!depsInstalled(backend)) run(npm, ["install"], backend, "מתקין את חבילות השרת (כדקה)");
if (!depsInstalled(frontend)) run(npm, ["install"], frontend, "מתקין את חבילות האתר (כדקה)");
if (buildProd) {
  run(npm, ["run", "build"], frontend, "בונה את האתר לפריסה ציבורית", { NEXT_PUBLIC_API_URL: "same-origin", NEXT_DIST_DIR: ".next-prod" });
  say("\nהבנייה לפריסה הסתיימה. להפעלה: node backend/src/all.js");
  process.exit(0);
}
if (!dev) {
  const buildId = path.join(frontend, ".next", "BUILD_ID");
  const stale = fs.existsSync(buildId) && Math.max(newestMtime(path.join(frontend, "src")), fs.statSync(path.join(frontend, "package.json")).mtimeMs) > fs.statSync(buildId).mtimeMs;
  if (!fs.existsSync(buildId) || stale) run(npm, ["run", "build"], frontend, "בונה את האתר (כדקה)");
}
if (setupOnly) {
  say("\nההתקנה הסתיימה. להפעלה: npm start");
  process.exit(0);
}

const portFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port);
  });
if (!(await portFree(BACKEND_PORT))) die(`פורט ${BACKEND_PORT} תפוס. סגרו את הטרמינל שבו השרת כבר רץ, או הגדירו פורט אחר.`);
if (!(await portFree(FRONTEND_PORT))) die(`פורט ${FRONTEND_PORT} תפוס. סגרו תוכנית אחרת שרצה עליו (למשל תיקיית scout-ai-web).`);

const children = [];
let stopping = false;
function start(label, cmdArgs, cwd) {
  const child = spawn(process.execPath, cmdArgs, { cwd, env: { ...process.env, PORT: String(BACKEND_PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim() && !/ExperimentalWarning|trace-warnings/.test(l)) out(`[${label}] ${l}`);
    });
  };
  pipe(child.stdout, console.log);
  pipe(child.stderr, console.error);
  child.on("exit", (code) => {
    if (stopping) return;
    console.error(`\n[${label}] נעצר (קוד ${code}). עוצר את הכול.`);
    shutdown(code || 1);
  });
  children.push(child);
}
function shutdown(code = 0) {
  stopping = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already stopped */
    }
  }
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("שרת", ["src/server.js"], backend);
start("אתר", [path.join(frontend, "node_modules", "next", "dist", "bin", "next"), dev ? "dev" : "start", "-p", String(FRONTEND_PORT)], frontend);

// wait until the site answers, then announce
const url = `http://localhost:${FRONTEND_PORT}`;
for (let i = 0; i < 120 && !stopping; i++) {
  try {
    const r = await fetch(url);
    if (r.ok) {
      say(`\n========================================\n  האתר מוכן: ${url}\n  לעצירה: Ctrl+C\n========================================\n`);
      if (openBrowser) {
        if (isWin) spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
        else if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
      }
      break;
    }
  } catch {
    /* not ready yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}
