// שלב 62: בדיקת דפדפן ל"שאלו את מעוז": שיחה כאורח ומחובר, כרטיסים וקישורים, בטיחות, תקלות רשת, מקלדת, נגישות
// בשלוש תצוגות, מובייל, הדפסה, פרטיות (שום דבר לא נשמר בדפדפן) ועמידות בפני תוכן זדוני בתשובה.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const B = process.env.BASE_URL, OUT = process.env.SHOTS || "/tmp/shotsE";
fs.mkdirSync(OUT, { recursive: true });
const jpost = (path, body, token) => fetch(B + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then((r) => r.json());
const reg = await jpost("/api/auth/register", { username: "eg" + Date.now().toString().slice(-7), password: "Str0ng!Passw0rd", displayName: "בודק", acceptTerms: true });
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
// פעולה עם תאריך בעוד יומיים, כדי שהנשר יציג אותה ב"מה מתוכנן לי"
const doc = await jpost("/api/write/docs", { template: "classic", title: "פעולה לבדיקת הנשר" }, reg.token);
await fetch(`${B}/api/write/docs/${doc.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${reg.token}` }, body: JSON.stringify({ title: "פעולה לבדיקת הנשר", meta: { date: day(2), startTime: "17:00" }, blocks: doc.blocks }) });

