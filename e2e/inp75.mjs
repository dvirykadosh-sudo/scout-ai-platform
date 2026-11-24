// שלב 75: מדידת תגובתיות (INP) של עורך הכתיבה במסמך כבד, לפני ואחרי פירוק העורך לרכיבים.
// מסמך של 40 שלבים (כ-2,500 תווים בכל אחד) נפתח בדפדפן עם האטת מעבד פי 4. מקלידים בשלב אחד, מוסיפים שלב ומשנים משך.
// INP לפי ההגדרה של Chrome: לכל אינטראקציה לוקחים את האירוע הארוך ביותר, ומדווחים על האחרון מבין ה-98 האחוזונים (ב-N<50 זה הגרוע ביותר).
// שימוש, מתיקיית e2e: sh run-fresh.sh inp75.mjs   (הפלט נשמר ב-KEEP_LOGS אם הוגדר)
import { chromium } from "playwright-core";

const B = process.env.BASE_URL || "http://localhost:5055";
const J = { "Content-Type": "application/json" };
const THROTTLE = Number(process.env.THROTTLE || 4);
const RUNS = Number(process.env.RUNS || 3);
const call = (method, p, tok, body) => fetch(B + p, { method, headers: { ...J, ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const username = "inp" + Math.random().toString(36).slice(2, 8);
const reg = await call("POST", "/api/auth/register", null, { username, password: "Str0ng!Passw0rd75x", displayName: "מודד", acceptTerms: true, signupCode: process.env.SIGNUP_CODE || "maoz2026" });
if (!reg.body?.token) throw new Error("הרשמה נכשלה: " + JSON.stringify(reg.body));
const tok = reg.body.token;

const WORDS = "אנחנו מתחילים בסיפור קצר על אומץ ועל חברות ואחר כך חוזרים למעגל כדי לשתף במה שהרגשנו ומה למדנו מהחוויה המשותפת של כולנו".split(" ");
const para = (n) => Array.from({ length: n }, (_, i) => WORDS[(i * 7 + n) % WORDS.length]).join(" ") + ".";
const text = () => Array.from({ length: 8 }, (_, i) => para(40 + i * 3)).join("\n\n").slice(0, 2500);
const created = await call("POST", "/api/write/docs", tok, { template: "blank", title: "מסמך כבד למדידה" });
const id = created.body.id;
const blocks = Array.from({ length: 40 }, (_, i) => ({ id: "b" + String(i).padStart(3, "0"), title: `שלב ${i + 1}`, kind: i === 0 ? "open" : i === 39 ? "close" : "body", minutes: 2, text: text(), note: "" }));
const put = await call("PUT", `/api/write/docs/${id}`, tok, { title: "מסמך כבד למדידה", meta: { ageGroup: "", minutes: 80 }, blocks, baseRev: created.body.rev });
if (put.status !== 200) throw new Error("יצירת המסמך הכבד נכשלה: " + JSON.stringify(put.body));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const results = [];
const pool = [];
const procs = [];
const press = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", timezoneId: "Asia/Jerusalem" });
  await ctx.addInitScript(([sess]) => {
    try {
      for (const k of ["scout.splash", "scout.hero.seen", "scout.intro"]) localStorage.setItem(k, "1");
      localStorage.setItem("scout.mascot", "off");
      localStorage.setItem("scout.session", sess);
      localStorage.setItem("scout.theme", "dark");
    } catch {}
    window.__ev = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.interactionId) window.__ev.push({ id: e.interactionId, name: e.name, d: e.duration, proc: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime, pres: e.startTime + e.duration - e.processingEnd });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  }, [JSON.stringify({ token: tok, user: reg.body.user })]);
  const p = await ctx.newPage();
  await p.goto(`${B}/write/${id}`, { waitUntil: "networkidle" });
  await p.waitForSelector("#wb-text-b000", { timeout: 30000 });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await p.evaluate(() => (window.__ev.length = 0));
  // 1) הקלדה רציפה בשלב אחד (הכי חשוב: זה מה שהמדריך עושה כל היום)
  await p.click("#wb-text-b000");
  await p.keyboard.press("Control+End");
  for (let i = 0; i < 40; i++) await p.keyboard.type(i % 9 === 8 ? " " : "אבגדהוזחט"[i % 9], { delay: 30 });
  await p.waitForTimeout(300);
  // 2) שינוי משך בשלב אחר ובדיקת הסימון "מוכן"
  await p.click("#wb-min-b010");
  await p.keyboard.type("7", { delay: 30 });
  await p.waitForTimeout(200);
  // 3) מעבר בין שלבים בלחיצה על כותרת
  await p.click("#wb-title-b020");
  await p.keyboard.type("א", { delay: 30 });
  await p.waitForTimeout(400);
  const ev = await p.evaluate(() => window.__ev);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // אינטראקציה = interactionId; לוקחים את הארוך ביותר בכל אחת
  const per = new Map();
  for (const e of ev) per.set(e.id, Math.max(per.get(e.id) ?? 0, e.d));
  const ds = [...per.values()].sort((a, b) => a - b);
  const q = (f) => ds[Math.min(ds.length - 1, Math.floor(ds.length * f))] ?? 0;
  const inp = ds.length < 50 ? ds[ds.length - 1] ?? 0 : q(0.98);
  results.push({ inp, p75: q(0.75), n: ds.length });
  pool.push(...ds);
  const pr = new Map(), ps = new Map();
  for (const e of ev) { pr.set(e.id, Math.max(pr.get(e.id) ?? 0, e.proc)); ps.set(e.id, Math.max(ps.get(e.id) ?? 0, e.pres)); }
  procs.push(...pr.values());
  press.push(...ps.values());
  console.log(`ריצה ${run + 1}: INP=${inp.toFixed(0)}ms · חציון עליון(p75)=${q(0.75).toFixed(0)}ms · אינטראקציות=${ds.length}`);
  await ctx.close();
}
await browser.close();
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`INP75 חציון בין ${RUNS} ריצות (האטה x${THROTTLE}, 40 שלבים): INP=${med(results.map((r) => r.inp)).toFixed(0)}ms · p75=${med(results.map((r) => r.p75)).toFixed(0)}ms`);
pool.sort((a, b) => a - b);
const pq = (f) => pool[Math.min(pool.length - 1, Math.floor(pool.length * f))] ?? 0;
console.log(`מאוחד (${pool.length} אינטראקציות מכל הריצות): חציון=${pq(0.5).toFixed(0)}ms · p75=${pq(0.75).toFixed(0)}ms · p90=${pq(0.9).toFixed(0)}ms · הגרוע=${pq(1).toFixed(0)}ms`);
const mq = (arr, f) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * f))] ?? 0; };
console.log(`פירוק: זמן הקוד שלנו (processing) חציון=${mq(procs, 0.5).toFixed(0)}ms p75=${mq(procs, 0.75).toFixed(0)}ms · השהיית ציור (presentation) חציון=${mq(press, 0.5).toFixed(0)}ms p75=${mq(press, 0.75).toFixed(0)}ms`);
console.log("ALL OK");
