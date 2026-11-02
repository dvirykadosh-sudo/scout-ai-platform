// בדיקות דפדפן לשלב 56 (453–469): סטודיו סיפור אישי.
import { chromium, request } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 6).join(" | ")); } };
const axeAll = (p, sel) => { const a = new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]); return (sel ? a.include(sel) : a).analyze(); };
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.map((n) => n.target.join(" ")).join("; ")).join(" || ");
const axeOk = async (p, n, sel) => { const r = await axeAll(p, sel); ok(r.violations.length === 0, "axe " + n + " " + axeMsg(r)); };
const J = { "Content-Type": "application/json" };
const user = "s56" + Date.now().toString().slice(-6);
let tok, usr, actId;
const mk = async (session, scheme) => {
  const c = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: "he-IL", colorScheme: scheme || "light" });
  await c.addInitScript(([st]) => { try { localStorage.setItem("scout.hero.seen", "1"); if (st) localStorage.setItem("scout.session", st); } catch {} }, [session || null]);
  return c;
};
const sess = () => JSON.stringify({ token: tok, user: usr });

const GENERIC = "חשוב לציין שאחריות היא ערך חשוב מאוד בעולם של היום. על מנת להצליח, אולם בסופו של דבר כל אחד מאיתנו צריך ללמוד. ללא ספק זו חוויה בלתי נשכחת.";
const FORMAL = "אולם לאחר מכן הלכנו הביתה, כאשר ירד גשם. על כן החלטנו לחכות עוד קצת לפני שנצא לדרך.";

await step("setup", async () => {
  const r = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user, password: "Str0ng-e2e-pw-26", displayName: "מדריך סיפור", signupCode: CODE, acceptTerms: true, formAge: 2500 }) })).json();
  tok = r.token; usr = r.user;
  ok(!!tok, "user registered");
  const a = await (await fetch(B + "/api/activities/quick", { method: "POST", headers: { ...J, Authorization: "Bearer " + tok }, body: JSON.stringify({ kind: "value", topic: "אחריות בטיול לילה" }) })).json();
  actId = a.id;
  ok(!!actId, "own activity created " + actId);
});

await step("anonymous visitor sees the gate and the page is indexable", async () => {
  const c = await mk(); const p = await c.newPage();
  await p.goto(B + "/story", { waitUntil: "networkidle" });
  ok(await p.getByRole("heading", { name: "הסטודיו פתוח למדריכים מחוברים" }).isVisible(), "gate shown");
  await axeOk(p, "story gate");
  await c.close();
  const html = await (await fetch(B + "/story", { headers: { "user-agent": "Googlebot/2.1" } })).text();
  ok(/<title>סטודיו סיפור אישי \| /.test(html) && /name="description" content="כתבו סיפור אישי/.test(html), "title + description in HTML");
  ok(/index/.test((html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || ""), "indexable");
  ok((await (await fetch(B + "/sitemap.xml")).text()).includes("/story"), "in sitemap");
  ok((await (await fetch(B + "/api/story/dict")).status) === 401, "API closed to anonymous");
});

let ctx, p;
await step("open the studio and build a story", async () => {
  ctx = await mk(sess()); p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|SpeechRecognition|Refused to connect to .https:\/\/fonts\.googleapis/i.test(m.text())) errs.push(p.url().replace(B, "") + " " + m.text().slice(0, 160) + " @" + JSON.stringify(m.location()).slice(0, 120)); });
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.errs = errs;
  await p.goto(B + "/story?value=" + encodeURIComponent("אחריות"), { waitUntil: "networkidle" });
  ok(await p.getByRole("heading", { level: 1, name: "סטודיו סיפור אישי" }).isVisible(), "h1");
  ok((await p.locator("#st-value").inputValue()) === "אחריות", "value preset from the link");
  await p.waitForSelector(".st-moments li");
  ok((await p.locator(".st-moments li").count()) === 3, "three moment types for the value");
  await p.locator(".st-moments li button").first().click();
  ok(await p.getByText("הרעיון שבחרתם:").isVisible(), "idea shown");
  await axeOk(p, "studio build tab");
  await p.fill("#st-sit", "הייתי מדריך צעיר בטיול לילה");
  await p.fill("#st-place", "בחורשה");
  await p.fill("#st-person", "ירון");
  await p.fill("#st-turn", 'חניך אחד לחש לי: "אני רוצה הביתה"');
  await p.fill("#st-feel", "בושה");
  await p.fill("#st-learn", "שלפעמים להישאר זה הכול");
  await p.fill("#st-want", "שתדעו שאפשר להישאר");
  await p.getByRole("button", { name: "בניית הסיפור" }).click();
  await p.waitForSelector(".st-built");
  const story = await p.locator(".st-story").first().innerText();
  ok(/זה קרה בחורשה\./.test(story) && /ועוד מישהו היה שם: ירון\./.test(story) && /הרגשתי בושה\./.test(story) && /ומה שלקחתי מזה/.test(story) && /על אחריות\./.test(story), "story assembled from the four parts");
  ok((await p.locator('input[name="opening"]').count()) === 4, "3 openings + none");
  ok((await p.locator('input[name="closing"]').count()) === 5, "4 closings + none");
  ok(await p.getByText("יצא לכם פעם להרגיש בושה?").isVisible(), "opening question uses the feeling");
  const qs = await p.locator(".st-qs li").count();
  ok(qs >= 1 && qs <= 3, "detail questions shown (" + qs + ")");
  const firstQ = p.locator(".st-qs li").first();
  await firstQ.locator("input").fill("השקט היה כזה שאפשר לשמוע את המדורה");
  await firstQ.getByRole("button", { name: "הוספה לסיפור" }).click();
  ok((await p.locator("#st-sit, #st-turn, #st-feel").evaluateAll((els) => els.map((e) => e.value).join(" "))).includes("השקט היה כזה"), "answer appended to a field");
  await p.getByRole("radio", { name: /יצא לכם פעם להרגיש בושה/ }).check();
  await p.getByRole("radio", { name: /אני רוצה שתדעו שאפשר להישאר/ }).first().check();
  await axeOk(p, "studio build result", ".st-panel");
});

