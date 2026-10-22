// בדיקות דפדפן לחשבונות ואבטחה, סבב 91–100.
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
const USER = "dad" + stamp;
const PW = "Str0ng-e2e-pw-26";


const A = await (await mk()).newPage();
const P = await (await mk()).newPage();
for (const p of [A, P]) p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const dlg = (p) => p.locator("dialog[open]");

await step("100. privacy page, footer link, axe", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.getByRole("link", { name: "פרטיות ותנאי שימוש" }).first().click();
  await A.getByRole("heading", { name: "פרטיות ותנאי שימוש" }).waitFor({ timeout: 8000 });
  await A.getByText(/אחרי \d+ ימים/).waitFor({ timeout: 6000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe privacy " + axeMsg(r));
});

await step("100+97. register needs the terms box, weak password hint shows", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("אבא בדיקה");
  await A.getByLabel("שם משתמש").fill(USER);
  await A.getByLabel("סיסמה", { exact: true }).fill("password");
  await A.getByText(/כדאי לשפר/).waitFor({ timeout: 6000 });
  ok(true, "weak password hint shown");
  await A.getByLabel("סיסמה", { exact: true }).fill(PW);
  await A.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByText("כדי להירשם יש לאשר").waitFor({ timeout: 6000 });
  ok(true, "blocked without terms");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe register with error " + axeMsg(r));
  await A.getByLabel("קראתי ואני מאשר").check();
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByRole("heading", { name: "פרטיות", exact: true }).waitFor({ timeout: 10000 });
  ok(true, "registered, privacy panel visible");
});

