// בדיקות לשלב 55: האתר פתוח לגוגל. רץ עם PUBLIC_URL=https://maoz.example, GOOGLE_SITE_VERIFICATION=g-test-123, BING_SITE_VERIFICATION=b-test-456.
import { chromium } from "playwright-core";
const B = process.env.BASE_URL || "http://localhost:5055";
const SITE = "https://maoz.example";
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 6).join(" | ")); } };
const get = async (path, ua = "Mozilla/5.0 (compatible; Googlebot/2.1)") => { const r = await fetch(B + path, { headers: { "user-agent": ua }, redirect: "manual" }); return { status: r.status, html: await r.text(), headers: r.headers }; };
const metaRobots = (h) => (h.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || "";
let act;

await step("setup", async () => {
  const list = await (await fetch(B + "/api/activities?pageSize=1")).json();
  act = await (await fetch(B + `/api/activities/${list.items[0].id}`)).json();
  ok(!!act.id, "found an activity");
});

await step("robots.txt and sitemap.xml", async () => {
  const rb = (await get("/robots.txt")).html;
  ok(/User-Agent: \*/i.test(rb) && /Allow: \//.test(rb), "robots allows everything by default");
  for (const p of ["/admin", "/join/", "/write/view/", "/api/", "/assistant/shared"]) ok(rb.includes("Disallow: " + p), "robots blocks " + p);
  ok(rb.includes(`Sitemap: ${SITE}/sitemap.xml`), "robots points to the sitemap on the public address");
  const sm = (await get("/sitemap.xml")).html;
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(locs.includes(SITE) || locs.includes(SITE + "/"), "sitemap has the home page");
  for (const p of ["/library", "/methods", "/values", "/types", "/help", "/privacy", "/accessibility"]) ok(locs.includes(SITE + p), "sitemap has " + p);
  ok(locs.filter((l) => /\/library\/\d+$/.test(l)).length >= 5, "sitemap has every published activity");
  ok(!locs.some((l) => /admin|join|write\/view|share-target|assistant\/shared/.test(l)), "sitemap leaves out private and utility pages");
});

await step("home page head", async () => {
  const { html } = await get("/");
  ok(/^index, follow/.test(metaRobots(html)), "home: robots index, follow (" + metaRobots(html) + ")");
  ok(html.includes(`<link rel="canonical" href="${SITE}"`) || html.includes(`<link rel="canonical" href="${SITE}/"`), "home: canonical");
  ok(html.includes('name="google-site-verification" content="g-test-123"'), "google verification tag");
  ok(html.includes('name="msvalidate.01" content="b-test-456"'), "bing verification tag");
  ok(/"@type":"Organization"/.test(html) && /"@type":"WebSite"/.test(html) && /SearchAction/.test(html), "organization + website structured data");
  ok(/property="og:site_name"/.test(html), "og:site_name");
  ok(/<html lang="he" dir="rtl"/.test(html), "lang and dir");
});

await step("inner pages have their own title, description and canonical", async () => {
  for (const [p, t] of [["/library", "מאגר פעולות"], ["/methods", "ספריית המתודות"], ["/help", "עזרה ושאלות נפוצות"]]) {
    const { html, status } = await get(p);
    ok(status === 200 && html.includes(`<title>${t} | מחולל פעולות</title>`), p + " title");
    ok(/<meta name="description" content="[^"]{30,}/.test(html), p + " description");
    ok(html.includes(`rel="canonical" href="${SITE}${p}"`), p + " canonical");
    ok(/^index/.test(metaRobots(html)), p + " indexable");
  }
});

await step("private pages are kept out", async () => {
  for (const p of ["/admin", "/join/abc123", "/write/view/abc123", "/assistant/shared"]) {
    const { html } = await get(p);
    ok(/noindex/.test(metaRobots(html)), p + " noindex (" + metaRobots(html) + ")");
  }
  const api = await get("/api/activities?pageSize=1");
  ok(/noindex/.test(api.headers.get("x-robots-tag") || ""), "API has X-Robots-Tag noindex");
});

await step("activity page is complete in the server HTML", async () => {
  const { html, status } = await get(`/library/${act.id}`);
  ok(status === 200, "200");
  ok(html.includes(act.title), "title is in the HTML without running JavaScript");
  const stageTitle = (act.stages[0].title || act.stages[0].name || "").trim();
  ok(!stageTitle || html.includes(stageTitle.slice(0, 12)), "first stage text is in the HTML: " + stageTitle.slice(0, 20));
  ok(html.includes(act.leadingValue), "value is in the HTML");
  ok(/property="og:title" content="[^"]+"/.test(html) && html.includes(`rel="canonical" href="${SITE}/library/${act.id}"`), "og:title + canonical");
  ok(/"@type":"LearningResource"/.test(html) && /"@type":"BreadcrumbList"/.test(html), "LearningResource + BreadcrumbList data");
  ok(/^index, follow/.test(metaRobots(html)), "activity indexable");
  const n = (html.match(/<h1/g) || []).length;
  ok(n === 1, "exactly one h1 (" + n + ")");
});

await step("missing activities answer with a real 404", async () => {
  ok((await get("/library/999999")).status === 404, "unknown id → 404");
  ok((await get("/library/abc")).status === 404, "bad id → 404");
});

await step("no hydration errors in a real browser", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ locale: "he-IL" });
  await ctx.addInitScript(() => { try { localStorage.setItem("scout.hero.seen", "1"); } catch {} });
  const p = await ctx.newPage();
  const bad = [];
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|SpeechRecognition/i.test(m.text())) bad.push(m.text().slice(0, 200)); });
  p.on("pageerror", (e) => bad.push("pageerror " + e.message));
  for (const path of [`/library/${act.id}`, "/library", "/"]) { await p.goto(B + path, { waitUntil: "networkidle" }); await p.waitForTimeout(800); }
  ok(bad.length === 0, "console clean: " + bad.join(" || "));
  await p.goto(B + `/library/${act.id}`, { waitUntil: "networkidle" });
  ok(await p.getByRole("heading", { level: 1, name: act.title }).isVisible(), "activity heading visible after hydration");
  await browser.close();
});

console.log(fails ? "FAILS " + fails : "ALL OK");
process.exit(fails ? 1 : 0);