await step("polish: send to polish, analyze, clichés with undo, register, directions, ages", async () => {
  await p.getByRole("button", { name: "המשך לליטוש הקול" }).click();
  await p.waitForSelector("#pl-body");
  ok((await p.locator("#pl-body").inputValue()).includes("הייתי מדריך צעיר"), "built text moved to the polish tab");
  await p.getByRole("button", { name: "בדיקת הקול" }).click();
  await p.waitForSelector(".st-meter");
  const sc = Number(await p.locator(".st-meter").getAttribute("aria-valuenow"));
  ok(sc >= 0 && sc <= 100, "meter has a value " + sc);
  ok(await p.getByRole("heading", { name: "הקראה בקול" }).isVisible(), "read-aloud section");
  await axeOk(p, "polish analysis", ".st-panel");
  // clichés: generic text scores low, fix + undo
  await p.fill("#pl-body", GENERIC);
  await p.getByRole("button", { name: "בדיקת הקול" }).click();
  await p.waitForFunction(() => Number(document.querySelector(".st-meter")?.getAttribute("aria-valuenow")) < 35);
  ok(await p.getByRole("heading", { name: "ניסוחים נדושים ומבנים חוזרים" }).isVisible(), "cliché list");
  await p.getByRole("button", { name: "ניקוי קלישאות" }).click();
  await p.waitForFunction(() => document.querySelector("#pl-body").value.includes("כדי להצליח"));
  ok(!(await p.locator("#pl-body").inputValue()).includes("על מנת"), "clichés fixed");
  await p.getByRole("button", { name: "ביטול הפעולה האחרונה" }).click();
  ok((await p.locator("#pl-body").inputValue()) === GENERIC, "undo restores the text");
  // register
  await p.fill("#pl-body", FORMAL);
  await p.getByRole("radio", { name: "דיבורי" }).check();
  await p.getByRole("button", { name: "החלת רמת הדיבור" }).click();
  await p.waitForFunction(() => document.querySelector("#pl-body").value.startsWith("אבל אחר כך"));
  ok(/כשירד גשם\. אז החלטנו/.test(await p.locator("#pl-body").inputValue()), "spoken register applied");
  // directions + ages on a real story
  await p.fill("#pl-body", 'היה לי בן 14 והמדריך שלי ביקש ממני לקחת את הקבוצה בטיול ללילה בחורשה. אני זוכר את הריח של העשן מהמדורה. ואז אחד החניכים לחש לי: "אני רוצה הביתה". התביישתי שאני לא יודע מה להגיד. ישבתי לידו ושתקתי חמש דקות. מאז אני יודע שלפעמים הדבר הכי טוב הוא להישאר.');
  await p.getByRole("button", { name: "הוספת הוראות במה" }).click();
  await p.waitForSelector("text=דף מדריך עם הוראות במה");
  ok(await p.getByText("(מנמיכים קול, מאטים)").first().isVisible(), "stage directions shown");
  await p.getByRole("button", { name: "גרסאות לפי גיל" }).click();
  await p.waitForSelector("text=ילדים (ג'–ו')");
  ok(await p.getByText("(עוצרים)").first().isVisible(), "young version has a pause");
  ok((await p.locator(".st-ages").innerText()).includes("מה אתם לוקחים מזה?"), "older version ends with an open question");
  await axeOk(p, "polish results", ".st-panel");
});

