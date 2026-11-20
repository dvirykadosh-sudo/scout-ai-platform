// שלב 72: סריקה רוחבית של כל העמודים הסטטיים באתר.
//  1. נגישות (axe) בארבעה מצבים: כהה, בהיר, ניגודיות גבוהה וחיסכון, ברוחב 1280.
//  2. בנייד (390px): אין גלילה אופקית ואין הפרות axe, בכל עמוד.
// הסריקה מתבצעת עם הפחתת תנועה, כדי שאנימציית כניסה באמצע לא תיתפס כבעיית ניגודיות.
// שימוש: מתיקיית e2e, מול שרת ייצור: BASE_URL=http://localhost:5055 node e2e-round-at.mjs   (ROUTES=/a,/b לסריקה חלקית)
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const ADMIN_PW = "Strong#Pass99";
const NEW_PW = "Zq9!Fresh-boss-pw-72";
const J = { "Content-Type": "application/json" };

const ALL_ROUTES = [
  "/", "/accessibility", "/account", "/admin", "/assistant", "/assistant/board", "/calendar", "/challenges", "/chat", "/comfort",
  "/coverage", "/cupboard", "/dashboard", "/hall", "/help", "/icebreakers", "/ideas", "/insights", "/install", "/library",
  "/library/import", "/methods", "/new", "/pilot", "/plan", "/privacy", "/quick", "/requests", "/status", "/stories", "/story",
  "/style-guide", "/team", "/tools", "/trail", "/types", "/values", "/vote", "/warmups", "/whats-new", "/whatsapp", "/wrapped", "/write",
];
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(",") : ALL_ROUTES;

const MODES = {
  dark: { theme: "dark" },
  light: { theme: "light" },
  hc: { theme: "dark", hc: "1" },
  saver: { theme: "dark", saver: "1" },
};

const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("; ")).join(" || ");

// משתמש אדמין (כדי שגם עמודי הניהול ייפתחו)
let sess = null;
{
  let L = await fetch(B + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ username: "admin", password: NEW_PW }) });
  if (L.status !== 200) L = await fetch(B + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ username: "admin", password: ADMIN_PW }) });
  let b = await L.json();
  if (b.user?.mustChangePw) {
    await fetch(B + "/api/auth/change-password", { method: "POST", headers: { ...J, Authorization: "Bearer " + b.token }, body: JSON.stringify({ currentPassword: ADMIN_PW, newPassword: NEW_PW }) });
    b = await (await fetch(B + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ username: "admin", password: NEW_PW }) })).json();
  }
  sess = b.token ? JSON.stringify({ token: b.token, user: b.user }) : null;
  ok(!!sess, "admin token");
}
void CODE;

const mk = async (mode, vp) => {
  const c = await browser.newContext({ viewport: vp, locale: "he-IL", reducedMotion: "reduce" });
  await c.addInitScript(([m, s]) => {
    try {
      for (const k of ["scout.splash", "scout.hero.seen", "scout.intro"]) localStorage.setItem(k, "1");
      localStorage.setItem("scout.mascot", "off");
      localStorage.setItem("scout.theme", m.theme);
      localStorage.setItem("scout.hc", m.hc || "0");
      localStorage.setItem("scout.saver", m.saver || "0");
      localStorage.setItem("scout.session", s);
    } catch {}
  }, [MODES[mode], sess]);
  return c;
};

const visit = async (p, route) => {
  const errs = [];
  const onErr = (e) => errs.push(e.message);
  p.on("pageerror", onErr);
  await p.goto(B + route, { waitUntil: "networkidle", timeout: 30000 });
  await p.waitForTimeout(350);
  p.off("pageerror", onErr);
  return errs;
};

// 1. נגישות ב-4 מצבים ברוחב מחשב
for (const mode of Object.keys(MODES)) {
  const c = await mk(mode, { width: 1280, height: 900 });
  const p = await c.newPage();
  for (const route of ROUTES) {
    try {
      const errs = await visit(p, route);
      ok(errs.length === 0, `pageerror ${mode} ${route} ${errs.join(" | ")}`.trim());
      const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      ok(r.violations.length === 0, `axe ${mode} ${route} ${axeMsg(r)}`.trim());
    } catch (e) {
      fails++;
      console.log("FAIL", `sweep ${mode} ${route} -`, e.message.split("\n")[0]);
    }
  }
  await c.close();
}

// 2. נייד 390: בלי גלילה אופקית ובלי הפרות
{
  const c = await mk("dark", { width: 390, height: 844 });
  const p = await c.newPage();
  for (const route of ROUTES) {
    try {
      await visit(p, route);
      const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      ok(w.sw <= w.iw, `mobile no h-scroll ${route} (${w.sw}/${w.iw})`);
      const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      ok(r.violations.length === 0, `axe mobile ${route} ${axeMsg(r)}`.trim());
    } catch (e) {
      fails++;
      console.log("FAIL", `mobile ${route} -`, e.message.split("\n")[0]);
    }
  }
  await c.close();
}

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
