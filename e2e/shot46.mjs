import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, locale: "he-IL" })).newPage();
await p.addInitScript(() => { localStorage.setItem("scout.hero.seen","1"); localStorage.setItem("scout.splash","1"); localStorage.setItem("scout.palette","fire"); localStorage.setItem("scout.holiday","hanukkah"); });
await p.goto("http://localhost:5055/", { waitUntil: "networkidle" });
await p.mouse.move(900, 200); await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/home46.png" });
await b.close();
