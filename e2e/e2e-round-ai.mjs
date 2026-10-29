// בדיקות דפדפן לשלב 50 (336–345).
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
const user = "f50" + Date.now().toString().slice(-6);
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

const close = async () => { await A.getByRole("button", { name: "סגירה" }).last().click(); };
await step("illustrations", async () => {
  await open("ספריית איורים");
  ok((await A.locator(".illus-btn").count()) >= 20, "20+ icons");
  await A.getByRole("button", { name: "אוהל", exact: true }).click();
  ok((await A.getByRole("button", { name: "אוהל", exact: true }).getAttribute("aria-pressed")) === "true", "pressed state");
  await A.getByRole("button", { name: "הוספת סימון מדורה לשלב" }).click();
  await A.getByText("סימון האיור נוסף").first().waitFor({ timeout: 5000 });
  const r = await axe(A); ok(r.violations.length === 0, "axe illus " + axeMsg(r));
});
await step("holiday", async () => {
  await open("תבניות לחגים");
  await A.getByRole("button", { name: "הוספת תבנית חנוכה" }).click();
  await A.getByText("שלבי חנוכה נוספו").first().waitFor({ timeout: 5000 });
  await A.waitForTimeout(800);
  ok((await A.getByText("מעטים מול רבים: משחק").count()) >= 1, "holiday stages in editor");
});
await step("hooks", async () => {
  await open("שאלות פתיחה");
  await A.getByText("הצבעה:").first().waitFor({ timeout: 6000 });
  ok((await A.getByRole("button", { name: "הוספה לשלב" }).count()) === 6, "6 hooks");
  const r = await axe(A); ok(r.violations.length === 0, "axe hooks " + axeMsg(r));
});
await step("game rules", async () => {
  await open("כללי משחק");
  await A.getByRole("button", { name: "יצירת כללים" }).click();
  await A.getByText("כתבו שם למשחק").first().waitFor({ timeout: 5000 });
  await A.getByLabel("שם המשחק").fill("מירוץ הדגלים");
  await A.getByLabel("מטרת המשחק").fill("להביא את הדגל לבסיס");
  await A.getByRole("button", { name: "יצירת כללים" }).click();
  await A.locator(".rules-out").waitFor({ timeout: 5000 });
  ok((await A.locator(".rules-out").innerText()).includes("בטיחות"), "rules text");
  const r = await axe(A); ok(r.violations.length === 0, "axe rules " + axeMsg(r));
});
await step("translate", async () => {
  await open("דף עזר באנגלית/רוסית");
  await A.getByText("Hello and welcome").waitFor({ timeout: 6000 });
  await A.getByLabel("שפה").selectOption("ru");
  await A.getByText("Здравствуйте и добро пожаловать").waitFor({ timeout: 6000 });
  const r = await axe(A); ok(r.violations.length === 0, "axe translate " + axeMsg(r));
});
await step("series", async () => {
  await open("הפעולה הבאה בסדרה");
  await A.getByText("העמקה:").first().waitFor({ timeout: 6000 });
  const r = await axe(A); ok(r.violations.length === 0, "axe series " + axeMsg(r));
});
await step("meter", async () => {
  await open("מד השתתפות");
  await A.getByLabel("שמות החניכים (שם בכל שורה)").fill("דנה\nיוסי\nמיכל");
  await A.getByRole("button", { name: "התחלה" }).click();
  for (let i = 0; i < 3; i++) await A.getByRole("button", { name: /^דנה: \d+\. הוספת השתתפות/ }).click();
  await A.getByRole("button", { name: /^יוסי: \d+\. הוספת השתתפות/ }).click();
  await A.getByRole("button", { name: /^יוסי: \d+\. הוספת השתתפות/ }).click();
  await A.getByText("כדאי לתת במה ל:").waitFor({ timeout: 4000 });
  ok((await A.locator(".meter-tip").innerText()).includes("מיכל"), "quiet voice flagged");
  const r = await axe(A); ok(r.violations.length === 0, "axe meter " + axeMsg(r));
});
await step("merge", async () => {
  const H = { ...J, Authorization: "Bearer " + tok };
  const d2 = await (await fetch(B + "/api/write/docs", { method: "POST", headers: H, body: JSON.stringify({ template: "classic", title: "גרסה של מדריך אחר" }) })).json();
  await fetch(B + "/api/write/docs/" + d2.id, { method: "PUT", headers: H, body: JSON.stringify({ title: "גרסה של מדריך אחר", meta: d2.meta, blocks: [...d2.blocks.slice(0, 1).map((b) => ({ ...b, text: "משחק בלתי קשור לגמרי עם כדורים וקונוסים" })), { id: "zz1", title: "שלב ייחודי של השני", kind: "peak", minutes: 5, text: "הפתעה" }], baseRev: d2.rev }) });
  await open("מיזוג שתי גרסאות");
  await A.getByRole("button", { name: "השוואה" }).first().click();
  await A.getByText("רק בגרסה האחרת").first().waitFor({ timeout: 6000 });
  const r = await axe(A); ok(r.violations.length === 0, "axe merge " + axeMsg(r));
  await A.getByRole("button", { name: "החלת המיזוג" }).click();
  await A.getByText("המיזוג הוחל").first().waitFor({ timeout: 5000 });
  await A.waitForTimeout(800);
  ok((await A.getByText("שלב ייחודי של השני").count()) >= 1, "unique stage merged in");
});
await step("voice notes", async () => {
  await open("הקלטה קולית לשלב");
  await A.getByRole("button", { name: "התחלת הקלטה" }).click();
  await A.getByRole("button", { name: /^עצירה/ }).waitFor({ timeout: 6000 });
  await A.waitForTimeout(1500);
  await A.getByRole("button", { name: /^עצירה/ }).click();
  await A.locator("audio").first().waitFor({ timeout: 6000 });
  const r = await axe(A); ok(r.violations.length === 0, "axe vnotes " + axeMsg(r));
  await A.getByRole("button", { name: "מחיקה" }).first().click();
  await A.getByText("אין עדיין הקלטות").waitFor({ timeout: 4000 });
});
await step("viewers", async () => {
  const H = { ...J, Authorization: "Bearer " + tok };
  const sh = await (await fetch(B + "/api/write/docs/" + docId + "/share", { method: "POST", headers: H, body: "{}" })).json();
  const V = await ctx.newPage();
  await V.goto(B + "/write/view/" + sh.token, { waitUntil: "networkidle" });
  await V.locator("section.card").nth(1).click();
  await V.waitForTimeout(1200);
  await open("מי צופה עכשיו");
  await A.locator(".viewer-dot").first().waitFor({ timeout: 8000 });
  const vt = await A.locator("dialog[open] .plain-list li").first().innerText(); ok(vt.includes("בשלב"), "viewer stage shown: " + vt);
  const r = await axe(A); ok(r.violations.length === 0, "axe viewers " + axeMsg(r));
  await V.close();
});
await step("headers allow mic", async () => {
  const r = await fetch(B + "/");
  ok(/microphone=\(self\)/.test(r.headers.get("permissions-policy") || ""), "microphone allowed for self");
});
await browser.close();
console.log(fails ? "FAILS " + fails : "ALL OK");
process.exit(fails ? 1 : 0);
