// בדיקות דפדפן לשלב 68: "מכשיר קשר מעוז" (דיבור), סימולטור חניכים, זוהר ספקולרי ו-View Transitions.
// זיהוי הדיבור וההקראה מדומים בדפדפן (בדיקות אוטומטיות אין להן מיקרופון), והשרת אמיתי. הבדיקה מוודאת גם שהכול נגיש (axe) בארבעת המצבים.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 4).join(" | ")); } };
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const J = { "Content-Type": "application/json" };
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

const reg = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: "s68" + Date.now().toString().slice(-6), password: "Str0ng-e2e-pw-26", displayName: "בודק", acceptTerms: true, signupCode: CODE }) })).json();
const userSess = JSON.stringify({ token: reg.token, user: reg.user });
ok(!!reg.token, "נרשם משתמש לבדיקה");
const list = await (await fetch(B + "/api/activities?pageSize=1")).json();
const actId = list.items?.[0]?.id;
ok(!!actId, "יש פעולה לבדיקת מצב שטח: " + actId);

const MODES = {
  dark: { theme: "dark" },
  light: { theme: "light" },
  hc: { theme: "dark", hc: "1" },
  saver: { theme: "dark", saver: "1" },
};

// דיבור מדומה: SpeechRecognition שמחזיר את window.__heard אחרי רגע, ו-speechSynthesis שרושם מה הוקרא וקורא onend.
const FAKE_SPEECH = () => {
  window.__spoken = [];
  window.__heard = "ירד גשם מה עושים";
  window.__vt = 0;
  class Rec {
    start() {
      window.__recStarts = (window.__recStarts || 0) + 1;
      setTimeout(() => {
        const t = window.__heard;
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: t.slice(0, 4) }], { isFinal: false })] });
        setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] });
          this.onend?.();
        }, 250);
      }, 250);
    }
    stop() { setTimeout(() => this.onend?.(), 10); }
    abort() { this.onend?.(); }
  }
  window.webkitSpeechRecognition = Rec;
  window.SpeechRecognition = Rec;
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speaking: false,
      getVoices: () => [],
      cancel() {},
      speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 20); },
    },
  });
  const orig = document.startViewTransition?.bind(document);
  if (orig) document.startViewTransition = (cb) => { window.__vt++; return orig(cb); };
};

const mk = async (mode, { vp = { width: 1280, height: 900 }, reduced = false, speech = true, vt = false, touch = false } = {}) => {
  const c = await browser.newContext({ viewport: vp, locale: "he-IL", reducedMotion: reduced ? "reduce" : "no-preference", hasTouch: touch });
  await c.addInitScript(([m, sess, vtOn]) => {
    try {
      for (const k of ["scout.splash", "scout.hero.seen", "scout.intro"]) localStorage.setItem(k, "1");
      localStorage.setItem("scout.mascot", "off");
      localStorage.setItem("scout.theme", m.theme);
      localStorage.setItem("scout.hc", m.hc || "0");
      localStorage.setItem("scout.saver", m.saver || "0");
      localStorage.setItem("scout.session", sess);
      if (vtOn) localStorage.setItem("scout.vt", "1");
    } catch {}
  }, [MODES[mode], userSess, vt]);
  if (speech) await c.addInitScript(FAKE_SPEECH);
  return c;
};

