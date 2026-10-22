// בדיקות דפדפן לעוזר הכתיבה, סבב 71–80.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const mk = async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", permissions: ["clipboard-read", "clipboard-write"] });
  await c.addInitScript(() => { try { localStorage.setItem("scout.hero.seen", "1"); } catch {} });
  return c;
};
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 10).join(" | ")); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const stamp = Date.now().toString().slice(-6);

const ctx = await mk();
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const box = page.getByLabel("טיוטת הפעולה", { exact: true });
const side = page.locator(".assist-side");
const dlg = page.locator("dialog[open]");
const DRAFT0 = "פעולה על אלימות\nהמטרה: שהחניכים יבינו שאלימות מתחילה במילים\nציוד: דפים וכדור\nבטיחות: גבולות גזרה ברורים\nפתיחה: מתכנסים במעגל, וכל אחד אומר מילה אחת. 5 דקות\nמשחק: מחלקים לקבוצות ועושים מירוץ תחנות. 15 דקות\nדיון: מה הרגשתם כשהיה קשה? 10 דקות\nסיכום: כל אחד אומר משפט אחד. 5 דקות";


const DRAFT = DRAFT0 + "\nהתאמה: מי שלא רץ הולך או שופט";
const DRAFT_BAD = "פעולה על חברות\nהמטרה: שהחניכים יבינו שחברות היא בחירה\nפתיחה: בנים נגד בנות במירוץ, מי שנפסל יושב בצד. 10 דקות\nמשחק: כל אחד קורא בקול. 15 דקות\nסיכום: מסכמים. 5 דקות";
const STATIONS = "פעולה על תחנות\nפתיחה: מעגל. 5 דקות\nמשחק: סבב תחנות. 15 דקות\nתחנה 1: בונים גשר מעיתונים\nתחנה 2: חידות קבוצתיות\nתחנה 3: מרכיבים סיפור. 15 דקות\nסיכום: משפט אחד. 5 דקות";

await page.goto(B + "/assistant", { waitUntil: "networkidle" });
await box.fill(DRAFT_BAD);
await side.getByText(/מוכנות להפעלה/).waitFor();

await step("72. readiness in side panel", async () => {
  const t = await side.innerText();
  ok(/מוכנות להפעלה: \d+\/100/.test(t), "readiness score shown");
});

await step("73. inclusion check", async () => {
  await page.getByRole("button", { name: "בדיקת הכלה" }).click();
  await dlg.getByRole("heading", { name: "בדיקת הכלה" }).waitFor();
  await dlg.getByText("התאמה", { exact: false }).first().waitFor();
  const n = await dlg.getByRole("button", { name: /הוספת התאמה/ }).count();
  ok(n >= 2, "flags found: " + n);
  const r = await axe(page);
  ok(r.violations.length === 0, "axe inclusion " + axeMsg(r));
  await dlg.getByRole("button", { name: /הוספת התאמה/ }).first().click();
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
  ok((await box.inputValue()).includes("התאמה:"), "adjustment line appended");
});

await step("71. style (anonymous shows login hint)", async () => {
  await box.fill(DRAFT.repeat(1));
  await page.getByRole("button", { name: "למידת הסגנון שלי" }).click();
  await dlg.getByRole("heading", { name: "הסגנון שלי" }).waitFor();
  await dlg.getByText("מה יישמר").waitFor();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe style " + axeMsg(r));
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
});

await step("74. parents pack", async () => {
  await page.getByRole("button", { name: "הודעות להורים וצוות" }).click();
  await dlg.getByLabel("מקום (לא חובה)").fill("מועדון השבט");
  await dlg.getByRole("button", { name: "יצירת ההודעות" }).click();
  await dlg.getByRole("heading", { name: "הודעה לחניכים" }).waitFor();
  ok((await dlg.innerText()).includes("מועדון השבט"), "place in messages");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe parents " + axeMsg(r));
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
});

await step("79. station cards + print pdf", async () => {
  await box.fill(STATIONS);
  await page.getByRole("button", { name: "כרטיסי תחנות" }).click();
  await dlg.getByText(/מצאתי בטיוטה 3 תחנות/).waitFor();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe stations " + axeMsg(r));
  await page.evaluate(() => document.body.classList.add("printing-cards"));
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "/tmp/cards.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => document.body.classList.remove("printing-cards"));
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
  const t = execFileSync("pdftotext", ["/tmp/cards.pdf", "-"]).toString();
  ok(t.includes("גשר") && t.includes("חידות"), "cards pdf has station text");
});

// ───── מכאן נדרשת התחברות ─────
await page.goto(B + "/account", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /הרשמה/ }).first().click();
await page.getByLabel("שם להצגה").fill("כותבת ל");
await page.getByLabel("שם משתמש").fill("lown" + stamp);
await page.getByLabel("סיסמה", { exact: true }).fill("password99");
await page.getByLabel("קוד הרשמה של השבט").fill(CODE);
await page.getByLabel("קראתי ואני מאשר").check();
await page.getByRole("button", { name: /הרשמה|יצירת חשבון/ }).last().click();
await page.getByText("הפעולות שלי").first().waitFor({ timeout: 8000 });
await page.goto(B + "/assistant", { waitUntil: "networkidle" });
await box.fill(DRAFT);