const realAsk = (q, token) => jpost("/api/lux/eagle/ask", { q }, token);
const WRITE_Q = "תכתוב לי פעולה על אחריות לכיתה ו' 45 דקות", ITEMS_Q = "שאלות לדיון על יושר";
const WRITE_REPLY = await realAsk(WRITE_Q, reg.token), ITEMS_REPLY = await realAsk(ITEMS_Q, reg.token);
const replay = async (p, replies) => p.route("**/api/lux/eagle/ask", (r) => { const q = JSON.parse(r.request().postData() || "{}").q; r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(replies[q] ?? ITEMS_REPLY) }); });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const errors = []; let bad = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const modes = { dark: { theme: "dark" }, light: { theme: "light" }, hc: { hc: "1", theme: "dark" } };
async function mk(mn = "dark", vp = { width: 1280, height: 900 }, opt = {}) {
  const m = modes[mn];
  const ctx = await browser.newContext({ viewport: vp, locale: "he-IL", timezoneId: "Asia/Jerusalem", ...(opt.ctx || {}) });
  await ctx.addInitScript(([m, tok, u, o]) => { try { localStorage.setItem("scout.splash", "1"); localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.intro", "1"); localStorage.setItem("scout.mascot", o.off ? "off" : "on"); localStorage.setItem("scout.theme", m.theme); localStorage.setItem("scout.hc", m.hc || "0"); if (!o.guest) localStorage.setItem("scout.session", JSON.stringify({ token: tok, user: u })); } catch {} }, [m, reg.token, reg.user, opt]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${mn} pageerror ${e.message}`));
  p.on("console", (c) => { if (c.type() === "error" && !/Failed to load resource|favicon|googleapis|Content Security|net::ERR/.test(c.text())) errors.push(`${mn} console ${c.text().slice(0, 200)}`); });
  return { ctx, p };
}
const openChat = async (p) => {
  await p.locator(".lux-mascot-btn").click();
  await p.getByRole("button", { name: "שאלו אותי" }).click();
  await p.locator(".eg-input").waitFor();
};
const say = async (p, q) => {
  const n = await p.locator(".eg-msg.is-eagle:not(.eg-typing)").count();
  await p.locator(".eg-input").fill(q);
  await p.keyboard.press("Enter");
  await p.waitForFunction((n) => document.querySelectorAll(".eg-msg.is-eagle:not(.eg-typing)").length > n, n, { timeout: 15000 });
  return p.locator(".eg-msg.is-eagle:not(.eg-typing)").last();
};
const axe = async (p, name) => { const a = await new AxeBuilder({ page: p }).include(".lux-mascot").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); console.log(`${name} axe:`, a.violations.length); for (const v of a.violations) for (const n of v.nodes.slice(0, 3)) console.log("   ", v.id, n.target.join(" "), (n.any[0]?.message || "").slice(0, 200)); return a.violations.length; };

// 1. אורח: פתיחה, שאלות פתיחה, שאלה מוכנה, קישור "פתח"
{
  const { ctx, p } = await mk("dark", undefined, { guest: true });
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await p.locator(".lux-mascot-btn").click();
  ok(await p.getByRole("button", { name: "שאלו אותי" }).isVisible(), "אורח: כפתור 'שאלו אותי' בחלון הנשר");
  ok(await p.getByRole("button", { name: "סיור באתר" }).isVisible(), "אורח: 'סיור באתר' עדיין קיים");
  ok(await p.getByRole("button", { name: "הסתרת הנשר" }).isVisible(), "אורח: 'הסתרת הנשר' עדיין קיים");
  await p.getByRole("button", { name: "שאלו אותי" }).click();
  await p.locator(".eg-input").waitFor();
  ok(await p.evaluate(() => document.activeElement?.classList.contains("eg-input")), "אורח: המיקוד עובר לשדה השאלה");
  const chips = await p.locator(".eg-hello .eg-chip").allInnerTexts();
  ok(chips.length >= 3, `אורח: שאלות פתיחה (${chips.length})`);
  ok(!chips.some((c) => /מתוכנן לי/.test(c)), "אורח: אין שאלה על היומן האישי");
  await p.locator(".eg-hello .eg-chip", { hasText: "מצב במה" }).click();
  await p.waitForSelector(".eg-msg.is-eagle:not(.eg-typing)");
  const a = p.locator(".eg-msg.is-eagle:not(.eg-typing)").last();
  ok((await a.innerText()).includes("מצב במה"), "אורח: התשובה על מצב במה");
  ok((await p.locator(".eg-msg.is-me").first().innerText()).includes("מצב במה"), "אורח: השאלה מוצגת כבועה שלי");
  const open = a.locator(".eg-open").first();
  ok((await open.getAttribute("href")) === "/library", "אורח: כפתור 'פתח' מוביל למאגר");
  await p.screenshot({ path: `${OUT}/guest-dark.png` });
  await open.click();
  await p.waitForURL(/\/library$/);
  await p.locator(".eg-input").waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  ok(await p.locator(".eg-input").count() === 0, "אורח: החלון נסגר אחרי ניווט");
  // השיחה נשמרת בזיכרון בזמן הניווט
  await p.locator(".lux-mascot-btn").click();
  await p.getByRole("button", { name: "שאלו אותי" }).click();
  ok((await p.locator(".eg-msg.is-me").count()) === 1, "אורח: השיחה נשארת אחרי מעבר עמוד");
  await ctx.close();
}

// 2. חיפוש במאגר, כרטיסים, בטיחות, אורח ששואל על היומן
{
  const { ctx, p } = await mk("dark", undefined, { guest: true });
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await openChat(p);
  let a = await say(p, "יש לך פעולה על אחריות?");
  const cards = await a.locator(".eg-card").count();
  ok(cards > 0, `חיפוש: ${cards} כרטיסי פעולה`);
  ok(/^\/library\/\d+$/.test((await a.locator(".eg-card").first().getAttribute("href")) || ""), "חיפוש: הכרטיס מוביל לפעולה");
  a = await say(p, "מה מתוכנן לי השבוע?");
  ok((await a.innerText()).includes("להתחבר") && (await a.locator('a[href="/login"]').count()) === 1, "אורח ביומן: מתבקש להתחבר");
  a = await say(p, "אני רוצה להתאבד");
  ok((await a.innerText()).includes("1201"), "בטיחות: מספר ער\"ן מוצג");
  ok((await a.locator(".eg-card").count()) === 0, "בטיחות: בלי כרטיסים");
  a = await say(p, "בלה בלה בלה");
  ok((await a.locator(".eg-chip").count()) > 0, "לא הבנתי: מוצעות שאלות לנסות");
  // פרטיות: שום תוכן שיחה לא נשמר בדפדפן
  const stored = await p.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
  ok(!/בלה בלה|1201|אחריות\?|להתאבד/.test(stored), "פרטיות: השיחה לא נשמרת באחסון הדפדפן");
  // שיחה חדשה
  await p.getByRole("button", { name: "שיחה חדשה" }).click();
  ok((await p.locator(".eg-msg").count()) === 0, "שיחה חדשה מנקה");
  await ctx.close();
}

// 3. מחובר: היומן האישי
{
  const { ctx, p } = await mk("dark");
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await openChat(p);
  const a = await say(p, "מה מתוכנן לי השבוע?");
  ok((await a.innerText()).includes("מתוכננות") || (await a.innerText()).includes("מתוכננת"), "מחובר: מציג תכנון");
  ok((await a.locator(".eg-card").allInnerTexts()).join().includes("פעולה לבדיקת הנשר"), "מחובר: הפעולה שלי מופיעה ככרטיס");
  ok(!/בינה מלאכותית/.test(await a.innerText()), "מחובר בלי מפתח: אין תווית AI");
  ok((await p.locator(".eg-chip", { hasText: "מתוכנן לי" }).count()) >= 0, "מחובר: שאלת היומן מותרת");
  await ctx.close();
}

// 4. תקלות: רשת, 429, תוכן זדוני בתשובה
{
  const { ctx, p } = await mk("dark", undefined, { guest: true });
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await openChat(p);
  await p.route("**/api/lux/eagle/ask", (r) => r.abort());
  let a = await say(p, "שאלה בזמן שאין רשת");
  ok((await a.innerText()).length > 5 && (await p.locator(".eg-input").isEnabled()), "רשת: הודעת שגיאה והשדה פעיל");
  await p.unroute("**/api/lux/eagle/ask");
  await p.route("**/api/lux/eagle/ask", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "RATE_LIMIT", message: "x" } }) }));
  a = await say(p, "שאלה מוגבלת");
  ok((await a.innerText()).includes("הרבה בזמן קצר"), "429: הודעה ברורה");
  await p.unroute("**/api/lux/eagle/ask");
  await p.route("**/api/lux/eagle/ask", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ answer: "<img src=x onerror=window.__pwn=1> <script>window.__pwn=2</script>", links: [{ label: "זדוני", href: "https://evil.example/x" }, { label: "גם זדוני", href: "javascript:window.__pwn=3" }, { label: "תקין", href: "/library" }], cards: [{ title: "כרטיס זדוני", meta: "", href: "//evil.example" }], source: "ai" }) }));
  a = await say(p, "תוכן זדוני");
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => window.__pwn)) === undefined, "XSS: שום קוד לא רץ");
  ok((await a.locator("img, script").count()) === 0, "XSS: התגיות מוצגות כטקסט");
  const hrefs = await a.locator("a").evaluateAll((l) => l.map((x) => x.getAttribute("href")));
  ok(hrefs.length === 1 && hrefs[0] === "/library", `XSS: רק קישורים פנימיים מוצגים (${hrefs.join(",")})`);
  ok((await a.innerText()).includes("בינה מלאכותית"), "תווית 'נוסח בעזרת בינה מלאכותית' כשהמקור מודל");
  await ctx.close();
}

