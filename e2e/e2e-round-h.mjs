// בדיקות דפדפן לסבב ח': תגיות, בקשות, היכל תהילה, שבוע להדפסה, עזרה, איחוד, ששכחתי, הודעות שבט.
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
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const stamp = Date.now().toString().slice(-6);
const register = async (p, user, display) => {
  await p.goto(B + "/account", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /הרשמה/ }).first().click();
  await p.getByLabel("שם להצגה").fill(display);
  await p.getByLabel("שם משתמש").fill(user);
  await p.getByLabel("סיסמה", { exact: true }).fill("password99");
  await p.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await p.getByLabel("קראתי ואני מאשר").check();
  await p.getByRole("button", { name: /הרשמה|יצירת חשבון/ }).last().click();
  await p.getByText("הפעולות שלי").first().waitFor({ timeout: 8000 });
};
const adminLogin = async (p) => {
  const login = async (pw) => {
    await p.goto(B + "/admin", { waitUntil: "networkidle" });
    await p.getByLabel("שם משתמש").fill("admin");
    await p.getByLabel("סיסמה").fill(pw);
    await p.getByRole("button", { name: /כניסה|התחברות/ }).last().click();
  };
  const head = p.getByRole("heading", { name: "הודעות שבט בדף הבית" });
  const change = p.getByText("לפני שממשיכים יש להחליף");
  await login(NEW_PW);
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
};

const ctx = await mk();
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await register(page, "hown" + stamp, "בעלת ח");
const token = await page.evaluate(() => JSON.parse(localStorage.getItem("scout.session")).token);
const apiPost = (path, body) => page.evaluate(async ({ token, B, path, body }) => (await fetch(B + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) })).json(), { token, B, path, body });
const mine = await apiPost("/api/activities/quick", { kind: "value", topic: "בדיקת ח" });
const id = mine.id;
ok(Number.isInteger(id), "activity " + id);

await step("43. tags on activity + in account", async () => {
  await page.goto(`${B}/library/${id}`, { waitUntil: "networkidle" });
  await page.getByLabel("תגית חדשה").fill("לחורף");
  await page.getByRole("button", { name: "הוספת תגית" }).click();
  await page.locator(".tag-list li", { hasText: "לחורף" }).waitFor();
  ok(true, "tag added");
  await page.goto(B + "/account", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /לחורף \(1\)/ }).click();
  await page.locator("#mytags-title ~ ul a").first().waitFor();
  ok(true, "tagged list shows activity");
  await page.goto(`${B}/library/${id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "הסרת התגית לחורף" }).click();
  await page.waitForFunction(() => !document.querySelector(".tag-list li"));
  ok(true, "tag removed");
});

await step("49. forgotten activities", async () => {
  await page.goto(B + "/account", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "פעולות שלכם שלא הופעלו זמן רב" }).waitFor();
  ok(true, "forgotten panel shown");
});

await step("44. requests board", async () => {
  await page.goto(B + "/requests", { waitUntil: "networkidle" });
  await page.getByLabel("איזו פעולה חסרה לכם?").fill("פעולה על שמירת הטבע לשכבה ה'");
  await page.getByRole("button", { name: "שליחת בקשה" }).click();
  await page.getByText("פעולה על שמירת הטבע לשכבה ה'").first().waitFor();
  ok(true, "request listed");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe requests " + r.violations.map((v) => v.id).join(","));
});

await step("45. hall page", async () => {
  await page.goto(B + "/hall", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "חדשות במאגר" }).waitFor();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe hall " + r.violations.map((v) => v.id).join(","));
});

await step("46. print week", async () => {
  await apiPost("/api/me/schedule", { title: "פעולת שבת", date: new Date().toLocaleDateString("en-CA") });
  await page.goto(B + "/calendar/print", { waitUntil: "networkidle" });
  await page.getByText("פעולת שבת").first().waitFor();
  ok((await page.locator(".week-table tbody tr").count()) === 7, "seven day rows");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe print week " + r.violations.map((v) => v.id).join(","));
});

await step("47. help center search", async () => {
  await page.goto(B + "/help", { waitUntil: "networkidle" });
  const all = await page.locator("details.insight").count();
  await page.getByLabel("חיפוש בעזרה").fill("תגיות");
  const some = await page.locator("details.insight").count();
  ok(all > some && some >= 1, `search filters ${all} -> ${some}`);
  await page.getByLabel("חיפוש בעזרה").fill("zzzzqq");
  ok((await page.locator("details.insight").count()) === 0, "no match shows none");
  await page.getByLabel("חיפוש בעזרה").fill("");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe help " + r.violations.map((v) => v.id).join(","));
});

await step("50 + 48. admin announcements and merge", async () => {
  const actx = await mk();
  const p = await actx.newPage();
  await adminLogin(p);
  await p.getByLabel("הודעה חדשה").fill("מחר טיול שבטי, נפגשים ב-8:00");
  await p.getByRole("button", { name: "פרסום הודעה" }).click();
  await p.getByText("מחר טיול שבטי, נפגשים ב-8:00").first().waitFor();
  // מופיעה בדף הבית של אורח
  const g = await mk();
  const gp = await g.newPage();
  await gp.goto(B + "/", { waitUntil: "networkidle" });
  await gp.getByRole("heading", { name: "הודעות מהשבט" }).waitFor();
  ok(await gp.getByText("מחר טיול שבטי, נפגשים ב-8:00").first().isVisible(), "guest sees announcement");
  const ra = await axe(gp);
  ok(ra.violations.length === 0, "axe home with announcement " + ra.violations.map((v) => v.id).join(","));
  await g.close();
  // הסרה
  await p.getByRole("button", { name: /הסרה של ההודעה/ }).first().click();
  await p.waitForFunction(() => !document.body.innerText.includes("מחר טיול שבטי"));
  ok(true, "announcement removed");
  // איחוד: משכפלים ורואים כלי איחוד
  const dup = await apiPost(`/api/activities/${id}/duplicate`, {});
  await p.goto(`${B}/library/${id}`, { waitUntil: "networkidle" });
  await p.getByRole("heading", { name: "פעולות דומות" }).waitFor();
  const summary = p.getByText("איחוד כפילות (אדמין)");
  ok((await summary.count()) === 1, "admin sees merge tool for near-duplicate " + dup.id);
  await summary.click();
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: /איחוד לתוך זו/ }).first().click();
  await p.waitForURL(/\/library$/, { timeout: 8000 });
  ok(true, "merged and returned to library");
  await actx.close();
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
