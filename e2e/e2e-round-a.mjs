// בדיקות דפדפן לסבב א': חירום מיידית, שלב בודד, ייבוא קבצים, משחקי היכרות, דף מחליף, מצב שטח, קיצורים.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B }).catch(() => {});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } };

await page.goto(B + "/account", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /הרשמה/ }).first().click();
await page.getByLabel("שם להצגה").fill("מיכל");
await page.getByLabel("שם משתמש").fill("michal" + Date.now().toString().slice(-6));
await page.getByLabel("סיסמה", { exact: true }).fill("password99");
await page.getByLabel("קוד הרשמה של השבט").fill(CODE);
await page.getByRole("button", { name: /הרשמה|יצירת חשבון/ }).last().click();
await page.getByText("הפעולות שלי").first().waitFor({ timeout: 8000 });

let actId = "";
await step("instant emergency", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByLabel("נושא הפעולה").fill("חברות אמיתית");
  await page.getByRole("button", { name: "יצירה מיידית: 10 דקות בלי ציוד" }).click();
  await page.getByRole("link", { name: "פתיחה במאגר" }).click();
  await page.waitForURL(/\/library\/\d+$/);
  actId = page.url().split("/").pop();
  await page.getByText(/אין ציוד/).first().waitFor();
  const t = await page.locator("body").innerText();
  ok(/אין ציוד/.test(t) && /10 דק/.test(t), "emergency activity: 10 minutes, no equipment");
});

await step("regenerate stage", async () => {
  await page.getByRole("button", { name: "עריכה", exact: true }).click();
  const dlg = page.getByRole("dialog");
  const before = await dlg.getByRole("textbox", { name: "תוכן" }).nth(1).inputValue();
  await dlg.getByRole("button", { name: /הצעה חדשה לשלב הזה/ }).nth(1).click();
  const box = dlg.getByRole("region", { name: /הצעה חדשה לשלב 2/ });
  await box.waitFor();
  await box.getByRole("button", { name: "החלפת התוכן בהצעה" }).click();
  const after = await dlg.getByRole("textbox", { name: "תוכן" }).nth(1).inputValue();
  ok(after !== before && after.length > 20, "stage 2 content replaced by suggestion");
  await dlg.getByRole("button", { name: "ביטול" }).last().click().catch(() => page.keyboard.press("Escape"));
});

await step("import file", async () => {
  await page.goto(B + "/library/import", { waitUntil: "networkidle" });
  await page.getByLabel("שם המדריך/ה").fill("מיכל");
  const doc = "פעולה ישנה על כבוד\nשכבת גיל: כיתה ו' בנים\nציוד: דפים\nפתיחה (5 דקות)\nשואלים מה זה כבוד.\nמשחק (15 דקות)\nמשחק קבוצות.\nזמן צופיות (10 דקות)\nקשר שמונה.\nדיון (10 דקות)\n1. מתי פגעו בכם?\nסיכום (5 דקות)\nכל אחד אומר משפט.";
  await page.getByLabel(/בחירת קבצים/).setInputFiles({ name: "ישן.txt", mimeType: "text/plain", buffer: Buffer.from(doc, "utf8") });
  await page.getByText(/זוהו 5 שלבים/).waitFor();
  ok(true, "5 stages detected");
  await page.getByRole("button", { name: "שמירה במאגר" }).click();
  await page.getByRole("link", { name: "פתיחה במאגר" }).waitFor();
  ok(true, "imported activity saved");
});

await step("icebreakers", async () => {
  await page.goto(B + "/icebreakers", { waitUntil: "networkidle" });
  await page.getByLabel("סוג").selectOption("1");
  await page.getByLabel("בלי ציוד בכלל").check();
  await page.waitForTimeout(500);
  const names1 = await page.locator(".card-title").allInnerTexts();
  await page.getByRole("button", { name: "עוד משחקים" }).click();
  await page.waitForTimeout(500);
  const names2 = await page.locator(".card-title").allInnerTexts();
  ok(names1.length === 3 && names1.join() !== names2.join(), "icebreakers filtered and refreshed");
});

await step("brief", async () => {
  await page.goto(B + `/library/${actId}/brief`, { waitUntil: "networkidle" });
  await page.getByLabel("הערה אישית למחליף").fill("בהצלחה!");
  const msg = await page.locator("#sub-msg").inputValue();
  ok(msg.includes(`/field/${actId}`) && msg.includes("בהצלחה!"), "substitute message has links and note");
  await page.getByRole("button", { name: "העתקת ההודעה" }).click();
  await page.getByText(/ההודעה הועתקה|לא הצלחתי להעתיק/).first().waitFor();
});

await step("field mode", async () => {
  await page.goto(B + `/field/${actId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "כפתורים ענקיים" }).click();
  ok(await page.locator(".field-big").count() === 1, "big-buttons mode");
  await page.keyboard.press("n");
  await page.getByRole("heading", { name: /שלב 2/ }).waitFor();
  ok(true, "N key moves to next stage");
  await page.keyboard.press("p");
  await page.getByRole("heading", { name: /שלב 1/ }).waitFor();
  ok(await page.getByRole("button", { name: "הקראת השלב" }).isVisible(), "read-aloud button present");
});

await step("shortcuts", async () => {
  await page.goto(B + "/methods", { waitUntil: "networkidle" });
  await page.keyboard.press("/");
  await page.waitForURL(/\/library/);
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.activeElement?.id === "f-q"), "'/' focuses library search");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("?");
  await page.getByRole("dialog", { name: "קיצורי מקלדת" }).waitFor();
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await page.waitForURL(/\/plan/);
  ok(true, "'G then P' goes to plan");
});

for (const path of ["/icebreakers", "/library/import", `/library/${actId}/brief`, `/field/${actId}`, "/library"]) {
  await step("axe " + path, async () => {
    await page.goto(B + path, { waitUntil: "networkidle" });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    ok(r.violations.length === 0, `axe ${path}: ${r.violations.map((v) => v.id + "(" + v.nodes.length + ")").join(",") || "0"}`);
  });
}
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
await browser.close();
process.exit(fails ? 1 : 0);
