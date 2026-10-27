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
await p.goto(B + "/library/5", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
await shot(5, "ייצוא ל-Word, הדפסה ושיתוף בלחיצה אחת", p.getByRole("button", { name: "ייצוא ל-Word" }));
await b.close();
