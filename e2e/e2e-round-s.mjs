// בדיקות דפדפן לייצוא וכלים נלווים, סבב 151–162.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import crypto from "node:crypto";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const ADMIN_PW = process.env.ADMIN_PASSWORD || "Strong#Pass99";
const NEW_PW = "E2e-new-pass-2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const mk = async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL" });
  await c.addInitScript(() => { try { localStorage.setItem("scout.hero.seen", "1"); } catch {} });
  return c;
};
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 8).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const stamp = Date.now().toString().slice(-6);
const USER = "exs" + stamp;
const PW = "Str0ng-e2e-pw-26";


const ctx = await mk();
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const saved = (p) => p.getByText(/^נשמר \d/).first();
const txt = (p, n) => p.getByLabel("טקסט השלב " + n, { exact: true });
const dlg = () => A.getByRole("dialog");
const close = () => dlg().getByRole("button", { name: "סגירה" }).last().click();
const rows = () => A.locator(`section[aria-labelledby="w-mine"] li`);

await step("register and create a document with a value", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("בודק סטט");
  await A.getByLabel("שם משתמש").fill(USER);
  await A.getByLabel("סיסמה", { exact: true }).fill(PW);
  await A.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await A.getByLabel("קראתי ואני מאשר").check();
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByRole("heading", { name: "פרטיות", exact: true }).waitFor({ timeout: 10000 });
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: /להתחיל\s*:\s*פעולה קלאסית/ }).click();
  await A.getByRole("button", { name: "דילוג" }).click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  await A.getByRole("textbox", { name: "שם הפעולה" }).fill("תבנית אומץ");
  await A.getByLabel("ערך או מטרה").fill("אומץ");
  await txt(A, 2).fill("נעשה משחק תחרות בין קבוצות עם חבלים.");
  await saved(A).waitFor({ timeout: 8000 });
});

await step("mark stage ready and progress", async () => {
  ok(await A.getByText(/0 מתוך 4 שלבים מסומנים כמוכנים/).isVisible(), "0 ready");
  await A.getByLabel(/^השלב מוכן\s*:\s*שלב 1/).check();
  ok(await A.getByText(/1 מתוך 4 שלבים מסומנים כמוכנים/).isVisible(), "1 ready");
});

await step("discussion questions by value", async () => {
  await txt(A, 3).click();
  await A.getByRole("button", { name: "שאלות לדיון" }).click();
  await dlg().getByText(/אומץ/).first().waitFor({ timeout: 4000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe questions " + axeMsg(r));
  await dlg().getByRole("checkbox").first().check();
  await dlg().getByRole("button", { name: "הכנסת הנבחרות לשלב" }).click();
  ok(/^1\./.test(await txt(A, 3).inputValue()), "numbered question inserted");
});

await step("run log", async () => {
  await A.getByRole("button", { name: /^יומן הרצות/ }).click();
  await dlg().getByLabel("איך הלך? מה לשנות?").fill("הלך מצוין, להאריך את המשחק");
  await dlg().getByLabel("דירוג (0 עד 5)").fill("5");
  await dlg().getByRole("button", { name: "הוספה ליומן" }).click();
  await dlg().getByText(/דירוג 5 מתוך 5/).waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe runlog " + axeMsg(r));
  await close();
  ok(await A.getByRole("button", { name: "יומן הרצות (1)" }).isVisible(), "count shown");
});

await step("shortcuts dialog and ctrl+s", async () => {
  await A.getByRole("region", { name: "סרגל כלים ומצב המסמך" }).getByRole("button", { name: "קיצורי מקלדת" }).click();
  await dlg().getByText("שמירה עכשיו").waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe keys " + axeMsg(r));
  await close();
  await txt(A, 1).click();
  await txt(A, 1).pressSequentially("עוד ");
  await A.keyboard.press("Control+s");
  await A.getByText("נשמר", { exact: true }).first().waitFor({ timeout: 4000 });
  ok(true, "ctrl+s toast");
});

await step("mark as personal template, summary sheet", async () => {
  await A.getByLabel("שמירה כתבנית אישית").check();
  ok((await A.locator(".write-summary").count()) === 1, "summary sheet exists");
  ok(!(await A.locator(".write-summary").isVisible()), "summary hidden on screen");
  await A.waitForTimeout(400);
  await saved(A).waitFor({ timeout: 8000 });
  await A.waitForTimeout(2500);
  await saved(A).waitFor({ timeout: 8000 });
});

await step("new doc from personal template, then import stages from another doc", async () => {
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: /התחלה מהתבנית\s*:\s*תבנית אומץ/ }).click();
  await A.getByRole("button", { name: "דילוג" }).click().catch(() => {});
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  ok((await A.getByRole("textbox", { name: "שם הפעולה" }).inputValue()) === "תבנית אומץ", "title copied");
  ok((await A.getByLabel("ערך או מטרה").inputValue()) === "אומץ", "value copied");
  ok(await A.getByRole("button", { name: "יומן הרצות (0)" }).isVisible(), "runs reset");
  await A.getByRole("button", { name: "שלבים ממסמך אחר" }).click();
  await dlg().getByRole("button", { name: /בחירה/ }).first().click();
  await dlg().getByRole("checkbox").first().check();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe import-stages " + axeMsg(r));
  await dlg().getByRole("button", { name: /הוספת 1 שלבים/ }).click();
  ok((await A.getByLabel(/^טקסט השלב \d+$/).count()) === 5, "5 stages");
  await A.getByRole("textbox", { name: "שם הפעולה" }).fill("מסמך שני");
  await A.waitForTimeout(3000);
  await saved(A).waitFor({ timeout: 8000 });
});

await step("stats modal", async () => {
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הסטטיסטיקה שלי" }).click();
  await dlg().getByText(/\d+ מסמכים/).waitFor({ timeout: 5000 });
  ok(await dlg().getByText(/משחק תחרות/).first().isVisible(), "method counted");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe stats " + axeMsg(r));
  await close();
});

await step("bulk archive, archive view, sort", async () => {
  await A.getByRole("checkbox", { name: /בחירה: מסמך שני/ }).check();
  await A.getByRole("button", { name: "העברה לארכיון" }).click();
  await A.getByText(/עודכנו 1 מסמכים/).waitFor({ timeout: 5000 });
  await A.waitForTimeout(800);
  ok((await rows().filter({ hasText: "מסמך שני" }).count()) === 0, "archived hidden");
  await A.getByLabel("הצגת הארכיון").check();
  ok((await rows().filter({ hasText: "מסמך שני" }).count()) === 1, "visible in archive view");
  await A.getByLabel("הצגת הארכיון").uncheck();
  await A.getByLabel("מיון").selectOption("title");
  await A.waitForTimeout(500);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe list " + axeMsg(r));
});

await step("mobile: no horizontal scroll", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.waitForTimeout(400);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "list ok");
  await rows().first().getByRole("link").first().click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  await A.waitForTimeout(500);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "editor ok");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
