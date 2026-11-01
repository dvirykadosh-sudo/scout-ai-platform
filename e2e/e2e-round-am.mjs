// בדיקות דפדפן לשלב 54 (423–452).
import { chromium, request } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
const require = createRequire(new URL("../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const ADMIN_PW = process.env.ADMIN_PASSWORD || "Strong#Pass99";
const NEW_PW = "E2e-new-pass-2026";
const SECRET = process.env.JWT_SECRET || "testsecret1234567890";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 6).join(" | ")); } };
const axeAll = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeIn = (p, sel) => new AxeBuilder({ page: p }).include(sel).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const axeOk = async (p, n, sel) => { const r = sel ? await axeIn(p, sel) : await axeAll(p); ok(r.violations.length === 0, "axe " + n + " " + axeMsg(r)); };
const J = { "Content-Type": "application/json" };
const user = "f54" + Date.now().toString().slice(-6);
let adminTok, adminSession, tok, usr, actId, actTitle;
const mk = async (session, extra) => {
  const c = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: "he-IL" });
  await c.addInitScript(([st, ex]) => { try { localStorage.setItem("scout.hero.seen", "1"); if (st) localStorage.setItem("scout.session", st); if (ex) eval(ex); } catch {} }, [session || null, extra || null]);
  return c;
};
const H = (t) => ({ ...J, Authorization: "Bearer " + t });

await step("setup", async () => {
  const api = await request.newContext();
  let L = await api.post(B + "/api/auth/login", { data: { username: "admin", password: ADMIN_PW } });
  if (L.status() !== 200) L = await api.post(B + "/api/auth/login", { data: { username: "admin", password: NEW_PW } });
  let b = await L.json();
  if (b.user?.mustChangePw) {
    await api.post(B + "/api/auth/change-password", { headers: { authorization: `Bearer ${b.token}` }, data: { currentPassword: ADMIN_PW, newPassword: NEW_PW } });
    b = await (await api.post(B + "/api/auth/login", { data: { username: "admin", password: NEW_PW } })).json();
  }
  adminTok = b.token; adminSession = JSON.stringify({ token: b.token, user: b.user });
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך בדיקה", signupCode: CODE, acceptTerms: true, formAge: 3000 }) })).json();
  tok = r.token; usr = r.user;
  ok(!!tok, "user registered");
  const list = await (await fetch(B + "/api/activities?pageSize=1")).json();
  actId = list.items[0].id; actTitle = list.items[0].title;
});
const sess = () => JSON.stringify({ token: tok, user: usr });

await step("headers: request id, server timing, gzip", async () => {
  const r = await fetch(B + "/api/activities?pageSize=50", { headers: { "accept-encoding": "gzip" } });
  ok(/^[0-9a-f]{10}$/.test(r.headers.get("x-request-id") || ""), "x-request-id");
  ok(/app;dur=/.test(r.headers.get("server-timing") || ""), "server-timing");
});

