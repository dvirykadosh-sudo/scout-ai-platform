// בדיקות דפדפן לעוזר הכתיבה, סבב 61–70.
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
const DRAFT = "פעולה על אלימות\nהמטרה: שהחניכים יבינו שאלימות מתחילה במילים\nציוד: דפים וכדור\nבטיחות: גבולות גזרה ברורים\nפתיחה: מתכנסים במעגל, וכל אחד אומר מילה אחת. 5 דקות\nמשחק: מחלקים לקבוצות ועושים מירוץ תחנות. 15 דקות\nדיון: מה הרגשתם כשהיה קשה? 10 דקות\nסיכום: כל אחד אומר משפט אחד. 5 דקות";

await page.goto(B + "/assistant", { waitUntil: "networkidle" });

await step("65. templates: pick, fill topic and value", async () => {
  await page.getByRole("button", { name: "תבניות", exact: true }).click();
  await dlg.getByRole("heading", { name: "תבניות להתחלה" }).waitFor();
  await dlg.getByLabel(/פעולה תנועתית/).check();
  await dlg.getByLabel("נושא הפעולה (לא חובה)").fill("אחריות");
  await dlg.getByLabel("הערך כמשפט (לא חובה)").fill("אחריות היא בחירה");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe templates dialog " + axeMsg(r));
  await dlg.getByRole("button", { name: "שימוש בתבנית" }).click();
  await dlg.waitFor({ state: "detached" });
  const v = await box.inputValue();
  ok(v.includes("תנועה סביב אחריות") && v.includes("שאחריות היא בחירה"), "template loaded and filled");
  await side.getByText(/נשארו למלא/).waitFor();
  ok(true, "placeholders listed in side panel");
});

await step("62+61. balance and method swap", async () => {
  await box.fill(DRAFT);
  await side.getByText("איזון:").waitFor();
  ok((await side.innerText()).includes("של עשייה"), "balance shown");
  await side.getByRole("button", { name: /^החלפה\s*:\s*משחק תחרות/ }).click();
  await dlg.getByRole("heading", { name: /החלפת השיטה/ }).waitFor();
  await dlg.getByText("חשיבה משותפת").first().waitFor();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe swap dialog " + axeMsg(r));
  await dlg.getByRole("button", { name: /^החלפת המשפט\s*:\s*משחק הדמייה/ }).click();
  await dlg.waitFor({ state: "detached" });
  const v = await box.inputValue();
  ok(v.includes("מדמים מצב אמיתי") && !v.includes("מירוץ תחנות"), "sentence replaced");
  await page.getByRole("button", { name: "ביטול השינוי האחרון" }).click();
  ok((await box.inputValue()).includes("מירוץ תחנות"), "undo restores");
});

await step("63. inspiration from the library", async () => {
  await page.getByRole("button", { name: "השראה מהמאגר" }).click();
  await dlg.getByRole("heading", { name: "השראה מהמאגר" }).waitFor();
  await dlg.getByLabel("לאיזה שלב מחפשים רעיון").selectOption("1");
  await dlg.getByText("אלימות בקרב בני נוער").first().waitFor();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe inspire dialog " + axeMsg(r));
  await dlg.getByRole("button", { name: /^הוספה לטיוטה\s*:\s*אלימות בקרב בני נוער/ }).click();
  await dlg.waitFor({ state: "detached" });
  ok((await box.inputValue()).split("משחק:").length >= 3, "excerpt appended with stage header");
  await box.fill(DRAFT);
});

await step("66. gear vs cupboard", async () => {
  await page.evaluate(() => localStorage.setItem("scout.cupboard", JSON.stringify({ have: ["paper"], extra: "" })));
  await page.getByRole("button", { name: "ציוד מול הארון" }).click();
  await dlg.getByRole("heading", { name: "ציוד מול הארון" }).waitFor();
  await dlg.getByText("צריך להשיג").waitFor();
  ok((await dlg.innerText()).includes("דפים וכדור"), "missing item flagged");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe gear dialog " + axeMsg(r));
  await dlg.getByRole("button", { name: "עדכון שורת הציוד בטיוטה" }).click();
  await dlg.waitFor({ state: "detached" });
  ok(/ציוד: דפים/.test(await box.inputValue()), "equipment line updated");
});

