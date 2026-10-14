// בדיקות דפדפן לסבב ג': התאמות, נושאים, הערות, אוספים, משוב, אישור ותובנות.
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

await page.goto(B + "/account", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /הרשמה/ }).first().click();
await page.getByLabel("שם להצגה").fill("גלית");
await page.getByLabel("שם משתמש").fill("galit" + Date.now().toString().slice(-6));
await page.getByLabel("סיסמה", { exact: true }).fill("password99");
await page.getByLabel("קוד הרשמה של השבט").fill(CODE);
await page.getByRole("button", { name: /הרשמה|יצירת חשבון/ }).last().click();
await page.getByText("הפעולות שלי").first().waitFor({ timeout: 8000 });

let actId = "";
const makeActivity = async (topic) => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByLabel("נושא הפעולה").fill(topic);
  await page.getByRole("button", { name: "יצירה מיידית: 10 דקות בלי ציוד" }).click();
  await page.getByRole("link", { name: "פתיחה במאגר" }).click();
  await page.waitForURL(/\/library\/\d+$/);
  await page.getByRole("heading", { level: 1 }).waitFor();
  return page.url().split("/").pop();
};

await step("topic ideas", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "רעיונות לנושא" }).waitFor();
  await page.locator(".topic-ideas .tags a").first().click();
  await page.waitForURL(/topic=/);
  await page.waitForTimeout(400);
  const v = await page.getByLabel("נושא הפעולה").inputValue();
  ok(v.length > 2, "clicking an idea fills the topic: " + v);
});

await step("create", async () => { actId = await makeActivity("בדיקת סבב ג"); });

await step("adapt", async () => {
  await page.getByRole("button", { name: "התאמה לתנאים" }).click();
  await page.getByRole("dialog").getByLabel("מה התנאים?").selectOption("heat");
  await page.getByRole("button", { name: "יצירת עותק מותאם" }).click();
  await page.getByRole("heading", { level: 1, name: /גרסת חום/ }).waitFor();
  ok(true, "adapted copy created");
  ok((await page.locator("body").innerText()).includes("התאמה (חום)"), "stages carry adaptation notes");
});

await step("notes", async () => {
  await page.getByLabel("הערה או רעיון לשיפור").fill("אפשר להוסיף משחק פתיחה");
  await page.getByRole("button", { name: "הוספת הערה" }).click();
  await page.getByText("אפשר להוסיף משחק פתיחה").waitFor();
  ok(true, "note added");
  await page.getByRole("button", { name: /מחיקת ההערה של/ }).click();
  await page.waitForTimeout(500);
  ok((await page.getByText("אפשר להוסיף משחק פתיחה").count()) === 0, "note removed");
});

await step("collections", async () => {
  await page.getByRole("button", { name: "הוספה לאוסף" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("אוסף חדש").fill("אוסף בדיקה");
  await dlg.getByRole("button", { name: "יצירה והוספה" }).click();
  await dlg.getByRole("checkbox", { name: /אוסף בדיקה/ }).waitFor();
  await page.keyboard.press("Escape");
  await page.goto(B + "/account", { waitUntil: "networkidle" });
  await page.getByText("אוסף בדיקה (1)").click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "הורדת האוסף כחוברת Word" }).click()]);
  ok(!!dl, "collection downloaded as a booklet");
});

