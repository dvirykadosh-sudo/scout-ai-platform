// בדיקות דפדפן לייצוא וכלים נלווים, סבב 139–150.
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
const USER = "exr" + stamp;
const PW = "Str0ng-e2e-pw-26";


const ctx = await mk();
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const saved = (p) => p.getByText(/^נשמר \d/).first();
const txt = (p, n) => p.getByLabel("טקסט השלב " + n, { exact: true });
const dlg = () => A.getByRole("dialog");
const close = () => dlg().getByRole("button", { name: "סגירה" }).last().click();
const stages = () => A.getByLabel(/^טקסט השלב \d+$/).count();
let shareUrl = "";

await step("register and create a classic document", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("בודק עוד");
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
  await A.getByRole("textbox", { name: "שם הפעולה" }).fill("אומץ בפעולה");
  await txt(A, 1).fill("אנחנו מתחילים בשאלה. " + "מילה ".repeat(40) + "סוף.");
  await txt(A, 2).fill("שלב גוף עם טקסט. כאן ממשיכים. ועוד משפט.");
  await saved(A).waitFor({ timeout: 8000 });
});

await step("auto minutes, clock times", async () => {
  await A.getByLabel("משך מתוכנן (דקות)").fill("60");
  await A.getByLabel("שעת התחלה").fill("18:00");
  await A.getByRole("button", { name: "חלוקת זמן אוטומטית" }).click();
  await A.getByText("מתחיל בשעה 18:00").waitFor({ timeout: 3000 });
  ok(await A.getByText(/השלבים מסתכמים ב-60 דקות, כמו המשך המתוכנן/).isVisible(), "total equals plan");
  ok((await A.getByText(/^מתחיל בשעה \d\d:\d\d$/).count()) === 4, "clock on 4 stages");
});

await step("duplicate and split stage", async () => {
  const n0 = await stages();
  await A.getByRole("button", { name: /^שכפול השלב\s*:\s*שלב 2/ }).click();
  ok((await stages()) === n0 + 1, "duplicate adds stage");
  await A.getByRole("button", { name: /^פיצול במיקום הסמן\s*:\s*שלב 3/ }).click();
  ok((await stages()) === n0 + 1, "split without cursor does nothing");
  await txt(A, 3).evaluate((el) => { el.focus(); el.setSelectionRange(12, 12); });
  await A.getByRole("button", { name: /^פיצול במיקום הסמן\s*:\s*שלב 3/ }).click();
  ok((await stages()) === n0 + 2, "split adds stage");
  await A.getByRole("button", { name: "ביטול", exact: true }).click();
  await A.getByRole("button", { name: "ביטול", exact: true }).click();
  ok((await stages()) === n0, "undo twice returns");
});