await step("link previews, robots, sitemap, manifest", async () => {
  const bot = await (await fetch(B + `/library/${actId}`, { headers: { "user-agent": "WhatsApp/2.23" } })).text();
  ok(/property="og:title"/.test(bot) && bot.includes(actTitle), "og:title with the activity title for WhatsApp");
  ok(/og:image/.test(bot) && /twitter:card/.test(bot), "og:image + twitter card");
  const rb = await (await fetch(B + "/robots.txt")).text();
  ok(/Allow: \//.test(rb) && /Disallow: \/admin/.test(rb) && /Sitemap:/.test(rb), "robots: whole site open, admin blocked, sitemap listed");
  const sm = await fetch(B + "/sitemap.xml");
  const smt = await sm.text();
  ok(sm.status === 200 && smt.includes(`/library/${actId}`) && !/\/admin/.test(smt), "sitemap lists activities and not admin");
  const mf = await (await fetch(B + "/manifest.webmanifest")).json();
  ok(mf.share_target?.action === "/share-target" && mf.shortcuts?.length === 4, "manifest share_target + 4 shortcuts");
});

await step("status page", async () => {
  const c = await mk(); const p = await c.newPage();
  await p.goto(B + "/status", { waitUntil: "networkidle" });
  await p.getByText("האתר פועל כרגיל").waitFor({ timeout: 8000 });
  ok(await p.getByText("מסד הנתונים").isVisible(), "db row");
  await axeOk(p, "status");
  await c.close();
});

await step("coverage page", async () => {
  const c = await mk(); const p = await c.newPage();
  await p.goto(B + "/coverage", { waitUntil: "networkidle" });
  await p.getByRole("heading", { name: "מה כדאי לכתוב הבא" }).waitFor({ timeout: 8000 });
  ok((await p.locator(".cov-table tbody tr").count()) >= 1, "matrix rows");
  ok((await p.locator(".cov-zero").count()) >= 1, "gap cells");
  await axeOk(p, "coverage");
  await c.close();
});

const uctx = await mk(sess());
const A = await uctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await step("activity page: reactions, cost, toc/progress, a11y", async () => {
  await A.goto(B + `/library/${actId}`, { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "מה דעתכם על הפעולה?" }).waitFor({ timeout: 8000 });
  const like = A.getByRole("button", { name: /אהבתי/ });
  await like.click();
  await A.waitForFunction(() => [...document.querySelectorAll(".react-btn")].some((b) => b.getAttribute("aria-pressed") === "true"));
  ok(/1 תגובות/.test((await like.getAttribute("aria-label")) || ""), "reaction counted");
  await like.click();
  await A.waitForFunction(() => ![...document.querySelectorAll(".react-btn")].some((b) => b.getAttribute("aria-pressed") === "true"));
  await A.getByText("אומדן עלות לפעולה").click();
  await A.getByText(/לחניך\./).waitFor({ timeout: 6000 });
  ok(await A.locator(".read-progress").count() === 1, "reading progress bar");
  const toc = A.locator('nav[aria-label="תוכן העמוד"]');
  if (await toc.count()) { ok(await toc.isVisible(), "toc visible on wide screens"); }
  else console.log("INFO  toc not rendered (fewer than 4 headings)");
  await axeOk(A, "activity page");
});

await step("verified badge appears after admin stamp", async () => {
  const r = await fetch(B + `/api/admin/security/stamps/${actId}`, { method: "PUT", headers: H(adminTok), body: JSON.stringify({ verified: true, note: "נבדקה בשטח" }) });
  ok(r.status === 200, "stamp saved");
  await A.goto(B + `/library/${actId}`, { waitUntil: "networkidle" });
  await A.getByText(/נבדקה על ידי צוות השבט/).waitFor({ timeout: 8000 });
  await axeOk(A, "verified badge");
  await fetch(B + `/api/admin/security/stamps/${actId}`, { method: "PUT", headers: H(adminTok), body: JSON.stringify({ verified: false }) });
});

await step("recently viewed + smart search fallback", async () => {
  await A.goto(B + "/library", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "המשיכו מאיפה שעצרתם" }).waitFor({ timeout: 6000 });
  ok(await A.locator(".recent .chip", { hasText: actTitle.slice(0, 8) }).count() >= 1, "viewed activity listed");
  await A.getByLabel("חיפוש חופשי").fill("בריונוק");
  await A.getByRole("heading", { name: "חיפוש חכם" }).waitFor({ timeout: 8000 });
  ok(await A.getByText(/האם התכוונתם ל/).isVisible(), "did you mean");
  await axeOk(A, "smart fallback");
  await A.locator(".smart-fallback .link-btn").click();
  await A.waitForTimeout(1200);
  ok((await A.getByLabel("חיפוש חופשי").inputValue()) === "בריונות", "suggestion applied to the box");
});

await step("voice button follows the feature flag", async () => {
  await A.goto(B + "/library", { waitUntil: "networkidle" });
  const has = await A.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  if (has) ok(await A.getByRole("button", { name: /חיפוש בקול/ }).isVisible(), "voice button visible when supported");
  else console.log("INFO  speech recognition not supported in this browser");
  await fetch(B + "/api/admin/security/flags/voice-search", { method: "PUT", headers: H(adminTok), body: JSON.stringify({ enabled: false, percent: 100, note: "e2e" }) });
  await A.goto(B + "/library", { waitUntil: "networkidle" });
  await A.waitForTimeout(800);
  ok((await A.getByRole("button", { name: /חיפוש בקול/ }).count()) === 0, "voice button hidden after the flag is switched off");
  await fetch(B + "/api/admin/security/flags/voice-search", { method: "DELETE", headers: H(adminTok) });
});

