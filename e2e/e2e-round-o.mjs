// בדיקות דפדפן לחשבונות ואבטחה, סבב 101–112.
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
const USER = "wri" + stamp;
const PW = "Str0ng-e2e-pw-26";


const ctx = await mk();
const A = await ctx.newPage();
A.on("pageerror", (e) => console.log("PAGEERROR", e.message));
let docUrl = "";
const saved = (p) => p.getByText(/^נשמר \d/).first();
const txt = (p, n) => p.getByLabel("טקסט השלב " + n, { exact: true });

await step("register and open the writing page", async () => {
  await A.goto(B + "/account", { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "הרשמה", exact: true }).first().click();
  await A.getByLabel("שם להצגה").fill("כותב בדיקה");
  await A.getByLabel("שם משתמש").fill(USER);
  await A.getByLabel("סיסמה", { exact: true }).fill(PW);
  await A.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await A.getByLabel("קראתי ואני מאשר").check();
  await A.getByRole("button", { name: /^הרשמה$/ }).last().click();
  await A.getByRole("heading", { name: "פרטיות", exact: true }).waitFor({ timeout: 10000 });
  await A.goto(B + "/", { waitUntil: "networkidle" });
  await A.getByRole("link", { name: "פעולה חדשה משלי" }).first().click();
  await A.getByRole("heading", { name: "מתחילים פעולה חדשה" }).waitFor({ timeout: 8000 });
  await A.getByRole("button", { name: /להתחיל/ }).first().waitFor({ timeout: 8000 });
  ok((await A.getByRole("button", { name: /להתחיל/ }).count()) >= 4, "template cards shown");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe write list " + axeMsg(r));
});

await step("101+108. start from a template, 4 stages with times", async () => {
  await A.getByRole("button", { name: /להתחיל\s*:\s*פעולה קלאסית/ }).click();
  await A.getByRole("heading", { name: "עורך פעולה" }).waitFor({ timeout: 8000 });
  await A.getByRole("textbox", { name: "שם הפעולה" }).waitFor();
  ok((await A.locator(".write-block").count()) === 4, "four stages");
  await A.getByText(/השלבים מסתכמים ב-45 דקות, כמו המשך המתוכנן/).waitFor({ timeout: 5000 });
  docUrl = A.url();
  ok(/\/write\/\d+$/.test(docUrl), "document url " + docUrl);
  const r = await axe(A);
  ok(r.violations.length === 0, "axe editor " + axeMsg(r));
});

await step("103. autosave and reload", async () => {
  await A.getByRole("textbox", { name: "שם הפעולה" }).fill("אומץ בחיי היום יום");
  await txt(A, 1).fill("שלום חבר'ה, היום נדבר על אומץ.");
  await txt(A, 2).fill("הגוף של הפעולה: אומץ הוא לא היעדר פחד.");
  await A.getByText("יש שינויים, נשמרים בעוד רגע").waitFor({ timeout: 3000 }).catch(() => {});
  await saved(A).waitFor({ timeout: 8000 });
  await A.reload({ waitUntil: "networkidle" });
  await txt(A, 1).waitFor({ timeout: 8000 });
  ok((await txt(A, 1).inputValue()).includes("היום נדבר על אומץ"), "text persisted after reload");
  ok((await A.getByRole("textbox", { name: "שם הפעולה" }).inputValue()) === "אומץ בחיי היום יום", "title persisted");
});

await step("102. bold, list and table with preview", async () => {
  const t = txt(A, 3);
  await t.fill("רגע השיא");
  await t.selectText();
  await A.getByRole("toolbar", { name: "עיצוב טקסט בשלב 3" }).getByRole("button", { name: "מודגש" }).click();
  await A.waitForTimeout(200); // הסימון מוחזר בפריים הבא, ובדפדפן אמיתי אדם לא מקליד בתוך 16ms
  ok((await t.inputValue()) === "**רגע השיא**", "bold markup " + (await t.inputValue()));
  await t.press("End");
  await t.press("Enter");
  await A.getByRole("toolbar", { name: "עיצוב טקסט בשלב 3" }).getByRole("button", { name: "טבלה" }).click();
  await A.waitForTimeout(200);
  await A.getByRole("toolbar", { name: "עיצוב טקסט בשלב 3" }).getByRole("button", { name: "רשימה" }).click();
  await A.waitForTimeout(200);
  await A.getByRole("toolbar", { name: "עיצוב טקסט בשלב 3" }).getByRole("button", { name: "תצוגה מקדימה" }).click();
  const pv = A.getByRole("region", { name: "תצוגה מקדימה של שלב 3" });
  await pv.locator("strong", { hasText: "רגע השיא" }).waitFor({ timeout: 9000 }).catch(async (e) => {
    console.log("DEBUG block3:", (await A.locator(".write-block").nth(2).innerHTML()).replace(/\s+/g, " ").slice(-1500));
    throw e;
  });
  ok(true, "bold rendered");
  ok((await pv.locator("table").count()) === 1 || (await pv.locator("ul").count()) >= 1, "table or list rendered in preview");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe preview " + axeMsg(r));
  await A.getByRole("toolbar", { name: "עיצוב טקסט בשלב 3" }).getByRole("button", { name: "חזרה לכתיבה" }).click();
  ok((await A.evaluate(() => document.querySelector(".write").innerHTML.includes("<script"))) === false, "no raw html in the editor");
});