await step("68. script: dialog and PDF only contains the script", async () => {
  await page.getByRole("button", { name: "תסריט למדריך" }).click();
  await dlg.getByRole("heading", { name: "תסריט למדריך" }).waitFor();
  await dlg.getByText(/דקה 0 עד 5/).waitFor();
  ok((await dlg.getByText("אומרים:").count()) >= 3, "say/do/ask sections");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe script dialog " + axeMsg(r));
  await page.evaluate(() => document.body.classList.add("printing-script"));
  const f = "/tmp/script-k.pdf";
  fs.writeFileSync(f, await page.pdf({ format: "A4", printBackground: true }));
  const out = execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf-8" });
  ok(out.includes("תסריט") && out.includes("מעבר"), "script text in PDF");
  ok(!out.includes("שיטות:"), "document layout not printed with the script");
  await page.evaluate(() => document.body.classList.remove("printing-script"));
  await dlg.locator("button.btn", { hasText: "סגירה" }).click();
});

await step("70. group profile check", async () => {
  await page.getByRole("button", { name: /הקבוצה שלי/ }).click();
  await dlg.getByRole("heading", { name: "הקבוצה שלי" }).first().waitFor();
  await dlg.getByLabel("שם הקבוצה").fill("שכבה ז׳");
  await dlg.getByLabel("כמה חניכים מגיעים בדרך כלל").fill("28");
  await dlg.getByLabel("ביישנית, קשה לה לדבר במליאה").check();
  await dlg.getByLabel("מדברת הרבה וקשה לעצור").check();
  const r = await axe(page);
  ok(r.violations.length === 0, "axe group dialog " + axeMsg(r));
  await dlg.getByRole("button", { name: "בדיקה מול הפרופיל" }).click();
  await dlg.waitFor({ state: "detached" });
  await side.getByRole("heading", { name: /בדיקה מול הקבוצה: שכבה ז׳/ }).waitFor();
  ok((await side.innerText()).includes("בזוגות"), "shy tip shown");
  await page.reload({ waitUntil: "networkidle" });
  ok((await page.getByRole("button", { name: /הקבוצה שלי: שכבה ז׳/ }).count()) === 1, "profile persisted on this device");
  await box.fill(DRAFT);
});

// ───── מכאן נדרשת התחברות ─────
await page.goto(B + "/account", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /הרשמה/ }).first().click();
await page.getByLabel("שם להצגה").fill("כותבת ק");
await page.getByLabel("שם משתמש").fill("kown" + stamp);
await page.getByLabel("סיסמה", { exact: true }).fill("password99");
await page.getByLabel("קוד הרשמה של השבט").fill(CODE);
await page.getByLabel("קראתי ואני מאשר").check();
await page.getByRole("button", { name: /הרשמה|יצירת חשבון/ }).last().click();
await page.getByText("הפעולות שלי").first().waitFor({ timeout: 8000 });
await page.goto(B + "/assistant", { waitUntil: "networkidle" });
await box.fill(DRAFT);

await step("67. add to calendar", async () => {
  await page.getByRole("button", { name: "הוספה ליומן" }).click();
  await dlg.getByRole("heading", { name: "הוספה ליומן" }).waitFor();
  await dlg.getByLabel("תאריך").fill("2031-03-04");
  await dlg.getByLabel("שעה").fill("17:45");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe schedule dialog " + axeMsg(r));
  await dlg.getByRole("button", { name: "הוספה ליומן" }).click();
  await dlg.getByText(/נוספה ליומן/).waitFor();
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("scout.session")).token);
  const cal = await (await fetch(B + "/api/me/schedule", { headers: { authorization: "Bearer " + token } })).json();
  ok(cal.some((x) => x.title === "פעולה על אלימות" && x.date === "2031-03-04" && x.time === "17:45"), "event in calendar API");
  await dlg.locator("button.btn", { hasText: "סגירה" }).click();
});