// 1. מכשיר קשר בעמוד העוזר: לחיצה, האזנה, תשובה והקראה
await step("walkie in assistant", async () => {
  const c = await mk("dark");
  const p = await c.newPage();
  await p.goto(B + "/assistant", { waitUntil: "networkidle" });
  const lab = p.locator("section.maoz-lab");
  ok((await lab.count()) === 1, "אזור 'מעוז בשטח' קיים");
  ok((await lab.locator('[role=tab]').count()) === 2 && (await lab.locator('[role=tab][aria-selected=true]').innerText()).includes("מכשיר קשר"), "שתי לשוניות, מכשיר קשר פעיל");
  const ptt = lab.locator(".maoz-ptt");
  await ptt.click();
  await p.waitForFunction(() => document.querySelector(".maoz-walkie")?.getAttribute("data-phase") === "listening", null, { timeout: 3000 });
  ok((await ptt.getAttribute("aria-pressed")) === "true", "הכפתור במצב האזנה");
  ok(/מקשיב/.test(await lab.locator(".maoz-status").innerText()), "שורת המצב אומרת 'מקשיב'");
  await p.waitForSelector(".maoz-reply", { timeout: 15000 });
  ok(/ירד גשם/.test(await lab.locator(".maoz-heard").innerText()), "מוצג מה ששמענו");
  const ans = (await lab.locator(".maoz-answer").innerText()).trim();
  ok(ans.length > 20, "התשובה לא ריקה: " + ans.slice(0, 60));
  ok(!/לא הבנתי|אני לא יודע/.test(ans), "התשובה לחירום בשטח אינה 'לא הבנתי'");
  const spoken = await p.evaluate(() => window.__spoken.join(" "));
  ok(spoken.length > 20, "התשובה הוקראה בקול (אוטומטית)");
  // כתיבה במקום דיבור, כולל שגיאות הקלדה
  await lab.getByRole("button", { name: "שאלה חדשה" }).click();
  await lab.locator(".maoz-type input").fill("חניכימ היפרקטיבימ");
  await lab.locator(".maoz-type button[type=submit]").click();
  await p.waitForSelector(".maoz-reply", { timeout: 15000 });
  const ans2 = (await lab.locator(".maoz-answer").innerText()).trim();
  ok(ans2.length > 10 && !/לא הבנתי/.test(ans2), "שגיאות הקלדה מובנות: " + ans2.slice(0, 70));
  // ללא הקראה
  await lab.getByRole("checkbox", { name: /להקריא/ }).uncheck();
  const n0 = await p.evaluate(() => window.__spoken.length);
  await lab.getByRole("button", { name: "שאלה חדשה" }).click();
  await lab.locator(".maoz-chip").first().click();
  await p.waitForSelector(".maoz-reply", { timeout: 15000 });
  ok((await p.evaluate(() => window.__spoken.length)) === n0, "בלי סימון הקראה אין הקראה");
  const a = await new AxeBuilder({ page: p }).withTags(AXE_TAGS).analyze();
  ok(a.violations.length === 0, "axe עם תשובה פתוחה: " + axeMsg(a));
  await c.close();
});

// 2. דפדפן בלי זיהוי דיבור: אפשר לכתוב, והכפתור מושבת בלי לשבור כלום
await step("walkie without speech support", async () => {
  const c = await mk("dark", { speech: false });
  await c.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  const p = await c.newPage();
  await p.goto(B + "/assistant", { waitUntil: "networkidle" });
  ok(await p.locator(".maoz-ptt").isDisabled(), "בלי תמיכה: כפתור הדיבור מושבת");
  ok(/אפשר לכתוב/.test(await p.locator(".maoz-status").innerText()), "הודעת מצב מכוונת לכתיבה");
  await p.locator(".maoz-type input").fill("משחק היכרות קצר בלי ציוד");
  await p.locator(".maoz-type button[type=submit]").click();
  await p.waitForSelector(".maoz-reply", { timeout: 15000 });
  ok((await p.locator(".maoz-answer").innerText()).trim().length > 10, "כתיבה עובדת בלי זיהוי דיבור");
  await c.close();
});

