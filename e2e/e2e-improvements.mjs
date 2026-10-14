import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", acceptDownloads: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } };

await page.goto(B + "/account", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /הרשמה/ }).first().click();
await page.getByLabel("שם להצגה").fill("רוני");
await page.getByLabel("שם משתמש").fill("roni" + Date.now().toString().slice(-6));
await page.getByLabel("סיסמה", { exact: true }).fill("password99");
await page.getByLabel("קוד הרשמה של השבט").fill(CODE);
await page.getByRole("button", { name: /הרשמה|יצירת חשבון/ }).last().click();
await page.getByText("הפעולות שלי").first().waitFor({ timeout: 8000 });

// draft autosave
await step("draft", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByLabel("נושא הפעולה").fill("טיוטה לבדיקה");
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "שחזור הטיוטה" }).click();
  ok((await page.getByLabel("נושא הפעולה").inputValue()) === "טיוטה לבדיקה", "draft restored after reload");
});

// create an activity
await step("create", async () => {
  await page.getByRole("button", { name: "פעולת חירום של 10 דקות" }).click();
  await page.getByLabel("נושא הפעולה").fill("בדיקת שיפורים");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "המשך" }).click();
  await page.getByRole("button", { name: "צור פעולה חכמה" }).click();
  await page.getByRole("link", { name: "פתיחה במאגר" }).click();
  await page.waitForURL(/\/library\/\d+$/);
  await page.getByRole("heading", { level: 1 }).waitFor();
});
const actUrl = page.url();
const actId = actUrl.split("/").pop();

await step("prep", async () => {
  const cb = page.getByRole("checkbox").first();
  await cb.check();
  await page.reload({ waitUntil: "networkidle" });
  ok(await page.getByRole("checkbox").first().isChecked(), "prep checklist persists");
});
await step("runs", async () => {
  await page.getByRole("button", { name: "רישום הפעלה חדשה" }).click();
  await page.getByLabel("מה עבד טוב").fill("הדיון עבד מצוין");
  await page.getByLabel("מה לשנות בפעם הבאה").fill("פחות זמן בפתיחה");
  await page.getByRole("button", { name: "שמירה ביומן" }).click();
  await page.getByText("בפעם האחרונה שהפעלתם").waitFor();
  ok(true, "run saved and shown as last-run note");
});
await step("edit+quality+versions", async () => {
  await page.getByRole("button", { name: "עריכה", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("textbox", { name: /תוכן|שלב 1/ }).first().fill("במסגרת הפעילות ניתן ללמד. לאחר מכן יש לוודא שהכול מוכן.");
  await dlg.getByRole("button", { name: "בדיקת סגנון" }).click();
  await dlg.getByText(/ציון טבעיות/).waitFor();
  await dlg.getByRole("button", { name: /תיקון כל מה שאפשר/ }).click();
  await dlg.getByText(/לא נמצאו ניסוחים משרדיים|נמצאו \d+ הערות/).waitFor();
  const v = await dlg.getByRole("textbox", { name: /תוכן|שלב 1/ }).first().inputValue();
  console.log("   fixed text:", v);
  ok(!v.includes("במסגרת הפעילות") && !v.includes("לאחר מכן"), "quality fix-all rewrote phrases");
  await dlg.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByText("הפעולה נשמרה").first().waitFor();
  await page.getByRole("button", { name: "היסטוריית גרסאות" }).click();
  await page.getByRole("dialog").getByText(/לפני עריכה/).first().waitFor();
  ok(true, "version saved on edit");
  await page.getByRole("dialog").locator("summary").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "שחזור הגרסה הזאת" }).click();
  await page.getByText(/הגרסה שוחזרה/).first().waitFor();
  ok(true, "version restored");
});
await step("cards", async () => {
  await page.goto(B + `/library/${actId}/cards`, { waitUntil: "networkidle" });
  const n = await page.locator(".print-card").count();
  ok(n > 0, `cards page shows ${n} question cards`);
  await page.getByLabel("תפקידים").isHidden();
  await page.getByRole("radio", { name: "תפקידים" }).check();
  ok((await page.locator(".print-card").count()) === 6, "6 role cards");
});
await step("library", async () => {
  await page.goto(B + "/library", { waitUntil: "networkidle" });
  await page.getByLabel("חיפוש חופשי").fill("דיון");
  await page.waitForTimeout(900);
  ok((await page.locator(".snippet").count()) > 0, "search shows snippets");
  await page.getByLabel("חיפוש חופשי").fill("");
  await page.getByLabel("מיון").selectOption("rating");
  await page.waitForTimeout(600);
  await page.getByRole("checkbox", { name: "הוספה לחוברת" }).first().check();
  await page.getByRole("checkbox", { name: "הוספה לחוברת" }).nth(1).check();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "הורדת חוברת" }).click()]);
  ok(!!dl, "booklet downloaded (headless chromium hides blob filenames)");
});
await step("plan", async () => {
  await page.goto(B + "/plan", { waitUntil: "networkidle" });
  await page.getByLabel("ערכים שרוצים לכסות").fill("אחריות, ערך שלא קיים במאגר");
  await page.getByRole("button", { name: "בניית תכנון" }).click();
  await page.getByRole("table").waitFor();
  ok((await page.locator(".plan-table tbody tr").count()) === 8, "8-week plan");
  ok(await page.getByText("ערך שלא קיים במאגר").first().isVisible(), "missing value flagged");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /CSV/ }).click()]);
  ok(!!dl, "csv download");
});
await step("account runs", async () => {
  await page.goto(B + "/account", { waitUntil: "networkidle" });
  ok(await page.getByText("הדיון עבד מצוין").first().isVisible(), "runs listed in account");
});

// offline
await step("offline", async () => {
  await page.goto(B + `/library/${actId}`, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "שמירה לשימוש בלי קליטה" }).click();
  await page.getByRole("button", { name: /נשמר למכשיר/ }).waitFor({ timeout: 15000 });
  await ctx.setOffline(true);
  await page.goto(B + `/field/${actId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 8000 });
  ok(true, "field mode loads offline");
  await page.getByText(/אין חיבור לאינטרנט/).waitFor({ timeout: 4000 });
  ok(true, "offline banner visible");
  const t = await page.locator("body").innerText();
  ok(t.includes("בדיקת שיפורים"), "activity content present offline");
  await ctx.setOffline(false);
});

// axe
for (const path of ["/plan", `/library/${actId}`, `/library/${actId}/cards`, "/library", "/"]) {
  await step("axe " + path, async () => {
    await page.goto(B + path, { waitUntil: "networkidle" });
    if (path === `/library/${actId}`) await page.getByRole("button", { name: "רישום הפעלה חדשה" }).click().catch(() => {});
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    ok(r.violations.length === 0, `axe ${path}: ${r.violations.map((v) => v.id + "(" + v.nodes.length + ")").join(",") || "0"}`);
  });
}
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
await browser.close();
