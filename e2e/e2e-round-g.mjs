// בדיקות דפדפן לסבב ז': בטיחות, דיווח, התראות, אחסון, דוח, ייצוא, פעולות דומות, התאמות נגישות.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const ADMIN_PW = process.env.ADMIN_PASSWORD || "Strong#Pass99";
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
const ownerCtx = await mk();
const page = await ownerCtx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const owner = "gown" + stamp;
await register(page, owner, "בעלת הפעולה");

// פעולה של המשתמשת עצמה, כדי שתהיה לה הרשאה ושיגיעו אליה התראות
let myId = null;
await step("create my activity via quick mode API", async () => {
  const token = await page.evaluate(() => { const s = localStorage.getItem("scout.session"); return s ? JSON.parse(s).token : null; });
  ok(!!token, "session token present");
  const r = await page.evaluate(async ({ token, B }) => {
    const res = await fetch(B + "/api/activities/quick", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ kind: "peak", topic: "משחק ריצה עם מדורה" }) });
    return res.json();
  }, { token, B });
  myId = r.id;
  ok(Number.isInteger(myId), "activity created " + myId);
});

await step("34. safety panel on activity page", async () => {
  await page.goto(`${B}/library/${myId}`, { waitUntil: "networkidle" });
  const panel = page.locator("#safety");
  await panel.waitFor();
  await panel.locator("summary").click();
  ok((await panel.innerText()).includes("בדיקת בטיחות"), "safety panel visible");
  const apply = panel.getByRole("button", { name: "הוספת ההנחיות החסרות" });
  if (await apply.count()) {
    await apply.click();
    await page.getByText(/הנחיות הבטיחות נוספו/).first().waitFor();
    ok(true, "missing guidance added");
  } else ok(true, "nothing missing to add");
});

await step("42. similar activities panel", async () => {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("scout.session")).token);
  await page.evaluate(async ({ token, B, myId }) => { await fetch(`${B}/api/activities/${myId}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: "{}" }); }, { token, B, myId });
  await page.goto(`${B}/library/${myId}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "פעולות דומות" }).waitFor();
  ok((await page.locator("#sim-title ~ ul li").count()) >= 1, "similar list has items");
});

await step("36. flag as guest", async () => {
  const gctx = await mk();
  const g = await gctx.newPage();
  await g.goto(`${B}/library/${myId}`, { waitUntil: "networkidle" });
  await g.getByRole("button", { name: "דיווח על בעיה" }).click();
  await g.getByLabel("מה הבעיה?").selectOption({ label: "בעיית בטיחות" });
  await g.getByLabel(/פרטים/).fill("בדיקת דיווח");
  await g.getByRole("button", { name: "שליחת דיווח" }).click();
  await g.getByText(/הדיווח הועבר/).first().waitFor();
  ok(true, "guest flag sent");
  await gctx.close();
});

await step("37. notification badge + panel", async () => {
  await page.goto(B + "/account", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /^התראות/ }).waitFor();
  ok((await page.locator(".nav-badge").count()) === 1, "nav badge visible");
  ok(await page.getByText(/דיווח על בעיה בפעולה שלך|מישהו דיווח/).first().isVisible(), "flag notification listed");
  await page.getByRole("button", { name: "סימון הכל כנקרא" }).click();
  await page.waitForFunction(() => !document.querySelector(".nav-badge"));
  ok(true, "badge cleared after mark-all-read");
});

await step("41. export my data", async () => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "הורדת הנתונים שלי" }).click()]);
  ok(dl.suggestedFilename() === "my-scout-data.json", "download name " + dl.suggestedFilename());
});

await step("35. new adapt conditions in modal", async () => {
  await page.goto(`${B}/library/${myId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "התאמה לתנאים" }).click();
  const t = await page.locator("dialog[open]").innerText();
  ok(t.includes("מגבלת ניידות") && t.includes("קשיי קשב"), "adapt modal lists new conditions");
  await page.keyboard.press("Escape");
});

await step("admin: flags, storage, report", async () => {
  const actx = await mk();
  const p = await actx.newPage();
  const NEW_PW = "E2e-new-pass-2026";
  const login = async (pw) => {
    await p.goto(B + "/admin", { waitUntil: "networkidle" });
    await p.getByLabel("שם משתמש").fill("admin");
    await p.getByLabel("סיסמה").fill(pw);
    await p.getByRole("button", { name: /כניסה|התחברות/ }).last().click();
  };
  const head = p.getByRole("heading", { name: /דיווחים על פעולות/ });
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
  ok(await p.getByText("בדיקת דיווח").first().isVisible(), "admin sees the guest flag");
  await p.getByRole("button", { name: /טופל/ }).first().click();
  await p.getByText("הדיווח נסגר").first().waitFor();
  ok(true, "flag resolved");
  await p.getByRole("heading", { name: "מצב האחסון" }).waitFor();
  ok(true, "storage card shown");
  await p.getByRole("heading", { name: "דוח תקופתי" }).waitFor();
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "הורדת הדוח כקובץ CSV" }).click()]);
  ok(/^report-.*\.csv$/.test(dl.suggestedFilename()), "report csv " + dl.suggestedFilename());
  const r = await axe(p);
  ok(r.violations.length === 0, "axe admin " + r.violations.map((v) => v.id).join(","));
  await actx.close();
});

await step("axe on activity page + account", async () => {
  for (const path of [`/library/${myId}`, "/account"]) {
    await page.goto(B + path, { waitUntil: "networkidle" });
    const r = await axe(page);
    ok(r.violations.length === 0, "axe " + path + " " + r.violations.map((v) => v.id).join(","));
  }
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
