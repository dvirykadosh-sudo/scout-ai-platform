// בדיקות דפדפן לשלב 40 (271–285).
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
const user = "b40" + Date.now().toString().slice(-6);
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

await step("home hero + effects + axe dark/light", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.getByText("ממשיכים מאיפה שעצרתם").waitFor({ timeout: 8000 });
  ok(await A.evaluate(() => !!document.documentElement.dataset.season), "season set");
  ok((await A.locator(".depth-bg").count()) === 1, "depth layer");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe home dark " + axeMsg(r));
  await A.evaluate(() => { document.documentElement.classList.add("light"); });
  const r2 = await axe(A);
  ok(r2.violations.length === 0, "axe home light " + axeMsg(r2));
  await A.screenshot({ path: "/tmp/home40.png" });
});

await step("library: age badge + empty art", async () => {
  await A.goto(B + "/library?q=zzzzzzqq", { waitUntil: "networkidle" });
  await A.locator(".empty-art").waitFor({ timeout: 8000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe library empty " + axeMsg(r));
  await A.goto(B + "/library", { waitUntil: "networkidle" });
  await A.locator(".activity-card").first().waitFor({ timeout: 8000 }).catch(() => {});
  ok((await A.locator('.glance-cell[class*="age-"]').count()) > 0, "age chips");
  const r2 = await axe(A);
  ok(r2.violations.length === 0, "axe library " + axeMsg(r2));
});

await step("reduced motion disables effects", async () => {
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", reducedMotion: "reduce" });
  await c2.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
  const P = await c2.newPage();
  await P.goto(B + "/", { waitUntil: "networkidle" });
  const anim = await P.evaluate(() => { const e = document.querySelector(".emblem-logo, .emblem-art"); return e ? getComputedStyle(e).animationName : "none"; });
  ok(anim === "none", "no float animation under reduced motion: " + anim);
  await c2.close();
});

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