// 3. סימולטור חניכים: תרגיל מלא עד ציון
await step("sparring", async () => {
  const c = await mk("light");
  const p = await c.newPage();
  await p.goto(B + "/assistant", { waitUntil: "networkidle" });
  const lab = p.locator("section.maoz-lab");
  await lab.getByRole("tab", { name: "סימולטור חניכים" }).click();
  await p.waitForSelector(".maoz-sc", { timeout: 10000 });
  ok((await lab.locator(".maoz-sc").count()) === 3, "שלושה תרגילים");
  await lab.locator(".maoz-sc").first().click();
  await p.waitForSelector(".maoz-line.is-kid", { timeout: 15000 });
  ok((await lab.locator(".maoz-line.is-kid").count()) >= 1, "החניכים פותחים את התרגיל");
  const say = lab.locator("#maoz-spar-say");
  await say.fill("אני רואה שאתם עייפים אחרי היום. בואו נעמוד במעגל, ומי שמוכן מרים יד. מה הייתם רוצים לשחק?");
  await lab.getByRole("button", { name: "אמרתי" }).click();
  await p.waitForFunction(() => document.querySelectorAll(".maoz-line.is-me").length === 1 && document.querySelector(".maoz-tip"), null, { timeout: 15000 });
  ok(((await lab.locator(".maoz-tip").innerText()) || "").length > 10, "יש טיפ אחרי התור");
  await lab.getByRole("button", { name: "סיום וציון" }).click();
  await p.waitForSelector(".maoz-report", { timeout: 15000 });
  const num = await lab.locator(".maoz-report .v21-ring").getAttribute("aria-label");
  const score = Number((num || "").match(/(\d+) אחוז/)?.[1]);
  ok(Number.isFinite(score) && score >= 0 && score <= 100, "ציון מוכנות תקין: " + num);
  ok((await lab.locator(".maoz-axes li").count()) === 5, "חמישה צירי משוב");
  ok(/הערכה/.test(await lab.locator(".maoz-report").innerText()), "מצוין שהציון הוא הערכה");
  const a = await new AxeBuilder({ page: p }).withTags(AXE_TAGS).analyze();
  ok(a.violations.length === 0, "axe בדוח הציון: " + axeMsg(a));
  // דיבור לתוך תיבת הכתיבה
  await lab.getByRole("button", { name: "עוד סיבוב באותו תרגיל" }).click();
  await p.waitForSelector(".maoz-line.is-kid", { timeout: 15000 });
  await p.evaluate(() => { window.__heard = "בואו נתחיל במשחק קצר"; });
  await lab.getByRole("button", { name: "הכתבה בקול" }).click();
  await p.waitForFunction(() => /בואו נתחיל/.test(document.querySelector("#maoz-spar-say")?.value || ""), null, { timeout: 5000 });
  ok(true, "הכתבה בקול נכנסת לתיבה");
  await c.close();
});

