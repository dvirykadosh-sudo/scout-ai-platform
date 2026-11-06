import { chromium } from "playwright-core";
const base = "http://localhost:5055";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] }); const pg = await b.newPage();
const bad = [];
pg.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) bad.push(m.text().slice(0, 200)); });
pg.on("pageerror", (e) => bad.push("pageerror " + e.message.slice(0, 150)));
let fails = 0; const ok = (c, n) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fails++; };
for (const p of ["/", "/library", "/style-guide"]) { const r = await pg.goto(base + p, { waitUntil: "networkidle" }); ok(r.status() < 400, "load " + p); }
const r = await fetch(base + "/");
const csp = r.headers.get("content-security-policy") || "";
ok(/frame-ancestors 'none'/.test(csp), "page CSP frame-ancestors");
ok(/object-src 'none'/.test(csp), "page CSP object-src");
ok(!!r.headers.get("strict-transport-security"), "HSTS in prod");
ok(/camera=\(\)/.test(r.headers.get("permissions-policy") || ""), "permissions-policy");
const foreign = await fetch(base + "/api/health", { headers: { origin: "https://evil.example" } });
ok(foreign.headers.get("access-control-allow-origin") !== "https://evil.example", "CORS blocks foreign origin");
ok(bad.length === 0, "no CSP violations / page errors " + JSON.stringify(bad));
await b.close(); process.exit(fails ? 1 : 0);