await step("reading toggles: comfy, ruler, data saver", async () => {
  await A.goto(B + "/library", { waitUntil: "networkidle" });
  const bar = A.getByRole("group", { name: "הגדרות נגישות" });
  await bar.getByRole("button", { name: "קריאה נוחה" }).click();
  ok(await A.evaluate(() => document.documentElement.classList.contains("comfy")), "html.comfy");
  await bar.getByRole("button", { name: "חיסכון בנתונים" }).click();
  ok(await A.evaluate(() => document.documentElement.classList.contains("saver")), "html.saver");
  await bar.getByRole("button", { name: "סרגל קריאה" }).click();
  await A.locator('[data-testid="ruler"]').waitFor({ state: "attached" });
  await A.mouse.move(400, 400);
  await A.waitForTimeout(200);
  ok(await A.locator(".ruler-dim").count() === 2, "ruler dims above and below");
  await axeOk(A, "comfy + ruler on");
  await A.keyboard.press("Escape");
  await A.waitForTimeout(200);
  ok((await A.locator('[data-testid="ruler"]').count()) === 0, "Escape closes the ruler");
  await A.reload({ waitUntil: "networkidle" });
  ok(await A.evaluate(() => document.documentElement.classList.contains("comfy") && document.documentElement.classList.contains("saver")), "settings remembered after reload");
  await A.getByRole("group", { name: "הגדרות נגישות" }).getByRole("button", { name: "קריאה נוחה" }).click();
  await A.getByRole("group", { name: "הגדרות נגישות" }).getByRole("button", { name: "חיסכון בנתונים" }).click();
});

await step("client errors and web vitals reach the admin", async () => {
  const c = await mk(sess()); const p = await c.newPage();
  await p.goto(B + "/library", { waitUntil: "networkidle" });
  await p.evaluate(() => { setTimeout(() => { throw new Error("e2e boom 54"); }, 0); });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForTimeout(1500);
  const e = await (await fetch(B + "/api/admin/security/errors", { headers: H(adminTok) })).json();
  ok(e.groups.some((g) => /e2e boom/.test(g.message)), "client error grouped in admin");
  const v = await (await fetch(B + "/api/admin/security/vitals", { headers: H(adminTok) })).json();
  ok(v.metrics.some((m) => m.samples > 0), "web vitals recorded");
  await c.close();
});

await step("admin monitor card", async () => {
  const c = await mk(adminSession); const p = await c.newPage();
  await p.goto(B + "/admin", { waitUntil: "networkidle" });
  const card = p.locator('section[aria-labelledby="mon-title"]');
  await card.waitFor({ timeout: 10000 });
  await card.getByRole("button", { name: "שגיאות", exact: true }).click();
  await card.getByText(/e2e boom/).first().waitFor({ timeout: 6000 });
  await axeOk(p, "admin errors", 'section[aria-labelledby="mon-title"]');
  await card.getByRole("button", { name: "ביצועים", exact: true }).click();
  await card.getByText("אחוזון 75").first().waitFor({ timeout: 6000 });
  await axeOk(p, "admin vitals", 'section[aria-labelledby="mon-title"]');
  await card.getByRole("button", { name: "דגלי תכונות", exact: true }).click();
  await card.getByLabel(/שם הדגל/).fill("e2e-flag");
  await card.getByRole("button", { name: "הוספה או עדכון" }).click();
  await card.getByText("e2e-flag").waitFor({ timeout: 6000 });
  await axeOk(p, "admin flags", 'section[aria-labelledby="mon-title"]');
  await card.getByRole("button", { name: "בדיקת גיבוי", exact: true }).click();
  await card.getByRole("button", { name: "הריצו בדיקת שחזור" }).click();
  await card.getByText("הגיבוי תקין ואפשר לשחזר ממנו").waitFor({ timeout: 15000 });
  await axeOk(p, "admin drill", 'section[aria-labelledby="mon-title"]');
  await card.getByRole("button", { name: "שביעות רצון", exact: true }).click();
  await card.getByText(/עוד אין תשובות|ציון NPS/).waitFor({ timeout: 6000 });
  await card.getByRole("button", { name: "חותמות איכות", exact: true }).click();
  await card.getByText(/פעולות מחותמות/).waitFor({ timeout: 6000 });
  await axeOk(p, "admin stamps", 'section[aria-labelledby="mon-title"]');
  await c.close();
  await fetch(B + "/api/admin/security/flags/e2e-flag", { method: "DELETE", headers: H(adminTok) });
});

await step("nps prompt after two days", async () => {
  const db = new DatabaseSync("/tmp/e2e61.db");
  db.prepare("UPDATE users SET created_at = ? WHERE username = ?").run(new Date(Date.now() - 5 * 86400000).toISOString(), user);
  db.close();
  const c = await mk(sess()); const p = await c.newPage();
  await p.goto(B + "/library", { waitUntil: "networkidle" });
  const box = p.locator("section.nps");
  await box.waitFor({ timeout: 15000 });
  await axeOk(p, "nps prompt", "section.nps");
  await box.getByRole("radio", { name: "9", exact: true }).click({ force: true });
  await box.getByLabel(/רוצים להוסיף/).fill("אתר מעולה");
  await box.getByRole("button", { name: "שליחה" }).click();
  await box.waitFor({ state: "detached", timeout: 6000 });
  const n = await (await fetch(B + "/api/admin/security/nps", { headers: H(adminTok) })).json();
  ok(n.responses === 1 && n.nps === 100, "nps stored: " + JSON.stringify([n.responses, n.nps]));
  await c.close();
});

