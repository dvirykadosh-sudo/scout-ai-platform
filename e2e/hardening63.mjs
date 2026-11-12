// שלב 63: בדיקת דפדפן מול שרת production: הרשמה אמיתית עם אסימון הטופס, פעולת אורח עם הודעה, וכרטיס ה-IP באדמין.
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:5056";
const ADMIN_PW = process.env.ADMIN_PW || "Tr1cky!Scout-pass-63x";
const fails = [];
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails.push(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// 1. הרשמה אמיתית (אסימון טופס נטען ברקע, ההרשמה אחרי כמה שניות)
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
const regTab = page.getByRole("button", { name: "הרשמה" });
if (await regTab.count()) await regTab.first().click();
await page.waitForSelector("#reg-user", { timeout: 15000 });
const tokenResp = page.waitForResponse((r) => r.url().includes("/api/auth/form-token"), { timeout: 2000 }).catch(() => null);
await page.fill("#reg-name", "בודק דפדפן");
await page.fill("#reg-user", "browser63");
await page.fill("#reg-pass", "Zq9!kLm-Vv21-xyz63");
await page.check("#reg-terms");
await page.waitForTimeout(3200);
const regResp = page.waitForResponse((r) => r.url().includes("/api/auth/register") && r.request().method() === "POST");
await page.getByRole("button", { name: /הרשמה|יצירת חשבון|הירשם/ }).last().click();
const rr = await regResp;
const body = await rr.json().catch(() => ({}));
ok(rr.status() === 201, `הרשמה אמיתית בדפדפן עברה (${rr.status()} ${body?.error?.code || ""})`);
ok(!!(rr.request().postData() || "").includes("formToken"), "הדפדפן שלח אסימון טופס");

// 2. פעולת אורח: הודעה "בלי התחברות" בעמוד הפעולה
const api = await ctx.request.post(BASE + "/api/activities/generate", { data: { topic: "ידיעת הארץ", value: "אחריות", ageGroup: "כיתה ז' - מעורב", participants: 15, instructor: "נועה", role: "מדריכה", methods: [{ name: "משחק תחרות", minutes: 10 }, { name: "דיון בשאלה", minutes: 12 }, { name: "הסבר", minutes: 5 }] } });
const act = await api.json();
ok(act.status === "UNLISTED", `פעולת אורח UNLISTED (${act.status})`);
const guest = await browser.newContext({ locale: "he-IL" });
const gp = await guest.newPage();
await gp.goto(BASE + "/library/" + act.id, { waitUntil: "networkidle" });
ok(await gp.getByText("לא מופיעה במאגר המשותף ולא בגוגל").count() > 0, "בעמוד הפעולה מוצגת הודעה שהיא קישור ישיר בלבד");
const robots = await gp.locator('meta[name="robots"]').getAttribute("content");
ok(/noindex/.test(robots || ""), `robots בעמוד הפעולה: ${robots}`);

// 3. אדמין: כרטיס IP, מתג אורחים
const ad = await ctx.request.post(BASE + "/api/auth/login", { data: { username: "admin", password: ADMIN_PW } });
const adj = await ad.json();
ok(ad.status() === 200, "אדמין נכנס");
if (adj.user?.mustChangePw) {
  const ch = await ctx.request.post(BASE + "/api/auth/change-password", { data: { currentPassword: ADMIN_PW, newPassword: "Zq9!Fresh-admin-pw-63" }, headers: { authorization: "Bearer " + adj.token } });
  ok(ch.status() === 200, "החלפת סיסמה ראשונה");
}
const login2 = await (await ctx.request.post(BASE + "/api/auth/login", { data: { username: "admin", password: adj.user?.mustChangePw ? "Zq9!Fresh-admin-pw-63" : ADMIN_PW } })).json();
await page.addInitScript((t) => { try { localStorage.setItem("scout.token", t); } catch {} }, login2.token);
const sys = await (await ctx.request.get(BASE + "/api/admin/system", { headers: { authorization: "Bearer " + login2.token } })).json();
ok(typeof sys.clientIp?.seen === "string", `המערכת מחזירה כתובת (${sys.clientIp?.seen})`);
console.log("warnings:", JSON.stringify(sys.warnings));
const st = await (await ctx.request.get(BASE + "/api/admin/settings", { headers: { authorization: "Bearer " + login2.token } })).json();
ok(st.guestPublish === false, "guestPublish כבוי כברירת מחדל");
ok(errors.length === 0, "בלי שגיאות JS בדף: " + errors.join(" | ").slice(0, 200));
await browser.close();
if (fails.length) { console.log("FAILS:", fails); process.exit(1); }
console.log("ALL OK");
