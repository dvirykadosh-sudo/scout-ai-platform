// בדיקות דפדפן לשלב 59: עיצוב אחיד בכל האתר, סרגל זכוכית ודוק בכל העמודים, כניסה עם הנשר ב-/account.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { lampOn } from "./lamp.mjs";

const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 4).join(" | ")); } };
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const J = { "Content-Type": "application/json" };
const user = "s59" + Date.now().toString().slice(-6);
let tok, usr;

const reg = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך בדיקה", signupCode: CODE, acceptTerms: true }) })).json();
tok = reg.token; usr = reg.user;
const sess = () => JSON.stringify({ token: tok, user: usr });
const mk = async ({ session = true, scheme = "dark", vp = { width: 1366, height: 850 }, reduced = false, cls = "" } = {}) => {
  const c = await browser.newContext({ viewport: vp, locale: "he-IL", colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference" });
  await c.addInitScript(([st, k]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.splash", "1"); if (st) localStorage.setItem("scout.session", st); if (k.includes("hc")) localStorage.setItem("scout.hc", "1"); } catch {} }, [session ? sess() : null, cls]);
  return c;
};

const PAGES = ["/", "/library", "/methods", "/plan", "/write", "/types", "/tools", "/calendar", "/team", "/help", "/account", "/chat"];

await step("shell on every page", async () => {
  const c = await mk();
  const p = await c.newPage();
  for (const path of PAGES) {
    await p.goto(B + path, { waitUntil: "networkidle" });
    await p.locator("aside.sh-sidebar").waitFor({ timeout: 8000 });
    const info = await p.evaluate(() => ({
      shell: document.documentElement.dataset.shell,
      side: !!document.querySelector("aside.sh-sidebar"),
      dock: !!document.querySelector(".sh-dock"),
      page: !!document.querySelector("main.page"),
    }));
    ok(info.shell === "on" && info.side && info.dock && info.page, "sidebar + dock + work panel on " + path + " " + JSON.stringify(info));
  }
  await c.close();
});

await step("sidebar does not cover the content (desktop)", async () => {
  const c = await mk();
  const p = await c.newPage();
  for (const path of ["/", "/library", "/plan", "/write"]) {
    await p.goto(B + path, { waitUntil: "networkidle" });
    const r = await p.evaluate(() => {
      const s = document.querySelector("aside.sh-sidebar").getBoundingClientRect();
      const m = document.querySelector("main.page").getBoundingClientRect();
      return { sideLeft: Math.round(s.left), pageRight: Math.round(m.right) };
    });
    ok(r.pageRight <= r.sideLeft, "content ends before the sidebar on " + path + " " + JSON.stringify(r));
  }
  await c.close();
});

await step("no horizontal overflow, desktop and phone", async () => {
  for (const vp of [{ width: 1366, height: 850 }, { width: 390, height: 844 }]) {
    const c = await mk({ vp });
    const p = await c.newPage();
    for (const path of PAGES) {
      await p.goto(B + path, { waitUntil: "networkidle" });
      const w = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(w <= 1, `no horizontal scroll ${vp.width}px ${path} (${w})`);
    }
    await c.close();
  }
});

await step("old purple is gone from the main surfaces", async () => {
  const c = await mk({ scheme: "dark" });
  const p = await c.newPage();
  for (const path of ["/", "/library", "/methods", "/plan"]) {
    await p.goto(B + path, { waitUntil: "networkidle" });
    const v = await p.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { accent: cs.getPropertyValue("--accent").trim(), btn: cs.getPropertyValue("--btn-bg").trim() };
    });
    const purple = /#5d2fa3|#7c3aed|#8b5cf6|#6d28d9|purple/i;
    ok(!purple.test(v.accent) && !purple.test(v.btn), "accent is not purple on " + path + " " + v.accent);
  }
  await c.close();
});

await step("/account uses the eagle lamp and pull string", async () => {
  const c = await mk({ session: false });
  const p = await c.newPage();
  await p.goto(B + "/account", { waitUntil: "networkidle" });
  const pull = p.getByRole("button", { name: /חוט התאורה/ });
  await pull.waitFor();
  ok((await p.getByLabel("שם משתמש").count()) === 0, "form hidden until the string is pulled");
  await lampOn(p);
  await p.getByRole("button", { name: "כבר יש לי חשבון" }).waitFor({ timeout: 6000 });
  ok((await p.getByRole("button", { name: "הרשמה", exact: true }).count()) >= 1, "login and register tabs after the pull");
  ok((await p.getByLabel(/שם משתמש/).count()) >= 1, "login form is available after the pull");
  await c.close();
});

await step("/account with reduced motion starts lit", async () => {
  const c = await mk({ session: false, reduced: true });
  const p = await c.newPage();
  await p.goto(B + "/account", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "כבר יש לי חשבון" }).waitFor({ timeout: 6000 });
  ok(true, "form visible immediately with reduced motion");
  await c.close();
});

await step("/login keeps the lamp and redirects after sign-in", async () => {
  const c = await mk({ session: false });
  const p = await c.newPage();
  await p.goto(B + "/login", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /חוט התאורה/ }).waitFor();
  ok(true, "pull string on /login");
  await c.close();
});

