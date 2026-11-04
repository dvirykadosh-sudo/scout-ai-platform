// בדיקות דפדפן לסבב ב': מצב בהיר/כהה, דף בית, תצוגה מקדימה, כרטיסים, לוגו, תנועה מופחתת.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const ADMIN_PW = process.env.ADMIN_PASSWORD || "Strong#Pass99";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", colorScheme: "dark" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } };
const cls = () => page.evaluate(() => document.documentElement.className);

await step("hero", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /ברוכים הבאים/ }).waitFor();
  await page.getByRole("heading", { name: "מהמאגר, כדי לקבל השראה" }).waitFor();
  ok(await page.locator(".examples-list .glance").count() > 0, "home shows library examples with glance cells");
  await page.getByRole("button", { name: "מתחילים" }).click();
  await page.reload({ waitUntil: "networkidle" });
  ok((await page.getByRole("heading", { name: /ברוכים הבאים/ }).count()) === 0, "welcome stays closed after first visit");
});

await step("live preview", async () => {
  await page.getByLabel("נושא הפעולה").fill("אחריות בקבוצה");
  const t = await page.locator(".live-preview").innerText();
  ok(t.includes("אחריות בקבוצה") && t.includes("עוד חסר"), "preview mirrors the topic and lists what is missing");
  await page.getByRole("button", { name: "פעולת חירום של 10 דקות" }).click();
  const t2 = await page.locator(".live-preview").innerText();
  ok(t2.includes("10 דקות בסך הכול"), "preview shows chosen methods and total");
});

await step("theme", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle" });
  ok(!(await cls()).includes("light"), "auto + dark device = dark");
  await page.getByRole("button", { name: /תצוגה:/ }).click();
  ok((await cls()).includes("light"), "toggle -> light");
  await page.reload({ waitUntil: "networkidle" });
  ok((await cls()).includes("light"), "light persists after reload (no flash: set before paint)");
  await page.getByRole("button", { name: /תצוגה:/ }).click();
  ok(!(await cls()).includes("light"), "next -> dark");
  await page.getByRole("button", { name: /תצוגה:/ }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(200);
  ok((await cls()).includes("light"), "auto follows device light");
  await page.emulateMedia({ colorScheme: "dark" });
});

await step("library glance", async () => {
  await page.goto(B + "/library", { waitUntil: "networkidle" });
  ok((await page.locator(".activity-card .glance-cell").count()) >= 4, "library cards show glance cells");
});

await step("reduced motion", async () => {
  const p2 = await ctx.newPage();
  await p2.emulateMedia({ reducedMotion: "reduce" });
  await p2.goto(B + "/library", { waitUntil: "networkidle" });
  const name = await p2.evaluate(() => getComputedStyle(document.querySelector(".page > *")).animationName);
  ok(name === "none", "no entrance animation when reduced motion is requested");
  await p2.close();
});

// logo (admin)
await step("logo", async () => {
  const p = await ctx.newPage();
  const NEW_PW = "E2e-new-pass-2026";
  const login = async (pw) => {
    await p.goto(B + "/admin", { waitUntil: "networkidle" });
    await p.getByLabel("שם משתמש").fill("admin");
    await p.getByLabel("סיסמה").fill(pw);
    await p.getByRole("button", { name: /כניסה|התחברות/ }).last().click();
  };
  await login(NEW_PW);
  const logoHeading = p.getByRole("heading", { name: "לוגו השבט" });
  const changeForm = p.getByText("לפני שממשיכים יש להחליף");
  await Promise.race([logoHeading.waitFor({ timeout: 6000 }), changeForm.waitFor({ timeout: 6000 })]).catch(() => {});
  if (!(await logoHeading.count())) {
    // first run: the admin must replace the temporary password
    if (!(await changeForm.count())) {
      await login(ADMIN_PW);
      await changeForm.waitFor({ timeout: 8000 });
    }
    await p.getByLabel("סיסמה נוכחית").fill(ADMIN_PW);
    await p.getByLabel("סיסמה חדשה", { exact: true }).fill(NEW_PW);
    await p.getByLabel("סיסמה חדשה, פעם נוספת").fill(NEW_PW);
    await p.getByRole("button", { name: "החלפת סיסמה" }).click();
    await p.waitForTimeout(1500);
    if (!(await logoHeading.count())) await login(NEW_PW);
  }
  await logoHeading.waitFor({ timeout: 10000 });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await p.getByLabel(/העלאת לוגו/).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await p.getByAltText("הלוגו הנוכחי של השבט").waitFor();
  await p.reload({ waitUntil: "networkidle" });
  await p.goto(B + "/", { waitUntil: "networkidle" });
  ok((await p.locator("img.emblem-logo").count()) === 1, "uploaded logo appears in the header");
  const bad = await p.evaluate(async (b) => (await fetch("/api/admin/logo", { method: "POST", body: "nope" })).status, null);
  ok(bad === 401, "logo upload without token refused");
  await p.goto(B + "/admin", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "הסרת הלוגו" }).click();
  await p.getByText("הלוגו הוסר").first().waitFor();
  ok(true, "logo removed");
  await p.close();
});

// a11y in both themes
await step("axe both themes", async () => {
  const actId = (await (await page.request.get(B + "/api/activities?pageSize=1")).json()).items[0].id;
  const paths = ["/", "/library", `/library/${actId}`, `/library/${actId}/brief`, `/library/${actId}/cards`, "/plan", "/icebreakers", "/methods", "/account", "/library/import", "/accessibility", `/field/${actId}`];
  for (const theme of ["light", "dark"]) {
    await ctx.addInitScript((t) => { try { localStorage.setItem("scout.theme", t); localStorage.setItem("scout.hero.seen", "1"); } catch {} }, theme);
    for (const path of paths) {
      const p = await ctx.newPage();
      await p.goto(B + path, { waitUntil: "networkidle" });
      const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const bad = r.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(" ")}`);
      ok(r.violations.length === 0, `axe ${theme} ${path}: ${bad.join(" | ") || "0"}`);
      await p.close();
    }
  }
});
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
await browser.close();
process.exit(fails ? 1 : 0);
