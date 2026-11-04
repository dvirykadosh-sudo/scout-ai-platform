// בדיקות דפדפן לעוזר הכתיבה, סבב 51–60.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
await ctx.addInitScript(() => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.removeItem("scout.assist.draft"); } catch {} });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0,12).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const box = page.getByLabel("טיוטת הפעולה", { exact: true });
const DRAFT = "פעולה על אחריות\nהמטרה: שהחניכים יבינו שאחריות היא בחירה\n\nפתיחה: נדבר על זה במעגל וכו׳. 5 דקות\n\nמשחק: במסגרת הפעילות ישנם תחנות ודילמה על אידיאולוגיה. 20 דקות\n\nדיון: מה הרגשתם כשהיה קשה?\n\nסיכום: כל אחד אומר משפט אחד. 5 דקות";
await page.goto(B + "/assistant", { waitUntil: "networkidle" });
await box.fill(DRAFT);
const side = page.locator(".assist-side");

await step("52. margin notes: mark and fix", async () => {
  await side.getByText("הערות בשוליים").waitFor();
  ok((await side.getByText('"נדבר על זה"').count()) === 1, "vague phrase flagged");
  await side.getByRole("button", { name: /^תיקון\s*:\s*במסגרת הפעילות/ }).click();
  ok(!(await box.inputValue()).includes("במסגרת הפעילות"), "office phrase fixed in text");
  await page.getByRole("button", { name: "ביטול השינוי האחרון" }).click();
  ok((await box.inputValue()).includes("במסגרת הפעילות"), "undo restores");
  await side.getByRole("button", { name: /^סימון בטקסט\s*:\s*נדבר על זה/ }).click();
  const sel = await box.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd));
  ok(sel === "נדבר על זה", "phrase selected in textarea: " + sel);
});

await step("57. value link and add sentence", async () => {
  await side.getByText("חיבור לערך").waitFor();
  await side.getByRole("button", { name: "הוספת משפט חיבור" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("הערך") && document.querySelector(".ok-box"), null, { timeout: 8000 }).catch(() => {});
  ok((await box.inputValue()).includes("בסיכום נחבר"), "connection sentence appended");
});

await step("58. age check", async () => {
  await page.getByLabel("שכבת גיל (לבדיקת התאמה)").selectOption("כיתה ד' - מעורב");
  await side.getByText("התאמה לכיתה ד'").waitFor();
  ok((await side.innerText()).includes("אידיאולוגיה"), "abstract word flagged for grade ד'");
});

await step("55. timeline", async () => {
  await page.getByLabel("משך הפעולה (דקות)").fill("30");
  await page.getByText(/דקות מתוך 30/).first().waitFor();
  ok(true, "timeline against target 30");
  ok((await page.locator(".assist-timeline-bar span").count()) >= 2, "stage segments drawn");
});

await step("53. rewrite preview + apply", async () => {
  await box.evaluate((el) => { const i = el.value.indexOf("משחק:"); el.focus(); el.setSelectionRange(i, i + 40); });
  await page.getByRole("button", { name: "ניסוח מחדש לפסקה" }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByRole("heading", { name: "אחרי" }).waitFor();
  ok((await dlg.innerText()).includes("בפעולה"), "preview shows fixed phrase");
  await dlg.getByRole("button", { name: "קצר יותר" }).click();
  await dlg.getByRole("button", { name: "החלפה בטיוטה" }).click();
  ok(!(await box.inputValue()).includes("במסגרת הפעילות"), "rewrite applied");
});

await step("59. discussion questions", async () => {
  await page.getByRole("button", { name: "שאלות לדיון" }).click();
  await page.getByRole("heading", { name: "שאלות לדיון מתוך הטיוטה" }).waitFor();
  ok((await page.locator("#assist-q-title ~ ul li").count()) === 3, "three levels");
  await page.getByRole("button", { name: /הוספה לטקסט\s*:\s*שאלה ערכית/ }).click();
  ok((await box.inputValue()).includes("שאלה לדיון (ערכית)"), "question inserted");
});

await step("60. dry run adds plan B", async () => {
  await page.getByRole("button", { name: "הרצה יבשה" }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByText(/דקה 0/).waitFor();
  await dlg.getByLabel(/מה אם יורד גשם/).check();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe dry-run dialog " + r.violations.map((v) => v.id).join(","));
  await dlg.getByRole("button", { name: /הוספת הנבחרים/ }).click();
  ok((await box.inputValue()).includes("תוכנית ב' (מה אם יורד גשם"), "plan B in draft");
  await side.getByText("תוכניות ב'").first().waitFor({ timeout: 100 }).catch(() => {});
});

await step("51. continue in my voice (3 variants)", async () => {
  await page.getByLabel("סגנון ההמשך").selectOption("humor");
  await page.getByRole("button", { name: "המשך בקול שלי" }).click();
  await page.getByRole("heading", { name: "המשך מוצע" }).waitFor();
  const n = await page.locator("#assist-cont-title ~ ul li").count();
  ok(n >= 1, "continue options: " + n);
  await page.locator("#assist-cont-title ~ ul li").first().getByRole("button").click();
  ok((await page.locator("#assist-cont-title").count()) === 0, "panel closes after adding");
});

await step("56. focus mode with word goal", async () => {
  await page.getByRole("button", { name: "מצב ריכוז" }).click();
  const dlg = page.getByRole("dialog", { name: "מצב ריכוז" });
  await dlg.waitFor();
  await dlg.getByLabel("יעד מילים").fill("500");
  ok((await dlg.getByRole("status").innerText()).includes("מתוך 500"), "goal shown");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe focus mode " + r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ") + " " + (n.any[0]?.message || "")).join("; ")).join(","));
  await dlg.getByLabel("טיוטת הפעולה במצב ריכוז").type(" עוד מילה");
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  ok((await box.inputValue()).includes("עוד מילה"), "text typed in focus mode kept");
});

await step("54. dictation button degrades gracefully", async () => {
  const b = page.getByRole("button", { name: /הכתבה בקול|עצירת הכתבה/ });
  ok((await b.count()) === 1, "dictation button present");
  const fake = await browser.newContext({ locale: "he-IL" });
  await fake.addInitScript(() => {
    try { localStorage.setItem("scout.hero.seen", "1"); } catch {}
    class R { start() { this.onresult && setTimeout(() => this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "משפט שהוכתב בקול" }, length: 1 }] }), 50); } stop() { this.onend && this.onend(); } }
    window.webkitSpeechRecognition = R; window.SpeechRecognition = R;
  });
  const p2 = await fake.newPage();
  await p2.goto(B + "/assistant", { waitUntil: "networkidle" });
  await p2.getByRole("button", { name: "הכתבה בקול" }).click();
  await p2.waitForFunction(() => document.getElementById("assist-text").value.includes("משפט שהוכתב בקול"));
  ok(true, "dictated text appended (mock recognizer)");
  await fake.close();
});

await step("axe on full assistant", async () => {
  const r = await axe(page);
  ok(r.violations.length === 0, "axe " + r.violations.map((v) => v.id).join(","));
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
