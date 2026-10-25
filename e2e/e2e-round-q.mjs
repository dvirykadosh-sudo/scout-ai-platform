// בדיקות דפדפן לייצוא וכלים נלווים, סבב 127–138.
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
const USER = "exq" + stamp;
const PW = "Str0ng-e2e-pw-26";


const ctx = await mk();
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const saved = (p) => p.getByText(/^נשמר \d/).first();
const txt = (p, n) => p.getByLabel("טקסט השלב " + n, { exact: true });

const dlg = () => A.getByRole("dialog");

await step("registration: code with spaces and capitals works; mobile attrs", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  ok((await A.getByLabel("שם משתמש").getAttribute("autocapitalize")) === "none", "username autocapitalize none");
  await A.getByLabel("שם להצגה").fill("בודק הרשמה");
  await A.getByLabel("שם משתמש").fill(USER);
  await A.getByLabel("סיסמה", { exact: true }).fill(PW);
  await A.getByLabel("קוד הרשמה של השבט").fill("  " + CODE.toUpperCase() + " ");
  await A.getByLabel("קראתי ואני מאשר").check();
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByRole("heading", { name: "פרטיות", exact: true }).waitFor({ timeout: 10000 });
  ok(true, "registered");
});

await step("home quick menu and axe", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "מה רוצים לעשות היום?" }).waitFor();
  await A.getByText("כל הכלים", { exact: true }).click();
  ok((await A.getByRole("navigation", { name: "תפריט מהיר" }).getByRole("link").count()) >= 6, "menu links");
  await A.waitForTimeout(800);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe home " + axeMsg(r));
});

await step("logo splash on creating a document", async () => {
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: /להתחיל\s*:\s*פעולה קלאסית/ }).click();
  await A.getByRole("dialog", { name: "פותחים מסמך חדש" }).waitFor({ timeout: 3000 });
  ok(true, "splash shown");
  await A.getByRole("button", { name: "דילוג" }).click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  ok(true, "editor opened after skip");
});

await step("meta, import text, prep sheet", async () => {
  await A.getByRole("textbox", { name: "שם הפעולה" }).fill("אומץ בפעולה");
  await A.getByLabel("שם המדריך/ה").fill("דביר");
  await A.getByLabel("תאריך הפעולה").fill("2026-10-23");
  await A.getByLabel("סימון בכוכב").check();
  await A.getByRole("button", { name: "הדבקת טקסט לשלבים" }).click();
  await A.getByLabel("הטקסט", { exact: true }).fill("פתיחה:\nשואלים מה זה אומץ\n\nמשחק (10 דקות):\nמשחקים עם חבלים\n\nסיכום:\nמעגל סיום");
  await A.getByRole("button", { name: "חלוקה לשלבים" }).click();
  await A.getByText(/נמצאו/).waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe import " + axeMsg(r));
  await A.getByRole("button", { name: "הוספה בסוף המסמך" }).click();
  await A.getByRole("heading", { name: /^משחק/ }).first().waitFor({ timeout: 3000 }).catch(() => {});
  ok((await A.getByLabel(/^טקסט השלב \d+$/).count()) === 7, "7 stages after import");
});

await step("prep sheet", async () => {
  await A.getByRole("button", { name: "דף הכנה" }).click();
  await dlg().getByRole("heading", { name: "ציוד להכין" }).waitFor({ timeout: 5000 });
  ok(await dlg().getByRole("heading", { name: "לפני שיוצאים" }).isVisible(), "checklist");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe prep " + axeMsg(r));
  await dlg().getByRole("button", { name: "סגירה" }).last().click();
});

await step("export: word download with logo, print sheet, axe", async () => {
  await A.getByRole("button", { name: "ייצוא ושיתוף" }).click();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe export " + axeMsg(r));
  const [dl] = await Promise.all([A.waitForEvent("download", { timeout: 10000 }), dlg().getByRole("button", { name: /הורדה כקובץ Word/ }).click()]);
  ok(dl.suggestedFilename().length > 0, "download started: " + dl.suggestedFilename());
  const fs = await import("node:fs");
  const path = await dl.path();
  const buf = fs.readFileSync(path);
  ok(buf.subarray(0, 2).toString() === "PK" && buf.includes(Buffer.from("word/media/")), "docx has logo image");
  ok((await A.locator(".write-print").count()) === 1, "print sheet in DOM");
  ok(!(await A.locator(".write-print").isVisible()), "print sheet hidden on screen");
  await dlg().getByRole("button", { name: "סגירה" }).last().click();
});

await step("starred doc is first and persists", async () => {
  await A.locator(".write-bar").getByText(/נשמר \d/).first().waitFor({ timeout: 8000 });
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  const first = A.locator(`section[aria-labelledby="w-mine"] li`).first();
  ok(/★/.test(await first.innerText()), "star on first row");
  await A.goto(B + "/", { waitUntil: "networkidle" });
  ok(await A.getByRole("link", { name: /להמשיך לכתוב/ }).isVisible(), "continue writing link");
});

await step("mobile: no horizontal scroll on home and editor", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.waitForTimeout(400);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "home ok");
  await A.getByRole("link", { name: /להמשיך לכתוב/ }).click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  await A.waitForTimeout(400);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "editor ok");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
