// בדיקות דפדפן לייצוא וכלים נלווים, סבב 163–174.
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
const USER = "ext" + stamp;
const PW = "Str0ng-e2e-pw-26";


const ctx = await mk();
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const saved = (p) => p.getByText(/^נשמר \d/).first();
const txt = (p, n) => p.getByLabel("טקסט השלב " + n, { exact: true });
const dlg = () => A.getByRole("dialog");
const close = () => dlg().getByRole("button", { name: "סגירה" }).last().click();
const rows = () => A.locator(`section[aria-labelledby="w-mine"] li`);
let shareUrl = "";

await step("register, create doc with typos", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("בודק קהילה");
  await A.getByLabel("שם משתמש").fill(USER);
  await A.getByLabel("סיסמה", { exact: true }).fill(PW);
  await A.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await A.getByLabel("קראתי ואני מאשר").check();
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByRole("heading", { name: "פרטיות", exact: true }).waitFor({ timeout: 10000 });
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: /להתחיל\s*:\s*פעולה קלאסית/ }).click();
  await A.getByRole("button", { name: "דילוג" }).click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  await A.getByRole("textbox", { name: "שם הפעולה" }).fill("מסמך קהילה");
  await txt(A, 1).fill("אנחנו אנחנו מתחילים  בשאלה , כן.");
  await saved(A).waitFor({ timeout: 8000 });
});

await step("typo check and one-click clean", async () => {
  await A.getByRole("button", { name: "קריאוּת והצעות לשם" }).click();
  await dlg().getByText(/חוזרת פעמיים ברצף/).waitFor({ timeout: 5000 });
  ok(await dlg().getByRole("listitem").filter({ hasText: /רווחים כפולים/ }).first().isVisible(), "double space found");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe typos " + axeMsg(r));
  await dlg().getByRole("button", { name: /ניקוי אוטומטי/ }).click();
  ok((await txt(A, 1).inputValue()) === "אנחנו אנחנו מתחילים בשאלה, כן.", "cleaned: " + (await txt(A, 1).inputValue()));
});

await step("163. version diff against current", async () => {
  await A.waitForTimeout(2500);
  await A.getByRole("button", { name: "גרסאות", exact: true }).click();
  await dlg().getByLabel("שם לנקודת שמירה").fill("נקודה");
  await dlg().getByRole("button", { name: "יצירת נקודת שמירה עכשיו" }).click();
  await dlg().getByText(/נקודה/).first().waitFor({ timeout: 6000 });
  await close();
  await txt(A, 1).fill("אנחנו אנחנו מתחילים בשאלה חדשה, כן.");
  await A.getByRole("button", { name: "גרסאות", exact: true }).click();
  await dlg().getByRole("button", { name: /צפייה/ }).first().click();
  await dlg().getByText("הצגת השינויים מול המסמך הנוכחי").click();
  await dlg().locator(".write-diff-text ins").first().waitFor({ timeout: 3000 });
  ok(/חדשה/.test((await dlg().locator(".write-diff-text ins").allInnerTexts()).join(" ")), "added word marked");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe diff " + axeMsg(r));
  await close();
});

await step("export: markdown, end time", async () => {
  await A.getByLabel("שעת התחלה").fill("18:00");
  await A.getByLabel("משך מתוכנן (דקות)").fill("45");
  await A.getByRole("button", { name: "חלוקת זמן אוטומטית" }).click();
  await A.getByText(/הפעולה מסתיימת בערך בשעה 18:45/).waitFor({ timeout: 3000 });
  await A.getByRole("button", { name: "ייצוא ושיתוף" }).click();
  const [dl] = await Promise.all([A.waitForEvent("download", { timeout: 8000 }), dlg().getByRole("button", { name: "הורדה כ-Markdown" }).click()]);
  const fs = await import("node:fs");
  const md = fs.readFileSync(await dl.path(), "utf8");
  ok(md.startsWith("# מסמך קהילה") && md.includes("## "), "markdown content");
  await close();
});

await step("run mode: size controls and next stage preview", async () => {
  await A.getByRole("button", { name: "מצב הרצה" }).click();
  const d = A.getByRole("dialog", { name: "מצב הרצה" });
  await d.getByText(/השלב הבא:/).waitFor();
  const size = () => A.locator(".write-run-text").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const s0 = await size();
  await d.getByRole("button", { name: "הגדלת טקסט" }).click();
  ok((await size()) > s0, "text grows");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe run " + axeMsg(r));
  await A.keyboard.press("Escape");
});