// 4. מצב שטח: פקודות בקול ושאלות חירום
await step("field mode walkie", async () => {
  const c = await mk("dark");
  const p = await c.newPage();
  await p.goto(B + `/field/${actId}`, { waitUntil: "networkidle" });
  const t = p.locator(".field-walkie-h button");
  ok((await t.getAttribute("aria-expanded")) === "false", "מכשיר הקשר סגור כברירת מחדל");
  ok((await p.locator(".maoz-walkie").count()) === 0, "לפני הפתיחה אין מיקרופון ואין רכיב");
  await t.click();
  ok((await p.locator(".maoz-walkie.is-field").count()) === 1, "נפתח במצב שטח");
  const stageTitle = () => p.locator("#field-stage").innerText();
  ok(/שלב 1/.test(await stageTitle()), "מתחילים בשלב 1");
  await p.evaluate(() => { window.__heard = "שלב הבא"; });
  await p.locator(".maoz-ptt").click();
  await p.waitForFunction(() => /שלב 2/.test(document.querySelector("#field-stage")?.textContent || ""), null, { timeout: 5000 });
  ok(true, "'שלב הבא' בקול מעביר שלב");
  ok((await p.evaluate(() => window.__spoken.join(" "))).includes("שלב 2"), "המעבר הוקרא");
  await p.locator(".maoz-type input").fill("שלב קודם");
  await p.locator(".maoz-type button[type=submit]").click();
  await p.waitForFunction(() => /שלב 1/.test(document.querySelector("#field-stage")?.textContent || ""), null, { timeout: 5000 });
  ok(true, "'שלב קודם' חוזר");
  await p.locator(".maoz-type input").fill("התחל");
  await p.locator(".maoz-type button[type=submit]").click();
  await p.waitForFunction(() => /השהיה/.test(document.querySelector(".field-controls")?.textContent || ""), null, { timeout: 5000 });
  ok(true, "'התחל' מפעיל טיימר");
  await p.locator(".maoz-type input").fill("עצור");
  await p.locator(".maoz-type button[type=submit]").click();
  await p.waitForFunction(() => !/השהיה/.test(document.querySelector(".field-controls")?.textContent || ""), null, { timeout: 5000 });
  ok(true, "'עצור' משהה");
  // משפט שאינו פקודה הולך למעוז, והמסך נשאר בפעולה
  await p.locator(".maoz-type input").fill("נשאר לי 10 דקות");
  await p.locator(".maoz-type button[type=submit]").click();
  await p.waitForSelector(".maoz-reply", { timeout: 15000 });
  const ans = (await p.locator(".maoz-answer").innerText()).trim();
  ok(ans.length > 20 && /10|עשר|דקות/.test(ans), "'נשאר לי 10 דקות' מקבל תשובה מתוכננת: " + ans.slice(0, 80));
  ok(p.url().includes("/field/"), "נשארים במצב שטח");
  const a = await new AxeBuilder({ page: p }).withTags(AXE_TAGS).analyze();
  ok(a.violations.length === 0, "axe במצב שטח עם תשובה: " + axeMsg(a));
  await c.close();
});

// 5. זוהר ספקולרי: עכבר, מגע, והפחתת תנועה
await step("specular glow", async () => {
  const sg = (p, sel) => p.locator(sel).first().evaluate((e) => ({ sg: getComputedStyle(e).getPropertyValue("--sg").trim(), mx: getComputedStyle(e).getPropertyValue("--mx").trim(), my: getComputedStyle(e).getPropertyValue("--my").trim(), op: getComputedStyle(e, "::after").opacity }));
  // עכבר: כרטיס Bento (בלי הטיית תלת-ממד, כדי שהנקודה תישאר מעל הכרטיס)
  let c = await mk("dark");
  let p = await c.newPage();
  await p.goto(B + "/assistant", { waitUntil: "networkidle" });
  const lab = p.locator("section.v21-card.maoz-lab");
  await lab.scrollIntoViewIfNeeded();
  const box = await lab.boundingBox();
  await p.mouse.move(box.x + 30, box.y + 20);
  await p.mouse.move(box.x + 60, box.y + 40);
  await p.waitForTimeout(600);
  let g = await sg(p, "section.v21-card.maoz-lab");
  ok(g.sg === "1" && /^\d+px$/.test(g.mx) && /^\d+px$/.test(g.my), `עכבר מעל כרטיס Bento: --sg=${g.sg} --mx=${g.mx} --my=${g.my}`);
  ok(Math.abs(parseInt(g.mx) - 60) <= 2 && Math.abs(parseInt(g.my) - 40) <= 2, `המיקום תואם לעכבר (${g.mx}, ${g.my})`);
  ok(Number(g.op) > 0.5, "הכתם נראה (opacity של ::after): " + g.op);
  await p.mouse.move(2, 2);
  await p.waitForTimeout(600);
  g = await sg(p, "section.v21-card.maoz-lab");
  ok(g.sg === "0", "יציאה מהכרטיס מכבה את הזוהר");
  await c.close();
  // כרטיס הפיקוד בעמוד הבית: הכרטיס המכיל מקבל זוהר
  c = await mk("dark");
  p = await c.newPage();
  await p.goto(B + "/", { waitUntil: "networkidle" });
  const cb = await p.locator(".v21-cmd-title").boundingBox();
  await p.mouse.move(cb.x + 4, cb.y + 4);
  await p.mouse.move(cb.x + 8, cb.y + 6);
  await p.waitForTimeout(500);
  const cmd = await sg(p, ".v21-command");
  ok(cmd.sg === "1", "כרטיס הפיקוד מקבל זוהר: " + cmd.sg);
  await c.close();
  // מגע
  c = await mk("light", { touch: true, vp: { width: 390, height: 800 } });
  p = await c.newPage();
  await p.goto(B + "/assistant", { waitUntil: "networkidle" });
  const card = p.locator(".v21-card").first();
  const hit = await card.evaluate((e) => { const r = e.getBoundingClientRect(); e.scrollIntoView({ block: "center" }); const r2 = e.getBoundingClientRect(); return { x: r2.left + 30, y: r2.top + 30 }; });
  await p.evaluate(({ x, y }) => { document.elementFromPoint(x, y).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerType: "touch" })); }, hit);
  await p.waitForTimeout(400);
  g = await sg(p, ".v21-card");
  ok(g.sg === "1" && /px$/.test(g.mx), `מגע: --sg=${g.sg} --mx=${g.mx}`);
  await p.evaluate(({ x, y }) => { document.elementFromPoint(x, y).dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerType: "touch" })); }, hit);
  await p.waitForTimeout(400);
  g = await sg(p, ".v21-card");
  ok(g.sg === "0", "הרמת האצבע מכבה");
  await c.close();
  // הפחתת תנועה, ניגודיות גבוהה וחיסכון: אין זוהר
  for (const [mode, reduced] of [["dark", true], ["hc", false], ["saver", false]]) {
    c = await mk(mode, { reduced });
    p = await c.newPage();
    await p.goto(B + "/", { waitUntil: "networkidle" });
    const b2 = await p.locator("a.v21-node").first().boundingBox();
    await p.mouse.move(b2.x + 20, b2.y + 15);
    await p.mouse.move(b2.x + 40, b2.y + 22);
    await p.waitForTimeout(400);
    const h = await sg(p, "a.v21-node");
    ok(h.sg !== "1", `${mode}${reduced ? "+reduced" : ""}: אין זוהר (--sg=${h.sg})`);
    await c.close();
  }
});

