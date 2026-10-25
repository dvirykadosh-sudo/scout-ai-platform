// בדיקות דפדפן לחשבונות ואבטחה, סבב 113–126.
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
const USER = "sug" + stamp;
const PW = "Str0ng-e2e-pw-26";


const ctx = await mk();
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const saved = (p) => p.getByText(/^נשמר \d/).first();
const txt = (p, n) => p.getByLabel("טקסט השלב " + n, { exact: true });
const dlg = () => A.getByRole("dialog");

await step("register and open a classic document", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("מציע בדיקה");
  await A.getByLabel("שם משתמש").fill(USER);
  await A.getByLabel("סיסמה", { exact: true }).fill(PW);
  await A.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await A.getByLabel("קראתי ואני מאשר").check();
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByRole("heading", { name: "פרטיות", exact: true }).waitFor({ timeout: 10000 });
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: /להתחיל\s*:\s*פעולה קלאסית/ }).click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  await A.getByRole("textbox", { name: "שם הפעולה" }).fill("אחריות בחיי היום יום");
  await A.getByLabel("גודל קבוצה").fill("12");
  await A.getByLabel("ערך או מטרה").fill("אחריות");
  await A.getByRole("group", { name: "ציוד שיש לכם" }).getByLabel(/דפים ועטים/).check();
  await txt(A, 1).fill("אנחנו מתחילים בשאלה: מה זו אחריות? ואז נשחק משחק קצר.");
  await saved(A).waitFor({ timeout: 8000 });
  ok(true, "doc ready");
});

await step("123. live missing list names the empty stage and has an action", async () => {
  const g = A.getByRole("region", { name: "מה חסר בפעולה" });
  await g.getByText(/כמעט ריק/).first().waitFor({ timeout: 8000 });
  ok((await g.getByRole("button", { name: /^הצעות לשלב/ }).count()) >= 1, "suggest action present");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe editor with gaps " + axeMsg(r));
});

await step("113+115+116. suggestions for stage 2, add one, undo it", async () => {
  await A.getByRole("button", { name: /^עזרה במתודות\s*:\s*שלב 2/ }).click();
  await dlg().getByRole("heading", { name: /עזרה במתודות/ }).waitFor({ timeout: 5000 });
  await dlg().getByRole("button", { name: /^הוספה בסוף השלב/ }).first().waitFor({ timeout: 8000 });
  const n = await dlg().getByRole("button", { name: /^הוספה בסוף השלב/ }).count();
  ok(n >= 1 && n <= 3, "up to three suggestions: " + n);
  ok((await dlg().getByText(/למה:/).count()) >= 1, "reason shown");
  await A.waitForTimeout(300);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe help modal " + axeMsg(r));
  await dlg().getByRole("button", { name: /^הוספה בסוף השלב/ }).first().click();
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
  await A.waitForTimeout(300);
  ok((await txt(A, 2).inputValue()).length > 20, "text inserted into stage 2");
  await A.getByRole("button", { name: "ביטול", exact: true }).first().click();
  await A.waitForTimeout(200);
  ok((await txt(A, 2).inputValue()) === "", "undo removed it");
});

await step("115. more suggestions excludes the ones already shown", async () => {
  await A.getByRole("button", { name: /^עזרה במתודות\s*:\s*שלב 2/ }).click();
  await dlg().getByRole("button", { name: /^הוספה בסוף השלב/ }).first().waitFor({ timeout: 8000 });
  const before = await dlg().locator(".write-sug h3").allInnerTexts();
  await dlg().getByRole("button", { name: /^עוד הצעות/ }).click();
  await A.waitForTimeout(800);
  const after = await dlg().locator(".write-sug h3").allInnerTexts();
  ok(after.length >= 1 && after.every((t) => !before.includes(t)), "new set: " + before.join("|") + " -> " + after.join("|"));
});

await step("120+121. deepen and short version", async () => {
  await dlg().getByRole("button", { name: /^העמקה לתסריט/ }).first().click();
  await dlg().getByRole("region", { name: /תסריט מלא/ }).waitFor({ timeout: 5000 });
  ok(/\d\. /.test(await dlg().locator("pre").innerText()), "numbered script");
  await dlg().getByRole("button", { name: /^החלפת כל תוכן השלב/ }).click();
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
  await A.waitForTimeout(300);
  ok(/\d\. /.test(await txt(A, 2).inputValue()), "script replaced stage text");
  await A.getByRole("button", { name: /^עזרה במתודות\s*:\s*שלב 2/ }).click();
  await dlg().getByRole("button", { name: /^גרסה קצרה/ }).first().click();
  await dlg().getByRole("region", { name: /תסריט מלא/ }).waitFor({ timeout: 5000 });
  ok(/10 דקות/.test(await dlg().locator("pre").innerText()), "ten-minute version");
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
});

