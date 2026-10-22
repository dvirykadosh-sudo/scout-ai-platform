// בדיקות דפדפן לסבב ה': ערכים, אתגרים, סיפורים, חימום, שאלות, סיכום, בדיקת מבנה, הצעות אחרי הפעלה ותכנון לכמה שכבות.
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


let actId = "";

await step("tools hub", async () => {
  await page.goto(B + "/tools", { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "כלים ורעיונות" }).waitFor();
  for (const name of ["פעולה לפי ערך", "אתגרי חינוך", "סיפורים ומשלים", "חימום, מעברים ושקט"]) ok(await page.getByRole("link", { name }).count() === 1, "hub links to " + name);
});

await step("values: a topic becomes an activity", async () => {
  await page.goto(B + "/values", { waitUntil: "networkidle" });
  ok((await page.locator(".kind-guide > li").count()) === 14, "fourteen values");
  await page.getByRole("button", { name: "יצירת פעולה בנושא מי סומך עליי (אחריות)" }).click();
  actId = await arriveAtActivity();
  const t = await bodyText();
  ok(t.includes("מי סומך עליי") && t.includes("אחריות"), "activity built from the chosen topic and value");
});

await step("challenges: a situation becomes an activity", async () => {
  await page.goto(B + "/challenges", { waitUntil: "networkidle" });
  ok((await page.locator(".kind-guide > li").count()) >= 8, "at least eight situations");
  ok((await bodyText()).includes("לא מזכירים שמות"), "care note shown");
  await page.getByRole("button", { name: "יצירת פעולה לאתגר: ריב בין חברים בקבוצה" }).click();
  await arriveAtActivity();
  ok((await page.locator(".chips .chip-accent").first().innerText()) === "פעולת חברה", "challenge produced a social activity");
});

await step("stories library", async () => {
  await page.goto(B + "/stories", { waitUntil: "networkidle" });
  const all = await page.locator("ul.list > li").count();
  ok(all >= 12, "twelve or more stories: " + all);
  await page.getByLabel("ערך").selectOption("אחריות");
  await page.waitForFunction(() => document.querySelectorAll("ul.list > li").length < 5);
  ok((await bodyText()).includes("הפנס של נועם"), "story for the chosen value");
});

await step("warm-ups", async () => {
  await page.goto(B + "/warmups", { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 2 }).first().waitFor();
  await page.getByLabel("מה צריך").selectOption("איסוף ושקט");
  await page.waitForFunction(() => [...document.querySelectorAll("ul.list .meta")].length > 0 && [...document.querySelectorAll("ul.list .meta")].every((m) => m.textContent.startsWith("איסוף ושקט")));
  ok(true, "category filter keeps only matching ideas");
});

await step("activity insights: questions, summary, review", async () => {
  await page.goto(B + "/library/" + actId, { waitUntil: "networkidle" });
  await page.getByText("שאלות לדיון בארבע רמות").click();
  await page.locator("#questions section").first().waitFor();
  ok((await page.locator("#questions section").count()) === 4, "four question levels");
  await page.getByText("סיכום קצר להורים ולמדריך").click();
  await page.locator("pre.copy-text").first().waitFor();
  ok((await page.locator("pre.copy-text").first().innerText()).startsWith("שלום להורים,"), "parents summary");
  await page.getByText("בדיקת מבנה אוטומטית").click();
  await page.getByText(/עברו \d+ מתוך 9 בדיקות/).waitFor();
  ok((await page.locator(".review-list li").count()) === 9, "nine checks");
});

await step("add a story to a stage", async () => {
  await page.goto(B + "/library/" + actId, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "הוספת סיפור" }).click();
  await page.getByLabel("באיזה שלב").selectOption("1");
  await page.getByRole("button", { name: "הוספה לשלב" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("סיפור לשילוב"), null, { timeout: 8000 });
  ok(true, "story text is now in the stage");
});