await step("71. save style", async () => {
  await page.getByRole("button", { name: "למידת הסגנון שלי" }).click();
  await dlg.getByText("מה יישמר").waitFor();
  await dlg.getByRole("button", { name: "שמירה כסגנון שלי" }).click();
  await dlg.getByRole("button", { name: "נשמר" }).waitFor();
  ok(true, "style saved");
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
});

await step("75. cloud draft + history + restore", async () => {
  await page.getByRole("button", { name: /שיתוף לתגובות/ }).click();
  await dlg.getByRole("button", { name: /שמירה בענן|שמירת הטיוטה|שמירה/ }).first().click();
  await page.getByRole("button", { name: /שיתוף לתגובות \(שמור בענן\)/ }).waitFor({ timeout: 8000 });
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
  await box.fill(DRAFT + "\nשורה חדשה לגרסה");
  await page.getByRole("button", { name: /שיתוף לתגובות/ }).click();
  await dlg.getByRole("button", { name: /עדכון|שמירה/ }).first().click();
  await page.waitForTimeout(800);
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
  await page.getByRole("button", { name: "היסטוריית גרסאות" }).click();
  await dlg.getByRole("button", { name: /^שחזור/ }).first().waitFor({ timeout: 8000 });
  const r = await axe(page);
  ok(r.violations.length === 0, "axe history " + axeMsg(r));
  page.once("dialog", (d) => d.accept());
  await dlg.getByRole("button", { name: /^שחזור/ }).first().click();
  await dlg.waitFor({ state: "detached" });
  ok(!(await box.inputValue()).includes("שורה חדשה לגרסה"), "restored previous version");
});

await step("76. add to board + board page", async () => {
  await page.getByRole("button", { name: "הוספה ללוח תכנון" }).click();
  await dlg.getByLabel("שם הפעולה").fill("פעולת אלימות");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe board-add " + axeMsg(r));
  await dlg.getByRole("button", { name: "הוספה ללוח" }).click();
  await dlg.getByRole("link", { name: "לפתיחת הלוח" }).click();
  await page.getByRole("heading", { name: "לוח תכנון שנתי" }).waitFor();
  await page.getByRole("button", { name: /פעולת אלימות/ }).waitFor({ timeout: 8000 });
  const r2 = await axe(page);
  ok(r2.violations.length === 0, "axe board page " + axeMsg(r2));
  await page.getByRole("button", { name: /פעולת אלימות/ }).click();
  await dlg.getByLabel("מצב").selectOption("done");
  await dlg.getByRole("button", { name: "שמירה" }).click();
  await dlg.waitFor({ state: "detached" });
  await page.getByRole("button", { name: /הופעלה/ }).waitFor();
  ok(true, "cell status changed");
});

await page.goto(B + "/assistant", { waitUntil: "networkidle" });
await box.fill(DRAFT);

await step("80. growth path", async () => {
  await page.getByRole("button", { name: "המסלול שלי כמדריך" }).click();
  await dlg.getByText(/נקודות/).first().waitFor();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe growth " + axeMsg(r));
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
});

await step("78. booklet download", async () => {
  await page.getByRole("button", { name: /חוברת פעולות/ }).click();
  await dlg.getByLabel(/פעולת אלימות|פעולה על אלימות/).first().check();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe booklet " + axeMsg(r));
  const [dl] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: /הורדת חוברת Word/ }).click()]);
  await dl.saveAs("/tmp/booklet.docx");
  ok(fs.statSync("/tmp/booklet.docx").size > 4000, "docx downloaded");
  await dlg.getByRole("button", { name: "סגירה" }).last().click();
});

await step("77. designed pdf", async () => {
  await box.fill(DRAFT);
  await side.getByText(/מוכנות להפעלה/).waitFor();
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole("button", { name: /PDF מעוצב/ }).click();
  await page.waitForFunction(() => document.body.classList.contains("printing-designed"));
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "/tmp/designed.pdf", format: "A4", });
  await page.emulateMedia({ media: "screen" });
  const t = execFileSync("pdftotext", ["/tmp/designed.pdf", "-"]).toString().replace(/[\u202a-\u202e\u200e\u200f]/g, "");
  ok(t.includes("שבט מעוז") && t.includes("סיכום במבט אחד"), "cover and summary text");
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", ["/tmp/designed.pdf"]).toString())?.[1]);
  ok(pages >= 2, "cover page separate: " + pages + " pages");
  const imgs = execFileSync("pdfimages", ["-list", "/tmp/designed.pdf"]).toString().split("\n").filter((l) => /image/.test(l)).length;
  ok(imgs >= 2, "QR + logo images: " + imgs);
  ok(/עמוד\s*\d/.test(t) || /\d\s*עמוד/.test(t), "page numbers in text");
});

await step("axe on full assistant", async () => {
  await page.evaluate(() => document.body.classList.remove("printing-designed"));
  const r = await axe(page);
  ok(r.violations.length === 0, "axe " + axeMsg(r));
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