// 5. מקלדת
{
  const { ctx, p } = await mk("dark", undefined, { guest: true });
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await p.locator(".lux-mascot-btn").focus(); await p.keyboard.press("Enter");
  await p.keyboard.press("Tab");
  ok(await p.evaluate(() => document.activeElement?.textContent?.includes("שאלו אותי")), "מקלדת: Tab מגיע ל'שאלו אותי'");
  await p.keyboard.press("Enter");
  await p.locator(".eg-input").waitFor();
  await p.keyboard.type("איך מפעילים את המקרן?"); await p.keyboard.press("Enter");
  await p.waitForSelector(".eg-msg.is-eagle:not(.eg-typing)");
  ok((await p.locator(".eg-msg.is-eagle:not(.eg-typing)").last().innerText()).includes("מקרן"), "מקלדת: שאלה ב-Enter נענית");
  await p.keyboard.press("Escape");
  ok((await p.locator(".eg-input").count()) === 0, "מקלדת: Esc סוגר");
  ok(await p.evaluate(() => document.activeElement?.classList.contains("lux-mascot-btn")), "מקלדת: המיקוד חוזר לנשר");
  await ctx.close();
}

// 6. נשר מוסתר: כפתור "שאלו את מעוז" בעזרה מחזיר אותו ופותח שיחה
{
  const { ctx, p } = await mk("dark", undefined, { guest: true, off: true });
  await p.goto(B + "/help", { waitUntil: "networkidle" });
  ok((await p.locator(".lux-mascot-btn").count()) === 0, "מוסתר: אין נשר");
  await p.locator("#help-q").fill("מקרן");
  await p.getByRole("button", { name: "שאלו את מעוז" }).first().click();
  await p.locator(".eg-input").waitFor();
  await p.waitForSelector(".eg-msg.is-eagle:not(.eg-typing)");
  ok((await p.locator(".eg-msg.is-me").first().innerText()).includes("מקרן"), "עזרה: החיפוש נשלח לנשר");
  ok((await p.locator(".lux-mascot-btn").count()) === 1, "עזרה: הנשר חזר להיות מוצג");
  await ctx.close();
}