await step("save, approve, versions and compare", async () => {
  await p.fill("#st-title", "הלילה בחורשה");
  await p.selectOption("#st-age", "ד'");
  await p.getByRole("button", { name: "שמירת סיפור חדש" }).click();
  await p.waitForFunction(() => /שמור, עדיין לא מאושר/.test(document.querySelector(".st-status")?.textContent || ""));
  ok(await p.getByText("שמור, עדיין לא מאושר").isVisible(), "saved, not approved");
  const approveBtn = p.getByRole("button", { name: "אישור הסיפור" });
  ok(await approveBtn.isDisabled(), "approve disabled until the read-aloud box is checked");
  await p.getByRole("checkbox", { name: /קראתי את הסיפור בקול/ }).check();
  await approveBtn.click();
  await p.waitForFunction(() => /מאושר לשילוב בפעולות/.test(document.querySelector(".st-status")?.textContent || ""));
  ok(true, "approved");
  await p.fill("#pl-body", (await p.locator("#pl-body").inputValue()) + " ועוד משפט אחד שהוספתי אחרי.");
  ok(/יש שינויים שלא נשמרו/.test(await p.locator(".st-status").innerText()), "dirty warning shown");
  await p.fill("#st-vlabel", "אחרי תוספת");
  await p.getByRole("button", { name: "שמירת שינויים" }).click();
  await p.waitForFunction(() => /שמור, עדיין לא מאושר/.test(document.querySelector(".st-status")?.textContent || ""));
  ok(true, "editing text revokes the approval");
  await p.waitForSelector("#cmp-a");
  await p.selectOption("#cmp-b", "0");
  await p.selectOption("#cmp-a", "1");
  await p.getByRole("button", { name: "השוואה" }).click();
  await p.waitForSelector("ins.st-add");
  ok((await p.locator("ins.st-add").count()) >= 3, "added words marked");
  await axeOk(p, "save bar + compare", ".st-panel");
  await axeOk(p, "save bar", ".st-savebar");
});

await step("my words dictionary + checks against it", async () => {
  await p.locator("details.st-dict summary").click();
  await p.fill("#dict-say", "תקשיבו\nיאללה");
  await p.fill("#dict-never", "אחי");
  await p.getByRole("button", { name: "שמירת המילים שלי" }).click();
  await p.getByText("המילים שלי נשמרו").waitFor();
  await p.fill("#pl-body", "תקשיבו, אחי, אני הולך הביתה אחרי שראיתי את הדבר הזה בבית הספר בבוקר כשהיה קר מאוד. אמרתי לו: \"בוא נלך\". חזרנו ביחד.");
  await p.getByRole("button", { name: "בדיקת הקול" }).click();
  await p.getByText("מילים שבחרתם לא להגיד, והן מופיעות:").waitFor();
  ok(true, "never-word flagged");
  await axeOk(p, "dictionary", ".st-panel");
});

