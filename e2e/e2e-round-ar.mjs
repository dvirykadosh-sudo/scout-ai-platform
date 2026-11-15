// בדיקות דפדפן לשלב 67: שפת העיצוב V21 (Bento + זכוכית נוזלית): מרכז הפיקוד, לשוניות Pill עם אינדיקטור, כרטיסי סטטיסטיקה,
// קפסולת התקדמות. הבדיקות מוודאות שהמראה לא שבר נגישות (axe) ושבכל מצב מופחת (ניגודיות גבוהה, חיסכון, הפחתת תנועה, נייד) הכול שטוח.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const ADMIN_PW = "Strong#Pass99";
const NEW_PW = "Zq9!Fresh-boss-pw-67";
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 4).join(" | ")); } };
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const J = { "Content-Type": "application/json" };

const reg = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: "s67" + Date.now().toString().slice(-6), password: "Str0ng-e2e-pw-26", displayName: "בודק", acceptTerms: true, signupCode: CODE }) })).json();
const userSess = JSON.stringify({ token: reg.token, user: reg.user });
ok(!!reg.token, "נרשם משתמש לבדיקה");

let adminSess = null;
await step("admin login", async () => {
  let L = await fetch(B + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ username: "admin", password: NEW_PW }) });
  if (L.status !== 200) L = await fetch(B + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ username: "admin", password: ADMIN_PW }) });
  let b = await L.json();
  if (b.user?.mustChangePw) {
    await fetch(B + "/api/auth/change-password", { method: "POST", headers: { ...J, Authorization: "Bearer " + b.token }, body: JSON.stringify({ currentPassword: ADMIN_PW, newPassword: NEW_PW }) });
    b = await (await fetch(B + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ username: "admin", password: NEW_PW }) })).json();
  }
  adminSess = b.token ? JSON.stringify({ token: b.token, user: b.user }) : null;
  ok(!!adminSess, "admin token");
});

const MODES = {
  dark: { theme: "dark" },
  light: { theme: "light" },
  hc: { theme: "dark", hc: "1" },
  saver: { theme: "dark", saver: "1" },
};
const mk = async (mode, { vp = { width: 1280, height: 900 }, reduced = false, admin = false } = {}) => {
  const c = await browser.newContext({ viewport: vp, locale: "he-IL", reducedMotion: reduced ? "reduce" : "no-preference" });
  await c.addInitScript(([m, sess]) => {
    try {
      for (const k of ["scout.splash", "scout.hero.seen", "scout.intro"]) localStorage.setItem(k, "1");
      localStorage.setItem("scout.mascot", "off");
      localStorage.setItem("scout.theme", m.theme);
      localStorage.setItem("scout.hc", m.hc || "0");
      localStorage.setItem("scout.saver", m.saver || "0");
      localStorage.setItem("scout.session", sess);
    } catch {}
  }, [MODES[mode], admin ? adminSess : userSess]);
  return c;
};

// 1. מרכז הפיקוד בעמוד הבית: מבנה, שמות נגישים וקישורים אמיתיים
await step("command center structure", async () => {
  const c = await mk("dark");
  const p = await c.newPage();
  await p.goto(B + "/", { waitUntil: "networkidle" });
  const sec = p.locator("section.v21-stage[aria-labelledby=v21-cmd-title]");
  ok((await sec.count()) === 1 && (await p.locator("#v21-cmd-title").innerText()).includes("מרכז הפיקוד"), "מרכז הפיקוד קיים עם כותרת מקושרת");
  ok((await sec.locator("a.v21-node").count()) === 5, "חמישה צמתים הם קישורים אמיתיים");
  ok((await sec.locator("button.v21-node").count()) === 1, "צומת 'שאל את מעוז' הוא כפתור");
  ok((await sec.getByRole("button", { name: "יצירת פעולה חכמה" }).count()) === 1, "ליבת מעוז היא כפתור עם שם נגיש");
  const hrefs = await sec.locator("a.v21-node").evaluateAll((els) => els.map((e) => e.getAttribute("href")).sort());
  ok(JSON.stringify(hrefs) === JSON.stringify(["/assistant", "/library", "/plan", "/tools", "/write"]), "היעדים: " + hrefs.join(","));
  ok((await p.locator("#step-title").count()) >= 1, "טופס היצירה (#step-title) עדיין קיים");
  // כפתור "שאל את מעוז" שולח את אירוע הנשר הקיים
  await p.evaluate(() => { window.__eagle = 0; window.addEventListener("scout:eagle", () => window.__eagle++); });
  await sec.locator("button.v21-node").evaluate((e) => e.click()); // click ישיר: הדוק הצף עלול לכסות את הכפתור בגלילה
  ok((await p.evaluate(() => window.__eagle)) === 1, "'שאל את מעוז' שולח scout:eagle");
  await c.close();
});

