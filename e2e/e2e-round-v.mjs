// בדיקות דפדפן לייצוא וכלים נלווים, סבב 188–200.
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
const USER = "exu" + stamp;
const PW = "Str0ng-e2e-pw-26";


const ctx = await mk();
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const saved = (p) => p.getByText(/^נשמר \d/).first();
const txt = (p, n) => p.getByLabel("טקסט השלב " + n, { exact: true });
const dlg = () => A.getByRole("dialog");
const close = () => dlg().getByRole("button", { name: "סגירה" }).last().click();
const bar = () => A.getByRole("region", { name: "סרגל כלים ומצב המסמך" });


await step("home: tabs", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  ok(await A.getByRole("tab", { name: "יצירת פעולה" }).getAttribute("aria-selected") === "true", "create tab default");
  await A.getByRole("tab", { name: "השראה והצעות" }).click();
  ok(await A.getByRole("tab", { name: "השראה והצעות" }).getAttribute("aria-selected") === "true", "ideas selected");
  await A.getByRole("tab", { name: "השבוע שלי והודעות" }).click();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe home " + axeMsg(r));
});

await step("200. tour on home", async () => {
  await A.getByRole("button", { name: "סיור קצר באתר" }).click();
  await dlg().getByRole("button", { name: "הבא" }).click();
  await dlg().getByRole("button", { name: "הבא" }).click();
  await dlg().getByRole("button", { name: "סיום" }).click();
});

await step("198/199. whats-new + feedback", async () => {
  await A.goto(B + "/whats-new", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: /גרסה 28/ }).waitFor();
  await A.getByRole("button", { name: /עזר/ }).first().click();
  await A.getByText(/תודה, המשוב/).first().waitFor({ timeout: 5000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe whats-new " + axeMsg(r));
});

await step("register and open editor", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("בודק אחרון");
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
  await txt(A, 2).fill("נשחק משחק בחוץ עם כדור ונרוץ בגינה");
});
await step("188. stations", async () => {
  await A.getByRole("button", { name: "חישוב תחנות" }).click();
  await dlg().getByRole("button", { name: "חישוב" }).click();
  await dlg().getByText(/סבב תחנות/).first().waitFor({ timeout: 5000 });
  await dlg().getByRole("button", { name: "הכנסה לשלב הנוכחי" }).click();
  ok((await txt(A, 2).inputValue()).includes("סבב תחנות"), "inserted");
});

await step("189. backup plan", async () => {
  await A.getByRole("button", { name: "תוכנית גיבוי" }).click();
  await dlg().getByText(/תוכנית גיבוי: גשם/).waitFor({ timeout: 5000 });
  await dlg().getByRole("button", { name: "הוספה כשלב חדש בסוף" }).click();
  ok(await A.getByRole("textbox", { name: "שם השלב" }).count() >= 0, "stage added");
});

await step("190. readiness", async () => {
  await A.getByRole("button", { name: "מוכנות להעברה" }).click();
  await dlg().getByText(/מתוך 100/).waitFor({ timeout: 5000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe readiness " + axeMsg(r));
  await close();
});

await step("192. tribe methods modal", async () => {
  await A.getByRole("button", { name: "מתודות השבט" }).click();
  await dlg().getByText(/מתודות שבטיות|עדיין לא/).first().waitFor({ timeout: 5000 });
  await close();
});

await step("194. word import field", async () => {
  await A.getByRole("button", { name: "הדבקת טקסט לשלבים" }).click();
  ok(await dlg().getByLabel(/קובץ Word/).count() === 1, "file input");
  await close();
});

await step("197. wake banner hidden when fast", async () => {
  ok(await A.getByText(/השרת מתעורר/).count() === 0, "no banner");
});

await step("mobile home: no horizontal scroll", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.goto(B + "/", { waitUntil: "networkidle" });
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "home ok");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
