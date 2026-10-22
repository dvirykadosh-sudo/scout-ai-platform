// בדיקות דפדפן לסבב ד': פעולה בלי נושא, סוגי פעולה, השבוע, מה חסר, שיא, כמו זו, קיצור והצעות מנהל.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const ADMIN_PW = process.env.ADMIN_PASSWORD || "Strong#Pass99";
const NEW_PW = "E2e-new-pass-2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const mk = async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", acceptDownloads: true });
  await c.addInitScript(() => { try { localStorage.setItem("scout.hero.seen", "1"); } catch {} });
  return c;
};
const ctx = await mk();
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const bodyText = () => page.locator("body").innerText();
const arriveAtActivity = async () => {
  await page.waitForURL(/\/library\/\d+$/, { timeout: 15000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  return page.url().split("/").pop();
};
const quickKind = async (label, minutes) => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: new RegExp("^" + label) }).check();
  if (minutes) await page.getByLabel("משך").selectOption(String(minutes));
  await page.getByRole("button", { name: "צרו לי " + label }).click();
  return arriveAtActivity();
};

await page.goto(B + "/account", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /הרשמה/ }).first().click();
await page.getByLabel("שם להצגה").fill("רונית");
await page.getByLabel("שם משתמש").fill("ronit" + Date.now().toString().slice(-6));
await page.getByLabel("סיסמה", { exact: true }).fill("password99");
await page.getByLabel("קוד הרשמה של השבט").fill(CODE);
await page.getByLabel("קראתי ואני מאשר").check();
await page.getByRole("button", { name: /הרשמה|יצירת חשבון/ }).last().click();
await page.getByText("הפעולות שלי").first().waitFor({ timeout: 8000 });

await step("home: what is missing and this week", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "מה חסר לך" }).waitFor();
  const gap = await page.locator(".gap-box").innerText();
  ok(gap.includes("עוד לא") && gap.includes("פעולת שיא"), "new instructor is told a peak activity is missing");
  await page.getByRole("heading", { name: "מה לעשות השבוע" }).waitFor();
  ok((await page.locator(".this-week .suggest-list > li").count()) === 3, "three suggestions for the week");
  const first = await page.locator(".this-week .suggest-list > li strong").first().innerText();
  await page.locator(".this-week").getByRole("button", { name: "צרו פעולה" }).first().click();
  await arriveAtActivity();
  const h1 = await page.getByRole("heading", { level: 1 }).innerText();
  ok(h1.includes(first), "suggestion became an activity: " + h1);
  ok((await page.locator(".chips .chip-accent").first().innerText()).startsWith("פעולת"), "kind chip shown on the activity");
});

await step("home: gap button creates the missing kind", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "מה חסר לך" }).waitFor();
  await page.locator(".gap-box").getByRole("button", { name: /צרו .* עכשיו/ }).click();
  await arriveAtActivity();
  ok(true, "created from the gap box");
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "מה חסר לך" }).waitFor();
  const top = await page.locator(".gap-top").innerText();
  ok(top.length > 0, "the highlighted kind moves on: " + top.replace(/\n/g, " "));
});

await step("surprise without any topic", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "אין לי נושא, תפתיעו אותי" }).waitFor();
  await page.getByRole("button", { name: "הפתיעו אותי" }).click();
  await arriveAtActivity();
  const t = await bodyText();
  ok(t.includes("רגע") || t.includes("פתיחה"), "a full activity opened");
});

let peakId = "";
await step("pick a kind: peak with its own length", async () => {
  peakId = await quickKind("פעולת שיא");
  const t = await bodyText();
  ok(t.includes("90 דקות"), "peak is 90 minutes");
  ok(t.includes("רגע השיא"), "peak stage notes are in the text");
});

let contentId = "";
await step("kind with a chosen length", async () => {
  contentId = await quickKind("פעולת תוכן", 45);
  ok((await bodyText()).includes("45 דקות"), "45 minutes honored");
});

await step("kind details are explained", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /^פעולת ערך/ }).check();
  await page.getByText(/מה זה פעולת ערך ואיך היא בנויה/).click();
  const t = await page.locator(".kind-more").innerText();
  ok(t.includes("מתי מתאים") && t.includes("מחויבות קטנה"), "details show when and the five-stage structure");
});