await step("snippets save and insert", async () => {
  await txt(A, 1).click();
  await A.getByRole("button", { name: "קטעים שמורים" }).click();
  await A.getByLabel("שם לקטע החדש").fill("פתיחה אהובה");
  await dlg().getByRole("button", { name: "שמירת טקסט השלב כקטע" }).click();
  await dlg().getByText("פתיחה אהובה").first().waitFor({ timeout: 4000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe snippets " + axeMsg(r));
  await close();
  await A.getByRole("button", { name: "קטעים שמורים" }).click();
  await dlg().getByRole("button", { name: /הכנסה לשלב/ }).click();
  ok((await txt(A, 1).inputValue()).split("אנחנו מתחילים בשאלה").length >= 3, "inserted a copy");
});

await step("readability and title ideas", async () => {
  await A.getByRole("button", { name: "קריאוּת והצעות לשם" }).click();
  await dlg().getByText(/משפט של \d+ מילים/).first().waitFor({ timeout: 5000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe readability " + axeMsg(r));
  await dlg().getByRole("button", { name: /שימוש בשם/ }).first().click();
  ok((await A.getByRole("textbox", { name: "שם הפעולה" }).inputValue()) !== "אומץ בפעולה", "title replaced");
});

await step("tags", async () => {
  await A.getByLabel("תגיות").fill("חורף, ערך");
  await A.getByLabel("תגיות").blur();
  await saved(A).waitFor({ timeout: 8000 });
});

await step("share link works for a visitor and can be revoked", async () => {
  await A.getByRole("button", { name: "שיתוף בקישור" }).click();
  await A.getByRole("button", { name: "יצירת קישור" }).click();
  shareUrl = await A.getByLabel("הקישור", { exact: true }).inputValue();
  ok(/\/write\/view\//.test(shareUrl), "url " + shareUrl);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe share " + axeMsg(r));
  const vctx = await mk();
  const V = await vctx.newPage();
  await V.goto(shareUrl.replace(/^https?:\/\/[^/]+/, B), { waitUntil: "networkidle" });
  await V.getByText("צפייה בלבד").waitFor({ timeout: 6000 });
  ok(await V.getByText("שלב גוף עם טקסט").isVisible(), "visitor sees text");
  ok((await V.getByLabel(/^טקסט השלב/).count()) === 0 && (await V.locator("[contenteditable]").count()) === 0, "no editing of stages");
  await V.waitForTimeout(600);
  const rv = await axe(V);
  ok(rv.violations.length === 0, "axe shared view " + axeMsg(rv));
  await A.getByRole("button", { name: "ביטול הקישור" }).click();
  await A.getByText("הקישור בוטל").waitFor({ timeout: 4000 });
  await V.reload({ waitUntil: "networkidle" });
  ok(await V.getByText(/לא קיים|פג תוקפו/).isVisible(), "revoked");
  await vctx.close();
  await close();
});

await step("run mode", async () => {
  await A.getByRole("button", { name: "מצב הרצה" }).click();
  await A.getByRole("dialog", { name: "מצב הרצה" }).waitFor();
  const t0 = await A.getByRole("timer").innerText();
  await A.getByRole("button", { name: "התחלה" }).click();
  await A.waitForTimeout(2300);
  const t1 = await A.getByRole("timer").innerText();
  ok(t0 !== t1, `timer ticks ${t0} -> ${t1}`);
  await A.getByRole("button", { name: "לשלב הבא" }).click();
  ok(/שלב 2 מתוך/.test(await A.getByRole("dialog", { name: "מצב הרצה" }).innerText()), "next stage");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe run " + axeMsg(r));
  await A.keyboard.press("Escape");
  await A.getByRole("dialog", { name: "מצב הרצה" }).waitFor({ state: "detached" });
});

await step("list: tag filter, backup download and restore", async () => {
  await saved(A).waitFor({ timeout: 8000 });
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByLabel("סינון לפי תגית").selectOption("חורף");
  ok((await A.locator(`section[aria-labelledby="w-mine"] li`).count()) === 1, "filter shows 1");
  await A.waitForTimeout(600);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe list " + axeMsg(r));
  const [dl] = await Promise.all([A.waitForEvent("download", { timeout: 10000 }), A.getByRole("button", { name: "הורדת גיבוי" }).click()]);
  const fs = await import("node:fs");
  const data = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  ok(data.kind === "scout-write-backup" && data.docs.length === 1 && data.snippets.length === 1, "backup content");
  await A.getByLabel("קובץ גיבוי לשחזור").setInputFiles(await dl.path());
  await A.getByText(/שוחזרו 1 מסמכים/).waitFor({ timeout: 6000 });
  await A.getByLabel("סינון לפי תגית").selectOption("");
  await A.waitForTimeout(800);
  ok((await A.locator(`section[aria-labelledby="w-mine"] li`).count()) === 2, "restored copy added (" + (await A.locator(`section[aria-labelledby="w-mine"] li`).count()) + ")");
});

await step("mobile: no horizontal scroll", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.waitForTimeout(400);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "list ok");
  await A.locator(`section[aria-labelledby="w-mine"] li a`).first().click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  await A.waitForTimeout(500);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "editor ok");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
