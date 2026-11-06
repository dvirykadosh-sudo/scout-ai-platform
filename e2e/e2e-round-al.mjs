// בדיקות דפדפן לשלב 53: מעבדת סגנון ופירוק.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 8).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const J = { "Content-Type": "application/json" };
const user = "f53" + Date.now().toString().slice(-6);
let tok, usr, docId;
await step("setup", async () => {
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך בדיקה", signupCode: CODE, acceptTerms: true }) })).json();
  tok = r.token; usr = r.user;
  const H = { ...J, Authorization: "Bearer " + tok };
  const d = await (await fetch(B + "/api/write/docs", { method: "POST", headers: H, body: JSON.stringify({ template: "classic" }) })).json();
  docId = d.id;
  const texts = ["בואו נתחיל! מה אתם חושבים על אחריות? ספרו לחבר על פעם שלקחתם אחריות.", "חלקו לקבוצות. כל קבוצה תחשוב איפה היא פוגשת אחריות בבית ובשבט, ואז תציג במשפט אחד.", "נסכם: מה לקחתם איתכם מהפעולה?"];
  await fetch(B + "/api/write/docs/" + d.id, { method: "PUT", headers: H, body: JSON.stringify({ title: "אחריות", meta: { ...d.meta, value: "אחריות" }, blocks: d.blocks.map((b, i) => ({ ...b, text: texts[i % 3] })), baseRev: d.rev }) });
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL" });
await ctx.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const axeOk = async (n) => { const r = await axe(A); ok(r.violations.length === 0, "axe " + n + " " + axeMsg(r)); };
const D = () => A.locator("dialog[open]");
await step("open lab", async () => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "כלים נוספים" }).click();
  await A.getByRole("button", { name: "מעבדת סגנון ופירוק" }).click();
  await D().getByRole("tab", { name: "פירוק וסגנון" }).waitFor();
  await axeOk("lab open");
});
await step("analyze", async () => {
  await D().getByRole("button", { name: "פרקו את הפעולה" }).click();
  await D().getByText("טביעת הסגנון שלכם").waitFor({ timeout: 8000 });
  ok((await D().locator("tbody tr").count()) >= 1, "stage rows");
  ok(/בדיוק בסגנון/.test(await D().locator(".lab-card").innerText()), "card text");
  await axeOk("analysis");
});
await step("save profile", async () => {
  await D().getByLabel("שם לשמירת הפרופיל").fill("הסגנון שלי");
  await D().getByRole("button", { name: "שמרו כפרופיל סגנון" }).click();
  await D().getByRole("tab", { name: "פרופילים" }).click();
  await D().getByText("הסגנון שלי").first().waitFor({ timeout: 6000 });
  await axeOk("profiles");
});
await step("rewrite", async () => {
  await D().getByRole("tab", { name: "כתיבה בסגנון" }).click();
  await D().getByLabel("טקסט לשכתוב").fill("יתבקשו החניכים לבצע את המשימה במסגרת הפעילות על מנת ללמוד, ולאחר מכן יציגו את התוצאות לכל הקבוצה ויסכמו.");
  await D().getByRole("button", { name: "שכתבו לסגנון" }).click();
  await D().getByText("משפט ממוצע:").waitFor({ timeout: 6000 });
  await axeOk("rewrite");
});
await step("review", async () => {
  await D().getByRole("tab", { name: "בדיקות עומק" }).click();
  await D().getByRole("button", { name: "הריצו בדיקות" }).click();
  await D().getByText("שלמות הפעולה").waitFor({ timeout: 8000 });
  await axeOk("review");
});
await step("free text", async () => {
  await D().getByRole("tab", { name: "פירוק טקסט חופשי" }).click();
  await D().getByLabel("הטקסט").fill("פעולה על חברות\nפתיחה: 10 דקות\nשואלים שאלה לכל הקבוצה.\nדיון\nמדברים בקבוצות על המשמעות.\nסיכום\nמסכמים יחד.");
  await D().getByRole("button", { name: "פרקו לשלבים" }).click();
  await D().locator("ol li").first().waitFor({ timeout: 6000 });
  ok((await D().locator("ol li").count()) >= 3, "3 stages");
  await axeOk("free text");
});
await step("my style", async () => {
  await D().getByRole("tab", { name: "הסגנון שלי" }).click();
  await D().getByText("מגמה לאורך הזמן").waitFor({ timeout: 8000 });
  await axeOk("my style");
});
await browser.close();
console.log(fails ? "FAILS " + fails : "ALL OK");
process.exit(fails ? 1 : 0);
