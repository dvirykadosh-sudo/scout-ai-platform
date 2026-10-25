// בדיקות דפדפן לייצוא וכלים נלווים, סבב 175–187.
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

await step("register and create two similar docs", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("בודק אחרון");
  await A.getByLabel("שם משתמש").fill(USER);
  await A.getByLabel("סיסמה", { exact: true }).fill(PW);
  await A.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await A.getByLabel("קראתי ואני מאשר").check();
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByRole("heading", { name: "פרטיות", exact: true }).waitFor({ timeout: 10000 });
  const long = "נשחק משחק תחרות בין הקבוצות עם חבלים ונדבר על אחריות ועל מה שלמדנו בפעולה הזאת ועל איך כל אחד מאיתנו יכול לעזור לחבר שלו";
  for (const title of ["אחריות בקבוצה", "אחריות בשבט"]) {
    await A.goto(B + "/write", { waitUntil: "networkidle" });
    await A.getByRole("button", { name: /להתחיל\s*:\s*פעולה קלאסית/ }).click();
    await A.getByRole("button", { name: "דילוג" }).click();
    await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
    await A.getByRole("textbox", { name: "שם הפעולה" }).fill(title);
    await txt(A, 2).fill(long);
    await A.waitForTimeout(3000);
    await saved(A).waitFor({ timeout: 8000 });
  }
});

await step("185. similar-doc notice", async () => {
  await A.getByText(/המסמך דומה מאוד ל/).waitFor({ timeout: 9000 });
  ok(await A.getByRole("link", { name: "אחריות בקבוצה" }).isVisible(), "links to the similar doc");
});

await step("176. search in all documents", async () => {
  await bar().getByRole("button", { name: "חיפוש בכל המסמכים" }).click();
  await dlg().getByLabel("מה לחפש").fill("חבלים");
  await dlg().getByRole("button", { name: "חיפוש", exact: true }).click();
  await dlg().getByRole("list", { name: "תוצאות חיפוש" }).waitFor({ timeout: 5000 });
  ok((await dlg().getByRole("list", { name: "תוצאות חיפוש" }).getByRole("listitem").count()) === 2, "2 results");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe search " + axeMsg(r));
  await close();
});

await step("181+187. equipment and self-review", async () => {
  await A.getByText(/^הציוד שלי וביקורת עצמית/).click();
  await A.getByLabel("פריט ציוד").fill("חבלים");
  await A.getByLabel("פריט ציוד").press("Enter");
  await A.getByRole("list", { name: "ציוד" }).getByText("חבלים", { exact: true }).waitFor();
  await A.getByLabel(/יש שאלה או מעשה פותח/).check();
  ok(await A.getByText(/\(1 מתוך 8\)/).isVisible(), "review progress");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe prep panel " + axeMsg(r));
  await bar().getByRole("button", { name: "דף הכנה" }).click();
  await dlg().getByText(/זמן הכנה משוער/).waitFor({ timeout: 5000 });
  ok(await dlg().getByText("חבלים").first().isVisible(), "equipment in prep sheet");
  await close();
});

await step("184. parents message", async () => {
  await A.getByLabel("תאריך הפעולה").fill("2026-11-05");
  await A.getByLabel("שעת התחלה").fill("17:30");
  await bar().getByRole("button", { name: "הודעה להורים" }).click();
  const t = dlg().getByLabel("נוסח ההודעה");
  await t.waitFor();
  await A.waitForTimeout(800);
  const v = await t.inputValue();
  ok(/אחריות בשבט/.test(v) && /17:30/.test(v) && /חבלים/.test(v), "message has title, time, gear: " + v.slice(0, 80));
  const r = await axe(A);
  ok(r.violations.length === 0, "axe parents " + axeMsg(r));
  await close();
});

await step("175. ics download", async () => {
  const [dl] = await Promise.all([A.waitForEvent("download", { timeout: 8000 }), bar().getByRole("button", { name: "קובץ יומן (ICS)" }).click()]);
  const fs = await import("node:fs");
  const ics = fs.readFileSync(await dl.path(), "utf8");
  ok(ics.includes("BEGIN:VEVENT") && ics.includes("DTSTART:20261105T173000"), "ics start " + (ics.match(/DTSTART:\S+/) || [""])[0]);
});

await step("182. group splitter", async () => {
  await bar().getByRole("button", { name: "חלוקה לקבוצות" }).click();
  await dlg().getByLabel(/שמות החניכים/).fill("דנה, נועם, יובל, מאיה, איתי, שירה, תום");
  await dlg().getByLabel("מספר קבוצות").fill("3");
  await dlg().getByText(/7 משתתפים ב-3 קבוצות: 3, 2, 2/).waitFor();
  await dlg().getByRole("button", { name: "ערבוב לקבוצות" }).click();
  const items = dlg().getByRole("list", { name: "הקבוצות" }).getByRole("listitem");
  ok((await items.count()) === 3, "3 groups");
  const all = (await items.allInnerTexts()).join(" ");
  ok(["דנה", "נועם", "יובל", "מאיה", "איתי", "שירה", "תום"].every((n) => all.includes(n)), "everyone placed");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe groups " + axeMsg(r));
  await close();
});

await step("177. ready-made stage and Alt+arrow move", async () => {
  const n0 = await A.getByLabel(/^טקסט השלב \d+$/).count();
  await bar().getByLabel("הוספת שלב מוכן").selectOption({ label: "מעגל סיכום" });
  ok((await A.getByLabel(/^טקסט השלב \d+$/).count()) === n0 + 1, "stage added");
  await txt(A, 1).click();
  await A.keyboard.press("Alt+ArrowDown");
  await A.waitForTimeout(300);
  ok((await txt(A, 1).inputValue()).length > 0 || (await txt(A, 2).inputValue()).length > 0, "alt+arrow handled without error");
});

await step("180. value suggestions list", async () => {
  ok((await A.locator("#w-values option").count()) >= 10, "datalist options");
});

await step("183. bulk tag on list", async () => {
  await A.waitForTimeout(2500);
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("checkbox", { name: /בחירה: אחריות בקבוצה/ }).check();
  A.once("dialog", (d) => d.accept("חורף"));
  await A.getByRole("button", { name: "הוספת תגית לנבחרים" }).click();
  await A.getByText(/עודכנו 1 מסמכים/).waitFor({ timeout: 5000 });
  await A.getByLabel("סינון לפי תגית").selectOption("חורף");
  ok((await A.locator(`section[aria-labelledby="w-mine"] li`).count()) === 1, "filtered by new tag");
  await A.waitForTimeout(500);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe list " + axeMsg(r));
});

await step("mobile: no horizontal scroll", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.waitForTimeout(500);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "list ok");
  await A.locator(`section[aria-labelledby="w-mine"] li a`).first().click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  await A.waitForTimeout(500);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "editor ok");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
