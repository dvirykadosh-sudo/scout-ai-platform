// צילומי מסך ובדיקת נגישות לעמוד הבית החדש (Dark Bento Glass), בכל התצוגות
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const OUT = process.env.SHOTS || "/tmp/shots";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const user = "lx" + Date.now().toString().slice(-7);
const reg = await (await fetch(B + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user, password: "Str0ng!Passw0rd", displayName: "בודק עיצוב", acceptTerms: true, signupCode: process.env.SIGNUP_CODE || "maoz2026" }) })).json();
console.log("register:", reg.token ? "ok" : JSON.stringify(reg).slice(0, 150));

const MODES = {
  "dark": { theme: "dark" },
  "dark-panel": { theme: "dark", panel: "dark" },
  "light": { theme: "light" },
  "hc": { hc: "1" },
  "blue": { theme: "dark", palette: "blue" },
  "green": { theme: "dark", palette: "green" },
  "fire": { theme: "dark", palette: "fire" },
};
const SIZES = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };
for (const [mn, m] of Object.entries(MODES)) {
  for (const [sn, vp] of Object.entries(SIZES)) {
    for (const first of [true, false]) {
      if (first && !(mn === "dark" || mn === "light" || mn === "hc")) continue;
      const ctx = await browser.newContext({ viewport: vp, locale: "he-IL", reducedMotion: "reduce" });
      await ctx.addInitScript(([m, first, tok, u]) => {
        try {
          localStorage.setItem("scout.splash", "1");
          if (!first) localStorage.setItem("scout.hero.seen", "1");
          if (m.theme) localStorage.setItem("scout.theme", m.theme);
          if (m.hc) localStorage.setItem("scout.hc", "1"); else localStorage.setItem("scout.hc", "0");
          if (m.panel) localStorage.setItem("scout.panel", m.panel);
          if (m.palette) localStorage.setItem("scout.palette", m.palette);
          if (tok) localStorage.setItem("scout.session", JSON.stringify({ token: tok, t: tok, user: u }));
        } catch {}
      }, [m, first, reg.token, reg.user]);
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(B + "/", { waitUntil: "networkidle" });
      await p.waitForTimeout(700);
      const tag = `${mn}-${sn}${first ? "-first" : ""}`;
      await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });
      const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      ok(r.violations.length === 0, `axe ${tag} ${axeMsg(r)}`);
      ok(errs.length === 0, `no page errors ${tag} ${errs.join("|")}`);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(overflow <= 1, `no horizontal overflow ${tag} (${overflow})`);
      ok((await p.locator("video").count()) === 0, `no video ${tag}`);
      await ctx.close();
    }
  }
}
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
