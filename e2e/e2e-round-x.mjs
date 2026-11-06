// בדיקות דפדפן לשלב 36 (201–220).
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
const user = "x36" + Date.now().toString().slice(-6);
let tok, usr, docId;

await step("setup via api", async () => {
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך בדיקה", signupCode: CODE, acceptTerms: true }) })).json();
  tok = r.token; usr = r.user;
  const H = { ...J, Authorization: "Bearer " + tok };
  const d = await (await fetch(B + "/api/write/docs", { method: "POST", headers: H, body: JSON.stringify({ template: "classic" }) })).json();
  docId = d.id;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const put = await fetch(B + "/api/write/docs/" + d.id, { method: "PUT", headers: H, body: JSON.stringify({ title: "פעולה בחוץ", meta: { ...d.meta, date: tomorrow, minutes: 40, equipment: ["חבלים", "כדור"] }, blocks: d.blocks.map((b) => ({ ...b, text: "משחק בחוץ במגרש" })), baseRev: d.rev }) });
  ok(put.ok, "doc saved " + put.status);
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL" });
await ctx.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await step("home: upcoming card + equipment", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "הפעולה הבאה שלי" }).waitFor({ timeout: 8000 });
  ok(await A.getByText("מחר יש לך פעולה").isVisible(), "tomorrow reminder");
  await A.getByRole("button", { name: /ציוד לשבוע/ }).click();
  ok(await A.getByText("חבלים").first().isVisible(), "equipment listed");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe equipment modal " + axeMsg(r));
  await A.getByRole("button", { name: "סגירה" }).last().click();
});

await step("editor: outdoor hint + more tools", async () => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByText(/אין בה תוכנית לגשם/).waitFor({ timeout: 8000 });
  await A.getByRole("button", { name: "כלים נוספים" }).click();
  await A.getByText(/סכום השלבים/).waitFor();
  await A.getByRole("button", { name: "הוספה לשלב" }).first().waitFor();
  await A.getByLabel("שמות החניכים (שם בכל שורה)").fill("דני\nרוני");
  await A.getByRole("button", { name: "שמירת הרשימה" }).click();
  await A.getByLabel("דני").waitFor();
  await A.getByLabel("דני").check();
  await A.getByText(/מי הגיע \(1 מתוך 2\)/).waitFor({ timeout: 5000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe more tools " + axeMsg(r));
});

await step("short10 creates a copy", async () => {
  await A.getByRole("button", { name: "יצירת קיצור ל-10 דקות" }).click();
  await A.waitForURL((u) => /\/write\/\d+$/.test(u.pathname) && !u.pathname.endsWith("/" + docId), { timeout: 10000 });
  ok(!A.url().endsWith("/write/" + docId), "navigated to the copy");
});

await step("templates: ceremonies", async () => {
  const t = await (await fetch(B + "/api/write/templates")).json();
  ok(t.filter((x) => x.id.startsWith("ceremony")).length === 4, "4 ceremony templates");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
