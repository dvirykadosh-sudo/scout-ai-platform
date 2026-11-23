// שלב 74: בדיקת דפדפן לממשק החדש של המחולל והמאגר: ציר זמן, כרטיס איכות, פרטיות, בטיחות, התאמה לכמה תנאים, פעולה לשכבה אחרת,
// הבדלי גרסאות, הצעות תגיות, סינון נגישות, חיפושים שמורים בחשבון, השוואה, כיסוי חגים, ייבוא עם דוח וכרטיס כיס A5.
// הפונקציונליות נבדקת פעם אחת (מצב כהה). נגישות (axe) וגלישה אופקית נבדקות בארבעת המצבים (כהה, בהיר, ניגודיות גבוהה, חיסכון), ובמסך של 390px.
// שימוש, מתיקיית e2e: sh run-fresh.sh e2e-round-av.mjs
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const B = process.env.BASE_URL || "http://localhost:5055";
const J = { "Content-Type": "application/json" };
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (n, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", n, "-", e.message.split("\n").slice(0, 3).join(" | ")); } };
const call = (method, p, tok, body) => fetch(B + p, { method, headers: { ...J, ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const ADMIN_PW = "Strong#Pass99", NEW_PW = "Zq9!Fresh-boss-pw-74";
let L = await call("POST", "/api/auth/login", null, { username: "admin", password: NEW_PW });
if (L.status !== 200) L = await call("POST", "/api/auth/login", null, { username: "admin", password: ADMIN_PW });
if (L.body?.user?.mustChangePw) {
  await call("POST", "/api/auth/change-password", L.body.token, { currentPassword: ADMIN_PW, newPassword: NEW_PW });
  L = await call("POST", "/api/auth/login", null, { username: "admin", password: NEW_PW });
}
const admin = L.body;
ok(!!admin?.token, "admin נכנס");

const stages = (c) => ["פתיחה", "ציר זמן/משחק", "זמן צופיות מעשי", "דיון", "סיכום"].map((name, i) => ({ name, minutes: [5, 15, 15, 10, 5][i], layer: "x", content: c[i] }));
const mkAct = async (title, equipment, content) => {
  const r = await call("POST", "/api/activities/import-parsed", admin.token, { title, ageGroup: "כיתה ח' - מעורב", leadingValue: "אחריות", equipment, safetyNotes: "זהירות.", instructor: "בודק", stages: stages(content) });
  return r.body?.id;
};
const PII = await mkAct("פעולת חנוכה לבדיקת שלב 74", "טלפון להתקשרות 050-1234567", ["שואלים שאלה פתוחה על חנוכה במעגל.", "מדליקים נרות ורצים בין תחנות בקבוצות.", "כל קבוצה מכינה חנוכיה מחומרים פשוטים.", "מדברים על המסר של החג.", "סבב סיכום קצר."]);
const CLEAN = await mkAct("פעולה שקטה בישיבה לבדיקה", "אין", ["יושבים במעגל ומדברים בשקט.", "יושבים במעגל ומשתפים רעיון.", "יושבים ומסכמים בקבוצות.", "מדברים על הערך.", "סבב סיכום."]);
ok(!!PII && !!CLEAN, `נוצרו שתי פעולות לבדיקה (${PII}, ${CLEAN})`);
// גרסה בהיסטוריה: עריכה אחת של הפעולה השקטה
{
  const full = (await call("GET", `/api/activities/${CLEAN}`, admin.token)).body;
  const body = { ...full };
  delete body.id;
  const u = await call("PUT", `/api/activities/${CLEAN}`, admin.token, { ...body, stages: body.stages.map((s, i) => (i === 1 ? { ...s, content: `${s.content}\nשורה חדשה לבדיקת ההבדלים` } : s)) });
  ok(u.status === 200, "עריכה יצרה גרסה בהיסטוריה");
}
// הפעלה אחת, כדי שיהיה מה להציג ב"מה עבד לי"
await call("POST", `/api/activities/${CLEAN}/runs`, admin.token, { ranOn: new Date().toISOString().slice(0, 10), groupLabel: "ז1", worked: "הילדים התלהבו", changeNext: "", notes: "", engagement: 3, timing: "ok" });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const errors = [];
let MODE = "dark";
const MODES = { dark: { theme: "dark" }, light: { theme: "light" }, hc: { theme: "dark", hc: "1" }, saver: { theme: "dark", saver: "1" } };
let REDUCED = false;
const mk = async (vp) => {
  const m = MODES[MODE];
  const c = await browser.newContext({ viewport: vp, locale: "he-IL", timezoneId: "Asia/Jerusalem", deviceScaleFactor: 1, acceptDownloads: true, reducedMotion: REDUCED ? "reduce" : "no-preference" });
  await c.addInitScript(([sess, mm]) => {
    try {
      for (const k of ["scout.splash", "scout.hero.seen", "scout.intro"]) localStorage.setItem(k, "1");
      localStorage.setItem("scout.mascot", "off");
      localStorage.setItem("scout.session", sess);
      localStorage.setItem("scout.theme", mm.theme);
      localStorage.setItem("scout.hc", mm.hc || "0");
      localStorage.setItem("scout.saver", mm.saver || "0");
    } catch {}
  }, [JSON.stringify({ token: admin.token, user: admin.user }), m]);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
  p.on("console", (mm) => mm.type() === "error" && !/favicon|Failed to load resource/.test(mm.text()) && errors.push("console: " + mm.text().slice(0, 160)));
  return { c, p };
};
const overflow = (p, w) => p.evaluate((W) => {
  const bad = [];
  const clipped = (el) => { for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) { const o = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(o.overflowX) || o.position === "fixed") return true; } return false; };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > W + 1 || r.left < -1) && getComputedStyle(el).position !== "fixed" && !clipped(el)) bad.push((el.getAttribute?.("class") || el.tagName).slice(0, 40) + ":" + Math.round(r.right));
  }
  return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bad: bad.slice(0, 4) };
}, w);
const axe = async (p, label, ctx) => {
  await p.waitForTimeout(400);
  let b = new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);
  if (ctx) b = b.include(ctx);
  const r = await b.analyze();
  const msg = r.violations.map((v) => v.id + " " + v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join("; ")).join(" || ");
  ok(r.violations.length === 0, `axe [${MODE}${REDUCED ? "+reduced" : ""}] ${label}` + (msg ? " :: " + msg : ""));
};
const go = async (p, path) => { await p.goto(B + path, { waitUntil: "networkidle" }); };
const noScroll = async (p, w, label) => { const o = await overflow(p, w); ok(o.sw <= o.cw && o.bad.length === 0, `בלי גלילה אופקית ב-${w}px: ${label}${o.bad.length ? " :: " + o.bad.join(",") : ""}`); };