await step("109. reorder with buttons and by dragging", async () => {
  const title = (n) => A.locator(".write-block").nth(n - 1).getByRole("textbox", { name: "כותרת השלב" });
  ok((await title(1).inputValue()) === "פתיחה", "first is open");
  await A.locator(".write-block").nth(0).getByRole("button", { name: /הזזה למטה/ }).click();
  ok((await title(2).inputValue()) === "פתיחה", "moved down by button");
  await A.locator(".write-block").nth(1).getByRole("button", { name: /הזזה למעלה/ }).click();
  ok((await title(1).inputValue()) === "פתיחה", "moved back up");
  await A.getByRole("button", { name: "הסתרת מה חסר" }).click();
  await A.setViewportSize({ width: 1280, height: 4400 });
  await A.evaluate(() => window.scrollTo(0, 0));
  await A.waitForTimeout(300);
  const hb = await A.locator(".write-block").nth(0).locator(".write-handle").boundingBox();
  const tb = await A.locator(".write-block").nth(2).boundingBox();
  await A.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await A.mouse.down();
  await A.mouse.move(hb.x + 5, hb.y + 40, { steps: 5 });
  await A.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 15 });
  await A.mouse.up();
  await A.waitForTimeout(500);
  ok((await title(3).inputValue()) === "פתיחה", "moved by drag " + (await title(3).inputValue()));
  await A.getByRole("button", { name: "ביטול", exact: true }).first().click();
  ok((await title(1).inputValue()) === "פתיחה", "undo restored the order");
  await A.setViewportSize({ width: 1280, height: 1000 });
});

await step("107. total minutes versus plan", async () => {
  await A.locator(".write-block").nth(0).getByRole("spinbutton", { name: "דקות" }).fill("20");
  await A.getByText(/חורגים ב-15 דקות/).waitFor({ timeout: 4000 });
  ok(true, "over-plan message");
  await A.getByRole("button", { name: /לקבוע את המשך המתוכנן ל-60 דקות/ }).click();
  await A.getByText(/כמו המשך המתוכנן/).waitFor({ timeout: 4000 });
  ok(true, "plan matched");
  ok(/מילים · זמן הקראה/.test(await A.locator(".write-bar").innerText()), "word count and reading time");
});

await step("110. find and replace, one undo step", async () => {
  await A.getByRole("button", { name: "חיפוש והחלפה" }).click();
  await A.getByLabel("חיפוש", { exact: true }).fill("אומץ");
  await A.getByText("נמצאו 2 מופעים").waitFor({ timeout: 4000 });
  await A.getByRole("button", { name: "הבא", exact: true }).click();
  await A.getByLabel("החלפה ב", { exact: true }).fill("חוסן");
  await A.getByRole("button", { name: "החלפת הכול" }).click();
  await A.getByText(/הוחלפו \d+ מופעים/).waitFor({ timeout: 4000 });
  ok(!(await txt(A, 2).inputValue()).includes("אומץ") && (await txt(A, 2).inputValue()).includes("חוסן"), "replaced in stage text");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe find panel " + axeMsg(r));
  await A.getByRole("button", { name: "ביטול", exact: true }).first().click();
  ok((await txt(A, 2).inputValue()).includes("אומץ"), "one undo reverts replace all");
  await A.getByRole("button", { name: "שחזור", exact: true }).first().click();
  ok((await txt(A, 2).inputValue()).includes("חוסן"), "redo applies it again");
});

await step("112. Ctrl+Z inside a text box", async () => {
  const t = txt(A, 4);
  await t.click();
  await t.fill("");
  await A.waitForTimeout(1200);
  await t.pressSequentially("סיכום קצר", { delay: 20 });
  ok((await t.inputValue()) === "סיכום קצר", "typed");
  await t.press("Control+z");
  ok((await t.inputValue()) === "", "ctrl+z undid the whole typing burst: " + JSON.stringify(await t.inputValue()));
  await t.press("Control+y");
  ok((await t.inputValue()) === "סיכום קצר", "ctrl+y redo");
});

await step("104. full screen mode", async () => {
  await txt(A, 2).click();
  await A.getByRole("button", { name: "מסך מלא לשלב הנוכחי" }).click();
  const d = A.getByRole("dialog", { name: "מצב כתיבה במסך מלא" });
  await d.waitFor();
  await d.getByLabel("טקסט השלב").fill("נוסח חדש במסך מלא");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe focus mode " + axeMsg(r));
  await A.keyboard.press("Escape");
  await d.waitFor({ state: "detached" });
  ok((await txt(A, 2).inputValue()) === "נוסח חדש במסך מלא", "text from full screen is in the stage");
});