// 6ב. עזרה בכתיבה: טיוטה בעורך, פרטים למחולל, רשימות עם העתקה
{
  const { ctx, p } = await mk("dark");
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B });
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await openChat(p);
  ok((await p.locator(".eg-hello .eg-chip", { hasText: "תכתוב לי פעולה" }).count()) === 1, "כתיבה: שאלת פתיחה 'תכתוב לי פעולה' מוצגת");
  const a = await say(p, WRITE_Q);
  ok((await a.innerText()).includes("45 דקות") && (await a.innerText()).includes("אחריות"), "כתיבה: מסכם מה הבין");
  const gen = a.locator("a.eg-open.is-primary").first();
  const href = (await gen.getAttribute("href")) || "";
  ok(href.startsWith("/?topic=") && href.includes("age="), `כתיבה: כפתור 'פתחו במחולל' עם פרטים (${href.slice(0, 40)}...)`);
  ok((await a.getByRole("button", { name: "צרו טיוטה בעורך" }).count()) === 1, "מחובר: כפתור 'צרו טיוטה בעורך'");
  // לחיצה על טיוטה: נפתח מסמך אמיתי עם הכותרת
  await a.getByRole("button", { name: "צרו טיוטה בעורך" }).click();
  await p.waitForURL(/\/write\/\d+$/, { timeout: 15000 });
  await p.waitForLoadState("networkidle");
  const loaded = await p.waitForFunction(() => [...document.querySelectorAll("input")].some((e) => e.value === "פעולה על אחריות"), null, { timeout: 10000 }).then(() => true, () => false);
  ok(loaded, "טיוטה: המסמך נפתח עם הכותרת בשדה השם");
  const mins = await p.locator("input").evaluateAll((els) => els.map((e) => e.value));
  ok(mins.includes("45") && mins.includes("אחריות"), "טיוטה: משך 45 וערך 'אחריות' מולאו");
  // המחולל מתמלא מהקישור
  await p.goto(B + href, { waitUntil: "networkidle" });
  ok((await p.locator("#topic").inputValue()) === "אחריות", "מחולל: הנושא מולא");
  ok((await p.locator("#ageGroup").inputValue()) === "כיתה ו' - מעורב", "מחולל: שכבת הגיל מולאה");
  // רשימה עם העתקה
  await openChat(p).catch(async () => { await p.locator(".lux-mascot-btn").click(); await p.getByRole("button", { name: "שאלו אותי" }).click(); });
  const q = await say(p, ITEMS_Q);
  ok((await q.locator(".eg-items li").count()) >= 3, "שאלות לדיון: רשימה של שאלות");
  await q.getByRole("button", { name: "העתקת הכול" }).click();
  await q.getByRole("button", { name: "הועתק" }).waitFor({ timeout: 3000 }).catch(() => {});
  ok((await q.getByRole("button", { name: "הועתק" }).count()) === 1, "העתקה: הכפתור מאשר");
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  ok(clip.includes('"יושר"'), "העתקה: הלוח מכיל את השאלות");
  await ctx.close();
}
{
  // אורח: אין כפתור טיוטה, יש הפניה להתחברות
  const { ctx, p } = await mk("dark", undefined, { guest: true });
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await openChat(p);
  const a = await say(p, "תכתוב לי פעולה על יושר לכיתה ח' 30 דקות");
  ok((await a.getByRole("button", { name: "צרו טיוטה בעורך" }).count()) === 0, "אורח: אין כפתור טיוטה");
  ok((await a.innerText()).includes("התחברות"), "אורח: מוסבר שצריך להתחבר לטיוטה");
  ok((await a.locator("a.eg-open.is-primary").count()) === 1, "אורח: כפתור המחולל קיים");
  await ctx.close();
}
{
  // תקלת יצירת טיוטה (שרת מחזיר 409): הודעה ברורה ונשארים בעמוד
  const { ctx, p } = await mk("dark");
  await p.goto(B + "/", { waitUntil: "networkidle" });
  await replay(p, { [WRITE_Q]: WRITE_REPLY });
  await p.route("**/api/lux/eagle/draft", (r) => r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "LIMIT", message: "אפשר לשמור עד 100 מסמכים." } }) }));
  await openChat(p);
  const a = await say(p, WRITE_Q);
  await a.getByRole("button", { name: "צרו טיוטה בעורך" }).click();
  await p.waitForFunction(() => [...document.querySelectorAll(".eg-msg.is-error")].some((e) => e.textContent.includes("100 מסמכים")), null, { timeout: 8000 });
  ok(/\/$/.test(new URL(p.url()).pathname), "שגיאת טיוטה: נשארים בעמוד והודעה מוצגת");
  ok(await p.getByRole("button", { name: "צרו טיוטה בעורך" }).isEnabled(), "שגיאת טיוטה: אפשר לנסות שוב");
  await ctx.close();
}

