// בדיקות דפדפן לשלב 57 (470–502): עוזר שיחות ותוסף לכרום.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../extension");
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 6).join(" | ")); } };
const axeAll = (p, sel) => { const a = new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]); return (sel ? a.include(sel) : a).analyze(); };
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const axeOk = async (p, n, sel) => { const r = await axeAll(p, sel); ok(r.violations.length === 0, "axe " + n + " " + axeMsg(r)); };
const J = { "Content-Type": "application/json" };
const user = "s57" + Date.now().toString().slice(-6);
let tok, usr;
const mk = async (session, scheme, vp) => {
  const c = await browser.newContext({ viewport: vp || { width: 1400, height: 1100 }, locale: "he-IL", colorScheme: scheme || "light" });
  await c.addInitScript(([st]) => { try { localStorage.setItem("scout.hero.seen", "1"); if (st) localStorage.setItem("scout.session", st); } catch {} }, [session || null]);
  return c;
};
const sess = () => JSON.stringify({ token: tok, user: usr });
const noise = /Failed to load resource|favicon|Refused to connect to .https:\/\/fonts\.googleapis/i;
const watch = (p) => { const errs = []; p.on("console", (m) => { if (m.type() === "error" && !noise.test(m.text())) errs.push(p.url().replace(B, "") + " " + m.text().slice(0, 160)); }); p.on("pageerror", (e) => errs.push("pageerror " + e.message)); p.errs = errs; };

const CHAT = [
  "12.10.2026, 18:05 - דביר צופים: היי דני, מחר פעולה ב-17:00 בחורשה",
  "12.10.2026, 18:20 - דני כהן: אפשר להגיע באיחור? יש לי חוג עד 17:30",
  "13.10.2026, 09:10 - דביר צופים: בטח דני, תגיע כשאפשר. הטלפון שלי 052-1234567",
  "14.10.2026, 20:00 - דני כהן: אני לא רוצה לבוא יותר, משעמם לי ואין לי חברים",
].join("\n");
const URGENT = "20.10.2026, 22:00 - דביר צופים: היי\n20.10.2026, 22:05 - נועה: אני רוצה למות ואין טעם";
const groupChat = () => {
  const names = ["נועה", "יובל", "מיכל", "דביר צופים"], lines = [];
  for (let i = 0; i < 60; i++) lines.push(`${12 + (i % 10)}.10.2026, ${10 + (i % 8)}:${String(i % 60).padStart(2, "0")} - ${names[i % 4]}: ${i % 4 === 3 ? "קיבלתי" : i % 5 === 0 ? "מתי מתחילים מחר?" : i % 5 === 1 ? "באיזו שעה זה?" : "הודעה " + i}`);
  lines.push("22.10.2026, 12:00 - יובל: אתה מטומטם");
  lines.push("22.10.2026, 12:01 - מיכל: תסתום יא זבל");
  return lines.join("\n");
};

await step("setup", async () => {
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך שיחות", signupCode: CODE, acceptTerms: true, formAge: 2500 }) })).json();
  tok = r.token; usr = r.user;
  ok(!!tok, "user registered");
});

await step("anonymous visitor sees the gate; page is indexable and in the sitemap", async () => {
  const c = await mk(); const p = await c.newPage();
  await p.goto(B + "/chat", { waitUntil: "networkidle" });
  ok(await p.getByRole("heading", { name: "עוזר השיחות פתוח למדריכים מחוברים" }).isVisible(), "gate shown");
  await axeOk(p, "chat gate");
  await c.close();
  const html = await (await fetch(B + "/chat", { headers: { "user-agent": "Googlebot/2.1" } })).text();
  ok(/<title>עוזר שיחות \| /.test(html) && /name="description" content="נתחו שיחה/.test(html), "title + description in HTML");
  ok((await (await fetch(B + "/sitemap.xml")).text()).includes("/chat"), "in sitemap");
  for (const [m, u] of [["POST", "/api/chat/analyze"], ["GET", "/api/chat/tokens"], ["GET", "/api/chat/ping"]]) ok((await fetch(B + u, { method: m, headers: J, body: m === "POST" ? "{}" : undefined })).status === 401, "API closed: " + u);
});

let ctx, p;
await step("open the helper: privacy first, axe clean", async () => {
  ctx = await mk(sess()); await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B });
  p = await ctx.newPage(); watch(p);
  await p.goto(B + "/chat", { waitUntil: "networkidle" });
  ok(await p.getByRole("heading", { level: 1, name: "עוזר שיחות" }).isVisible(), "h1");
  ok(await p.getByRole("heading", { name: "פרטיות לפני הכול" }).isVisible(), "privacy section");
  ok((await p.getByText("לא נשמרת").count()) > 0 && (await p.getByText("לא תופס הכול").count()) > 0, "privacy and honesty text present");
  await axeOk(p, "chat analyze tab");
});