/** פונקציונליות: פעם אחת, במצב כהה */
const functional = async () => {
  const { c, p } = await mk({ width: 1280, height: 900 });

  await step("ציר זמן בעמוד הפעולה", async () => {
    await go(p, `/library/${PII}`);
    await p.locator(".tl-bar").waitFor();
    ok((await p.locator(".tl-legend li").count()) === 5, "ציר הזמן מציג חמישה שלבים");
    ok((await p.locator(".tl-bar").getAttribute("aria-label"))?.includes("ציר זמן"), "ציר הזמן נגיש לקורא מסך");
    ok((await p.locator(".tl-warn").count()) === 0, "חלוקת זמן תקינה: בלי התראה");
  });

  await step("כרטיס איכות", async () => {
    await p.locator("#quality summary").click();
    await p.getByText("יעד חינוכי מדיד").waitFor({ timeout: 8000 });
    ok((await p.locator(".q-dims li").count()) === 6, "שישה ממדים");
    ok((await p.locator(".q-why").innerText()).length > 20, "שורת 'למה הפעולה הזאת'");
    ok(await p.getByText(/בסוף הפעולה לפחות \d+ מתוך \d+/).count() >= 1, "יעד מדיד עם מספרים");
    await p.getByText("איך מנסחים כל שלב לשכבה הזאת").click();
    ok(await p.getByText("פתיחה שמעוררת עניין").count() >= 0, "רמזי ניסוח לפי גיל נפתחים");
  });

  await step("סריקת פרטיות: הסרה אוטומטית", async () => {
    const det = p.locator("#privacy");
    await det.waitFor();
    await p.getByText(/בדיקת פרטיות \(\d+ ממצאים\)/).waitFor({ timeout: 8000 });
    ok((await det.innerText()).includes("מספר טלפון"), "מספר הטלפון זוהה");
    await det.getByRole("button", { name: /הסרה אוטומטית/ }).click();
    await p.getByText("הפרטים האישיים הוסרו").waitFor({ timeout: 8000 });
    await p.getByText(/^בדיקת פרטיות$/).waitFor({ timeout: 8000 }); // אין עוד ממצאים: הכותרת בלי מספר, והפאנל נסגר
    await det.locator("summary").click();
    await p.getByText("לא נמצאו בפעולה טלפונים").waitFor({ timeout: 8000 });
    ok(!(await p.locator("body").innerText()).includes("050-1234567"), "הטלפון נעלם מהעמוד");
  });

  await step("סריקת בטיחות מורחבת", async () => {
    await p.locator("#safety summary").click();
    await p.locator("#safety .pill").first().waitFor({ timeout: 8000 });
    ok((await p.locator("#safety").innerText()).includes("ציון כיסוי"), "ציון כיסוי מוצג");
    const add = p.locator("#safety").getByRole("button", { name: "הוספת ההנחיות החסרות" });
    if (await add.count()) {
      await add.click();
      await p.getByText("הנחיות הבטיחות נוספו").waitFor({ timeout: 8000 });
      ok(true, "ההנחיות נוספו, והסריקה מתרעננת");
    } else ok(true, "אין הנחיות חסרות");
  });

  await step("הצעות תגיות", async () => {
    await p.locator(".tag-suggest").waitFor({ timeout: 8000 });
    const first = p.locator(".tag-suggest button").first();
    const label = (await first.innerText()).replace(/^\+\s*/, "");
    await first.click();
    await p.locator("#tag-new").waitFor();
    await p.getByRole("listitem").filter({ hasText: label }).first().waitFor({ timeout: 8000 });
    ok(true, "התגית המוצעת נוספה: " + label);
  });

  await step("התאמה לכמה תנאים", async () => {
    await p.getByRole("button", { name: "התאמה לתנאים" }).click();
    const dlg = p.getByRole("dialog");
    ok(await dlg.getByRole("button", { name: "יצירת עותק מותאם" }).isDisabled(), "בלי בחירה אי אפשר ליצור");
    await dlg.getByLabel("גשם", { exact: true }).check();
    await dlg.getByLabel("חושך או ערב", { exact: true }).check();
    await dlg.getByLabel("קור", { exact: true }).check();
    ok(await dlg.getByLabel("חום", { exact: true }).isDisabled(), "אחרי שלושה תנאים שאר התנאים נעולים");
    await dlg.getByLabel("קור", { exact: true }).uncheck();
    await dlg.getByLabel("גשם", { exact: true }).uncheck();
    await dlg.getByLabel("קבוצה קטנה", { exact: true }).check();
    await dlg.getByLabel("קבוצה גדולה", { exact: true }).check();
    ok((await dlg.getByRole("alert").innerText()).includes("אי אפשר לשלב"), "תנאים סותרים מסומנים");
    ok(await dlg.getByRole("button", { name: "יצירת עותק מותאם" }).isDisabled(), "בסתירה אי אפשר ליצור");
    await dlg.getByLabel("קבוצה קטנה", { exact: true }).uncheck();
    await dlg.getByLabel("גשם", { exact: true }).check();
    await dlg.getByRole("button", { name: "יצירת עותק מותאם" }).click();
    await p.getByRole("heading", { level: 1, name: /גרסת חושך או ערב \+ קבוצה גדולה \+ גשם/ }).waitFor({ timeout: 10000 });
    ok((await p.locator("body").innerText()).includes("התאמה (גשם)"), "העותק כולל הערות התאמה");
  });

  await step("אותה פעולה, שכבה אחרת", async () => {
    await go(p, `/library/${CLEAN}`);
    await p.getByRole("button", { name: "אותה פעולה, שכבה אחרת" }).click();
    const dlg = p.getByRole("dialog");
    await dlg.getByLabel("שכבת גיל").selectOption("כיתה ד' - מעורב");
    await dlg.getByLabel(/מספר משתתפים/).fill("40");
    await dlg.getByRole("button", { name: "יצירת עותק" }).click();
    await p.waitForURL((u) => /\/library\/\d+$/.test(u.pathname) && !u.pathname.endsWith("/" + CLEAN), { timeout: 10000 });
    await p.getByRole("heading", { level: 1 }).waitFor();
    const t = await p.locator("body").innerText();
    ok(t.includes("התאמה לכיתות ג'–ד'") && t.includes("כיתה ד' - מעורב"), "הועתק לשכבה החדשה עם הערות גיל");
  });

  await step("הבדלי גרסאות שורה אחרי שורה", async () => {
    await go(p, `/library/${CLEAN}`);
    await p.getByRole("button", { name: "היסטוריית גרסאות" }).click();
    const dlg = p.getByRole("dialog");
    await dlg.locator("summary").first().click();
    await dlg.getByRole("button", { name: "פירוט שורה אחרי שורה" }).first().click();
    await dlg.locator(".diff").first().waitFor({ timeout: 8000 });
    ok((await dlg.locator(".diff-add").count()) >= 1 && (await dlg.locator(".diff").first().innerText()).includes("+ "), "שורה שנוספה מסומנת ב-+");
    await p.keyboard.press("Escape");
  });

  await step("כרטיס כיס A5", async () => {
    await go(p, `/library/${CLEAN}/pocket`);
    await p.locator(".pocket").waitFor();
    await p.locator(".pocket-qr img").waitFor({ timeout: 8000 });
    ok((await p.locator(".pocket-stages li").count()) === 5, "חמישה שלבים בכרטיס");
    const bg = await p.locator(".pocket").evaluate((el) => getComputedStyle(el).backgroundColor);
    ok(bg === "rgb(255, 255, 255)", "הגיליון לבן גם במצב כהה: " + bg);
    await p.emulateMedia({ media: "print" });
    const pdf = await p.pdf({ preferCSSPageSize: true });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok(pages === 1, "הכרטיס מודפס בדף אחד: " + pages);
    const mb = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
    ok(!!mb && Math.abs(Number(mb[1]) - 419.5) < 3 && Math.abs(Number(mb[2]) - 595.3) < 3, "גודל הדף A5: " + (mb ? mb[1] + "x" + mb[2] : "לא נמצא"));
    await p.emulateMedia({ media: "screen" });
  });

  await step("מאגר: סינון נגישות וחיפוש שמור בחשבון", async () => {
    await go(p, "/library");
    await p.locator(".adv-filters summary").click();
    await p.getByLabel("שקטה", { exact: true }).check();
    await p.getByLabel("בלי ריצה", { exact: true }).check();
    await p.waitForFunction(() => /access=/.test(location.search) && location.search.includes("noRun") && location.search.includes("quiet"));
    await p.getByLabel("אפשר בישיבה", { exact: true }).check();
    ok(await p.getByLabel("בלי מגע", { exact: true }).isDisabled(), "עד שלוש תגיות נגישות");
    await p.locator(".count").filter({ hasText: /נמצאו|אין פעולות/ }).waitFor();
    await p.getByLabel("שם לחיפוש הנוכחי").fill("שקטות");
    await p.getByRole("button", { name: "שמירת החיפוש" }).click();
    await p.getByText("החיפוש נשמר בחשבון").waitFor({ timeout: 8000 });
    await p.getByRole("button", { name: "שקטות", exact: true }).waitFor();
    await go(p, "/library");
    await p.getByRole("button", { name: "שקטות", exact: true }).waitFor({ timeout: 8000 });
    await p.getByRole("button", { name: "שקטות", exact: true }).click();
    await p.waitForFunction(() => location.search.includes("access="));
    ok(true, "החיפוש נשמר בחשבון וחוזר אחרי טעינה מחדש");
    await p.getByRole("button", { name: "מחיקת החיפוש השמור שקטות" }).click();
    await p.getByRole("button", { name: "שקטות", exact: true }).waitFor({ state: "detached" });
  });

  await step("השוואה: מהמאגר ומהכתובת", async () => {
    await go(p, "/library");
    const picks = p.getByLabel("הוספה לחוברת");
    await picks.nth(0).check();
    await picks.nth(1).check();
    await p.getByRole("link", { name: "השוואה", exact: true }).click();
    await p.waitForURL(/\/compare\?ids=\d+,\d+/);
    await p.locator("table.cmp").waitFor({ timeout: 8000 });
    ok((await p.locator("table.cmp thead th").count()) === 2, "שתי עמודות");
    ok((await p.locator("table.cmp tbody tr").count()) >= 12, "שורות השוואה");
    await p.getByRole("button", { name: /^הסרת .* מההשוואה$/ }).first().click();
    await p.getByText(/נבחרה ".*"\. הוסיפו עוד פעולה/).waitFor({ timeout: 8000 });
    await p.locator("#cmp-q").fill("שקטה");
    await p.getByRole("button", { name: "הוספה להשוואה" }).first().click();
    await p.locator("table.cmp").waitFor({ timeout: 8000 });
    ok(true, "הוספת פעולה אחרי הסרה");
    ok((await call("GET", "/api/compare?ids=1", null)).status === 400, "השרת דוחה השוואה של פעולה אחת");
  });

  await step("כיסוי חגים", async () => {
    await go(p, "/coverage");
    await p.getByRole("heading", { name: "חגים ומועדים בשלושת החודשים הקרובים" }).waitFor({ timeout: 8000 });
    ok((await p.locator("#hol-h").locator("xpath=..").locator("li").count()) >= 1, "יש מועדים ברשימה");
  });

  await step("מה עבד לי ומגוון", async () => {
    await go(p, "/account");
    await p.getByRole("heading", { name: "מה עבד לי" }).waitFor({ timeout: 8000 });
    ok((await p.locator("#wk-h").locator("xpath=..").innerText()).includes("הילדים התלהבו"), "ההערה מההפעלה מוצגת");
    await p.getByRole("heading", { name: "מגוון הפעולות שלי" }).waitFor();
  });

  await step("ייבוא עם דוח מוכנות", async () => {
    await go(p, "/library/import");
    const txt = "פעולה מקובץ לבדיקה\nפתיחה 10 דקות\nשואלים שאלה.\nמשחק 15 דקות\nמשחקים.\nמשימה 10 דקות\nעושים.\nדיון 10 דקות\nמדברים.\nסיכום 5 דקות\nמסכמים.";
    await p.locator("#imp-files").setInputFiles({ name: "פעולה.txt", mimeType: "text/plain", buffer: Buffer.from(txt, "utf8") });
    await p.getByRole("group", { name: "דוח ייבוא" }).waitFor({ timeout: 10000 });
    ok((await p.getByRole("group", { name: "דוח ייבוא" }).innerText()).includes("מוכנות לפרסום"), "הדוח מציג ציון מוכנות");
  });

  await c.close();
};