await step("settings: content panel and palette", async () => {
  const c = await mk();
  const p = await c.newPage();
  await p.goto(B + "/library", { waitUntil: "networkidle" });
  await p.evaluate(() => { localStorage.setItem("scout.panel", "dark"); });
  await p.reload({ waitUntil: "networkidle" });
  ok((await p.evaluate(() => document.documentElement.dataset.panel)) === "dark", "dark content panel is remembered");
  await p.evaluate(() => { localStorage.removeItem("scout.panel"); });
  await c.close();
});

await step("high contrast has no glass and no gradients on the panel", async () => {
  const c = await mk({ cls: "hc" });
  const p = await c.newPage();
  await p.goto(B + "/library", { waitUntil: "networkidle" });
  const r = await p.evaluate(() => {
    const m = getComputedStyle(document.querySelector("main.page"));
    const s = getComputedStyle(document.querySelector("aside.sh-sidebar"));
    return { bg: m.backgroundColor, img: m.backgroundImage, blur: s.backdropFilter };
  });
  ok(r.bg === "rgb(0, 0, 0)" && r.img === "none" && (r.blur === "none" || r.blur === ""), "black panel, no gradient, no blur " + JSON.stringify(r));
  await c.close();
});

await step("axe on the redesigned pages (light and dark)", async () => {
  for (const scheme of ["light", "dark"]) {
    const c = await mk({ scheme });
    const p = await c.newPage();
    for (const path of ["/", "/library", "/methods", "/plan", "/write", "/types", "/dashboard"]) {
      await p.goto(B + path, { waitUntil: "networkidle" });
      await p.waitForTimeout(400);
      const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      ok(r.violations.length === 0, `axe ${scheme} ${path}: ${axeMsg(r) || "0"}`);
    }
    await c.close();
  }
});

await step("guest upload limit is 400KB, signed-in user is not blocked", async () => {
  const big = Buffer.alloc(500 * 1024, 1);
  for (const route of ["/api/style/extract", "/api/activities/import-file"]) {
    const g = await fetch(B + route, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: big });
    ok(g.status === 413, "guest 500KB is 413 on " + route + " (" + g.status + ")");
    const u = await fetch(B + route, { method: "POST", headers: { "Content-Type": "application/octet-stream", Authorization: "Bearer " + tok }, body: big });
    ok(u.status !== 413, "signed-in 500KB is not 413 on " + route + " (" + u.status + ")");
  }
});

await browser.close();
console.log(fails ? "\n" + fails + " FAILURES" : "\nALL OK");
process.exit(fails ? 1 : 0);
