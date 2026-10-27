// בדיקות דפדפן לשלב 40 (286–300).
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
const user = "c41" + Date.now().toString().slice(-6);
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


await step("editor: progress + sticky + saved check", async () => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.locator(".ed-progress progress").waitFor({ timeout: 8000 });
  await A.getByText(/שלבים כתובים/).first().waitFor();
  const pos = await A.locator(".write-bar").evaluate((e) => getComputedStyle(e).position);
  ok(pos === "sticky", "write bar sticky");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe editor " + axeMsg(r));
});

await step("style guide + palettes axe", async () => {
  await A.goto(B + "/style-guide", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "מדריך סגנון" }).first().waitFor({ timeout: 8000 });
  for (const pal of ["purple", "blue", "green"]) {
    for (const light of [false, true]) {
      await A.evaluate(([p, l]) => { const d = document.documentElement; d.dataset.palette = p; d.classList.toggle("light", l); }, [pal, light]);
      const r = await axe(A);
      ok(r.violations.length === 0, `axe style-guide ${pal} ${light ? "light" : "dark"} ` + axeMsg(r));
    }
  }
  await A.evaluate(() => { document.documentElement.dataset.palette = "purple"; document.documentElement.classList.remove("light"); });
});

await step("palette toggle persists", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: /צבעים: סגול/ }).click();
  await A.getByRole("button", { name: /צבעים: כחול/ }).waitFor();
  await A.reload({ waitUntil: "networkidle" });
  ok((await A.evaluate(() => document.documentElement.dataset.palette)) === "blue", "palette persisted");
});

await step("mobile bottom nav", async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: "he-IL" });
  await c.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
  const P = await c.newPage();
  await P.goto(B + "/library", { waitUntil: "networkidle" });
  await P.getByRole("navigation", { name: "ניווט תחתון" }).waitFor();
  ok(await P.getByRole("navigation", { name: "ניווט תחתון" }).isVisible(), "bottom nav visible on mobile");
  const r = await new AxeBuilder({ page: P }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  ok(r.violations.length === 0, "axe mobile library " + axeMsg(r));
  await P.getByRole("navigation", { name: "ניווט תחתון" }).getByRole("link", { name: "כתיבה" }).click();
  await P.waitForURL(/\/write/);
  await c.close();
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "he-IL" });
  const Q = await d.newPage();
  await Q.goto(B + "/", { waitUntil: "networkidle" });
  ok(!(await Q.getByRole("navigation", { name: "ניווט תחתון" }).isVisible()), "bottom nav hidden on desktop");
  await d.close();
});

await step("splash first visit only", async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "he-IL" });
  const P = await c.newPage();
  await P.goto(B + "/", { waitUntil: "domcontentloaded" });
  await P.locator(".splash").waitFor({ timeout: 4000 });
  await P.locator(".splash").waitFor({ state: "detached", timeout: 5000 });
  await P.reload({ waitUntil: "networkidle" });
  ok((await P.locator(".splash").count()) === 0, "splash not shown again");
  await c.close();
});

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
