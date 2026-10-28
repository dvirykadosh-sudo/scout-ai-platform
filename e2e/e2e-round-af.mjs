// בדיקות דפדפן לשלב 39 (326–335).
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 8).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const J = { "Content-Type": "application/json" };
const user = "f47" + Date.now().toString().slice(-6);
let tok, usr, docId;

await step("setup", async () => {
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך בדיקה", signupCode: CODE, acceptTerms: true }) })).json();
  tok = r.token; usr = r.user;
  const H = { ...J, Authorization: "Bearer " + tok };
  const d = await (await fetch(B + "/api/write/docs", { method: "POST", headers: H, body: JSON.stringify({ template: "classic" }) })).json();
  docId = d.id;
  await fetch(B + "/api/write/docs/" + d.id, { method: "PUT", headers: H, body: JSON.stringify({ title: "משחק במים ובאש", meta: { ...d.meta, groupSize: 24, minutes: 40 }, blocks: d.blocks.map((b) => ({ ...b, text: "נשחק ליד המים ואחר כך נדליק מדורה ונרוץ בחושך. זהו משפט ארוך מאוד, עם הרבה פסיקים, עוד פסיק, ועוד פסיק, ועוד אחד, כדי לבדוק." })), baseRev: d.rev }) });
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL", permissions: ["microphone"] });
await ctx.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const open = async (btn) => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "כלים נוספים" }).click();
  await A.getByRole("button", { name: btn }).click();
};
await step("map", async () => {
  await open("מפת תחנות");
  await A.getByRole("button", { name: "הוספת תחנה" }).click();
  await A.getByRole("button", { name: "הוספת תחנה" }).click();
  await A.getByLabel("שם תחנה 1").fill("מדורה");
  ok((await A.locator(".station-map g").count()) >= 2, "stations drawn");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe map " + axeMsg(r));
  await A.getByRole("button", { name: "הוספה לשלב כרשימה" }).click();
  await A.getByText("המפה נוספה לשלב").first().waitFor({ timeout: 5000 });
});
await step("read aloud", async () => {
  await open("הקראה בקול");
  await A.getByRole("button", { name: "הקראה" }).waitFor({ timeout: 6000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe read " + axeMsg(r));
});
await step("practice", async () => {
  await open("תרגול קולי");
  await A.getByRole("button", { name: "התחלת הקלטה" }).click();
  await A.getByRole("button", { name: "עצירה" }).waitFor({ timeout: 6000 });
  await A.waitForTimeout(1500);
  await A.getByRole("button", { name: "עצירה" }).click();
  await A.locator("audio").waitFor({ timeout: 6000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe practice " + axeMsg(r));
});
await step("story + quiz", async () => {
  await open("פתיחה וחידון");
  await A.getByRole("button", { name: "הוספה לשלב" }).first().waitFor({ timeout: 8000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe story " + axeMsg(r));
  await A.getByRole("button", { name: "הוספה לשלב" }).first().click();
  await A.getByText("נוסף לשלב").first().waitFor({ timeout: 5000 });
});
await step("printables + crossword", async () => {
  await open("הדפסות ומשחקים");
  await A.getByLabel(/מילים ורמזים/).waitFor({ timeout: 8000 });
  await A.waitForFunction(() => document.querySelector("#pr-words")?.value.length > 5, null, { timeout: 8000 });
  const n = (await A.getByLabel(/מילים ורמזים/).inputValue()).split("\n").filter(Boolean).length;
  ok(n >= 4, "keywords found " + n);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe printables " + axeMsg(r));
  const [pop] = await Promise.all([A.waitForEvent("popup", { timeout: 6000 }), A.getByRole("button", { name: "תשבץ", exact: true }).click()]);
  await pop.waitForLoadState();
  const cells = await pop.locator("table.cw td").count();
  ok(cells > 9, "crossword table " + cells);
  ok((await pop.locator("table.cw td.b").count()) < cells, "crossword has letters cells");
  await pop.close();
  const [p2] = await Promise.all([A.waitForEvent("popup", { timeout: 6000 }), A.getByRole("button", { name: "הדפסת כרטיסי תפקידים" }).click()]);
  await p2.waitForLoadState();
  ok((await p2.locator(".cards .card").count()) >= 5, "role cards");
});
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