/** נגישות וגלישה אופקית בכל מצב */
const sweep = async () => {
  {
    const { c, p } = await mk({ width: 1280, height: 900 });
    await go(p, `/library/${PII}`);
    await p.locator(".tl-bar").waitFor();
    await p.locator("#quality summary").click();
    await p.getByText("יעד חינוכי מדיד").waitFor({ timeout: 8000 });
    await p.locator("#safety summary").click();
    await p.locator("#safety .pill").first().waitFor({ timeout: 8000 });
    await axe(p, "עמוד פעולה עם ציר זמן, איכות ובטיחות");
    await p.getByRole("button", { name: "התאמה לתנאים" }).click();
    await axe(p, "חלון התאמה לתנאים", "dialog");
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "אותה פעולה, שכבה אחרת" }).click();
    await axe(p, "חלון שכבה אחרת", "dialog");
    await p.keyboard.press("Escape");
    await go(p, `/library/${CLEAN}`);
    await p.getByRole("button", { name: "היסטוריית גרסאות" }).click();
    const dlg = p.getByRole("dialog");
    await dlg.locator("summary").first().click();
    await dlg.getByRole("button", { name: "פירוט שורה אחרי שורה" }).first().click();
    await dlg.locator(".diff").first().waitFor({ timeout: 8000 });
    await axe(p, "היסטוריית גרסאות עם פירוט", "dialog");
    await p.keyboard.press("Escape");
    for (const [path, label, wait] of [
      [`/compare?ids=${PII},${CLEAN}`, "השוואה", "table.cmp"],
      [`/library/${CLEAN}/pocket`, "כרטיס כיס", ".pocket-qr img"],
      ["/coverage", "כיסוי חגים", "#hol-h"],
      ["/account", "אזור אישי עם מגוון", "#div-h"],
    ]) {
      await go(p, path);
      await p.locator(wait).first().waitFor({ timeout: 8000 });
      await axe(p, label);
    }
    await go(p, "/library");
    await p.locator(".adv-filters summary").click();
    await axe(p, "מאגר עם מסנני נגישות");
    await c.close();
  }
  {
    const { c, p } = await mk({ width: 390, height: 800 });
    for (const [path, label, wait] of [
      [`/library/${PII}`, "עמוד פעולה", ".tl-bar"],
      [`/compare?ids=${PII},${CLEAN}`, "השוואה", "table.cmp"],
      [`/library/${CLEAN}/pocket`, "כרטיס כיס", ".pocket"],
      ["/coverage", "כיסוי חגים", "#hol-h"],
      ["/library", "מאגר", ".filters"],
      ["/account", "אזור אישי", "#div-h"],
    ]) {
      await go(p, path);
      await p.locator(wait).first().waitFor({ timeout: 8000 });
      await noScroll(p, 390, `${label} [${MODE}]`);
    }
    await go(p, `/library/${PII}`);
    await p.locator("#quality summary").click();
    await p.getByText("יעד חינוכי מדיד").waitFor({ timeout: 8000 });
    await noScroll(p, 390, `כרטיס איכות פתוח [${MODE}]`);
    await c.close();
  }
};

await functional();
for (const [mode, reduced] of [["dark", false], ["light", false], ["hc", false], ["saver", false], ["dark", true]]) {
  MODE = mode;
  REDUCED = reduced;
  await step(`sweep ${mode}${reduced ? "+reduced" : ""}`, sweep);
}

console.log(errors.length ? "שגיאות דפדפן:\n" + [...new Set(errors)].join("\n") : "אין שגיאות דפדפן");
await browser.close();
console.log(fails ? `FAILED ${fails}` : "ALL OK");
process.exit(fails ? 1 : 0);