// 6. View Transitions: בדפדפן אוטומטי כבוי כברירת מחדל, ובהפעלה מפורשת עובד בלי לשבור ניווט ולשוניות
await step("view transitions", async () => {
  // ברירת מחדל באוטומציה: אין מעברים
  let c = await mk("dark");
  let p = await c.newPage();
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await p.locator('.home-tabs [role="tab"]').nth(1).click();
  ok((await p.locator('.home-tabs [role="tab"]').nth(1).getAttribute("aria-selected")) === "true", "אוטומציה: לשונית מתחלפת מיד");
  ok((await p.evaluate(() => window.__vt)) === 0, "אוטומציה: startViewTransition לא נקרא");
  await c.close();
  // מופעל: לשוניות וניווט
  c = await mk("dark", { vt: true });
  p = await c.newPage();
  await p.goto(B + "/", { waitUntil: "networkidle" });
  const has = await p.evaluate(() => typeof document.startViewTransition === "function");
  ok(has, "הדפדפן תומך ב-startViewTransition");
  const tabs = p.locator('.home-tabs [role="tab"]');
  await tabs.nth(1).click();
  await p.waitForFunction(() => document.querySelectorAll('.home-tabs [role="tab"]')[1]?.getAttribute("aria-selected") === "true", null, { timeout: 4000 });
  ok(true, "לשונית מתחלפת גם דרך מעבר");
  ok((await p.evaluate(() => window.__vt)) >= 1, "מעבר הלשוניות הופעל");
  await p.waitForFunction(() => document.querySelectorAll('[style*="v21-panel"]').length === 0, null, { timeout: 4000 });
  ok(true, "אין שמות מעבר שנשארו תקועים");
  const before = await p.evaluate(() => window.__vt);
  await p.locator("a.v21-node[href='/plan']").click();
  await p.waitForURL("**/plan", { timeout: 8000 });
  ok(true, "קישור פנימי מנווט דרך מעבר");
  ok((await p.evaluate(() => window.__vt)) > before, "מעבר העמודים הופעל");
  await p.waitForTimeout(500);
  ok((await p.locator("main h1, main .page-title").count()) >= 1, "העמוד החדש נטען");
  // הפחתת תנועה: אין מעבר גם כשמופעל
  await c.close();
  c = await mk("dark", { vt: true, reduced: true });
  p = await c.newPage();
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await p.locator('.home-tabs [role="tab"]').nth(1).click();
  await p.locator("a.v21-node[href='/plan']").click();
  await p.waitForURL("**/plan", { timeout: 8000 });
  ok((await p.evaluate(() => window.__vt)) === 0, "הפחתת תנועה: אין מעברים");
  await c.close();
  // קישור להורדה/API לא נבלע
  c = await mk("dark", { vt: true });
  p = await c.newPage();
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await p.evaluate(() => { const a = document.createElement("a"); a.href = "/api/health"; a.id = "t-api"; a.textContent = "api"; document.querySelector("main").appendChild(a); });
  await Promise.all([p.waitForURL("**/api/health", { timeout: 8000 }), p.locator("#t-api").click()]);
  ok(true, "קישור /api ניווט רגיל ולא נבלע");
  await c.close();
});

