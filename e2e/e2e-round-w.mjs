// בדיקות דפדפן לשלב 32: גיבוי להורדה, מצב מערכת, דפי שגיאה, התקנה, באנרים.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const B = process.env.BASE_URL || "http://localhost:5055";
const ADMIN_PW = process.env.ADMIN_PASSWORD || "Strong#Pass99";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 8).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL", acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem("scout.hero.seen", "1"); } catch {} });
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));

let adminToken = null, adminUser = null;
await step("admin login via api", async () => {
  const NEW = "E2e-new-pass-2026-w";
  const login = async (pw) => { const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: pw }) }); return r.ok ? r.json() : null; };
  let d = await login(ADMIN_PW);
  if (d && d.user.mustChangePw) {
    const r = await fetch(B + "/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + d.token }, body: JSON.stringify({ currentPassword: ADMIN_PW, newPassword: NEW }) });
    if (!r.ok) throw new Error("change pw " + r.status);
    d = await login(NEW);
  } else if (!d) d = await login(NEW);
  if (!d) throw new Error("no admin login");
  adminToken = d.token; adminUser = d.user;
});

await step("health + health/data", async () => {
  const h = await (await fetch(B + "/api/health")).json();
  ok(h.ok && h.startedAt, "health has startedAt");
  const r = await fetch(B + "/api/health/data");
  ok(r.status === 200, "health/data 200");
});

await step("install page + footer link", async () => {
  await A.goto(B + "/install", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "האתר כאפליקציה בטלפון" }).waitFor();
  ok(await A.getByText("הוסף למסך הבית").first().isVisible(), "iphone steps");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe install " + axeMsg(r));
  await A.goto(B + "/", { waitUntil: "networkidle" });
  ok(await A.getByRole("link", { name: "התקנה בטלפון" }).first().isVisible(), "footer link");
});

await step("404 page in hebrew", async () => {
  await A.goto(B + "/no-such-page-xyz", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "הדף לא נמצא" }).waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe 404 " + axeMsg(r));
});

await step("robots", async () => {
  const t = await (await fetch(B + "/robots.txt")).text();
  ok(/Disallow: \//.test(t), "robots disallow");
});

await step("offline banner", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await ctx.setOffline(true);
  await A.evaluate(() => window.dispatchEvent(new Event("offline")));
  await A.getByText(/אין חיבור לאינטרנט/).first().waitFor({ timeout: 4000 });
  await ctx.setOffline(false);
  await A.evaluate(() => window.dispatchEvent(new Event("online")));
  await A.getByText(/אין חיבור לאינטרנט/).first().waitFor({ state: "detached", timeout: 4000 });
});

await step("admin system card + fresh backup download", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.evaluate(([t, u]) => sessionStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })), [adminToken, adminUser]);
  await A.goto(B + "/admin", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "מצב המערכת וגיבוי" }).waitFor({ timeout: 10000 });
  await A.getByText(/בדיקת תקינות: תקין/).waitFor();
  const [dl] = await Promise.all([A.waitForEvent("download", { timeout: 15000 }), A.getByRole("button", { name: /הורדת גיבוי עכשיו/ }).click()]);
  ok(/^maoz-backup-.*\.db$/.test(dl.suggestedFilename()), "filename " + dl.suggestedFilename());
  const p = await dl.path();
  ok(fs.readFileSync(p).subarray(0, 15).toString("latin1") === "SQLite format 3", "valid sqlite file");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe admin " + axeMsg(r));
});

await step("session expiry message", async () => {
  await A.evaluate(() => sessionStorage.setItem("scout.session", JSON.stringify({ token: "bad.token.here", user: { id: 1, username: "admin", role: "ADMIN", displayName: "x" } })));
  await A.goto(B + "/admin", { waitUntil: "networkidle" });
  await A.getByText(/ההתחברות פגה/).first().waitFor({ timeout: 8000 });
});

await step("mobile no overflow", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.goto(B + "/install", { waitUntil: "networkidle" });
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "install fits");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
