// בדיקות דפדפן לסבב ו': חיפוש מתקדם, ארון, מצב מהיר, יומן ותזכורות, שיתוף עריכה, ווטסאפ, מצגת, מדריך חדש.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const mk = async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  await c.addInitScript(() => { try { localStorage.setItem("scout.hero.seen", "1"); } catch {} });
  return c;
};
const ctx = await mk();
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const bodyText = (p = page) => p.locator("body").innerText();
const stamp = Date.now().toString().slice(-6);
const register = async (p, user, display) => {
  await p.goto(B + "/account", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /הרשמה/ }).first().click();
  await p.getByLabel("שם להצגה").fill(display);
  await p.getByLabel("שם משתמש").fill(user);
  await p.getByLabel("סיסמה", { exact: true }).fill("password99");
  await p.getByLabel("קוד הרשמה של השבט").fill(CODE);
  await p.getByLabel("קראתי ואני מאשר").check();
  await p.getByRole("button", { name: /הרשמה|יצירת חשבון/ }).last().click();
  await p.getByText("הפעולות שלי").first().waitFor({ timeout: 8000 });
};
const owner = "own" + stamp, partner = "par" + stamp;
await register(page, owner, "בעלת הפעולה");

await step("tools hub links", async () => {
  await page.goto(B + "/tools", { waitUntil: "networkidle" });
  for (const n of ["מצב מהיר", "מה יש בארון", "יומן ותזכורות", "מדריך חדש? מתחילים כאן"]) ok((await page.getByRole("link", { name: n }).count()) === 1, "hub: " + n);
});

await step("25. advanced filters + URL + saved search", async () => {
  await page.goto(B + "/library", { waitUntil: "networkidle" });
  await page.locator(".adv-filters summary").click();
  await page.getByLabel("תנועתית בלבד").check();
  await page.waitForFunction(() => location.search.includes("energetic=1"));
  ok(true, "URL reflects filter");
  const count = await page.locator(".count").innerText();
  ok(/נמצאו \d+ פעולות/.test(count), "count shown: " + count);
  await page.getByLabel("שם לחיפוש הנוכחי").fill("תנועתיות");
  await page.getByRole("button", { name: "שמירת החיפוש" }).click();
  await page.getByRole("button", { name: "תנועתיות", exact: true }).waitFor();
  await page.getByRole("button", { name: "ניקוי סינון" }).first().click();
  await page.waitForFunction(() => !location.search.includes("energetic"));
  await page.getByRole("button", { name: "תנועתיות", exact: true }).click();
  await page.waitForFunction(() => location.search.includes("energetic=1"));
  ok(true, "saved search re-applies");
  await page.goto(B + "/library?energetic=1&lightGear=1", { waitUntil: "networkidle" });
  ok(await page.getByLabel("תנועתית בלבד").isChecked(), "filters restored from URL");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe library " + r.violations.map((v) => v.id).join(","));
});

await step("26. cupboard", async () => {
  await page.goto(B + "/cupboard", { waitUntil: "networkidle" });
  await page.locator(".count").filter({ hasText: /נמצאו|אין פעולות/ }).waitFor();
  const before = await page.locator(".count").innerText();
  await page.getByRole("button", { name: "סימון הכול" }).click();
  await page.waitForTimeout(700);
  const after = await page.locator(".count").innerText();
  ok(/\d+|אין/.test(after), "results after ticking everything: " + after);
  await page.getByLabel("כמה מותר שיחסר").selectOption("2");
  await page.waitForTimeout(500);
  ok((await page.locator(".list > li").count()) >= 1, "activities listed");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe cupboard " + r.violations.map((v) => v.id).join(","));
  void before;
});