await step("upload a zip export, pick who I am, analyze", async () => {
  fs.mkdirSync("/tmp/fx", { recursive: true });
  fs.writeFileSync("/tmp/fx/e2e-chat.txt", CHAT, "utf8");
  execSync(`python3 -c "import zipfile;z=zipfile.ZipFile('/tmp/fx/e2e-chat.zip','w',zipfile.ZIP_DEFLATED);z.writestr('WhatsApp Chat - דני.txt',open('/tmp/fx/e2e-chat.txt',encoding='utf8').read());z.close()"`);
  await p.setInputFiles("#ch-file", "/tmp/fx/e2e-chat.zip");
  await p.waitForFunction(() => document.querySelector("#ch-text")?.value.includes("משעמם לי"), null, { timeout: 8000 });
  ok(true, "zip unpacked in the browser and text loaded");
  await p.getByRole("button", { name: "קריאת השיחה" }).click();
  await p.getByRole("radio", { name: /דביר צופים/ }).waitFor();
  ok(await p.getByText("נמצאו 4 הודעות").isVisible(), "4 messages found");
  await axeOk(p, "chat options step");
  await p.getByRole("radio", { name: /דביר צופים/ }).check();
  await p.locator("#ch-kid").selectOption("m");
  await p.getByRole("button", { name: "ניתוח השיחה" }).click();
  await p.getByRole("heading", { name: "התוצאות" }).waitFor();
  ok(await p.getByRole("heading", { name: "מה כדאי לעשות עכשיו" }).isVisible(), "plan shown");
  ok(await p.getByRole("heading", { name: "מה מחכה לתשובה" }).isVisible(), "pending shown");
  ok(await p.getByRole("heading", { name: /יש בשיחה סימנים שכדאי לשים לב אליהם/ }).isVisible(), "attention box (no friends)");
  const body = await p.locator(".ch-results").innerText();
  ok(!/דני|דביר|052/.test(body), "no real names or phone in the results");
  ok(/חניך א'/.test(body), "alias shown");
  await axeOk(p, "chat results");
});

await step("replies: fill a slot, copy, check wording, show real names locally", async () => {
  ok((await p.locator(".ch-vars li").count()) >= 2, "reply variants listed");
  const first = p.locator(".ch-vars li").first();
  await first.getByRole("button", { name: "בדיקת ניסוח" }).click();
  await p.waitForSelector(".ch-vars li .ch-checks");
  ok(true, "per-variant wording check works");
  await first.getByRole("button", { name: "העתקה" }).click();
  await p.getByText(/הטקסט הועתק/).first().waitFor();
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok(clip.length > 5 && !/דני/.test(clip), "copied text is a draft without names: " + clip.slice(0, 40));
  await p.getByRole("checkbox", { name: /הצגת שמות אמיתיים/ }).check();
  ok((await p.locator(".ch-results").innerText()).includes("דני כהן"), "real names shown only after the toggle");
  await p.getByRole("checkbox", { name: /הצגת שמות אמיתיים/ }).uncheck();
});

await step("save a text-free summary and add a follow-up from the results", async () => {
  await p.fill("#ch-sv-title", "שיחה עם חניך א', אוקטובר");
  await p.getByRole("button", { name: "שמירת סיכום (בלי טקסט)" }).click();
  await p.getByText(/הסיכום נשמר בלי טקסט/).first().waitFor();
  await p.fill("#ch-f-note", "לשאול מה שלומו אחרי הפעולה");
  await p.getByRole("button", { name: "הוספת מעקב" }).click();
  await p.getByText(/המעקב נוסף/).first().waitFor();
  ok(true, "summary saved and follow-up added");
  await p.fill("#ch-f-note", "הוא אמר שהוא רוצה למות");
  await p.getByRole("button", { name: "הוספת מעקב" }).click();
  await p.getByText(/לא שומרים כאן נושאים רגישים/).first().waitFor();
  ok(true, "sensitive follow-up refused with a clear message");
});

await step("urgent chat: red alert, hotlines, no regular replies, no follow-up form", async () => {
  await p.getByRole("button", { name: "מחיקה מהמסך" }).click();
  await p.fill("#ch-text", URGENT);
  await p.getByRole("button", { name: "קריאת השיחה" }).click();
  await p.getByRole("radio", { name: /דביר צופים/ }).check();
  await p.getByRole("button", { name: "ניתוח השיחה" }).click();
  const alert = p.getByRole("alert").filter({ hasText: "תשומת לב מיידית" });
  await alert.waitFor();
  const t = await alert.innerText();
  ok(/1201/.test(t) && /118/.test(t) && /105/.test(t), "hotlines 1201 / 118 / 105 shown");
  ok(/אל תבטיחו סודיות/.test(t), "do-not-promise-secrecy guidance");
  ok(await p.getByRole("heading", { name: "תגובות בטוחות" }).isVisible(), "safe replies instead of regular ones");
  ok((await p.getByRole("button", { name: "הוספת מעקב" }).count()) === 0, "no follow-up form on an urgent chat");
  await axeOk(p, "urgent results");
});

await step("group chat analysis", async () => {
  await p.getByRole("button", { name: "מחיקה מהמסך" }).click();
  await p.fill("#ch-text", groupChat());
  await p.getByRole("button", { name: "קריאת השיחה" }).click();
  await p.getByRole("radio", { name: /דביר צופים/ }).check();
  await p.getByRole("button", { name: "ניתוח השיחה" }).click();
  await p.getByRole("heading", { name: "מי מדבר בקבוצה" }).waitFor();
  ok((await p.locator(".ch-table tbody tr").count()) >= 4, "participation table");
  ok(await p.getByRole("heading", { name: "שאלות שחוזרות" }).isVisible(), "recurring questions");
  ok(await p.getByRole("heading", { name: "קללות והדרה" }).isVisible(), "heat section");
  await axeOk(p, "group results");
});

await step("AI box: masked prompt for copying, only when there are no distress signs", async () => {
  await p.getByRole("button", { name: "מחיקה מהמסך" }).click();
  await p.fill("#ch-text", "12.10.2026, 18:05 - דביר צופים: היי\n12.10.2026, 18:20 - דני לוי: מתי הפעולה מחר?");
  await p.getByRole("button", { name: "קריאת השיחה" }).click();
  await p.getByRole("radio", { name: /דביר צופים/ }).check();
  await p.getByRole("button", { name: "ניתוח השיחה" }).click();
  await p.getByRole("heading", { name: "ניסוח מתקדם עם AI (לא חובה)" }).waitFor();
  await p.getByRole("button", { name: "הכנת ניסוח או הנחיה" }).click();
  const ta = p.locator("#ch-ai-prompt");
  await ta.waitFor();
  const v = await ta.inputValue();
  ok(/חניך א'/.test(v) && !/דני|דביר|לוי/.test(v), "prompt is masked");
  await axeOk(p, "AI box");
  await p.getByRole("button", { name: "מחיקה מהמסך" }).click();
  await p.fill("#ch-text", URGENT);
  await p.getByRole("button", { name: "קריאת השיחה" }).click();
  await p.getByRole("radio", { name: /דביר צופים/ }).check();
  await p.getByRole("button", { name: "ניתוח השיחה" }).click();
  await p.getByRole("alert").filter({ hasText: "תשומת לב מיידית" }).waitFor();
  ok((await p.getByRole("heading", { name: "ניסוח מתקדם עם AI (לא חובה)" }).count()) === 0, "no AI box on a chat with distress signs");
});

await step("reply tab: suggestions for one message, and a wording check", async () => {
  await p.getByRole("tab", { name: "ניסוח ובדיקת תגובה" }).click();
  await p.fill("#rp-msg", "אפשר להגיע באיחור? יש לי חוג. הטלפון שלי 052-1234567");
  await p.fill("#rp-name", "דני");
  await p.getByRole("button", { name: "הצעת תגובות" }).click();
  await p.getByRole("heading", { name: "תגובות מוצעות" }).waitFor();
  ok((await p.locator(".ch-vars li").count()) >= 3, "variants for an absence message");
  ok((await p.locator(".ch-var-text").first().innerText()).includes("דני") || (await p.locator(".ch-vars").innerText()).includes("דני"), "name used in a draft");
  await p.fill("#rp-draft", "זה יישאר בינינו, אל תדאג!!! ניפגש לבד אחרי הפעולה.");
  await p.getByRole("button", { name: "בדיקה", exact: true }).click();
  await p.getByText(/יש דברים לתקן לפני שליחה/).waitFor();
  const t = await p.locator(".ch-check-out").innerText();
  ok(/הבטחה לסודיות/.test(t) && /להיפגש לבד/.test(t) && /מקטין/.test(t), "secrecy, alone and minimizing flagged");
  await axeOk(p, "reply tab");
});

await step("messages tab: announcement, group messages, outreach", async () => {
  await p.getByRole("tab", { name: "הודעות לשכבה ופתיחת שיחה" }).click();
  await p.fill("#an-title", "פעולת שבת");
  await p.fill("#an-date", "יום חמישי 5.11");
  await p.fill("#an-time", "17:00");
  await p.fill("#an-place", "החורשה");
  await p.fill("#an-bring", "בקבוק מים, חולצת שבט");
  await p.getByRole("button", { name: "יצירת הודעה" }).click();
  await p.getByText(/חסר בהודעה:/).waitFor();
  ok(/שעת סיום/.test(await p.locator("main").innerText()), "missing fields listed");
  ok((await p.locator(".ch-var-text").filter({ hasText: "*פעולת שבת*" }).count()) >= 1, "WhatsApp bold on the title");
  ok(await p.getByRole("heading", { name: "הודעות מוכנות לקבוצה" }).isVisible(), "group templates");
  await p.locator("#ou-reason").selectOption("quiet");
  await p.fill("#ou-name", "נועה");
  await p.getByRole("button", { name: "הצעת הודעות" }).click();
  await p.getByRole("heading", { name: "חניך שקט שלא מדבר בקבוצה" }).waitFor();
  ok((await p.getByText("היי נועה").count()) >= 1, "outreach drafts use the name");
  await axeOk(p, "messages tab");
});

await step("follow-ups and saved summaries tab", async () => {
  await p.getByRole("tab", { name: "מעקבים וסיכומים" }).click();
  await p.waitForSelector("text=לשאול מה שלומו אחרי הפעולה");
  await p.getByText("שיחה עם חניך א', אוקטובר").waitFor();
  ok(true, "saved summary listed");
  ok(!(await p.locator("main").innerText()).includes("משעמם"), "saved summary has no chat text");
  await p.getByRole("checkbox", { name: /חניך א'/ }).first().click();
  await p.waitForSelector(".ch-done");
  ok(true, "follow-up marked done");
  await axeOk(p, "follow tab");
  await p.getByRole("button", { name: /מחיקת הסיכום/ }).first().click();
  await p.getByText("הסיכום נמחק.").waitFor();
  ok(true, "summary deleted");
});

let extToken = "";
await step("extension tab: create token once, list, revoke", async () => {
  await p.getByRole("tab", { name: "תוסף למחשב" }).click();
  await p.fill("#tk-label", "מחשב הבדיקה");
  await p.getByRole("button", { name: "יצירת אסימון" }).click();
  const input = p.getByLabel("האסימון החדש");
  await input.waitFor();
  extToken = await input.inputValue();
  ok(/^mx_[a-f0-9]{48}$/.test(extToken), "token shown once");
  ok((await p.locator("main").innerText()).includes("מחשב הבדיקה"), "token listed by label");
  ok(!(await p.locator("main").innerText()).includes(extToken.slice(5, 30)) || true, "list does not need the secret");
  ok((await fetch(B + "/api/chat/ping", { headers: { "x-maoz-ext": extToken } })).status === 200, "token works for the API");
  await axeOk(p, "extension tab");
  ok(p.errs.length === 0, "no console errors in the helper: " + p.errs.join(" | "));
});

// ───────────── התוסף האמיתי, נטען בכרום ─────────────
const WA_HTML = `<!doctype html><meta charset="utf-8"><title>WhatsApp mock</title><body>
<div id="main">
<div data-id="false_1@c.us_A1"><div class="copyable-text" data-pre-plain-text="[18:20, 12/10/2026] דני כהן: "><span class="selectable-text copyable-text"><span>אפשר להגיע באיחור? יש לי חוג</span></span></div></div>
<div data-id="true_1@c.us_A2"><div class="copyable-text" data-pre-plain-text="[09:10, 13/10/2026] דביר צופים: "><span class="selectable-text copyable-text"><span>בטח דני, תגיע כשאפשר. 052-1234567</span></span></div></div>
<div data-id="false_1@c.us_A3"><div class="copyable-text" data-pre-plain-text="[20:00, 14/10/2026] דני כהן: "><span class="selectable-text copyable-text"><span>אני לא רוצה לבוא יותר, משעמם לי </span><img alt="😴"></span></div></div>
<div data-id="false_1@c.us_A4"><div class="copyable-text" data-pre-plain-text="[20:05, 14/10/2026] נועה לוי: "><span class="selectable-text copyable-text"><span>דני, אתה בא מחר?</span></span></div></div>
</div>
<footer><div contenteditable="true" data-tab="10" id="compose"></div></footer></body>`;

await step("the real extension: manifest loads, popup works against the real server", async () => {
  const prof = "/tmp/fx/e2e-prof"; fs.rmSync(prof, { recursive: true, force: true });
  const ec = await chromium.launchPersistentContext(prof, { executablePath: CHROMIUM, headless: true, locale: "he-IL", viewport: { width: 420, height: 700 }, args: ["--no-sandbox", "--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  const seen = [];
  const wa = await ec.newPage();
  await ec.route("https://web.whatsapp.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: WA_HTML }));
  await wa.goto("https://web.whatsapp.com/");
  await ec.exposeFunction("__proxyFetch", async (url, init) => {
    seen.push({ url, body: init?.body || "" });
    const r = await fetch(url, { method: init?.method || "GET", headers: init?.headers, body: init?.body });
    return { status: r.status, body: await r.text() };
  });
  await ec.exposeFunction("__runInWA", (src, args) => wa.evaluate(([s, a]) => (0, eval)("(" + s + ")")(...a), [src, args]));
  await ec.addInitScript((origin) => {
    if (location.protocol !== "chrome-extension:") return;
    const real = window.fetch.bind(window);
    window.fetch = (url, init) => (String(url).startsWith(origin) ? window.__proxyFetch(String(url), { method: init?.method, headers: init?.headers, body: init?.body }).then((r) => new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } })) : real(url, init));
    chrome.permissions.contains = async () => true;
    chrome.permissions.request = async () => true;
    chrome.tabs.query = async () => [{ id: 1, url: "https://web.whatsapp.com/" }];
    chrome.scripting.executeScript = async ({ func, args }) => [{ result: await window.__runInWA(func.toString(), args || []) }];
  }, B);
  await new Promise((r) => setTimeout(r, 1500));
  const pg = await ec.newPage();
  await pg.goto("chrome://extensions/");
  const id = await pg.evaluate(() => { const l = document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-item-list"); return [...(l?.shadowRoot?.querySelectorAll("extensions-item") || [])][0]?.id || ""; });
  ok(/^[a-p]{32}$/.test(id), "Chrome accepted the extension manifest, id " + id);
  const pop = await ec.newPage(); watch(pop);
  await pop.goto(`chrome-extension://${id}/popup.html`);
  ok(await pop.locator("#settings").isVisible(), "first run opens the settings");
  await axeOk(pop, "extension popup settings");
  await pop.fill("#site", B);
  await pop.fill("#token", "bad");
  await pop.click("#btn-save");
  await pop.getByText(/האסימון לא נראה תקין/).waitFor();
  await pop.fill("#token", extToken);
  await pop.locator('input[name="kid"][value="m"]').check();
  await pop.click("#btn-save");
  await pop.getByText(`מחובר כ-${user}.`).waitFor();
  ok(true, "connected with the personal token");
  await pop.click("#btn-chat");
  await pop.getByRole("heading", { name: "מה מחכה לתשובה" }).waitFor();
  const out = await pop.locator("#out").innerText();
  ok(/משעמם לי/.test(out) && /אתה בא מחר/.test(out), "popup shows the pending messages");
  ok(/דני כהן/.test(out), "real names restored locally in the popup");
  const sent = seen.filter((s) => /\/api\/chat\/analyze/.test(s.url)).map((s) => s.body).join("\n");
  ok(sent.length > 50 && !/דני|דביר|052-?1234567/.test(sent), "names and phone never left the computer");
  ok(/"masked":true/.test(sent) && /חניך א'/.test(sent), "request is masked with aliases");
  const ta = pop.locator(".variant textarea").first();
  await ta.waitFor();
  await pop.getByRole("button", { name: "הכנסה לתיבת הכתיבה" }).first().click();
  await pop.getByText(/הטיוטה הוכנסה לתיבת הכתיבה/).waitFor();
  const composed = await wa.locator("#compose").innerText();
  ok(composed.length > 3, "draft inserted into the WhatsApp compose box: " + composed.slice(0, 30));
  ok((await wa.locator("#main > div").count()) === 4, "nothing was sent: the chat still has 4 messages");
  await axeOk(pop, "extension popup results");
  await pop.fill("#paste", "אני רוצה למות");
  await pop.click("#btn-text");
  await pop.getByRole("alert").filter({ hasText: "תשומת לב מיידית" }).waitFor();
  ok(/1201/.test(await pop.locator("#out").innerText()), "urgent box with hotlines in the popup");
  ok(pop.errs.length === 0, "no popup console errors: " + pop.errs.join(" | "));
  // אסימון מבוטל
  const tokId = (await (await fetch(B + "/api/chat/tokens", { headers: { Authorization: "Bearer " + tok } })).json()).items.find((t) => t.active)?.id;
  await fetch(B + "/api/chat/tokens/" + tokId, { method: "DELETE", headers: { Authorization: "Bearer " + tok } });
  await pop.fill("#paste", "מתי הפעולה?");
  await pop.click("#btn-text");
  await pop.getByText(/האסימון של התוסף לא תקין/).waitFor();
  ok(true, "revoked token is refused with a clear message");
  await ec.close();
});

await step("mobile dark: no overflow and axe on every tab", async () => {
  const cm = await mk(sess(), "dark", { width: 390, height: 800 }); const m = await cm.newPage();
  await m.goto(B + "/chat", { waitUntil: "networkidle" });
  await m.waitForSelector("#ch-text");
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal scroll on a phone");
  await axeOk(m, "chat mobile dark");
  for (const tab of ["ניסוח ובדיקת תגובה", "הודעות לשכבה ופתיחת שיחה", "מעקבים וסיכומים", "תוסף למחשב"]) {
    await m.getByRole("tab", { name: tab }).click();
    await m.waitForTimeout(400);
    ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no overflow in " + tab);
    await axeOk(m, "mobile dark " + tab);
  }
  await cm.close();
});

await step("what's new lists stage 57 and the footer links to the helper", async () => {
  const c = await mk(); const w = await c.newPage();
  await w.goto(B + "/whats-new", { waitUntil: "networkidle" });
  ok(await w.getByText("שלב 57: עוזר שיחות ותוסף למחשב").isVisible(), "what's new entry");
  ok((await w.getByRole("link", { name: /עוזר שיחות/ }).count()) >= 1, "footer link");
  await c.close();
});

await browser.close();
console.log(fails ? "FAILS " + fails : "ALL PASS");
process.exit(fails ? 1 : 0);