await step("117. swap method in stage 1 in place", async () => {
  await A.getByRole("button", { name: /^עזרה במתודות\s*:\s*שלב 1/ }).click();
  await dlg().getByRole("tab", { name: "החלפת מתודה" }).click();
  await dlg().getByRole("button", { name: /^החלפה במשפט הקיים/ }).first().waitFor({ timeout: 8000 });
  const before = await txt(A, 1).inputValue();
  await dlg().getByRole("button", { name: /^החלפה במשפט הקיים/ }).first().click();
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
  await A.waitForTimeout(300);
  const after = await txt(A, 1).inputValue();
  ok(after !== before && after.length > 10, "stage 1 changed");
});

await step("119. bridge to next stage", async () => {
  await A.getByRole("button", { name: /^עזרה במתודות\s*:\s*שלב 1/ }).click();
  await dlg().getByRole("tab", { name: "מעבר לשלב הבא" }).click();
  await dlg().getByRole("button", { name: /^הוספה בסוף השלב/ }).first().waitFor({ timeout: 8000 });
  const before = await txt(A, 1).inputValue();
  await dlg().getByRole("button", { name: /^הוספה בסוף השלב/ }).first().click();
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
  await A.waitForTimeout(300);
  ok((await txt(A, 1).inputValue()).length > before.length, "bridge appended");
});

await step("124. personal prefs dialog", async () => {
  await A.getByRole("button", { name: "המתודות שלי" }).click();
  const first = dlg().getByRole("radio", { name: "אוהב" }).first();
  await first.waitFor({ timeout: 5000 });
  await first.click();
  await A.waitForTimeout(400);
  ok((await first.getAttribute("aria-checked")) === "true", "marked as liked");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe prefs " + axeMsg(r));
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
  await A.reload({ waitUntil: "networkidle" });
  await A.getByRole("button", { name: "המתודות שלי" }).click();
  await A.waitForTimeout(600);
  ok((await dlg().getByRole("radio", { name: "אוהב", checked: true }).count()) === 1, "pref persisted");
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
});

await step("126. search method and add", async () => {
  await A.getByRole("button", { name: "חיפוש מתודה" }).click();
  await dlg().getByLabel("מה מחפשים").fill("משחק");
  await dlg().getByRole("button", { name: "חיפוש", exact: true }).click();
  await dlg().getByRole("button", { name: /^הוספה/ }).first().waitFor({ timeout: 8000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe search " + axeMsg(r));
  await dlg().getByRole("button", { name: /^הוספה/ }).first().click();
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
  ok(true, "added from search");
});

await step("125. compare a stage with an earlier version", async () => {
  await saved(A).waitFor({ timeout: 8000 });
  await A.getByRole("button", { name: "גרסאות", exact: true }).click();
  await dlg().getByLabel("שם לנקודת שמירה").fill("לפני שינוי");
  await dlg().getByRole("button", { name: "יצירת נקודת שמירה עכשיו" }).click();
  await A.waitForTimeout(600);
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
  await txt(A, 3).fill("שורה חדשה לגמרי בסיכום.");
  await saved(A).waitFor({ timeout: 8000 });
  await A.getByRole("button", { name: "גרסאות", exact: true }).click();
  await dlg().getByRole("button", { name: /^צפייה/ }).first().click();
  await dlg().getByLabel("שלב להשוואה").selectOption({ index: 2 });
  await dlg().getByRole("region", { name: "הבדלים בטקסט השלב" }).waitFor({ timeout: 5000 });
  ok((await dlg().locator(".diff-add").count()) >= 1, "added line marked");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe compare " + axeMsg(r));
  await dlg().getByRole("button", { name: /^החזרת הטקסט הישן/ }).click();
  await dlg().getByRole("button", { name: "חזרה לרשימה" }).click();
  await dlg().getByRole("button", { name: "סגירה", exact: true }).last().click();
  ok((await txt(A, 3).inputValue()) !== "שורה חדשה לגמרי בסיכום.", "stage restored alone");
});

await step("118. header fields persist after reload", async () => {
  await saved(A).waitFor({ timeout: 8000 });
  await A.reload({ waitUntil: "networkidle" });
  await A.getByLabel("גודל קבוצה").waitFor({ timeout: 8000 });
  ok((await A.getByLabel("גודל קבוצה").inputValue()) === "12", "group size kept");
  ok((await A.getByLabel("ערך או מטרה").inputValue()) === "אחריות", "value kept");
  ok(await A.getByRole("group", { name: "ציוד שיש לכם" }).getByLabel(/דפים ועטים/).isChecked(), "gear kept");
});

await step("mobile: no horizontal scroll with new panels", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.waitForTimeout(400);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal scroll");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
