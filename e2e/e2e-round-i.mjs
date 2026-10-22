// בדיקות דפדפן לעוזר הכתיבה האישי ולהדפסה עם לוגו קבוע.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const B = process.env.BASE_URL || "http://localhost:5055";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
await ctx.addInitScript(() => { try { localStorage.setItem("scout.hero.seen", "1"); } catch {} });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } };
const axe = (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const box = page.getByLabel("טיוטת הפעולה");

await step("assistant page empty state + nav", async () => {
  await page.goto(B + "/assistant", { waitUntil: "networkidle" });
  ok((await page.getByRole("link", { name: "עוזר כתיבה" }).count()) >= 1, "nav link");
  await page.getByText(/כשתתחילו לכתוב/).waitFor();
  ok(await page.getByRole("button", { name: "ייצוא ל-PDF" }).isDisabled(), "export disabled when empty");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe empty " + r.violations.map((v) => v.id).join(","));
});

await step("stuck button on empty draft inserts a starter", async () => {
  await page.getByRole("button", { name: "אני תקוע/ה, עזרה" }).click();
  await page.getByRole("heading", { name: "עזרה להמשך" }).waitFor();
  await page.getByRole("button", { name: /הוספה לטקסט/ }).first().click();
  ok((await box.inputValue()).length > 10, "starter inserted into textarea");
  await page.getByRole("button", { name: "ניקוי" }).click().catch(() => {});
});

await step("live analysis organizes the draft", async () => {
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "ניקוי" }).click().catch(() => {});
  await box.fill("פעולה על אחריות\nהמטרה: שהחניכים יבינו שאחריות היא בחירה\nציוד: דפים וטושים\n\nפתיחה: מתכנסים במעגל וכל אחד אומר מילה אחת על אחריות. 5 דקות\n\nמשחק: מחלקים לקבוצות ועושים מירוץ תחנות. 20 דקות");
  const side = page.locator(".assist-side");
  await side.getByText("פעולה על אחריות", { exact: true }).waitFor();
  await side.getByText("שיטות שזיהיתי").waitFor();
  const t = await side.innerText();
  ok(t.includes("משחק תחרות"), "method detected");
  ok(t.includes("25 דקות") || t.includes("25"), "minutes summed");
  ok(await page.getByRole("progressbar").isVisible(), "progress bar");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe with analysis " + r.violations.map((v) => v.id).join(","));
});

await step("stuck button suggests the next missing stage", async () => {
  await page.getByRole("button", { name: "אני תקוע/ה, עזרה" }).click();
  await page.getByText(/זמן צופיות מעשי/).first().waitFor();
  const before = (await box.inputValue()).length;
  await page.getByRole("button", { name: /הוספה לטקסט/ }).first().click();
  ok((await box.inputValue()).length > before + 20, "suggestion appended");
});

await step("draft survives reload", async () => {
  await page.waitForTimeout(700);
  await page.reload({ waitUntil: "networkidle" });
  ok((await box.inputValue()).includes("פעולה על אחריות"), "draft restored from localStorage");
});

await step("save to library as draft", async () => {
  await page.getByRole("button", { name: "שמירה במאגר" }).click();
  await page.getByText(/הפעולה תישמר כטיוטה/).waitFor();
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByRole("link", { name: "לפתיחת הפעולה" }).waitFor();
  await page.getByRole("link", { name: "לפתיחת הפעולה" }).click();
  await page.getByRole("heading", { name: "פעולה על אחריות" }).waitFor();
  ok(true, "saved activity opens");
});

await step("PDF has the fixed logo on every page", async () => {
  await page.goto(B + "/assistant", { waitUntil: "networkidle" });
  const long = Array.from({ length: 12 }, (_, i) => `משפט מספר ${i + 1} שמסביר מה עושים עם הקבוצה ואיך מחלקים תפקידים כך שכולם משתתפים ולא נשאר אף אחד בצד.`).join(" ");
  await box.fill(`פעולה ארוכה\nפתיחה: ${long} ${long}\nמשחק: ${long} ${long} ${long}\nדיון: מה הרגשתם? ${long}\nסיכום: ${long}`);
  await page.locator(".assist-title", { hasText: "פעולה ארוכה" }).waitFor();
  const pdf = "/tmp/e2e-assist.pdf";
  await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [pdf]).toString())[1]);
  ok(pages >= 2, "pdf has " + pages + " pages");
  const imgs = execFileSync("pdfimages", ["-list", pdf]).toString().split("\n").filter((l) => /^\s*\d+\s+\d+\s+image/.test(l));
  const onPages = new Set(imgs.map((l) => l.trim().split(/\s+/)[0]));
  ok(onPages.size === pages, `logo image on all ${pages} pages (found on ${onPages.size})`);
  const txt = execFileSync("pdftotext", ["-layout", pdf, "-"]).toString();
  ok(txt.includes("שבט מעוז") && txt.includes("פעולה ארוכה"), "pdf text has brand + title");
  fs.rmSync(pdf, { force: true });
});

await step("PDF of a library activity also carries the logo", async () => {
  await page.goto(B + "/library/1", { waitUntil: "networkidle" });
  await page.pdf({ path: "/tmp/e2e-act.pdf", format: "A4", preferCSSPageSize: true });
  const imgs = execFileSync("pdfimages", ["-list", "/tmp/e2e-act.pdf"]).toString().split("\n").filter((l) => /^\s*\d+\s+\d+\s+image/.test(l));
  ok(imgs.length >= 1, "activity pdf has logo image");
  ok(/Page size:\s+59\d/.test(execFileSync("pdfinfo", ["/tmp/e2e-act.pdf"]).toString()), "activity pdf is portrait A4");
  fs.rmSync("/tmp/e2e-act.pdf", { force: true });
});

await step("site header shows the default tribe logo", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  ok((await page.locator("img.emblem-logo").count()) === 1, "emblem uses the logo image");
  const r = await axe(page);
  ok(r.violations.length === 0, "axe home " + r.violations.map((v) => v.id).join(","));
});

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
process.exit(fails ? 1 : 0);
