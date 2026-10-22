// בדיקות דפדפן לחשבונות ואבטחה, סבב 81–90.
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
const USER = "mom" + stamp;
const EMAIL = `mom${stamp}@example.com`;
const PHONE_IN = "050-76" + stamp.slice(0, 5);
const PW = "password99";

// TOTP (RFC 6238) לבדיקה בלבד
const b32 = (s) => { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, v = 0; const out = []; for (const c of s.toUpperCase()) { const i = A.indexOf(c); if (i < 0) continue; v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = (secret, step) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac("sha1", b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0"); };
const now = () => Math.floor(Date.now() / 30000);

const ctxA = await mk();
const A = await ctxA.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await step("82. register with email and phone", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("אמא בדיקה");
  await A.getByLabel("שם משתמש").fill(USER);
  await A.getByLabel("סיסמה", { exact: true }).fill(PW);
  await A.getByLabel("מייל (לא חובה)").fill(EMAIL);
  await A.getByLabel("טלפון (לא חובה)").fill(PHONE_IN);
  await A.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await A.getByLabel("קראתי ואני מאשר").check();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe register " + axeMsg(r));
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByRole("heading", { name: "מייל וטלפון" }).waitFor({ timeout: 10000 });
  ok(await A.getByText("לא מאומת").count() === 2, "both shown as unverified");
});

await step("83. verification without a provider says so clearly", async () => {
  await A.getByRole("button", { name: "אימות המייל" }).click();
  await A.getByRole("alert").filter({ hasText: "לא מוגדרת" }).waitFor({ timeout: 6000 });
  ok(true, "no-provider message shown");
});

await step("axe on account security panels", async () => {
  const r = await axe(A);
  ok(r.violations.length === 0, "axe account " + axeMsg(r));
});

// ───── אדמין מאמת ידנית ─────
const ctxB = await mk();
const P = await ctxB.newPage();
P.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const dlg = P.locator("dialog[open]");
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

await step("89. search and manual verify in the user dialog", async () => {
  await P.getByLabel("חיפוש (שם, שם משתמש, מייל או טלפון)").fill(USER);
  const row = P.getByRole("row").filter({ hasText: USER });
  await row.getByRole("button", { name: /פרטים וניהול/ }).click();
  await dlg.getByRole("heading", { name: new RegExp(USER) }).waitFor();
  await dlg.getByRole("button", { name: "אימות מייל ידני" }).click();
  await dlg.getByRole("button", { name: "ביטול אימות מייל" }).waitFor();
  await dlg.getByRole("button", { name: "אימות טלפון ידני" }).click();
  await dlg.getByRole("button", { name: "ביטול אימות טלפון" }).waitFor();
  const r = await axe(P);
  ok(r.violations.length === 0, "axe user dialog " + axeMsg(r));
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
});

// ───── כניסה בכל זיהוי ─────
const loginAs = async (ident, label) => {
  const c = await mk();
  const p = await c.newPage();
  await p.goto(B + "/account", { waitUntil: "networkidle" });
  await p.getByLabel("שם משתמש, מייל או טלפון").fill(ident);
  await p.getByLabel("סיסמה", { exact: true }).fill(PW);
  await p.getByRole("button", { name: /^כניסה$/ }).click();
  return { c, p };
};
await step("81. login by email and by phone", async () => {
  const e = await loginAs(EMAIL.toUpperCase(), "email");
  await e.p.getByText("אמא בדיקה").first().waitFor({ timeout: 8000 });
  ok(true, "login with email");
  await e.c.close();
  const t = await loginAs("+97250" + PHONE_IN.slice(4).replace("-", ""), "phone");
  await t.p.getByText("אמא בדיקה").first().waitFor({ timeout: 8000 });
  ok(true, "login with phone");
  await t.c.close();
});

await step("84. forgot password screen (no provider configured)", async () => {
  const c = await mk();
  const p = await c.newPage();
  await p.goto(B + "/account", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "שכחתי סיסמה" }).click();
  await p.getByRole("heading", { name: "איפוס סיסמה" }).waitFor();
  await p.getByText("שליחת קודים לא מוגדרת").waitFor();
  const r = await axe(p);
  ok(r.violations.length === 0, "axe forgot " + axeMsg(r));
  await c.close();
});

// ───── 2FA ─────
let secret = "";
let backup = "";
await step("86. enable two-factor in the account page", async () => {
  await A.reload({ waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הפעלת אימות דו-שלבי" }).click();
  const form = A.getByRole("form", { name: "הגדרת אימות דו-שלבי" });
  secret = (await form.locator("code").innerText()).trim();
  ok(/^[A-Z2-7]{32}$/.test(secret), "secret shown: " + secret.length);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe 2fa setup " + axeMsg(r));
  await form.getByLabel("קוד מהאפליקציה").fill(totp(secret, now()));
  await form.getByRole("button", { name: "אישור והפעלה" }).click();
  await A.getByText("קודי גיבוי.").waitFor({ timeout: 8000 });
  backup = (await A.locator(".ok-box code").first().innerText()).trim();
  ok(/^[0-9a-f]{4}-[0-9a-f]{4}$/.test(backup), "backup code shown");
  const r2 = await axe(A);
  ok(r2.violations.length === 0, "axe 2fa enabled " + axeMsg(r2));
});

const ctxD = await mk();
const D = await ctxD.newPage();
await step("86. two-step login with the app code", async () => {
  await D.goto(B + "/account", { waitUntil: "networkidle" });
  await D.getByLabel("שם משתמש, מייל או טלפון").fill(USER);
  await D.getByLabel("סיסמה", { exact: true }).fill(PW);
  await D.getByRole("button", { name: /^כניסה$/ }).click();
  await D.getByRole("heading", { name: "אימות דו-שלבי" }).waitFor();
  const r = await axe(D);
  ok(r.violations.length === 0, "axe 2fa step " + axeMsg(r));
  await D.getByLabel("קוד אימות").fill("000000");
  await D.getByRole("button", { name: "אימות", exact: true }).click();
  await D.getByRole("alert").filter({ hasText: "הקוד שגוי" }).waitFor();
  ok(true, "wrong code rejected");
  await D.getByLabel("קוד אימות").fill(totp(secret, now() + 1));
  await D.getByRole("button", { name: "אימות", exact: true }).click();
  await D.getByText("אמא בדיקה").first().waitFor({ timeout: 8000 });
  ok(true, "logged in after second step");
});

await step("86. backup code works once", async () => {
  const c = await mk();
  const p = await c.newPage();
  const go = async (code) => {
    await p.goto(B + "/account", { waitUntil: "networkidle" });
    await p.getByLabel("שם משתמש, מייל או טלפון").fill(USER);
    await p.getByLabel("סיסמה", { exact: true }).fill(PW);
    await p.getByRole("button", { name: /^כניסה$/ }).click();
    await p.getByLabel("קוד אימות").fill(code);
    await p.getByRole("button", { name: "אימות", exact: true }).click();
  };
  await go(backup);
  await p.getByText("אמא בדיקה").first().waitFor({ timeout: 8000 });
  ok(true, "backup code accepted");
  await c.close();
  const c2 = await mk();
  const p2 = await c2.newPage();
  await p2.goto(B + "/account", { waitUntil: "networkidle" });
  await p2.getByLabel("שם משתמש, מייל או טלפון").fill(USER);
  await p2.getByLabel("סיסמה", { exact: true }).fill(PW);
  await p2.getByRole("button", { name: /^כניסה$/ }).click();
  await p2.getByLabel("קוד אימות").fill(backup);
  await p2.getByRole("button", { name: "אימות", exact: true }).click();
  await p2.getByRole("alert").filter({ hasText: "הקוד שגוי" }).waitFor();
  ok(true, "same backup code rejected");
  await c2.close();
});

await step("87. devices list and disconnect others", async () => {
  await A.reload({ waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "מכשירים מחוברים" }).waitFor();
  ok(await A.getByText("המכשיר הזה").count() === 1, "current device marked");
  const tokenD = await D.evaluate(() => JSON.parse(localStorage.getItem("scout.session") || "{}").token);
  const status = async () => D.evaluate(async (t) => (await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })).status, tokenD);
  ok((await status()) === 200, "other device is signed in");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe devices " + axeMsg(r));
  await A.getByRole("button", { name: "ניתוק כל המכשירים האחרים" }).click();
  await A.getByText(/נותקו \d+ מכשירים/).first().waitFor({ timeout: 6000 });
  ok((await status()) === 401, "other device token revoked immediately");
});

// ───── תפקידי צוות ויומן ─────
const STAFF = "staff" + stamp;
let tmpPw = "";
await step("88+89. create a content manager from the admin page", async () => {
  await P.getByRole("button", { name: "יצירת משתמש" }).click();
  await dlg.getByLabel("שם להצגה").fill("מנהלת תוכן");
  await dlg.getByLabel("שם משתמש").fill(STAFF);
  await dlg.getByLabel("סוג חשבון").selectOption("ADMIN");
  await dlg.getByLabel("תפקיד בצוות").selectOption("CONTENT");
  const r = await axe(P);
  ok(r.violations.length === 0, "axe create user " + axeMsg(r));
  await dlg.getByRole("button", { name: "יצירה" }).click();
  await dlg.waitFor({ state: "detached" });
  tmpPw = (await P.locator(".error-box code").first().innerText()).trim();
  ok(tmpPw.length >= 8, "temporary password shown");
});

await step("88. a content manager sees no users, audit or backups", async () => {
  const c = await mk();
  const p = await c.newPage();
  await p.goto(B + "/admin", { waitUntil: "networkidle" });
  await p.getByLabel("שם משתמש").fill(STAFF);
  await p.getByLabel("סיסמה").fill(tmpPw);
  await p.getByRole("button", { name: /^כניסה$/ }).click();
  await p.getByText("לפני שממשיכים יש להחליף").waitFor();
  await p.getByLabel("סיסמה נוכחית").fill(tmpPw);
  await p.getByLabel("סיסמה חדשה", { exact: true }).fill(NEW_PW);
  await p.getByLabel("סיסמה חדשה, פעם נוספת").fill(NEW_PW);
  await p.getByRole("button", { name: "החלפת סיסמה" }).click();
  await p.getByRole("heading", { name: /דיווחים על פעולות/ }).waitFor({ timeout: 10000 });
  ok((await p.getByRole("heading", { name: "משתמשים", exact: true }).count()) === 0, "no users section");
  ok((await p.getByRole("heading", { name: "יומן פעולות מלא" }).count()) === 0, "no audit section");
  ok((await p.getByRole("heading", { name: /גיבויים/ }).count()) === 0, "no backups section");
  const err = await p.locator(".error-box").count();
  ok(err === 0, "no error boxes on the restricted dashboard");
  const r = await axe(p);
  ok(r.violations.length === 0, "axe content-manager dashboard " + axeMsg(r));
  await c.close();
});

await step("90. audit viewer: filter, verify chain, export", async () => {
  await P.reload({ waitUntil: "networkidle" });
  await P.getByRole("heading", { name: "יומן פעולות מלא" }).waitFor({ timeout: 10000 });
  await P.getByLabel("מי (שם משתמש)").fill(USER);
  await P.locator("section[aria-labelledby=audit-title]").getByRole("cell", { name: "התחברות" }).first().waitFor({ timeout: 6000 });
  await P.getByRole("button", { name: "בדיקת תקינות היומן" }).click();
  await P.getByText(/היומן תקין: נבדקו \d+ רשומות/).waitFor();
  const [dl] = await Promise.all([P.waitForEvent("download"), P.locator("section[aria-labelledby=audit-title]").getByRole("button", { name: /ייצוא ל-Excel/ }).click()]);
  ok((await dl.suggestedFilename()) === "audit-log.csv", "csv downloaded");
  const r = await axe(P);
  ok(r.violations.length === 0, "axe admin page " + axeMsg(r));
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