await step("27. quick mode", async () => {
  await page.goto(B + "/quick", { waitUntil: "networkidle" });
  await page.getByLabel("45 דקות").check();
  await page.getByRole("button", { name: "תנו לי פעולה עכשיו" }).click();
  await page.locator(".quick-main").waitFor();
  const first = await page.locator(".quick-main h2").innerText();
  ok(first.length > 2, "got a pick: " + first);
  ok((await page.locator(".reason-list li").count()) >= 2, "reasons shown");
  await page.getByRole("button", { name: "עוד אחת" }).click();
  await page.waitForFunction((t) => document.querySelector(".quick-main h2")?.textContent !== t, first);
  ok(true, "another one differs");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe quick " + r.violations.map((v) => v.id).join(","));
});

let actId = "";
await step("make an activity", async () => {
  await page.goto(B + "/values", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "יצירת פעולה בנושא מי סומך עליי (אחריות)" }).click();
  await page.waitForURL(/\/library\/\d+$/, { timeout: 15000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  actId = page.url().split("/").pop();
});

await step("28-29. schedule from activity, calendar, reminder", async () => {
  await page.getByRole("button", { name: "שיבוץ ביומן" }).click();
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA");
  await page.getByLabel("תאריך", { exact: true }).fill(tomorrow);
  await page.getByLabel("שעה (לא חובה)").fill("18:30");
  await page.getByLabel("קבוצה (לא חובה)").fill("ז' בנות");
  await page.getByLabel("תזכורת", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByText("הפעולה נוספה ליומן").waitFor();
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "תזכורות" }).waitFor();
  ok((await bodyText()).includes("מחר פעולה:"), "home reminder says tomorrow");
  await page.goto(B + "/calendar", { waitUntil: "networkidle" });
  await page.locator(".cal-event").first().waitFor();
  ok((await page.locator(".cal-event").first().innerText()).includes("18:30"), "event on calendar grid");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /הורדת היומן לטלפון/ }).click()]);
  ok(dl.suggestedFilename().endsWith(".ics"), "ics downloaded");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe calendar " + r.violations.map((v) => v.id).join(","));
  await page.locator(".cal-event").first().click();
  await page.getByRole("button", { name: "מחיקה" }).click();
  await page.getByText("האירוע נמחק מהיומן").waitFor();
  ok((await page.locator(".cal-event").count()) === 0, "event deleted");
  await page.getByRole("button", { name: "אירוע חדש" }).click();
  await page.getByLabel("שם האירוע, או חיפוש פעולה מהמאגר").fill("טיול שבט");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByText("הפעולה נוספה ליומן").waitFor();
  ok((await page.locator(".cal-event", { hasText: "טיול שבט" }).count()) === 1, "free-text event added");
});

await step("31. whatsapp", async () => {
  await page.goto(B + "/library/" + actId, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "שיתוף בוואטסאפ" }).click();
  await page.locator("#wa-text").waitFor();
  await page.waitForFunction(() => document.querySelector("#wa-text")?.value.length > 50);
  const staff = await page.locator("#wa-text").inputValue();
  ok(staff.startsWith("*"), "staff text begins with bold title");
  await page.getByLabel(/הודעה לחניכים/).check();
  await page.getByLabel("מקום (לא חובה)").fill("המועדון");
  await page.waitForFunction(() => document.querySelector("#wa-text")?.value.includes("המועדון"));
  ok((await page.locator("#wa-text").inputValue()).includes("נפגשים לפעולה"), "kids invite text");
  ok((await page.getByRole("link", { name: "פתיחה בוואטסאפ" }).getAttribute("href"))?.startsWith("https://wa.me/?text="), "wa.me link");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe whatsapp modal " + r.violations.map((v) => v.id).join(","));
  await page.keyboard.press("Escape");
});