await step("93. user deletes own IPs from the account page", async () => {
  A.once("dialog", (d) => d.accept());
  await A.getByRole("button", { name: "מחיקת כתובות ה-IP שלי" }).click();
  await A.getByText(/נמחקו \d+ כתובות/).waitFor({ timeout: 6000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe account privacy " + axeMsg(r));
});

await step("admin login", async () => {
  const login = async (pw) => {
    await P.goto(B + "/admin", { waitUntil: "networkidle" });
    await P.getByLabel("שם משתמש").fill("admin");
    await P.getByLabel("סיסמה").fill(pw);
    await P.getByRole("button", { name: /^כניסה$/ }).click();
  };
  const head = P.getByRole("heading", { name: "משתמשים", exact: true });
  const change = P.getByText("לפני שממשיכים יש להחליף");
  await login(NEW_PW);
  await Promise.race([head.waitFor({ timeout: 6000 }), change.waitFor({ timeout: 6000 })]).catch(() => {});
  if (!(await head.count())) {
    if (!(await change.count())) { await login(ADMIN_PW); await change.waitFor({ timeout: 8000 }); }
    await P.getByLabel("סיסמה נוכחית").fill(ADMIN_PW);
    await P.getByLabel("סיסמה חדשה", { exact: true }).fill(NEW_PW);
    await P.getByLabel("סיסמה חדשה, פעם נוספת").fill(NEW_PW);
    await P.getByRole("button", { name: "החלפת סיסמה" }).click();
    await P.waitForTimeout(1500);
    if (!(await head.count())) await login(NEW_PW);
  }
  await head.waitFor({ timeout: 10000 });
  ok(true, "admin dashboard open");
});

await step("91+98. security dashboard and access log", async () => {
  for (const h of ["לוח אבטחה ושימוש", "יומן כניסות וכתובות IP", "מבקרים באתר", "חסימת כתובות IP", "הגדרות פרטיות ואבטחה"]) {
    await P.getByRole("heading", { name: h }).waitFor({ timeout: 10000 });
  }
  ok(true, "all five sections present");
  await P.getByLabel("שם משתמש", { exact: true }).last().fill(USER);
  await P.locator("section[aria-labelledby=acc-title]").getByRole("cell", { name: /הרשמה/ }).first().waitFor({ timeout: 8000 });
  ok(true, "registration row in the access log with IP column");
  const [dl] = await Promise.all([P.waitForEvent("download"), P.locator("section[aria-labelledby=acc-title]").getByRole("button", { name: /ייצוא ל-Excel/ }).click()]);
  ok((await dl.suggestedFilename()) === "access-log.csv", "access csv downloaded");
});

await step("99. users csv export", async () => {
  const [dl] = await Promise.all([P.waitForEvent("download"), P.getByRole("button", { name: /ייצוא משתמשים/ }).click()]);
  ok((await dl.suggestedFilename()) === "users.csv", "users csv downloaded");
});

await step("95. block and unblock an address, own address refused", async () => {
  const sec = P.locator("section[aria-labelledby=blk-title]");
  await sec.getByLabel("כתובת או טווח").fill("203.0.113.7");
  await sec.getByRole("button", { name: "חסימה", exact: true }).click();
  await sec.getByText("203.0.113.7").first().waitFor({ timeout: 6000 });
  ok(true, "block listed");
  await sec.getByRole("button", { name: /הסרה/ }).first().click();
  await sec.getByText("אין כתובות חסומות.").waitFor({ timeout: 6000 });
  ok(true, "block removed");
  await sec.getByLabel("כתובת או טווח").fill("127.0.0.1");
  await sec.getByRole("button", { name: "חסימה", exact: true }).click();
  await sec.getByRole("alert").waitFor({ timeout: 6000 });
  ok(true, "own address refused");
});

await step("93+97. settings save", async () => {
  const sec = P.locator("section[aria-labelledby=set-title]");
  await sec.getByLabel("שמירת יומן כניסות (ימים)").fill("60");
  await sec.getByRole("button", { name: "שמירת הגדרות" }).click();
  await P.getByText("ההגדרות נשמרו").waitFor({ timeout: 6000 });
  await P.reload({ waitUntil: "networkidle" });
  await P.getByRole("heading", { name: "הגדרות פרטיות ואבטחה" }).waitFor({ timeout: 10000 });
  ok((await P.locator("#set-ret").inputValue()) === "60", "retention persisted");
  const r = await axe(P);
  ok(r.violations.length === 0, "axe admin security " + axeMsg(r));
});

await step("96. captcha appears after failures and login works after solving it", async () => {
  const C = await (await mk()).newPage();
  await C.goto(B + "/account", { waitUntil: "networkidle" });
  const tryLogin = async (pw) => {
    await C.getByLabel("שם משתמש, מייל או טלפון").fill(USER);
    await C.getByLabel("סיסמה", { exact: true }).fill(pw);
    await C.getByRole("button", { name: /^כניסה$/ }).click();
    await C.waitForTimeout(700);
  };
  for (let i = 0; i < 3; i++) await tryLogin("wrong-pass-" + i);
  const q = C.getByText(/שאלת אבטחה: כמה זה/);
  if (!(await q.count())) await tryLogin("wrong-again");
  await q.waitFor({ timeout: 6000 });
  ok(true, "captcha question shown");
  const solve = async () => {
    const t = await C.locator("label[for=login-captcha]").innerText();
    const m = t.match(/(\d+) (ועוד|פחות) (\d+)/);
    return String(m[2] === "ועוד" ? +m[1] + +m[3] : +m[1] - +m[3]);
  };
  const r = await axe(C);
  ok(r.violations.length === 0, "axe captcha " + axeMsg(r));
  await C.locator("#login-captcha").fill("999");
  await C.getByLabel("סיסמה", { exact: true }).fill(PW);
  await C.getByRole("button", { name: /^כניסה$/ }).click();
  await C.waitForTimeout(800);
  await C.locator("#login-captcha").fill(await solve());
  await C.getByLabel("סיסמה", { exact: true }).fill(PW);
  await C.getByRole("button", { name: /^כניסה$/ }).click();
  await C.getByRole("heading", { name: "פרטיות", exact: true }).waitFor({ timeout: 10000 });
  ok(true, "logged in after solving captcha");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