await step("feedback", async () => {
  await page.goto(B + `/library/${actId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "משוב מחניכים" }).click();
  const url = await page.getByRole("dialog").locator("#share-url").inputValue();
  ok(url.endsWith(`/feedback/${actId}`), "feedback link in modal");
  await page.keyboard.press("Escape");
  const anon = await mk();
  const p = await anon.newPage();
  await p.goto(B + `/feedback/${actId}`, { waitUntil: "networkidle" });
  await p.getByText("מעולה").click();
  await p.getByLabel(/מה אהבתם/).fill("המשחק היה כיף");
  await p.getByText("כן", { exact: true }).click();
  await p.getByRole("button", { name: "שליחה" }).click();
  await p.getByRole("heading", { name: "תודה רבה!" }).waitFor();
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  ok(r.violations.length === 0, "axe feedback thank-you: " + (r.violations.map((v) => v.id).join(",") || "0"));
  await p.goto(B + `/feedback/${actId}`, { waitUntil: "networkidle" });
  const r2 = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  ok(r2.violations.length === 0, "axe feedback form: " + (r2.violations.map((v) => v.id + "(" + v.nodes[0].target.join(" ") + ")").join(",") || "0"));
  await anon.close();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /משוב מחניכים \(אנונימי\)/ }).waitFor();
  ok(await page.getByText("המשחק היה כיף").isVisible(), "owner sees the anonymous comment");
});

// admin: approval + insights
await step("admin approval and insights", async () => {
  const actx = await mk();
  const p = await actx.newPage();
  const login = async (pw) => {
    await p.goto(B + "/admin", { waitUntil: "networkidle" });
    await p.getByLabel("שם משתמש").fill("admin");
    await p.getByLabel("סיסמה").fill(pw);
    await p.getByRole("button", { name: /כניסה|התחברות/ }).last().click();
  };
  await login(NEW_PW);
  const head = p.getByRole("heading", { name: "אישור פעולות לפני פרסום" });
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
  await p.getByRole("heading", { name: "תובנות" }).waitFor();
  ok(await p.getByRole("list", { name: "פעולות לפי ערך" }).isVisible(), "insights show value coverage");
  const box = p.getByRole("checkbox", { name: /רק אחרי שאאשר/ });
  await box.click();
  await p.getByText(/ימתינו לאישור שלכם/).first().waitFor();
  const topic = "ממתינה לאישור " + Date.now().toString().slice(-5);
  await makeActivity(topic);
  await page.getByText(/ממתינה לאישור של מנהל השבט/).waitFor();
  ok(true, "pending banner shown to the creator");
  await page.goto(B + "/library?focus=1", { waitUntil: "networkidle" });
  await page.getByLabel("חיפוש חופשי").fill(topic);
  await page.waitForTimeout(900);
  ok((await page.locator(".activity-card").count()) === 0, "pending activity is not in the shared library");
  await p.reload({ waitUntil: "networkidle" });
  const approveBtn = p.getByRole("button", { name: new RegExp("אישור " + topic) });
  await approveBtn.click();
  await approveBtn.waitFor({ state: "detached", timeout: 8000 });
  await page.goto(B + "/library", { waitUntil: "networkidle" });
  await page.getByLabel("חיפוש חופשי").fill(topic);
  await page.waitForFunction(() => document.querySelectorAll(".activity-card").length === 1, null, { timeout: 8000 }).catch(() => {});
  ok((await page.locator(".activity-card").count()) === 1, "after approval it appears in the library");
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  ok(r.violations.length === 0, "axe admin: " + (r.violations.map((v) => v.id + "(" + v.nodes[0].target.join(" ") + ")").join(",") || "0"));
  await box.click();
  await p.getByText(/מתפרסמות מיד/).first().waitFor();
  await actx.close();
});

await step("axe pages", async () => {
  for (const theme of ["light", "dark"]) {
    await ctx.addInitScript((t) => { try { localStorage.setItem("scout.theme", t); } catch {} }, theme);
    for (const path of ["/", "/account", `/library/${actId}`]) {
      const p = await ctx.newPage();
      await p.goto(B + path, { waitUntil: "networkidle" });
      const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      ok(r.violations.length === 0, `axe ${theme} ${path}: ${r.violations.map((v) => v.id + "(" + v.nodes[0].target.join(" ") + ")").join(" | ") || "0"}`);
      await p.close();
    }
  }
});
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
await browser.close();
process.exit(fails ? 1 : 0);
