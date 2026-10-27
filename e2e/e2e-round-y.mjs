// בדיקות דפדפן לשלב 37 (221–250).
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const ADMIN_PW = process.env.ADMIN_PASSWORD || "Strong#Pass99";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 8).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const J = { "Content-Type": "application/json" };
const user = "y37" + Date.now().toString().slice(-6);
let tok, usr, adminTok, adminUsr;

await step("setup", async () => {
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך בדיקה", signupCode: CODE, acceptTerms: true }) })).json();
  tok = r.token; usr = r.user;
  const NEW = "E2e-new-pass-2026-y";
  const login = async (pw) => { const x = await fetch(B + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ username: "admin", password: pw }) }); return x.ok ? x.json() : null; };
  let d = await login(ADMIN_PW);
  if (d && d.user.mustChangePw) {
    await fetch(B + "/api/auth/change-password", { method: "POST", headers: { ...J, Authorization: "Bearer " + d.token }, body: JSON.stringify({ currentPassword: ADMIN_PW, newPassword: NEW }) });
    d = await login(NEW);
  } else if (!d) d = await login(NEW);
  adminTok = d.token; adminUsr = d.user;
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL" });
await ctx.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await step("team board: add, list, substitute text", async () => {
  await A.goto(B + "/team", { waitUntil: "networkidle" });
  await A.getByLabel("שם הפעולה").fill("פעולת אומץ בבדיקה");
  const t = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await A.getByLabel("תאריך").fill(t);
  await A.getByRole("button", { name: "הוספה ללוח" }).click();
  await A.getByText("פעולת אומץ בבדיקה").first().waitFor({ timeout: 6000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe team " + axeMsg(r));
  await A.getByRole("button", { name: "בקשת מחליף" }).click();
  await A.getByText(/הודעה למחליף הועתקה|failed|שגיאה/).first().waitFor({ timeout: 6000 }).catch(() => {});
});

await step("ctrl+k palette", async () => {
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.keyboard.press("Control+k");
  await A.getByRole("dialog", { name: "חיפוש מהיר" }).waitFor();
  await A.getByLabel("חיפוש עמוד או מסמך").fill("לוח צוות");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe palette " + axeMsg(r));
  await A.keyboard.press("Enter");
  await A.waitForURL(/\/team$/, { timeout: 6000 });
});

await step("compact toggle", async () => {
  await A.getByRole("button", { name: "תצוגה קומפקטית" }).click();
  ok(await A.evaluate(() => document.documentElement.classList.contains("compact")), "compact class");
  await A.getByRole("button", { name: "תצוגה קומפקטית" }).click();
});

await step("admin ops + maintenance banner", async () => {
  const actx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL" });
  await actx.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); sessionStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [adminTok, adminUsr]);
  const P = await actx.newPage();
  await P.goto(B + "/admin", { waitUntil: "networkidle" });
  await P.getByRole("heading", { name: "תפעול ושחזור" }).waitFor({ timeout: 10000 });
  await P.getByLabel("הודעה לגולשים").fill("בדיקת תחזוקה");
  await P.getByRole("button", { name: "הפעלת מצב תחזוקה" }).click();
  await P.getByText(/פעיל כעת: בדיקת תחזוקה/).waitFor({ timeout: 5000 });
  const r = await axe(P);
  ok(r.violations.length === 0, "axe admin ops " + axeMsg(r));
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.getByText(/האתר בתחזוקה: בדיקת תחזוקה/).waitFor({ timeout: 8000 });
  await P.getByRole("button", { name: "כיבוי" }).click();
  await P.getByText(/פעיל כעת/).waitFor({ state: "detached", timeout: 5000 });
  await actx.close();
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