await step("visitor leaves a comment, owner resolves it", async () => {
  await saved(A).waitFor({ timeout: 8000 });
  await A.getByRole("button", { name: "שיתוף בקישור" }).click();
  await A.getByRole("button", { name: "יצירת קישור" }).click();
  shareUrl = (await A.getByLabel("הקישור", { exact: true }).inputValue()).replace(/^https?:\/\/[^/]+/, B);
  ok(await A.getByRole("link", { name: /שליחה בוואטסאפ/ }).isVisible(), "whatsapp link");
  await close();
  const vctx = await mk();
  const V = await vctx.newPage();
  await V.goto(shareUrl, { waitUntil: "networkidle" });
  await V.getByRole("heading", { name: "הערות ומשוב" }).waitFor({ timeout: 6000 });
  await V.getByLabel("השם שלך").fill("מבקר <b>");
  await V.getByLabel("ההערה", { exact: true }).fill("רעיון מצוין <script>alert(1)</script>");
  await V.getByLabel("על איזה שלב?").selectOption({ index: 1 });
  await V.getByRole("button", { name: "שליחת ההערה" }).click();
  await V.getByText(/רעיון מצוין/).first().waitFor({ timeout: 5000 });
  ok(await V.getByText("<script>alert(1)</script>", { exact: false }).count() >= 1, "rendered as text");
  await V.waitForTimeout(600);
  const rv = await axe(V);
  ok(rv.violations.length === 0, "axe visitor " + axeMsg(rv));
  await vctx.close();
  await A.getByRole("button", { name: /^הערות מבקרים/ }).click();
  await dlg().getByText(/רעיון מצוין/).waitFor({ timeout: 5000 });
  const r = await axe(A);
  ok(r.violations.length === 0, "axe owner comments " + axeMsg(r));
  await dlg().getByRole("button", { name: /סימון כטופלה/ }).click();
  await dlg().getByText(/טופלה/).first().waitFor({ timeout: 4000 });
  await close();
});

await step("trash: delete then restore", async () => {
  await A.waitForTimeout(2500);
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  A.once("dialog", (d) => d.accept());
  await A.getByRole("button", { name: /מחיקה\s*:\s*מסמך קהילה/ }).click();
  await A.getByText("סל מחזור (1)").waitFor({ timeout: 5000 });
  ok((await rows().filter({ hasText: "מסמך קהילה" }).count()) === 0, "gone from list");
  await A.getByText("סל מחזור (1)").click();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe trash " + axeMsg(r));
  await A.getByRole("button", { name: /^שחזור\s*:\s*מסמך קהילה/ }).click();
  await A.getByText("המסמך הוחזר").waitFor({ timeout: 5000 });
  await A.waitForTimeout(600);
  ok((await rows().filter({ hasText: "מסמך קהילה" }).count()) === 1, "restored");
});

await step("tribe template published by admin is available", async () => {
  const api = ctx.request;
  const L = await api.post(B + "/api/auth/login", { data: { username: "admin", password: ADMIN_PW } });
  let tok = (await L.json()).token;
  const me = (await L.json()).user;
  if (me?.mustChangePw) {
    await api.post(B + "/api/auth/change-password", { headers: { authorization: `Bearer ${tok}` }, data: { currentPassword: ADMIN_PW, newPassword: NEW_PW } });
    tok = (await (await api.post(B + "/api/auth/login", { data: { username: "admin", password: NEW_PW } })).json()).token;
  }
  const H = { authorization: `Bearer ${tok}` };
  const doc = await (await api.post(B + "/api/write/docs", { headers: H, data: { template: "value" } })).json();
  const pub = await api.post(B + "/api/admin/write-templates", { headers: H, data: { docId: doc.id, title: "תבנית שבט בדיקה" } });
  ok(pub.status() === 201, "published " + pub.status());
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "תבניות השבט" }).waitFor({ timeout: 5000 });
  await A.waitForTimeout(500);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe list " + axeMsg(r));
  await A.getByRole("button", { name: /התחלה מתבנית השבט\s*:\s*תבנית שבט בדיקה/ }).click();
  await A.getByRole("button", { name: "דילוג" }).click().catch(() => {});
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  ok((await A.getByRole("textbox", { name: "שם הפעולה" }).inputValue()) === "תבנית שבט בדיקה", "created from tribe template");
});

await step("mobile: no horizontal scroll", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.waitForTimeout(500);
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "editor ok");
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  ok(await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "list ok");
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
