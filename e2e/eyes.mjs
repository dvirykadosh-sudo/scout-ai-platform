import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 3, locale: "he-IL" });
await ctx.addInitScript(() => { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.splash", "1"); });
const p = await ctx.newPage();
await p.goto("http://localhost:5055/", { waitUntil: "networkidle" }); await p.mouse.move(900, 300); await p.waitForTimeout(500);
const bb = await p.locator(".logo3d-front").boundingBox();
await p.screenshot({ path: "/tmp/eyes2.png", clip: { x: bb.x + bb.width * 0.3, y: bb.y + bb.height * 0.3, width: bb.width * 0.4, height: bb.height * 0.3 } });
await b.close();