await step("AI polish without a key: copyable prompt, paste back", async () => {
  await p.fill("#pl-body", 'היה לי בן 14 והמדריך שלי ביקש ממני לקחת את הקבוצה בטיול ללילה בחורשה. ואז אחד החניכים לחש לי: "אני רוצה הביתה". ישבתי לידו ושתקתי חמש דקות.');
  await p.getByRole("button", { name: "בקשת ליטוש" }).click();
  await p.waitForSelector("#pl-prompt");
  ok(/אל תמציא עובדות/.test(await p.locator("#pl-prompt").inputValue()), "prompt forbids inventing facts");
  ok(/תקשיבו/.test(await p.locator("#pl-prompt").inputValue()), "my words are in the prompt");
  await p.fill("#pl-back", "סיפור שהודבק מהצ'אט ומחליף את הטקסט הקיים, והוא ארוך מספיק.");
  await p.getByRole("button", { name: "החלפת הסיפור" }).click();
  await p.waitForFunction(() => document.querySelector("#pl-body").value.startsWith("סיפור שהודבק"));
  ok(true, "pasted answer applied");
});

await step("memories: names hidden, privacy blocks, filters, write a story from a memory", async () => {
  await p.getByRole("tab", { name: "ספריית זיכרונות" }).click();
  await p.fill("#mem-title", "הלילה בחורשה");
  await p.fill("#mem-body", "ישבנו עם דני ליד המדורה והוא סיפר לי הכול");
  await p.selectOption("#mem-value", "אחריות");
  await p.fill("#mem-names", "דני");
  await p.getByRole("button", { name: "שמירה בספרייה" }).click();
  await p.getByText("חניך א'", { exact: false }).first().waitFor();
  ok(!(await p.locator(".st-cards").innerText()).includes("דני"), "name replaced with a label");
  // quote: consent + pii block
  await p.getByRole("radio", { name: "ציטוט או רגע של חניך" }).check();
  ok(await p.getByText("פרטיות חניכים.").isVisible(), "privacy notice for trainee quotes");
  await p.fill("#mem-title", "ציטוט");
  await p.fill("#mem-body", "תתקשרו אליו 052-1234567");
  await p.getByRole("button", { name: "שמירה בספרייה" }).click();
  await p.getByText("מספר טלפון", { exact: false }).first().waitFor();
  ok((await p.locator(".st-cards li").count()) === 1, "quote with a phone number was not saved");
  await p.fill("#mem-body", "אני רוצה שמישהו יקשיב לי");
  await p.getByRole("radio", { name: "בעילום שם מלא, בלי פרטים מזהים" }).check();
  await p.getByRole("button", { name: "שמירה בספרייה" }).click();
  await p.waitForFunction(() => document.querySelectorAll(".st-cards li").length === 2);
  await p.selectOption("#mem-k", "quote");
  await p.waitForFunction(() => document.querySelectorAll(".st-cards li").length === 1);
  await p.selectOption("#mem-k", "");
  await axeOk(p, "memories", ".st-panel");
  await p.locator(".st-cards li").filter({ hasText: "הלילה בחורשה" }).getByRole("button", { name: "לכתוב ממנו סיפור" }).click();
  await p.waitForSelector("#st-sit");
  ok((await p.locator("#st-sit").inputValue()).includes("חניך א'"), "memory text copied into the first part");
  ok((await p.locator("#st-value").inputValue()) === "אחריות", "value copied");
});

await step("my stories tab", async () => {
  await p.getByRole("tab", { name: "הסיפורים שלי" }).click();
  await p.waitForSelector(".st-cards li");
  ok(await p.locator(".st-cards li").first().innerText().then((t) => t.includes("הלילה בחורשה")), "saved story listed");
  await axeOk(p, "stories tab", ".st-panel");
  await p.getByRole("button", { name: /פתיחה לעריכה|פתוח כעת/ }).click();
  await p.waitForSelector("#pl-body");
  ok((await p.locator("#st-title").inputValue()) === "הלילה בחורשה", "story opened for editing");
});

