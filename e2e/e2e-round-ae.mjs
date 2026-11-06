// בדיקות דפדפן לשלב 40 (301–325).
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 8).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const J = { "Content-Type": "application/json" };
const user = "e46" + Date.now().toString().slice(-6);
let tok, usr, docId;

await step("setup", async () => {
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך בדיקה", signupCode: CODE, acceptTerms: true }) })).json();
  tok = r.token; usr = r.user;
  const H = { ...J, Authorization: "Bearer " + tok };
  const d = await (await fetch(B + "/api/write/docs", { method: "POST", headers: H, body: JSON.stringify({ template: "classic" }) })).json();
  docId = d.id;
  await fetch(B + "/api/write/docs/" + d.id, { method: "PUT", headers: H, body: JSON.stringify({ title: "משחק במים ובאש", meta: { ...d.meta, groupSize: 24, minutes: 40 }, blocks: d.blocks.map((b) => ({ ...b, text: "נשחק ליד המים ואחר כך נדליק מדורה ונרוץ בחושך. זהו משפט ארוך מאוד, עם הרבה פסיקים, עוד פסיק, ועוד פסיק, ועוד אחד, כדי לבדוק." })), baseRev: d.rev }) });
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL" });
await ctx.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));



await step("logo 3d + palettes + embers", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  ok((await A.locator(".logo3d-back").count()) === 3, "3 depth layers");
  await A.evaluate(() => { localStorage.setItem("scout.palette", "fire"); });
  await A.reload({ waitUntil: "networkidle" });
  await A.locator("canvas.embers").waitFor({ timeout: 6000 });
  for (const light of [false, true]) {
    await A.evaluate((l) => document.documentElement.classList.toggle("light", l), light);
    const r = await axe(A);
    ok(r.violations.length === 0, `axe home fire ${light ? "light" : "dark"} ` + axeMsg(r));
  }
  await A.evaluate(() => { localStorage.removeItem("scout.palette"); });
});

await step("coverflow + holiday + confetti", async () => {
  await A.evaluate(() => { localStorage.setItem("scout.holiday", "hanukkah"); });
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.getByText("חנוכה שמח").waitFor({ timeout: 6000 });
  await A.getByRole("tab", { name: /השראה|רעיונות/ }).click().catch(() => {});
  await A.waitForTimeout(500);
  const cf = await A.locator(".cf-track").count();
  console.log("coverflow tracks", cf);
  await A.evaluate(() => window.dispatchEvent(new Event("scout:celebrate")));
  await A.locator("canvas.confetti").waitFor({ timeout: 3000 });
  ok(true, "confetti runs");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe holiday " + axeMsg(r));
  await A.evaluate(() => { localStorage.removeItem("scout.holiday"); });
});

await step("flip cards", async () => {
  await A.goto(B + "/library/5", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "תצוגת כרטיסים" }).click();
  const first = A.locator(".flip-card").first();
  await first.click();
  ok((await first.getAttribute("aria-pressed")) === "true", "flipped");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe flip " + axeMsg(r));
});

await step("stack view", async () => {
  await A.goto(B + "/library", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "תצוגת ערימה" }).click();
  ok((await A.locator("ul.list.stacked").count()) === 1, "stacked");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe stacked " + axeMsg(r));
  await A.reload({ waitUntil: "networkidle" });
  ok((await A.locator("ul.list.stacked").count()) === 1, "stack persists");
});

await step("gauge in readiness", async () => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: /מוכנות/ }).first().click();
  await A.locator("svg.gauge").waitFor({ timeout: 8000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe gauge " + axeMsg(r));
});

await step("reduced motion: no confetti, no tilt", async () => {
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", reducedMotion: "reduce" });
  await c2.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
  const P = await c2.newPage();
  await P.goto(B + "/", { waitUntil: "networkidle" });
  await P.evaluate(() => window.dispatchEvent(new Event("scout:celebrate")));
  await P.waitForTimeout(300);
  ok((await P.locator("canvas.confetti").count()) === 0, "no confetti");
  const tr = await P.locator(".logo3d-stage").evaluate((e) => getComputedStyle(e).transform);
  ok(tr === "none", "no logo transform " + tr);
  await c2.close();
});

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