await step("run log: ratings and suggestions", async () => {
  await page.goto(B + "/library/" + actId, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "רישום הפעלה חדשה" }).click();
  await page.getByLabel("כמה החניכים השתתפו").selectOption("1");
  await page.getByLabel("האם הזמן הספיק").selectOption("long");
  await page.getByLabel("מה לשנות בפעם הבאה").fill("היה משעמם");
  await page.getByRole("button", { name: "שמירה ביומן" }).click();
  await page.getByRole("heading", { name: "הצעות לשיפור לפי הרישום האחרון" }).waitFor({ timeout: 8000 });
  const box = await page.locator(".run-suggestions").innerText();
  ok(box.includes("גרסה של") && box.includes("התאמה לקבוצה עם הרבה אנרגיה"), "suggestions: shorten and adapt");
  ok((await bodyText()).includes("השתתפות: מעטה"), "participation shown in the log list");
  const before = page.url();
  await page.locator(".run-suggestions").getByRole("button", { name: "התאמה לקבוצה עם הרבה אנרגיה" }).click();
  await page.waitForURL((u) => /\/library\/\d+$/.test(u.pathname) && u.href !== before, { timeout: 15000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  ok((await page.getByRole("heading", { level: 1 }).innerText()).includes("קבוצה עם הרבה אנרגיה"), "suggestion made an adapted copy");
});

await step("adapt modal lists the new group conditions", async () => {
  await page.getByRole("button", { name: "התאמה לתנאים" }).click();
  const opts = await page.getByLabel("מה התנאים?").locator("option").allInnerTexts();
  ok(opts.length === 14 && opts.includes("בנים ובנות יחד") && opts.includes("קבוצה ותיקה וחזקה"), "fourteen conditions: " + opts.length);
  await page.keyboard.press("Escape");
});

await step("multi-grade plan", async () => {
  await page.goto(B + "/plan", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "תכנון לכמה שכבות יחד" }).waitFor();
  await page.getByLabel("ערכים, מופרדים בפסיק (לא חובה)").fill("אחריות, חברות");
  await page.getByRole("button", { name: "תכנון משותף לשכבות" }).click();
  await page.getByRole("table", { name: "תכנון שבועי לכל השכבות" }).waitFor();
  ok((await page.locator("table.plan-table").last().locator("tbody tr").count()) === 6, "six weeks");
  ok((await page.locator("table.plan-table").last().locator("thead th").count()) === 5, "week, value and three grades");
  ok((await page.locator("table.plan-table").last().locator("tbody tr").first().innerText()).includes("אחריות"), "first week has the first value");
});

await step("axe pages", async () => {
  for (const theme of ["light", "dark"]) {
    await ctx.addInitScript((t) => { try { localStorage.setItem("scout.theme", t); } catch {} }, theme);
    for (const path of ["/tools", "/values", "/challenges", "/stories", "/warmups", "/plan", `/library/${actId}`]) {
      const p = await ctx.newPage();
      await p.goto(B + path, { waitUntil: "networkidle" });
      if (path.startsWith("/library/")) {
        for (const t of ["שאלות לדיון בארבע רמות", "סיכום קצר להורים ולמדריך", "בדיקת מבנה אוטומטית"]) await p.getByText(t).click();
        await p.getByRole("button", { name: "רישום הפעלה חדשה" }).click();
      }
      if (path === "/plan") {
        await p.getByRole("button", { name: "תכנון משותף לשכבות" }).click();
        await p.getByRole("table", { name: "תכנון שבועי לכל השכבות" }).waitFor();
      }
      await p.waitForTimeout(700);
      const r = await axe(p);
      ok(r.violations.length === 0, `axe ${theme} ${path}: ${r.violations.map((v) => v.id + "(" + v.nodes[0].target.join(" ") + ")").join(" | ") || "0"}`);
      await p.close();
    }
  }
});
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
await browser.close();
process.exit(fails ? 1 : 0);
