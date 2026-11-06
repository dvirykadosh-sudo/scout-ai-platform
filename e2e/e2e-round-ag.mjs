// בדיקות דפדפן לשלב 40 (שלב 48).
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
const user = "g48" + Date.now().toString().slice(-6);
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




await step("method wheel", async () => {
  await A.goto(B + "/methods", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "תצוגת גלגל" }).click();
  await A.locator(".wheel-item").first().waitFor();
  ok((await A.locator(".wheel-item").count()) === 12, "12 methods on wheel");
  await A.getByRole("button", { name: "הבאה" }).click();
  await A.locator(".wheel-detail h3").waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe wheel " + axeMsg(r));
});
await step("trail view + eyes", async () => {
  await A.goto(B + "/library/5", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "תצוגת שביל" }).click();
  await A.locator("svg.trail-plane").waitFor();
  ok((await A.locator(".logo3d-eye").count()) === 2, "two eye pupils");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe trail " + axeMsg(r));
});
await step("israel map on team page", async () => {
  await A.goto(B + "/team", { waitUntil: "networkidle" });
  await A.getByRole("img", { name: /מפה סכמטית של ישראל/ }).waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe team map " + axeMsg(r));
});
await step("flipbook", async () => {
  await A.goto(B + "/library", { waitUntil: "networkidle" });
  await A.locator(".activity-card").first().waitFor({ timeout: 8000 });
  await A.getByLabel("הוספה לחוברת").nth(0).check();
  await A.getByLabel("הוספה לחוברת").nth(1).check();
  await A.getByRole("button", { name: "עיון כספר" }).click();
  await A.getByText(/עמוד 1 מתוך 3/).waitFor({ timeout: 6000 });
  await A.getByRole("button", { name: "הדף הבא" }).click();
  await A.getByText(/עמוד 2 מתוך 3/).waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe flipbook " + axeMsg(r));
});
await step("stage mode", async () => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "כלים נוספים" }).click();
  await A.getByRole("button", { name: "מצב במה" }).click();
  await A.locator(".stage-card").waitFor({ timeout: 6000 });
  await A.getByRole("button", { name: "הבא", exact: true }).click();
  await A.getByText(/שלב 2 מתוך/).waitFor();
  await A.getByRole("button", { name: "הפעלת שעון" }).click();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe stage mode " + axeMsg(r));
});
await step("reduced motion wheel fallback", async () => {
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", reducedMotion: "reduce" });
  const P = await c2.newPage();
  await P.goto(B + "/methods", { waitUntil: "networkidle" });
  await P.getByRole("button", { name: "תצוגת גלגל" }).click();
  const tr = await P.locator(".wheel-ring").evaluate((e) => getComputedStyle(e).transform);
  ok(tr === "none", "flat wheel " + tr);
  await c2.close();
});
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
