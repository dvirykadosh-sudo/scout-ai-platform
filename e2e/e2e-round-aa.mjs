// בדיקות דפדפן לשלב 39 (261–270).
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
const user = "a39" + Date.now().toString().slice(-6);
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
const open = async (btn) => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "כלים נוספים" }).click();
  await A.getByRole("button", { name: btn }).click();
};

await step("voice check", async () => {
  await open("בדיקת קול");
  await A.getByText(/דקות/).first().waitFor({ timeout: 8000 });
  await A.getByText(/משפטים שקשה להגיד בקול/).waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe voice " + axeMsg(r));
});

await step("safety + emergency", async () => {
  await open("בדיקת בטיחות");
  await A.getByRole("button", { name: "הוספת שלב בטיחות" }).waitFor({ timeout: 8000 });
  await A.getByLabel("שם (רכז, הורה אחראי, מרפאה)").fill("רכז שבט");
  await A.getByRole("textbox", { name: "טלפון", exact: true }).fill("0501234567");
  await A.getByRole("button", { name: "הוספת איש קשר" }).click();
  await A.getByText("רכז שבט:").waitFor({ timeout: 6000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe safety " + axeMsg(r));
});

await step("age adapt creates copy", async () => {
  await open("התאמה לגיל");
  await A.getByRole("button", { name: "יצירת עותק מותאם" }).click();
  await A.waitForURL((u) => /\/write\/\d+$/.test(u.pathname) && !u.pathname.endsWith("/" + docId), { timeout: 10000 });
  ok(true, "navigated to copy");
});

await step("stage questions", async () => {
  await open("שאלות לדיון לשלב");
  await A.getByRole("button", { name: "הוספת שלוש השאלות" }).waitFor({ timeout: 8000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe questions " + axeMsg(r));
  await A.getByRole("button", { name: "הוספת שלוש השאלות" }).click();
  await A.getByText(/השאלות נוספו/).first().waitFor({ timeout: 6000 });
});

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