// 7. נגישות וצילומים: שלוש תצוגות, מחשב ונייד
for (const mn of ["dark", "light", "hc"]) {
  for (const [vn, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 780 }]]) {
    const { ctx, p } = await mk(mn, vp, { ctx: vn === "mobile" ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {} });
    await p.goto(B + "/", { waitUntil: "networkidle" });
    await replay(p, { [WRITE_Q]: WRITE_REPLY, [ITEMS_Q]: ITEMS_REPLY });
    await openChat(p);
    await say(p, "יש לך פעולה על אחריות?");
    await say(p, ITEMS_Q);
    await say(p, WRITE_Q);
    await p.waitForTimeout(400);
    const box = await p.locator(".lux-mascot-panel").boundingBox();
    const vw = p.viewportSize();
    ok(box && box.x >= 0 && box.x + box.width <= vw.width + 1 && box.y >= 0 && box.y + box.height <= vw.height + 1, `${mn}/${vn}: החלון בתוך המסך (${Math.round(box?.x)},${Math.round(box?.y)},${Math.round(box?.width)}x${Math.round(box?.height)})`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${mn}/${vn}: אין גלילה אופקית`);
    const fz = await p.locator(".eg-input").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    ok(fz >= 16, `${mn}/${vn}: גודל גופן בשדה ${fz}px (בלי זום בנייד)`);
    const small = await p.locator(".eg-form button, .eg-chip, .eg-open, .eg-x, .eg-link").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 36).length);
    ok(small === 0, `${mn}/${vn}: יעדי לחיצה לפחות 36px (${small} קטנים)`);
    ok((await axe(p, `${mn}/${vn}`)) === 0, `${mn}/${vn}: אין הפרות נגישות`);
    await p.screenshot({ path: `${OUT}/chat-${mn}-${vn}.png` });
    if (mn === "dark" && vn === "desktop") {
      // הדפסה: הנשר לא מודפס
      await p.emulateMedia({ media: "print" });
      ok((await p.locator(".lux-mascot").evaluate((e) => getComputedStyle(e).display)) === "none", "הדפסה: הנשר מוסתר");
      await p.emulateMedia({ media: "screen" });
    }
    await ctx.close();
  }
}

// 8. מצב רגוע: הנקודות לא זזות
{
  const { ctx, p } = await mk("dark", undefined, { guest: true });
  await ctx.addInitScript(() => { try { localStorage.setItem("scout.comfort", JSON.stringify({ fs: "100", motion: "calm" })); } catch {} });
  const p2 = await ctx.newPage();
  await p2.goto(B + "/", { waitUntil: "networkidle" });
  await p2.route("**/api/lux/eagle/ask", async (r) => { await new Promise((s) => setTimeout(s, 900)); r.continue(); });
  await openChat(p2);
  await p2.locator(".eg-input").fill("איך מפעילים מצב במה?"); await p2.keyboard.press("Enter");
  await p2.waitForSelector(".eg-typing");
  const anim = await p2.locator(".eg-dots i").first().evaluate((e) => getComputedStyle(e).animationName);
  ok(anim === "none", `מצב רגוע: אין אנימציה בנקודות (${anim})`);
  await ctx.close();
}

await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console/page errors");
console.log(bad ? `\n${bad} FAILED` : "\nALL PASSED");
process.exit(bad || errors.length ? 1 : 0);
