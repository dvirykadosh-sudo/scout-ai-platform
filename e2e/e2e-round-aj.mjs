// בדיקות דפדפן לשלב 51 (346–366).
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 8).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const J = { "Content-Type": "application/json" };
const user = "f51" + Date.now().toString().slice(-6);
let tok, usr, docId;

await step("setup", async () => {
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך בדיקה", signupCode: CODE, acceptTerms: true }) })).json();
  tok = r.token; usr = r.user;
  const H = { ...J, Authorization: "Bearer " + tok };
  const d = await (await fetch(B + "/api/write/docs", { method: "POST", headers: H, body: JSON.stringify({ template: "classic" }) })).json();
  docId = d.id;
  await fetch(B + "/api/write/docs/" + d.id, { method: "PUT", headers: H, body: JSON.stringify({ title: "משחק במים ובאש", meta: { ...d.meta, groupSize: 24, minutes: 40 }, blocks: d.blocks.map((b) => ({ ...b, text: "נשחק ליד המים ואחר כך נדליק מדורה ונרוץ בחושך. זהו משפט ארוך מאוד, עם הרבה פסיקים, עוד פסיק, ועוד פסיק, ועוד אחד, כדי לבדוק." })), baseRev: d.rev }) });
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "he-IL", permissions: ["microphone"] });
await ctx.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [tok, usr]);
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const open = async (btn) => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "כלים נוספים" }).click();
  await A.getByRole("button", { name: btn }).click();
};


const box = async (label) => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "כלים נוספים" }).click();
  await A.getByRole("button", { name: "ארגז כלים (21 כלים)" }).click();
  await A.locator("dialog[open]").getByRole("button", { name: label, exact: true }).click();
};
const axeOk = async (n) => { const r = await axe(A); ok(r.violations.length === 0, "axe " + n + " " + axeMsg(r)); };
await step("grid has 21 tools", async () => {
  await A.goto(B + "/write/" + docId, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "כלים נוספים" }).click();
  await A.getByRole("button", { name: "ארגז כלים (21 כלים)" }).click();
  ok((await A.locator("dialog[open] .modal-content .actions .btn").count()) === 21, "21 buttons");
  await axeOk("grid");
});
for (const [label, wait] of [["בדיקת קצב", "סך הכול"], ["עקומת אנרגיה", "אנרגיה"], ["בדיקת בהירות", ""], ["בדיקת לשון מכלילה", ""], ["רמזים למדריך", "מה לומר"], ["רשימת ציוד", ""], ["רשימה לפני יציאה", "סומנו"], ["חלוקת תפקידים בין מדריכים", "מדריך ראשון"], ["לוח זמנים לקיר", "שעת התחלה"], ["כרטיס חירום", "מדריך אחראי"], ["שמות לקבוצות", "נושא"], ["לוח ניקוד", "הוספת קבוצה"], ["קוביות ומטבע", "הטלת מטבע"], ["לוח צלילים", "עוצמה"], ["שאלות רפלקציה", "הוספת הכול"], ["משפט לסיום", "הוספת הכול"], ["כרטיס סיכום", "מה עבד"]]) {
  await step(label, async () => {
    await box(label);
    if (wait) await A.getByText(wait, { exact: false }).first().waitFor({ timeout: 6000 });
    else await A.waitForTimeout(1200);
    await axeOk(label);
  });
}
await step("pace content", async () => {
  await box("בדיקת קצב");
  await A.getByText("סך הכול").waitFor({ timeout: 6000 });
});
await step("preflight persists", async () => {
  await box("רשימה לפני יציאה");
  await A.locator("dialog[open]").getByRole("checkbox").first().check();
  await A.getByText("סומנו 1 מתוך").waitFor({ timeout: 4000 });
  await box("רשימה לפני יציאה");
  await A.getByText("סומנו 1 מתוך").waitFor({ timeout: 4000 });
});
await step("score", async () => {
  await box("לוח ניקוד");
  await A.getByRole("button", { name: "הוספת 5 נקודות ל" + "קבוצה 1" }).click();
  await A.getByText("5 (מובילה)").waitFor({ timeout: 3000 });
});
await step("names tools", async () => {
  await box("חלוקה לקבוצות");
  await A.getByLabel(/שמות החניכים/).fill("דנה\nיוסי\nמיכל\nרון\nנועה\nאורי");
  await A.getByLabel("מספר קבוצות").fill("2");
  await A.getByLabel(/מי לא באותה קבוצה/).fill("דנה, יוסי");
  await A.locator("dialog[open]").getByRole("button", { name: "חלוקה", exact: true }).click();
  await A.getByText("קבוצה 1 (3):").waitFor({ timeout: 4000 });
  const txt = await A.locator("dialog[open] .plain-list").innerText();
  const g = txt.split("\n").filter((l) => l.includes("קבוצה"));
  ok(!g.some((l) => l.includes("דנה") && l.includes("יוסי")), "apart pair respected: " + g.join(" | "));
  await axeOk("teams");
  await A.getByRole("button", { name: "חזרה לכלים" }).click();
  await A.locator("dialog[open]").getByRole("button", { name: "גלגל בחירה", exact: true }).click();
  await A.getByRole("button", { name: "הגרלה" }).click();
  await A.getByText("נבחר/ה:").waitFor({ timeout: 5000 });
  await axeOk("wheel");
  await A.getByRole("button", { name: "חזרה לכלים" }).click();
  await A.locator("dialog[open]").getByRole("button", { name: "תגי שם", exact: true }).click();
  await A.getByText("6 שמות מוכנים").waitFor({ timeout: 3000 });
});
await step("noise meter", async () => {
  await box("מד רעש");
  await A.getByRole("button", { name: "הפעלת המד" }).click();
  await A.getByRole("button", { name: "עצירה" }).waitFor({ timeout: 6000 });
  await A.waitForTimeout(800);
  await axeOk("noise");
  await A.getByRole("button", { name: "עצירה" }).click();
});
await browser.close();
console.log(fails ? "FAILS " + fails : "ALL OK");
process.exit(fails ? 1 : 0);