let link = "";
await step("64. cloud save + share link + guest comment + resolve", async () => {
  await page.getByRole("button", { name: /שיתוף לתגובות/ }).click();
  await dlg.getByRole("heading", { name: "שיתוף לתגובות" }).waitFor();
  await dlg.getByRole("button", { name: "שמירת הטיוטה בענן" }).click();
  await dlg.getByRole("button", { name: "יצירת קישור לשיתוף" }).click();
  await dlg.getByLabel(/קישור לשיתוף/).waitFor();
  link = await dlg.getByLabel(/קישור לשיתוף/).inputValue();
  ok(/\/assistant\/shared\?t=[\w-]{20,}$/.test(link), "share link shape " + link);
  const r = await axe(page);
  ok(r.violations.length === 0, "axe share dialog " + axeMsg(r));
  const g = await mk();
  const gp = await g.newPage();
  gp.on("pageerror", (e) => console.log("PAGEERROR guest", e.message));
  await gp.goto(link, { waitUntil: "networkidle" });
  await gp.getByRole("heading", { name: "פעולה על אלימות" }).waitFor();
  ok((await gp.locator(".assist-shared-text").innerText()).includes("מירוץ תחנות"), "guest sees draft text");
  ok((await gp.locator("textarea#assist-text").count()) === 0, "guest cannot edit");
  await gp.getByLabel("השם שלכם").fill("גל");
  await gp.getByLabel("התגובה").fill("אולי לקצר את הפתיחה?");
  const rg = await axe(gp);
  ok(rg.violations.length === 0, "axe shared page " + axeMsg(rg));
  await gp.getByRole("button", { name: "שליחת תגובה" }).click();
  await gp.getByText("אולי לקצר את הפתיחה?").last().waitFor();
  ok(true, "guest comment posted");
  await g.close();
  await dlg.getByRole("button", { name: "רענון תגובות" }).click();
  await dlg.getByText("אולי לקצר את הפתיחה?").waitFor();
  await dlg.getByRole("button", { name: /סימון כטופל/ }).click();
  await dlg.getByText("טופל").first().waitFor();
  ok(true, "owner resolved comment");
  await dlg.getByRole("button", { name: "ביטול השיתוף" }).click();
  await dlg.getByRole("button", { name: "יצירת קישור לשיתוף" }).waitFor();
  const g2 = await mk();
  const gp2 = await g2.newPage();
  await gp2.goto(link, { waitUntil: "networkidle" });
  await gp2.getByText(/השיתוף בוטל|הקישור לא פעיל/).first().waitFor();
  ok(true, "revoked link no longer works");
  await g2.close();
  await dlg.locator("button.btn", { hasText: "סגירה" }).click();
});

await step("69. after the activity: parse and save", async () => {
  await page.getByRole("button", { name: "אחרי הפעולה" }).click();
  await dlg.getByRole("heading", { name: "אחרי הפעולה" }).waitFor();
  await dlg.getByLabel("הערות אחרי הפעולה").fill("המשחק לקח יותר זמן ממה שתכננתי. החניכים אהבו את התחנות. בפעם הבאה לקצר את הפתיחה.");
  await dlg.getByRole("button", { name: "סידור ההערות" }).click();
  await dlg.getByRole("heading", { name: "מה עבד" }).waitFor();
  ok((await dlg.innerText()).includes("הזמן לא הספיק"), "draft tip about timing");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe reflect dialog " + axeMsg(r));
  await dlg.getByRole("button", { name: "שמירה", exact: true }).click();
  await dlg.getByText(/^נשמר/).waitFor();
  ok(true, "reflection saved");
  await dlg.locator("button.btn", { hasText: "סגירה" }).click();
});

await step("opening a cloud draft by link param", async () => {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("scout.session")).token);
  const list = await (await fetch(B + "/api/assist/drafts", { headers: { authorization: "Bearer " + token } })).json();
  await page.goto(B + "/assistant?draft=" + list[0].id, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("assist-text").value.includes("פעולה על אלימות"), null, { timeout: 8000 });
  ok(true, "draft loaded from ?draft=");
});

await step("axe on full assistant", async () => {
  const r = await axe(page);
  ok(r.violations.length === 0, "axe " + axeMsg(r));
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