// 2. לשוניות Pill: האינדיקטור יושב בדיוק על הלשונית הפעילה (גם ב-RTL), והמקלדת עדיין עובדת
await step("tab indicator", async () => {
  const c = await mk("light");
  const p = await c.newPage();
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await p.waitForSelector(".home-tabs.v21-live", { timeout: 8000 });
  const geo = () => p.evaluate(() => {
    const l = document.querySelector(".home-tabs");
    const i = l.querySelector(".v21-ind").getBoundingClientRect();
    const a = l.querySelector('[role=tab][aria-selected="true"]').getBoundingClientRect();
    return Math.abs(i.left - a.left) < 2 && Math.abs(i.width - a.width) < 2;
  });
  await p.waitForTimeout(900); // המדידה נעשית שוב אחרי טעינת הגופנים, והאינדיקטור מתיישב בתנועה קצרה
  ok(await geo(), "האינדיקטור על הלשונית הפעילה");
  await p.locator('.home-tabs [role="tab"]').nth(1).click();
  await p.waitForTimeout(900);
  ok(await geo(), "האינדיקטור עבר ללשונית שנבחרה");
  await p.keyboard.press("ArrowLeft");
  await p.waitForTimeout(900);
  ok(await geo(), "חץ במקלדת מזיז את האינדיקטור והבחירה");
  const a = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  ok(a.violations.length === 0, "axe בבהיר אחרי מעבר לשוניות: " + axeMsg(a));
  await c.close();
});

// 3. מצבים מופחתים: ללא תלת-ממד, טשטוש וקווים זורמים
await step("reduced modes are flat", async () => {
  const cases = [
    ["hc", {}], ["saver", {}], ["dark", { reduced: true }], ["dark", { vp: { width: 390, height: 800 } }],
  ];
  for (const [mode, opt] of cases) {
    const c = await mk(mode, opt);
    const p = await c.newPage();
    await p.goto(B + "/", { waitUntil: "networkidle" });
    const st = await p.evaluate(() => {
      const cmd = document.querySelector(".v21-command");
      const cs = getComputedStyle(cmd);
      return { tr: cs.transform, bf: cs.backdropFilter || cs.webkitBackdropFilter || "none" };
    });
    const label = mode + (opt.reduced ? "+reduced-motion" : "") + (opt.vp ? "+mobile" : "");
    ok(st.tr === "none", `${label}: כרטיס הפיקוד בלי הטיה (${st.tr})`);
    ok(/none/.test(st.bf) || st.bf === "", `${label}: בלי טשטוש רקע (${st.bf})`);
    await c.close();
  }
});

// 4. הגנה מפני נסיגה: כרטיס KPI בדשבורד נשאר עמודה (מחלקות tw: חייבות להיכתב כמחרוזת רגילה)
await step("dashboard kpi layout", async () => {
  const c = await mk("dark");
  const p = await c.newPage();
  await p.goto(B + "/dashboard", { waitUntil: "networkidle" });
  const dir = await p.locator("section.db-card").first().evaluate((e) => getComputedStyle(e).flexDirection);
  ok(dir === "column", "כרטיס KPI ראשון בעמודה: " + dir);
  ok((await p.locator(".v21-hero-dark").count()) >= 1, "יש כרטיס Hero כהה");
  ok((await p.locator(".v21-pill").count()) >= 1, "יש תגית שינוי/סטטוס");
  await c.close();
});

// 5. קפסולת התקדמות בטופס היצירה: ערך אמיתי לפי השלב
await step("form progress", async () => {
  const c = await mk("dark");
  const p = await c.newPage();
  await p.goto(B + "/", { waitUntil: "networkidle" });
  const bar = p.locator('[role=progressbar][aria-label^="התקדמות בשלבי הטופס"]');
  ok((await bar.count()) === 1, "קפסולת התקדמות בטופס");
  const v = await bar.getAttribute("aria-valuenow");
  ok(v !== null && +v >= 0 && +v <= 100, "aria-valuenow תקין: " + v);
  await c.close();
});

// 6. נגישות (axe) בכל ארבעת המצבים, בדסקטופ ובנייד
const ROUTES = ["/", "/library", "/dashboard", "/plan", "/icebreakers", "/account", "/methods", "/write", "/assistant"];
for (const mode of Object.keys(MODES)) {
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 800 }]) {
    await step(`axe ${mode} ${vp.width}`, async () => {
      const c = await mk(mode, { vp });
      const p = await c.newPage();
      let bad = [];
      for (const r of ROUTES) {
        await p.goto(B + r, { waitUntil: "networkidle" });
        await p.waitForTimeout(500);
        const a = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        if (a.violations.length) bad.push(r + ": " + axeMsg(a));
      }
      ok(bad.length === 0, `axe ${mode} ${vp.width}px על ${ROUTES.length} עמודים` + (bad.length ? " | " + bad.join(" || ") : ""));
      await c.close();
    });
  }
}

// 7. לוח הבקרה של האדמין: פס הסטטיסטיקה עם טבעת נגישה
if (adminSess) {
  await step("admin stat strip", async () => {
    for (const mode of ["dark", "light", "hc"]) {
      const c = await mk(mode, { admin: true });
      const p = await c.newPage();
      await p.goto(B + "/admin", { waitUntil: "networkidle" });
      await p.waitForTimeout(800);
      ok((await p.locator("ul.v21-stats[aria-label]").count()) === 1, `${mode}: פס הסטטיסטיקה קיים`);
      const rings = await p.locator('.v21-ring[role="img"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      ok(rings.length >= 1 && rings.every((l) => /אחוז/.test(l)), `${mode}: טבעות עם תווית נגישה (${rings.length})`);
      const a = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      ok(a.violations.length === 0, `${mode}: axe באדמין: ` + axeMsg(a));
      await c.close();
    }
  });
}

await browser.close();
console.log(fails ? "\n" + fails + " FAILURES" : "\nALL OK");
process.exit(fails ? 1 : 0);