await step("105. private margin note stays out of the text", async () => {
  await A.locator(".write-block").nth(1).locator("summary").click();
  await A.getByLabel("הערה אישית לשלב 2").fill("להביא חבל ארוך, סוד שלי");
  await A.getByText(/הערה לעצמי \(יש הערה\)/).first().waitFor({ timeout: 3000 });
  await saved(A).waitFor({ timeout: 8000 });
});

await step("112. versions: save point, view, restore", async () => {
  await A.getByRole("button", { name: "גרסאות", exact: true }).click();
  const m = A.locator("dialog[open]");
  await m.getByLabel("שם לנקודת שמירה").fill("לפני הסיכום");
  await m.getByRole("button", { name: "יצירת נקודת שמירה עכשיו" }).click();
  await m.getByText(/לפני הסיכום/).first().waitFor({ timeout: 6000 });
  ok(true, "save point listed");
  await m.getByRole("button", { name: /צפייה/ }).first().click();
  await m.getByRole("region", { name: "תוכן הגרסה" }).waitFor();
  const r = await axe(A);
  ok(r.violations.length === 0, "axe versions " + axeMsg(r));
  const t = await m.getByRole("region", { name: "תוכן הגרסה" }).innerText();
  ok(!t.includes("סוד שלי"), "private note is not in version preview");
  A.once("dialog", (d) => d.accept());
  await m.getByRole("button", { name: "שחזור הגרסה הזו" }).click();
  await A.getByText("הגרסה שוחזרה").waitFor({ timeout: 6000 });
  ok(true, "restored");
});

await step("103. conflict when the same document is edited elsewhere", async () => {
  const B2 = await (await ctx.browser().newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" })).newPage();
  // כניסה לאותו משתמש בלשונית אחרת, דרך אותו אסימון
  const tok = await A.evaluate(() => { for (const k of Object.keys(localStorage)) { if (/token|auth|session/i.test(k)) return [k, localStorage.getItem(k)]; } return null; });
  ok(!!tok, "found session storage key");
  await B2.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("scout.hero.seen", "1"); }, tok);
  await B2.goto(docUrl, { waitUntil: "networkidle" });
  await txt(B2, 1).waitFor({ timeout: 8000 });
  await txt(B2, 1).fill("נוסח מהלשונית השנייה");
  await saved(B2).waitFor({ timeout: 8000 });
  await txt(A, 1).fill("נוסח מהלשונית הראשונה");
  await A.getByRole("alert").filter({ hasText: "עודכן בלשונית או במכשיר אחר" }).waitFor({ timeout: 8000 });
  ok(true, "conflict banner shown, nothing overwritten");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe conflict " + axeMsg(r));
  await A.getByRole("button", { name: /לטעון את הנוסח העדכני/ }).click();
  ok((await txt(A, 1).inputValue()) === "נוסח מהלשונית השנייה", "loaded newest");
  await B2.close();
});

await step("send to the writing assistant without the private note", async () => {
  await A.getByRole("button", { name: "בדיקה בעוזר הכתיבה" }).click();
  await A.waitForURL(/\/assistant$/, { timeout: 8000 });
  const v = await A.locator("textarea.assist-textarea").inputValue();
  await A.waitForTimeout(800);
  const v2 = await A.locator("textarea.assist-textarea").inputValue();
  ok(v2.includes("נוסח מהלשונית השנייה"), "text arrived in the assistant: " + JSON.stringify(v2.slice(0, 200)));
  ok(!v.includes("סוד שלי"), "private note not sent");
});

await step("list: duplicate and delete, mobile axe", async () => {
  await A.setViewportSize({ width: 390, height: 800 });
  await A.goto(B + "/write", { waitUntil: "networkidle" });
  await A.getByRole("heading", { name: "המסמכים שלי" }).waitFor();
  const n = await A.locator("section[aria-labelledby=w-mine] li").count();
  await A.getByRole("button", { name: /שכפול/ }).first().click();
  await A.waitForFunction((c) => document.querySelectorAll("section[aria-labelledby=w-mine] li").length === c + 1, n, { timeout: 6000 });
  ok(true, "duplicated");
  const r = await axe(A);
  ok(r.violations.length === 0, "axe list mobile " + axeMsg(r));
  A.once("dialog", (d) => d.accept());
  await A.getByRole("button", { name: /מחיקה\s*:.*\(עותק\)/ }).first().click();
  await A.waitForFunction((c) => document.querySelectorAll("section[aria-labelledby=w-mine] li").length === c, n, { timeout: 6000 });
  ok(true, "deleted the copy");
  await A.getByRole("link", { name: /פתיחה\s*:\s*אומץ בחיי היום יום/ }).first().click();
  await A.getByRole("textbox", { name: "שם הפעולה" }).waitFor({ timeout: 8000 });
  const r2 = await axe(A);
  ok(r2.violations.length === 0, "axe editor mobile " + axeMsg(r2));
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
