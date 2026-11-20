// שלב 71 + 72: בדיקת דפדפן לממשק של שלב 71 (סטודיו סטורי, זירת משחק, מקרן, התנגשויות ביומן וארון הציוד).
// הפונקציונליות נבדקת פעם אחת (מצב כהה). אחר כך נבדקות נגישות (axe) וגלישה אופקית בכל ארבעת המצבים (כהה, בהיר, ניגודיות גבוהה, חיסכון) ובהפחתת תנועה.
// שימוש, מתיקיית e2e: sh run-fresh.sh e2e-round-au.mjs
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";

const B = process.env.BASE_URL || "http://localhost:5055";
const J = { "Content-Type": "application/json" };
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (n, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", n, "-", e.message.split("\n").slice(0, 3).join(" | ")); } };

const post = (p, tok, body) => fetch(B + p, { method: "POST", headers: { ...J, ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const ADMIN_PW = "Strong#Pass99", NEW_PW = "Zq9!Fresh-boss-pw-72";
let L = await post("/api/auth/login", null, { username: "admin", password: NEW_PW });
if (L.status !== 200) L = await post("/api/auth/login", null, { username: "admin", password: ADMIN_PW });
if (L.body?.user?.mustChangePw) {
  await post("/api/auth/change-password", L.body.token, { currentPassword: ADMIN_PW, newPassword: NEW_PW });
  L = await post("/api/auth/login", null, { username: "admin", password: NEW_PW });
}
const admin = L.body;
ok(!!admin?.token, "admin נכנס");
const reg = await post("/api/auth/register", null, { username: "hadas" + Date.now().toString().slice(-5), password: "Str0ng-e2e-pw-71", displayName: "הדס", acceptTerms: true, signupCode: "maoz2026" });
ok(!!reg.body?.token, "מדריכה שנייה נרשמה");

const acts = await (await fetch(B + "/api/activities?limit=1")).json();
const act = (acts.items ?? acts)[0];
ok(!!act?.id, "יש פעולה בסיס הנתונים");

const il = (d = 0) => new Date(Date.now() + d * 864e5).toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
const TODAY = il();
await post("/api/me/schedule", reg.body.token, { title: "פעולה של הדס", date: TODAY, time: "17:00", durationMin: 60, room: "חדר בדיקה", gear: ["ball"] });

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

const suite = async (first) => {
  /* ───── סטודיו ייצוא ב-390px ───── */
  await step("studio 390", async () => {
    const { c, p } = await mk({ width: 390, height: 844 });
    await p.goto(`${B}/library/${act.id}/studio`);
    await p.waitForSelector('[role="tablist"]');
    for (const tab of ["מסמך", "כרטיסים", "כרזה", "סטורי הזמנה"]) {
      const t = p.getByRole("tab", { name: new RegExp(tab) }).first();
      if (await t.count()) { await t.click(); await p.waitForTimeout(500); } else if (tab !== "מסמך") ok(false, `לשונית ${tab} חסרה`);
      const o = await overflow(p, 390);
      ok(o.sw <= o.cw && o.bad.length === 0, `390px בלי גלילה אופקית: ${tab} (scrollWidth ${o.sw}/${o.cw}) ${o.bad.join(", ")}`);
    }
    await c.close();
  });

  /* ───── כרטיס סטורי: ציור, אירוע אישור הגעה, QR והורדה ───── */
  await step("story flow", async () => {
    const { c, p } = await mk({ width: 1280, height: 900 });
    await p.goto(`${B}/library/${act.id}/studio`);
    await p.getByRole("tab", { name: /סטורי הזמנה/ }).click();
    await p.waitForSelector("canvas.story71-canvas");
    await p.fill("#st-place", "המועדון");
    await p.fill("#st-date", TODAY);
    await p.fill("#st-time", "17:30");
    await p.waitForTimeout(900);
    const px = await p.evaluate(() => { const c = document.querySelector("canvas.story71-canvas"); const d = c.getContext("2d").getImageData(540, 960, 1, 1).data; const t = c.getContext("2d").getImageData(540, 250, 1, 1).data; return { w: c.width, h: c.height, mid: [...d], top: [...t] }; });
    ok(px.w === 1080 && px.h === 1920, "הקנבס 1080×1920");
    ok(px.mid[3] === 255 && px.mid.some((v) => v > 0), "הכרטיס צויר (פיקסל לא ריק)");
    if (first) {
      await p.fill("#st-phone", "050-1234567");
      await p.getByRole("button", { name: "יצירת קישור אישור הגעה" }).click();
      await p.waitForSelector("text=האירוע פעיל");
      await p.waitForTimeout(1100);
      const dl = p.waitForEvent("download");
      await p.getByRole("button", { name: /הורדת תמונה/ }).click();
      const d = await dl;
      const path = await d.path();
      const buf = readFileSync(path);
      ok(buf.slice(1, 4).toString() === "PNG" && buf.length > 20000, `ירד PNG אמיתי (${buf.length} בייט)`);
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      ok(w === 1080 && h === 1920, `גודל התמונה שירדה ${w}×${h}`);
      const evs = await (await fetch(B + "/api/admin/wa/rsvp", { headers: { Authorization: "Bearer " + admin.token } })).json();
      ok(evs.some((e) => /^[a-z0-9]{6}$/.test(e.key)), "האירוע נרשם ברשימת אישורי ההגעה");
    }
    await axe(p, "טאב סטורי", ".story71");
    await c.close();
  });

  /* ───── זירת משחק: במה, מקרן, חידון, גלגל, לוח ניקוד ───── */
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await step(`arena ${vp.width}`, async () => {
      const { c, p } = await mk(vp);
      await p.goto(`${B}/stage/${act.id}`);
      await p.waitForSelector(".stg-icon");
      await p.getByRole("button", { name: /זירת משחק/ }).first().click();
      await p.waitForSelector('[role="dialog"][aria-label="זירת משחק"]');
      ok(true, `הזירה נפתחה (${vp.width}px)`);
      await p.getByRole("button", { name: "התחלת החידון" }).click();
      await p.waitForSelector(".arn-opts");
      ok((await p.locator(".arn-opt").count()) >= 3, "שאלה עם אפשרויות");
      await p.getByRole("button", { name: "גלו את התשובה" }).click();
      ok((await p.locator(".arn-opt.right").count()) === 1, "התשובה הנכונה מסומנת (✓)");
      await p.locator(".arn-team").first().click();
      await p.waitForTimeout(700);
      ok(/10/.test(await p.locator(".arn-score").first().innerText()), "הניקוד עלה ל-10 במסך");
      await p.getByRole("tab", { name: "גלגל מזל" }).click();
      await p.getByRole("button", { name: "סיבוב" }).click();
      await p.waitForSelector("text=נבחר:", { timeout: 9000 });
      ok(true, "הגלגל נעצר על תוצאה");
      const o = await overflow(p, vp.width);
      ok(o.sw <= o.cw, `הזירה בלי גלילה אופקית ב-${vp.width}px (${o.sw}/${o.cw})`);
      await axe(p, `זירה ${vp.width}`, ".arn");
      await p.keyboard.press("Escape");
      await p.waitForSelector('[role="dialog"][aria-label="זירת משחק"]', { state: "detached" });
      ok(true, "Esc סוגר את הזירה");
      await c.close();
    });
  }
  await step("projector arena + hc", async () => {
    const { c, p } = await mk({ width: 1280, height: 800 }, { hc: true });
    await p.goto(`${B}/projector/${act.id}`);
    await p.waitForSelector(".prj-btn");
    await p.keyboard.press("g");
    await p.waitForSelector(".arn-projector");
    ok(true, "המקרן פותח זירה במקש G");
    await p.getByRole("button", { name: "התחלת החידון" }).click();
    await p.waitForSelector(".arn-opts");
    await c.close();
  });

  /* ───── יומן: התראת התנגשות חיה והנעילה ───── */
  await step("calendar clash", async () => {
    const { c, p } = await mk({ width: 390, height: 844 });
    await p.goto(`${B}/calendar`);
    await p.getByRole("button", { name: "אירוע חדש" }).click();
    await p.waitForSelector("#sc-room");
    await p.fill("#sc-title", "אירוע בדיקה").catch(() => {});
    await p.fill("#sc-time", "17:30");
    await p.fill("#sc-room", "חדר בדיקה");
    await p.waitForSelector("#sc-clash", { timeout: 5000 });
    const txt = await p.locator("#sc-clash").innerText();
    ok(/הדס/.test(txt) && /חדר בדיקה/.test(txt), "התראה חיה מציגה מי תופס את החדר: " + txt.replace(/\s+/g, " ").slice(0, 90));
    ok(await p.getByRole("button", { name: "שמירה" }).isDisabled(), "כפתור השמירה נעול בזמן התנגשות");
    ok(await p.getByRole("button", { name: /לשבץ בכל זאת/ }).isVisible(), "יש אפשרות מפורשת לשבץ בכל זאת");
    await p.fill("#sc-time", "19:00");
    await p.waitForSelector("#sc-clash", { state: "detached", timeout: 5000 });
    ok(await p.getByRole("button", { name: "שמירה" }).isEnabled(), "אחרי שינוי שעה ההתראה נעלמת והשמירה פתוחה");
    await p.fill("#sc-time", "17:30");
    await p.waitForSelector("#sc-clash");
    const o = await overflow(p, 390);
    ok(o.sw <= o.cw, `מודל השיבוץ בלי גלילה אופקית ב-390px (${o.sw}/${o.cw})`);
    await axe(p, "מודל שיבוץ עם התנגשות");
    if (first) {
      await p.getByRole("button", { name: /לשבץ בכל זאת/ }).click();
      await p.waitForTimeout(1200);
      await p.goto(`${B}/calendar`);
      await p.waitForSelector(".cal71-alert", { timeout: 6000 });
      ok(true, "אחרי שיבוץ בכוח מופיע באנר התנגשות ביומן");
      await p.goto(`${B}/cupboard`);
      await p.waitForSelector(".res71");
      const o2 = await overflow(p, 390);
      ok(o2.sw <= o2.cw && (await p.locator(".res71-days li li").count()) >= 1, "ארון הציוד מציג תפוסה בשבועיים הקרובים, בלי גלילה אופקית");
    }
    await c.close();
  });
};

for (const [mode, reduced] of [["dark", false], ["light", false], ["hc", false], ["saver", false], ["dark", true]]) {
  MODE = mode;
  REDUCED = reduced;
  await suite(mode === "dark" && !reduced);
}

console.log(errors.length ? "שגיאות דפדפן:\n" + [...new Set(errors)].join("\n") : "אין שגיאות דפדפן");
await browser.close();
console.log(fails ? `FAILED ${fails}` : "ALL OK");