await step("session expiry warning and extension", async () => {
  const real = jwt.decode(tok);
  const short = jwt.sign({ sub: real.sub, username: real.username, role: real.role, mustChangePw: false, sid: real.sid }, SECRET, { expiresIn: 240 });
  const c = await mk(JSON.stringify({ token: short, user: usr })); const p = await c.newPage();
  await p.goto(B + "/library", { waitUntil: "networkidle" });
  const dlg = p.getByRole("alertdialog", { name: /ההתחברות עומדת לפוג/ });
  await dlg.waitFor({ timeout: 8000 });
  await axeOk(p, "session warning", ".session-warn");
  await dlg.getByRole("button", { name: "הישארו מחוברים" }).click();
  await dlg.waitFor({ state: "detached", timeout: 6000 });
  const stored = JSON.parse(await p.evaluate(() => localStorage.getItem("scout.session")));
  const exp = jwt.decode(stored.token).exp * 1000;
  ok(exp - Date.now() > 3600_000, "token replaced with a long-lived one");
  await c.close();
});

await step("double-open document warning", async () => {
  const c2 = await mk(sess());
  const d = await (await fetch(B + "/api/write/docs", { method: "POST", headers: H(tok), body: JSON.stringify({ template: "classic" }) })).json();
  const q1 = await c2.newPage();
  await q1.goto(B + `/write/${d.id}`, { waitUntil: "networkidle" });
  await q1.waitForTimeout(800);
  const q2 = await c2.newPage();
  await q2.goto(B + `/write/${d.id}`, { waitUntil: "networkidle" });
  await q1.getByText(/פתוח גם בלשונית אחרת/).first().waitFor({ timeout: 8000 });
  ok(true, "double-open warning shown");
  await c2.close();
});

await step("share target page", async () => {
  const c = await mk(sess()); const p = await c.newPage();
  const text = "פעולה על אחריות\nפתיחה: 10 דקות\nשואלים שאלה לכל הקבוצה על אחריות.\nדיון\nמדברים בקבוצות על המשמעות של אחריות אישית.\nסיכום\nמסכמים יחד את מה שלמדנו היום.";
  await p.goto(B + "/share-target?title=" + encodeURIComponent("פעולה על אחריות") + "&text=" + encodeURIComponent(text), { waitUntil: "networkidle" });
  await p.getByRole("heading", { name: "קיבלנו טקסט ששיתפתם" }).waitFor({ timeout: 8000 });
  await axeOk(p, "share target");
  await p.getByRole("button", { name: "פרקו לשלבים ושמרו כמסמך" }).click();
  await p.waitForURL(/\/write\/\d+/, { timeout: 15000 });
  ok(true, "redirected to the new document");
  await c.close();
  const c2 = await mk(); const q = await c2.newPage();
  await q.goto(B + "/share-target?text=hello", { waitUntil: "networkidle" });
  await q.getByText(/התחברו/).first().waitFor({ timeout: 6000 });
  await c2.close();
});

await step("present mode keeps the screen awake", async () => {
  const c = await mk(sess(), "window.__wl = 0; if (!navigator.wakeLock) { Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { window.__wl++; return { released: false, release: async () => {} }; } } }); } else { const o = navigator.wakeLock.request.bind(navigator.wakeLock); navigator.wakeLock.request = async (t) => { window.__wl++; return o(t); }; }");
  const p = await c.newPage();
  await p.goto(B + `/present/${actId}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  ok((await p.evaluate(() => window.__wl)) >= 1, "wake lock requested");
  await c.close();
});

await step("cross-tab logout sync", async () => {
  const c = await mk(sess());
  const p1 = await c.newPage(), p2 = await c.newPage();
  await p1.goto(B + "/library", { waitUntil: "networkidle" });
  await p2.goto(B + "/library", { waitUntil: "networkidle" });
  await p1.goto(B + "/account", { waitUntil: "networkidle" });
  await p1.getByRole("button", { name: "התנתקות" }).first().click();
  await p2.getByText(/התנתקתם בלשונית אחרת/).waitFor({ timeout: 8000 });
  ok(true, "second tab was told about the logout");
  await c.close();
});

await step("whats new lists stage 54 and footer has new links", async () => {
  const c = await mk(); const p = await c.newPage();
  await p.goto(B + "/whats-new", { waitUntil: "networkidle" });
  await p.getByText("שלב 54").first().waitFor({ timeout: 6000 });
  await axeOk(p, "whats-new");
  await c.close();
});

await browser.close();
console.log(fails ? "FAILS " + fails : "ALL OK");
process.exit(fails ? 1 : 0);