await step("activity page: add my story (needs approval), version saved", async () => {
  // approve again so the story can be used
  await p.getByRole("checkbox", { name: /קראתי את הסיפור בקול/ }).check();
  await p.getByRole("button", { name: "אישור הסיפור" }).click();
  await p.waitForFunction(() => /מאושר לשילוב בפעולות/.test(document.querySelector(".st-status")?.textContent || ""));
  // opening/closing were saved empty in this flow, so use the full story mode
  const c2 = await mk(sess()); const q = await c2.newPage();
  await q.goto(B + `/library/${actId}`, { waitUntil: "networkidle" });
  await q.getByRole("button", { name: "הסיפור שלי" }).click();
  await q.getByText("הסיפורים המאושרים שלכם").waitFor();
  await axeOk(q, "my story modal", "dialog");
  // ברירת המחדל: פתיחה בהתחלה וסיום בסוף
  await q.getByRole("button", { name: "הוספה לפעולה" }).click();
  await q.getByText("הסיפור נוסף לפעולה").waitFor();
  await q.waitForFunction(() => document.body.textContent.includes("פתיחה אישית (הלילה בחורשה):"), null, { timeout: 8000 }).catch(() => {});
  const bodyText = await q.locator("body").textContent();
  ok(bodyText.includes("פתיחה אישית (הלילה בחורשה): יצא לכם פעם להרגיש בושה?") && bodyText.includes("סיום אישי: אני רוצה שתדעו שאפשר להישאר."), "opening and closing woven into the first and last stage");
  // ואז הסיפור כולו בשלב
  await q.getByRole("button", { name: "הסיפור שלי" }).click();
  await q.getByRole("radio", { name: "הסיפור כולו בשלב אחד" }).check();
  await q.getByRole("button", { name: "הוספה לפעולה" }).click();
  await q.waitForFunction(() => document.body.textContent.includes("הסיפור שלי (הלילה בחורשה)"), null, { timeout: 8000 }).catch(() => {});
  ok((await q.locator("body").textContent()).includes("הסיפור שלי (הלילה בחורשה)"), "story text added to the activity page");
  const vs = await (await fetch(B + `/api/activities/${actId}/versions`, { headers: { Authorization: "Bearer " + tok } })).json();
  ok(vs.items.some((v) => /סיפור אישי/.test(v.note || "")), "version saved before the change");
  await c2.close();
  // a visitor who is not the owner does not get the button
  const other = await (await fetch(B + "/api/auth/register", { method: "POST", headers: J, body: JSON.stringify({ username: user + "x", password: "Str0ng-e2e-pw-26", displayName: "אחר", signupCode: CODE, acceptTerms: true, formAge: 2500 }) })).json();
  const c3 = await mk(JSON.stringify({ token: other.token, user: other.user })); const r = await c3.newPage();
  await r.goto(B + `/library/${actId}`, { waitUntil: "networkidle" });
  ok((await r.getByRole("button", { name: "הסיפור שלי" }).count()) === 0, "non-owner has no 'my story' button");
  await c3.close();
});

await step("responsive, dark mode, no console errors", async () => {
  ok(p.errs.length === 0, "no console errors: " + p.errs.join(" || "));
  await ctx.close();
  const cm = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: "he-IL", colorScheme: "dark" });
  await cm.addInitScript(([st]) => { try { localStorage.setItem("scout.hero.seen", "1"); localStorage.setItem("scout.session", st); } catch {} }, [sess()]);
  const m = await cm.newPage();
  await m.goto(B + "/story", { waitUntil: "networkidle" });
  await m.waitForSelector("#st-sit");
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal scroll on a phone");
  await axeOk(m, "story mobile dark");
  await m.getByRole("tab", { name: "ליטוש הקול" }).click();
  await m.waitForSelector("#pl-body");
  await axeOk(m, "polish mobile dark");
  await m.getByRole("tab", { name: "ספריית זיכרונות" }).click();
  await m.waitForSelector("#mem-title");
  await axeOk(m, "memories mobile dark");
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal scroll in the memory tab");
  await cm.close();
});

await step("what's new lists stage 56", async () => {
  const c = await mk(); const w = await c.newPage();
  await w.goto(B + "/whats-new", { waitUntil: "networkidle" });
  ok(await w.getByText("שלב 56: סטודיו סיפור אישי וכתיבה אנושית").isVisible(), "what's new entry");
  await c.close();
});

await browser.close();
console.log(fails ? "FAILS " + fails : "ALL PASS");
process.exit(fails ? 1 : 0);