await step("wizard: kind select and random topic", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.locator("#kind").selectOption({ label: "פעולת שטח" });
  await page.getByRole("button", { name: "אין נושא? הציעו לי נושא וערך" }).click();
  await page.waitForFunction(() => document.getElementById("topic")?.value.length > 1, null, { timeout: 6000 });
  ok((await page.locator("#topic").inputValue()).length > 1, "random topic fills the field");
  await page.getByRole("button", { name: /שיטות וזמנים/ }).click();
  await page.locator(".method-card.on").first().waitFor();
  ok((await page.locator(".method-card.on").count()) === 4, "field kind preselects its four methods");
  await page.goto(B + "/?kind=social", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("kind")?.value === "social", null, { timeout: 6000 });
  ok(true, "kind from the link preselects the select");
});

await step("tools: similar, upgrade, shorten", async () => {
  await page.goto(B + `/library/${contentId}`, { waitUntil: "networkidle" });
  const before = page.url();
  await page.getByRole("button", { name: "פעולה כמו זו" }).click();
  await page.waitForURL((u) => u.href !== before && /\/library\/\d+$/.test(u.pathname), { timeout: 15000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  ok(true, "similar activity created");
  ok((await page.locator(".chips .chip-accent").first().innerText()) === "פעולת תוכן", "same kind as the source");

  await page.goto(B + `/library/${contentId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "הפוך לפעולת שיא" }).click();
  await page.getByRole("heading", { level: 1, name: /גרסת שיא/ }).waitFor({ timeout: 15000 });
  const t = await bodyText();
  ok(t.includes("65 דקות") && t.includes("רגע השיא"), "upgrade adds 20 minutes and the peak notes");
  ok((await page.getByRole("button", { name: "הפוך לפעולת שיא" }).count()) === 0, "no upgrade button on a peak activity");

  await page.goto(B + `/library/${peakId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "גרסה מקוצרת" }).click();
  await page.getByRole("dialog").getByLabel("כמה דקות?").selectOption("20");
  await page.getByRole("button", { name: "יצירת גרסה מקוצרת" }).click();
  await page.getByRole("heading", { level: 1, name: /20 דק/ }).waitFor({ timeout: 15000 });
  ok((await bodyText()).includes("20 דקות"), "shortened to 20 minutes");

  await page.goto(B + `/library/${contentId}`, { waitUntil: "networkidle" });
  ok((await bodyText()).includes("45 דקות"), "the original is untouched");
});

await step("types page", async () => {
  await page.goto(B + "/types", { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "סוגי פעולות" }).waitFor();
  await page.locator(".kind-guide > li").first().waitFor();
  ok((await page.locator(".kind-guide > li").count()) === 7, "seven kinds explained");
  await page.getByRole("link", { name: "יצירת פעולת שטח" }).click();
  await page.waitForURL(/kind=field/);
  await page.locator("#quick").waitFor();
  ok(await page.getByRole("radio", { name: /^פעולת שטח/ }).isChecked(), "link preselects the kind");
});

await step("peak ideas", async () => {
  await page.goto(B + "/ideas", { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "רעיונות לפעולת שיא" }).waitFor();
  await page.locator("#idea-cat").selectOption("טקס");
  await page.waitForFunction(() => document.querySelectorAll(".examples-list > li").length === 3);
  ok(true, "category filter leaves three ceremony ideas");
  await page.getByRole("button", { name: "בנו מזה פעולת שיא" }).first().click();
  await arriveAtActivity();
  const t = await bodyText();
  ok(t.includes("הרעיון המרכזי"), "the idea is in the activity");
});

await step("library filter by kind", async () => {
  await page.goto(B + "/library", { waitUntil: "networkidle" });
  await page.getByLabel("סוג פעולה").selectOption({ label: "פעולת שטח" });
  await page.waitForTimeout(900);
  const n = await page.locator(".activity-card").count();
  ok(n === 0, "no field activities yet: " + n);
  await page.getByLabel("סוג פעולה").selectOption({ label: "פעולת שיא" });
  await page.waitForFunction(() => document.querySelectorAll(".activity-card").length > 0, null, { timeout: 8000 });
  const kinds = await page.locator(".activity-card .kind-line").allInnerTexts();
  ok(kinds.length > 0 && kinds.every((c) => c.trim() === "פעולת שיא"), "only peak activities listed: " + kinds.length);
});

await step("admin featured picks", async () => {
  const actx = await mk();
  const p = await actx.newPage();
  const login = async (pw) => {
    await p.goto(B + "/admin", { waitUntil: "networkidle" });
    await p.getByLabel("שם משתמש").fill("admin");
    await p.getByLabel("סיסמה").fill(pw);
    await p.getByRole("button", { name: /כניסה|התחברות/ }).last().click();
  };
  await login(NEW_PW);
  const head = p.getByRole("heading", { name: "הצעות ממנהל השבט" });
  const change = p.getByText("לפני שממשיכים יש להחליף");
  await Promise.race([head.waitFor({ timeout: 6000 }), change.waitFor({ timeout: 6000 })]).catch(() => {});
  if (!(await head.count())) {
    if (!(await change.count())) { await login(ADMIN_PW); await change.waitFor({ timeout: 8000 }); }
    await p.getByLabel("סיסמה נוכחית").fill(ADMIN_PW);
    await p.getByLabel("סיסמה חדשה", { exact: true }).fill(NEW_PW);
    await p.getByLabel("סיסמה חדשה, פעם נוספת").fill(NEW_PW);
    await p.getByRole("button", { name: "החלפת סיסמה" }).click();
    await p.waitForTimeout(1500);
    if (!(await head.count())) await login(NEW_PW);
  }
  await head.waitFor({ timeout: 10000 });
  await p.getByRole("button", { name: "הוספת הצעה" }).click();
  const row = p.locator(".feat-row").first();
  await row.getByLabel("נושא", { exact: true }).fill("ט\"ו בשבט בשטח");
  await row.getByLabel("ערך מוביל").fill("אחריות לסביבה");
  await row.getByLabel("סוג פעולה").selectOption({ label: "פעולת שטח" });
  await row.getByLabel(/הערה למדריכים/).fill("לשבוע הבא");
  await p.getByRole("button", { name: "שמירה" }).click();
  await p.getByText("ההצעות נשמרו").first().waitFor();
  ok(true, "featured pick saved");
  const r = await axe(p);
  ok(r.violations.length === 0, "axe admin featured: " + (r.violations.map((v) => v.id + "(" + v.nodes[0].target.join(" ") + ")").join(",") || "0"));
  await actx.close();

  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "הצעות ממנהל השבט" }).waitFor();
  const t = await page.locator(".featured").innerText();
  ok(t.includes("ט\"ו בשבט בשטח") && t.includes("לשבוע הבא"), "pick shown on the home page with its note");
  await page.locator(".featured").getByRole("button", { name: "צרו פעולה" }).click();
  await arriveAtActivity();
  ok((await page.getByRole("heading", { level: 1 }).innerText()).includes("ט\"ו בשבט בשטח"), "the pick became an activity");
  ok((await bodyText()).includes("אחראי בטיחות"), "field activity carries the field safety note");
});

await step("year mix", async () => {
  await page.goto(B + "/types", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "תמהיל מומלץ לשנה" }).waitFor();
  const rows = await page.locator(".year-mix tbody tr").count();
  ok(rows === 7, "year mix lists seven kinds");
  ok((await page.locator(".year-mix").innerText()).includes("יצרתי ב-12 החודשים"), "signed-in user sees own counts");
});

await step("axe pages", async () => {
  for (const theme of ["light", "dark"]) {
    await ctx.addInitScript((t) => { try { localStorage.setItem("scout.theme", t); } catch {} }, theme);
    for (const path of ["/", "/types", "/ideas", `/library/${peakId}`, "/library"]) {
      const p = await ctx.newPage();
      await p.goto(B + path, { waitUntil: "networkidle" });
      await p.waitForTimeout(600);
      const r = await axe(p);
      ok(r.violations.length === 0, `axe ${theme} ${path}: ${r.violations.map((v) => v.id + "(" + v.nodes[0].target.join(" ") + ")").join(" | ") || "0"}`);
      await p.close();
    }
  }
});
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
await browser.close();
process.exit(fails ? 1 : 0);
