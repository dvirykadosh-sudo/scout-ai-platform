import { chromium } from "playwright-core";
const B = "http://localhost:5055";
const J = { "Content-Type": "application/json" };
const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: "vid" + Date.now().toString().slice(-6), password: "Str0ng-e2e-pw-26", displayName: "דביר", signupCode: "maoz2026", acceptTerms: true }) })).json();
const H = { ...J, Authorization: "Bearer " + r.token };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, locale: "he-IL" });
await ctx.addInitScript(([t, u]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.splash", "1"); localStorage.setItem("scout.theme", "dark"); localStorage.setItem("scout.session", JSON.stringify({ token: t, user: u })); } catch {} }, [r.token, r.user]);
const p = await ctx.newPage();
const shot = async (n, cap, loc) => {
  let box = null;
  if (loc) { await loc.first().scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(200); box = await loc.first().boundingBox().catch(() => null); }
  await p.evaluate(([cap, box]) => {
    document.getElementById("vcap")?.remove(); document.getElementById("vhl")?.remove();
    if (box) { const h = document.createElement("div"); h.id = "vhl"; h.style.cssText = `position:fixed;z-index:9998;left:${box.x - 6}px;top:${box.y - 6}px;width:${box.width + 12}px;height:${box.height + 12}px;border:4px solid #ffd54a;border-radius:16px;box-shadow:0 0 28px #ffd54a;pointer-events:none`; document.body.appendChild(h); }
    const c = document.createElement("div"); c.id = "vcap"; c.dir = "rtl";
    c.style.cssText = "position:fixed;z-index:9999;inset-inline:0;bottom:0;padding:20px 40px 24px;background:linear-gradient(0deg,rgba(10,5,28,.97),rgba(10,5,28,.9));color:#fff;font:800 36px Heebo,Arial,sans-serif;text-align:center;border-top:3px solid #8a4bf0";
    c.textContent = cap; document.body.appendChild(c);
  }, [cap, box]);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `/tmp/vid2/scene${n}.png` });
};
const next = async () => { await p.getByRole("button", { name: "המשך" }).click(); await p.waitForTimeout(450); };
await p.goto(B + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
await shot(1, "מחולל פעולות: פעולה מוכנה בכמה דקות", null);
await p.getByLabel("נושא הפעולה").fill("אחריות אישית");
await shot(2, "1. כותבים נושא, בוחרים גיל וערך מוביל", p.getByLabel("נושא הפעולה"));
await next(); await next();
await p.getByText("משחק תחרות").first().click(); await p.getByText("דיון בשאלה").first().click(); await p.waitForTimeout(300);
await shot(3, "2. מסמנים שיטות, והזמן מתחלק לבד", p.getByRole("heading", { name: "שיטות וזמנים" }));
await p.goto(B + "/library/5", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
await p.evaluate(() => window.scrollTo(0, 0));
await shot(4, "4. מקבלים פעולה שלמה בחמישה שלבים", p.locator("h1").first());
console.log(await p.getByRole("button").allInnerTexts(), await p.getByRole("link").allInnerTexts());
// editor
const d = await (await fetch(B + "/api/write/docs", { method: "POST", headers: H, body: JSON.stringify({ template: "classic" }) })).json();
const txt = "נפתח בשאלה: מה אומר ״אני אחראי״? כל חניך מספר רגע שבו לקח אחריות. אחר כך נשחק משחק קצר ונדבר על מה למדנו, ובסוף כל אחד יבחר צעד אחד לשבוע הקרוב.";
await fetch(B + "/api/write/docs/" + d.id, { method: "PUT", headers: H, body: JSON.stringify({ title: "אחריות אישית", meta: { ...d.meta, groupSize: 20, minutes: 45, ageGroup: "כיתה ז'" }, blocks: d.blocks.map((x, i) => ({ ...x, text: i < 3 ? txt : "" })), baseRev: d.rev }) });
await p.goto(B + "/write/" + d.id, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
await p.evaluate(() => window.scrollTo(0, 0));
await shot(7, "5. מעדיפים לכתוב לבד? העורך מציע שיטות ומראה מה חסר", p.locator(".write-bar"));
await p.getByRole("button", { name: "כלים נוספים" }).click(); await p.waitForTimeout(500);
await shot(8, "6. בדיקת קול, בטיחות והתאמה לגיל", p.getByRole("heading", { name: "בדיקות והתאמות" }));
await p.keyboard.press("Escape");
await p.goto(B + "/library", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
await shot(9, "7. מאגר פעולות מוכן, עם חיפוש לפי נושא", p.getByRole("search"));
console.log("ok");
await b.close();