// 7. נגישות (axe) בארבעת המצבים, בדסקטופ ובנייד: העוזר עם מכשיר קשר, העוזר עם סימולטור, ומצב שטח עם מכשיר קשר פתוח
for (const mode of Object.keys(MODES)) {
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 800 }]) {
    await step(`axe ${mode} ${vp.width}`, async () => {
      const c = await mk(mode, { vp });
      const p = await c.newPage();
      const bad = [];
      const scan = async (label) => {
        await p.waitForTimeout(450);
        const a = await new AxeBuilder({ page: p }).withTags(AXE_TAGS).analyze();
        if (a.violations.length) bad.push(label + ": " + axeMsg(a));
      };
      await p.goto(B + "/assistant", { waitUntil: "networkidle" });
      await scan("assistant/walkie");
      await p.locator(".maoz-ptt").click();
      await p.waitForSelector(".maoz-reply", { timeout: 15000 });
      await scan("assistant/walkie+reply");
      await p.locator('section.maoz-lab').getByRole("tab", { name: "סימולטור חניכים" }).click();
      await scan("assistant/spar");
      await p.locator(".maoz-sc").first().click();
      await p.waitForSelector(".maoz-line.is-kid", { timeout: 15000 });
      await p.locator("#maoz-spar-say").fill("בואו נתחיל. מי רוצה להציע משחק?");
      await p.getByRole("button", { name: "אמרתי" }).click();
      await p.waitForSelector(".maoz-line.is-me", { timeout: 15000 });
      await p.waitForSelector(".maoz-tip", { timeout: 15000 });
      await scan("assistant/spar-turn");
      await p.getByRole("button", { name: "סיום וציון" }).click();
      await p.waitForSelector(".maoz-report", { timeout: 15000 });
      await scan("assistant/spar-report");
      await p.goto(B + `/field/${actId}`, { waitUntil: "networkidle" });
      await p.locator(".field-walkie-h button").click();
      await scan("field/walkie");
      await p.locator(".maoz-ptt").click();
      await p.waitForSelector(".maoz-reply", { timeout: 15000 });
      await scan("field/walkie+reply");
      ok(bad.length === 0, `axe ${mode} ${vp.width}px` + (bad.length ? " | " + bad.join(" || ") : ""));
      await c.close();
    });
  }
}

await browser.close();
console.log(fails ? "\n" + fails + " FAILURES" : "\nALL OK");
process.exit(fails ? 1 : 0);