await step("32. presentation mode", async () => {
  await page.goto(B + "/present/" + actId, { waitUntil: "networkidle" });
  await page.locator(".slide-on").waitFor();
  ok((await page.locator(".slide-on h1").count()) === 1, "title slide");
  await page.keyboard.press("ArrowLeft");
  ok((await page.locator(".slide-on h2").first().innerText()) === "פתיחה", "left arrow goes forward to the first stage");
  await page.keyboard.press("ArrowRight");
  ok((await page.locator(".slide-on h1").count()) === 1, "right arrow goes back");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
  ok((await page.locator(".slide-on h2").innerText()) === "מה לוקחים מכאן", "last slide");
  ok((await page.locator(".present-bar span[role=status]").innerText()).includes("7 מתוך 7"), "counter");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe present " + r.violations.map((v) => v.id).join(","));
  await page.emulateMedia({ media: "print" });
  ok((await page.locator(".slide:visible").count()) === 7, "all slides visible when printing");
  await page.emulateMedia({ media: "screen" });
});

await step("33. newbie mode", async () => {
  await page.goto(B + "/new", { waitUntil: "networkidle" });
  ok((await page.locator(".journey > li").count()) === 6, "six journey steps");
  await page.getByLabel("להפעיל מצב מדריך חדש").check();
  await page.locator(".journey input[type=checkbox]").first().check();
  await page.reload({ waitUntil: "networkidle" });
  ok(await page.locator(".journey input[type=checkbox]").first().isChecked(), "journey progress remembered");
  ok((await page.locator("#glossary dt").count()) >= 8, "glossary");
  await page.goto(B + "/library/" + actId, { waitUntil: "networkidle" });
  await page.locator("#newbie[open]").waitFor();
  await page.getByText("אם משהו משתבש").waitFor();
  ok((await page.locator(".newbie-steps li").count()) === 5, "five stage tips");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe activity page " + r.violations.map((v) => v.id).join(","));
  const r2 = await (async () => { await page.goto(B + "/new", { waitUntil: "networkidle" }); return axe(page); })();
  ok(r2.violations.length === 0, "axe /new " + r2.violations.map((v) => v.id).join(","));
});

await step("30. collaborators + conflict", async () => {
  const ctx2 = await mk();
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => console.log("PAGEERROR2", e.message));
  await register(p2, partner, "שותף לעריכה");
  await p2.goto(B + "/library/" + actId, { waitUntil: "networkidle" });
  ok((await p2.getByRole("button", { name: "עריכה", exact: true }).count()) === 0, "stranger cannot edit");
  await page.goto(B + "/library/" + actId, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /שותפים לעריכה/ }).click();
  await page.getByLabel("שם המשתמש של השותף").fill(partner);
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  await page.getByText("השותף נוסף").waitFor();
  await page.locator(`ul[aria-label="שותפים נוכחיים"] li`).first().waitFor();
  ok((await page.locator(`ul[aria-label="שותפים נוכחיים"] li`).count()) === 1, "partner listed");
  await page.keyboard.press("Escape");
  await p2.goto(B + "/library/" + actId, { waitUntil: "networkidle" });
  await p2.getByRole("button", { name: "עריכה", exact: true }).waitFor();
  ok((await p2.getByRole("button", { name: "מחיקה" }).count()) === 0, "partner cannot delete");
  // the partner opens the editor, then the owner saves, then the partner hits a conflict
  await p2.getByRole("button", { name: "עריכה", exact: true }).click();
  await page.getByRole("button", { name: "עריכה", exact: true }).click();
  await page.getByLabel("שם הפעולה").fill("שם מהבעלים " + stamp);
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByText("הפעולה נשמרה").waitFor();
  await p2.getByLabel("שם הפעולה").fill("שם מהשותף " + stamp);
  await p2.getByRole("button", { name: "שמירה", exact: true }).click();
  await p2.getByText(/שמר\/ה שינויים בפעולה אחרי שפתחתם/).waitFor();
  ok(true, "conflict shown to the partner");
  await p2.getByRole("button", { name: /שמירה בכל זאת/ }).click();
  await p2.getByText("הפעולה נשמרה").waitFor();
  ok((await p2.locator("h1").innerText()).includes("שם מהשותף"), "forced save wins");
  await ctx2.close();
});

await browser.close();
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
process.exit(fails ? 1 : 0);
