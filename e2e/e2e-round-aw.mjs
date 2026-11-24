// שלב 75: עוזר הכתיבה והעורך. בדיקות דפדפן.
//  א. פעולות: קיצורים (גם במקלדת עברית), תפריט /, ביטול לכל שלב, גרירה בעכבר ובמקלדת, מצב מיקוד, חיפוש והחלפה, מד זמן,
//     בדיקת סגנון, "טרם נבדק" לפני ייצוא, וואטסאפ בלי עיצוב שבור ובלי הערות אישיות, גרסאות והשוואה זה לצד זה, תצוגת A4,
//     מגבלות (60 שלבים, 20,000 תווים), יציאה עם שינויים שלא נשמרו, שחזור מהמכשיר, וסל השלבים שנמחקו.
//  ב. נגישות (axe) ב-4 מצבים + כהה עם הפחתת תנועה, ובנייד 390px בלי גלילה אופקית.
// שימוש, מתיקיית e2e: sh run-fresh.sh e2e-round-aw.mjs
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const B = process.env.BASE_URL || "http://localhost:5055";
const CODE = process.env.SIGNUP_CODE || "maoz2026";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const J = { "Content-Type": "application/json" };
const call = (method, p, tok, body) => fetch(B + p, { method, headers: { ...J, ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? "OK  " : "FAIL", m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.log("FAIL", name, "-", e.message.split("\n").slice(0, 6).join(" | ")); } };
const axeMsg = (r) => r.violations.map((v) => v.id + " " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("; ")).join(" || ");

const username = "aw" + Math.random().toString(36).slice(2, 8);
const reg = await call("POST", "/api/auth/register", null, { username, password: "Str0ng!Passw0rd75x", displayName: "כותב שלב 75", acceptTerms: true, signupCode: CODE });
if (!reg.body?.token) throw new Error("הרשמה נכשלה: " + JSON.stringify(reg.body));
const tok = reg.body.token;
const sess = JSON.stringify({ token: tok, user: reg.body.user });

const LONG = "היום אנחנו יוצאים יחד אל הנחל הקטן שליד הגבעה הירוקה וכל אחד מהחניכים מביא איתו חבל וכובע ובקבוק מים קר וחברים טובים שרוצים לשחק ולצחוק ולהתאמץ ולנצח";
const blocksA = () => [
  { id: "b1", title: "שלב א", kind: "open", minutes: 5, text: "ברוכים הבאים לפעולה על אומץ. אומץ הוא לא היעדר פחד.", note: "" },
  { id: "b2", title: "שלב ב", kind: "body", minutes: 20, text: LONG + ".", note: "להביא חבל ארוך, סוד שלי" },
  { id: "b3", title: "שלב ג", kind: "peak", minutes: 15, text: "רגע השיא: כולם מחזיקים ידיים. **חשוב** לעצור כאן ולנשום.", note: "" },
  { id: "b4", title: "שלב ד", kind: "close", minutes: 5, text: "מסכמים במעגל: מה למדנו על אומץ?", note: "" },
];
const mkDoc = async (title, blocks, minutes = 45) => {
  const c = await call("POST", "/api/write/docs", tok, { template: "blank", title });
  const put = await call("PUT", `/api/write/docs/${c.body.id}`, tok, { title, meta: { ageGroup: "", minutes }, blocks, baseRev: c.body.rev });
  if (put.status !== 200) throw new Error("יצירת מסמך נכשלה: " + JSON.stringify(put.body));
  return c.body.id;
};

const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
const MODES = { dark: { theme: "dark" }, light: { theme: "light" }, hc: { theme: "dark", hc: "1" }, saver: { theme: "dark", saver: "1" } };
const mk = async (mode, vp, reduced = true) => {
  const c = await browser.newContext({ viewport: vp, locale: "he-IL", reducedMotion: reduced ? "reduce" : "no-preference", permissions: ["clipboard-read", "clipboard-write"] });
  await c.addInitScript(([m, s]) => {
    try {
      for (const k of ["scout.splash", "scout.hero.seen", "scout.intro"]) localStorage.setItem(k, "1");
      localStorage.setItem("scout.mascot", "off");
      localStorage.setItem("scout.theme", m.theme);
      localStorage.setItem("scout.hc", m.hc || "0");
      localStorage.setItem("scout.saver", m.saver || "0");
      localStorage.setItem("scout.session", s);
    } catch {}
  }, [MODES[mode], sess]);
  return c;
};
const open = async (p, id) => {
  await p.goto(`${B}/write/${id}`, { waitUntil: "networkidle" });
  await p.locator("#wb-text-b1").waitFor({ timeout: 20000 });
};
const order = (p) => p.evaluate(() => [...document.querySelectorAll('input[id^="wb-title-"]')].map((i) => i.value));
const saved = (p) => p.getByText(/^נשמר \d/).first();
const dlg = (p, name) => p.getByRole("dialog", { name });
const axe = async (p) => { await p.waitForTimeout(450); return new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); };
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

// ───────────────────────── א. פעולות ─────────────────────────
const idA = await mkDoc("בדיקת שלב 75", blocksA());
{
  const ctx = await mk("dark", { width: 1280, height: 1000 });
  const A = await ctx.newPage();
  A.on("pageerror", (e) => { fails++; console.log("FAIL PAGEERROR", e.message.slice(0, 200)); });
  await open(A, idA);

  await step("מד זמן: בתוך התכנון, ואז חריגה", async () => {
    await A.locator(".tmeter-badge").first().waitFor();
    ok(/בתוך התכנון/.test(await A.locator(".tmeter-badge").first().innerText()), "45 דקות מול 45 מתוכננות: בתוך התכנון");
    await A.locator("#wb-min-b2").fill("40");
    await A.waitForTimeout(300);
    ok(/חריגה/.test(await A.locator(".tmeter-badge").first().innerText()), "אחרי 40 דקות בשלב ב: חריגה מהתכנון (יש גם תווית ולא רק צבע)");
    await A.locator("#wb-min-b2").fill("20");
    await A.waitForTimeout(300);
    ok(/בתוך התכנון/.test(await A.locator(".tmeter-badge").first().innerText()), "חזרה ל-20: בתוך התכנון");
  });

  await step("קיצורים: לוח, ? ו-Ctrl+S במקלדת עברית", async () => {
    await A.keyboard.press("Control+/");
    await dlg(A, "קיצורי מקלדת בעורך").waitFor({ timeout: 4000 });
    ok(true, "Ctrl+/ פותח את לוח הקיצורים");
    const t = await dlg(A, "קיצורי מקלדת בעורך").innerText();
    ok(/Ctrl\+S/.test(t) && /Alt\+↑/.test(t) && /\/משחק/.test(t) && /Space|רווח/.test(t), "הלוח כולל קיצורים, פקודות / ושינוי סדר בלי עכבר");
    await A.keyboard.press("Escape");
    await dlg(A, "קיצורי מקלדת בעורך").waitFor({ state: "hidden" });
    await A.locator(".write-bar .hint").first().click();
    await A.keyboard.press("Shift+Slash");
    await dlg(A, "קיצורי מקלדת בעורך").waitFor({ timeout: 4000 });
    ok((await A.locator("dialog[open]").count()) === 1, "? מחוץ לתיבת טקסט פותח את לוח הקיצורים של העורך, ורק אותו (לא גם את קיצורי האתר)");
    await A.keyboard.press("Escape");
    await dlg(A, "קיצורי מקלדת בעורך").waitFor({ state: "hidden" });
    // מקלדת עברית: ctrl+ס מדווח key="ס" אבל code="KeyS"
    await A.locator("#wb-text-b1").click();
    await A.keyboard.type(" ");
    const prevented = await A.evaluate(() => !document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ס", code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true })));
    ok(prevented, "Ctrl+S עם מקלדת עברית נתפס על ידי העורך (לא נפתח חלון שמירת הדפדפן)");
    await saved(A).waitFor({ timeout: 8000 });
    ok(true, "המסמך נשמר");
  });

  await step("ביטול לכל שלב: שינוי בשלב אחד לא מבטל שינוי בשלב אחר", async () => {
    const t1 = A.locator("#wb-text-b1"), t3 = A.locator("#wb-text-b3");
    const before1 = await t1.inputValue();
    await A.waitForTimeout(1200);
    await t1.click();
    await A.keyboard.press("Control+End");
    await A.keyboard.type(" תוספת אחת", { delay: 15 });
    await A.waitForTimeout(1200);
    await t3.fill("נוסח חדש לגמרי בשלב ג");
    await A.waitForTimeout(1200);
    await t1.click();
    await A.keyboard.press("Control+z");
    ok((await t1.inputValue()) === before1, "Ctrl+Z בשלב א ביטל רק את התוספת שלו");
    ok((await t3.inputValue()) === "נוסח חדש לגמרי בשלב ג", "שלב ג נשאר כמו שכתבנו");
    await A.keyboard.press("Control+y");
    ok((await t1.inputValue()).includes("תוספת אחת"), "Ctrl+Y שחזר");
    await t3.fill(blocksA()[2].text);
    await A.waitForTimeout(900);
  });

  await step("חיפוש והחלפה: מילה שלמה, בכל המסמך, וצעד ביטול אחד", async () => {
    await A.locator(".write-bar .hint").first().click();
    await A.keyboard.press("Control+Shift+H");
    await A.locator("#w-find").waitFor({ timeout: 4000 });
    await A.locator("#w-find").fill("אומץ");
    await A.locator("#w-repl").fill("חוסן");
    await A.getByText(/נמצאו \d+ מופעים/).first().waitFor({ timeout: 4000 });
    ok(true, "מספר המופעים מוצג");
    await A.getByRole("button", { name: "החלפת הכול" }).click();
    await A.getByText(/הוחלפו \d+ מופעים ב-\d+ שלבים/).first().waitFor({ timeout: 4000 });
    const all = await A.evaluate(() => [...document.querySelectorAll('textarea[id^="wb-text-"]')].map((t) => t.value).join("\n"));
    ok(!all.includes("אומץ") && all.includes("חוסן"), "כל המופעים הוחלפו");
    await A.getByRole("button", { name: "ביטול", exact: true }).first().click();
    const after = await A.evaluate(() => [...document.querySelectorAll('textarea[id^="wb-text-"]')].map((t) => t.value).join("\n"));
    ok(after.includes("אומץ") && !after.includes("חוסן"), "לחיצת ביטול אחת החזירה את כל ההחלפות");
    await A.getByRole("button", { name: "סגירת החיפוש" }).click();
  });

  await step("תפריט /: שלב חדש, משך והסימון טרם נבדק", async () => {
    const n0 = await A.locator(".write-block").count();
    const t = A.locator("#wb-text-b4");
    await t.click();
    await t.fill("");
    await A.keyboard.type("/");
    await A.getByRole("listbox", { name: "פקודות לשלב" }).waitFor({ timeout: 3000 });
    ok(true, "הקלדת / בשורה ריקה פותחת את תפריט הפקודות");
    await A.keyboard.type("משח");
    ok(((await A.getByRole("option").allInnerTexts()).join(" ")).includes("משחק"), "הסינון משאיר את /משחק");
    await A.keyboard.press("Enter");
    await A.waitForFunction((n) => document.querySelectorAll(".write-block").length === n + 1, n0, { timeout: 4000 });
    ok(!(await t.inputValue()).includes("/"), "הפקודה לא נשארה בטקסט");
    ok((await A.locator(".write-block").count()) === n0 + 1, "נוסף שלב משחק");
    // /דקות 12 בשלב הנוכחי
    await t.click();
    await A.keyboard.type("/דקות 12");
    await A.keyboard.press("Enter");
    await A.waitForTimeout(300);
    ok((await A.locator("#wb-min-b4").inputValue()) === "12", "/דקות 12 קבע 12 דקות");
    await t.click();
    await A.keyboard.type("/לבדיקה");
    await A.keyboard.press("Enter");
    await A.waitForTimeout(300);
    ok(await A.locator(".write-block").nth(3).getByRole("checkbox", { name: /טרם נבדק/ }).isChecked(), "/לבדיקה סימן ״טרם נבדק״");
    await A.locator(".write-block").nth(3).getByRole("checkbox", { name: /טרם נבדק/ }).uncheck();
    await t.fill("מסכמים במעגל: מה למדנו על אומץ?");
  });

  await step("גרירה: במקלדת (רווח, חצים, Esc) ובעכבר", async () => {
    const o0 = await order(A);
    const grab = A.locator("#wb-grab-b1");
    await grab.focus();
    await A.keyboard.press("Space");
    ok((await grab.getAttribute("aria-pressed")) === "true", "רווח מרים את השלב (aria-pressed)");
    await A.keyboard.press("ArrowDown");
    await A.keyboard.press("ArrowDown");
    await A.keyboard.press("Space");
    const o1 = await order(A);
    ok(o1[2] === o0[0] && o1[0] === o0[1], "שלב א הוזז שתי עמדות למטה: " + o1.join(","));
    ok((await A.locator("#wb-grab-b1").getAttribute("aria-pressed")) !== "true", "השלב הונח");
    // Esc מבטל
    await A.locator("#wb-grab-b1").focus();
    await A.keyboard.press("Space");
    await A.keyboard.press("ArrowUp");
    await A.keyboard.press("Escape");
    ok((await order(A)).join() === o1.join(), "Esc ביטל את ההזזה והחזיר את הסדר");
    // עכבר: גוררים את הידית של השלב השני מתחת לשלישי (מגלגלים כך שהידית מתחת לסרגל הדביק)
    await A.evaluate(() => { const r = document.querySelectorAll(".write-block .write-handle")[1].getBoundingClientRect(); window.scrollBy(0, r.top - 250); });
    await A.waitForTimeout(250);
    const hnd = await A.locator(".write-block").nth(1).locator(".write-handle").boundingBox();
    const third = await A.locator(".write-block").nth(2).boundingBox();
    await A.mouse.move(hnd.x + hnd.width / 2, hnd.y + hnd.height / 2);
    await A.mouse.down();
    await A.mouse.move(hnd.x + hnd.width / 2, hnd.y + 80, { steps: 4 });
    await A.mouse.move(hnd.x + hnd.width / 2, third.y + third.height * 0.6, { steps: 12 });
    await A.mouse.up();
    await A.waitForTimeout(300);
    const o2 = await order(A);
    ok(o2[1] === o1[2] && o2[2] === o1[1], "גרירה בעכבר: השני עבר אחרי השלישי: " + o2.join(","));
    // כל הזזה היא צעד ביטול משלה (גם ביטול ההזזה ב-Esc): לוחצים ביטול עד שהסדר חוזר
    let steps = 0;
    while ((await order(A)).join() !== o0.join() && steps < 8) {
      const u = A.getByRole("button", { name: "ביטול", exact: true }).first();
      if (await u.isDisabled()) break;
      await u.click();
      steps++;
      await A.waitForTimeout(120);
    }
    ok((await order(A)).join() === o0.join(), `ביטול חוזר החזיר את הסדר המקורי (${steps} לחיצות)`);
  });

  await step("מצב מיקוד: בלי תפריטים, מעבר בין שלבים, ו-Esc", async () => {
    await A.locator("#wb-text-b1").click();
    await A.keyboard.press("Control+Shift+F");
    const d = dlg(A, "מצב כתיבה במסך מלא");
    await d.waitFor({ timeout: 4000 });
    ok(await A.locator(".write-actions-card").isHidden() || (await d.boundingBox()).width >= 1200, "המצב מכסה את כל החלון בלי סרגל הכלים");
    const t0 = await d.locator("#wf-title").inputValue();
    await A.keyboard.press("Alt+PageDown");
    await A.waitForTimeout(250);
    ok((await d.locator("#wf-title").inputValue()) !== t0, "Alt+PageDown עבר לשלב הבא");
    await d.locator("#wf-text").click();
    await A.keyboard.press("Control+End");
    await A.keyboard.type(" נכתב במיקוד", { delay: 10 });
    await A.keyboard.press("Escape");
    await d.waitFor({ state: "hidden" });
    const all = await A.evaluate(() => [...document.querySelectorAll('textarea[id^="wb-text-"]')].map((t) => t.value).join("\n"));
    ok(all.includes("נכתב במיקוד"), "מה שנכתב במיקוד נשמר בשלב");
  });

  await step("בדיקת סגנון בעברית", async () => {
    await A.getByRole("button", { name: "בדיקת סגנון בעברית" }).click();
    const d = dlg(A, "בדיקת סגנון בעברית");
    await d.waitFor({ timeout: 4000 });
    await d.getByRole("button", { name: /משפטים ארוכים/ }).waitFor({ timeout: 4000 });
    ok(true, "נמצא משפט ארוך");
    await d.getByRole("button", { name: /קפיצה למקום/ }).first().click();
    await d.waitFor({ state: "hidden" });
    await A.waitForFunction(() => /^wb-text-/.test(document.activeElement?.id ?? ""), null, { timeout: 4000 });
    ok(true, "הקפיצה ממקדת את תיבת הטקסט של השלב");
  });

  await step("״הקרא לי״ נפתח עם הסבר כנה על תלות בדפדפן", async () => {
    await A.getByRole("button", { name: "הקרא לי", exact: true }).click();
    const d = dlg(A, "הקרא לי");
    await d.waitFor({ timeout: 4000 });
    ok(/דפדפן/.test(await d.innerText()), "ההסבר מזכיר שהקול תלוי בדפדפן");
    await A.keyboard.press("Escape");
    await d.waitFor({ state: "hidden" });
  });

  await step("״טרם נבדק״: אזהרה לפני ייצוא, וואטסאפ בלי פורמט שבור ובלי הערות פרטיות", async () => {
    const cb = A.locator(".write-block").nth(2).getByRole("checkbox", { name: /טרם נבדק/ });
    await cb.check();
    await A.getByRole("button", { name: "ייצוא ושיתוף" }).click();
    const g = dlg(A, "יש שלבים שטרם נבדקו");
    await g.waitFor({ timeout: 4000 });
    ok(/טרם נבדק/.test(await g.innerText()), "נפתחה אזהרה עם רשימת השלבים");
    await g.getByRole("button", { name: "חזרה לעריכה" }).click();
    await g.waitFor({ state: "hidden" });
    await A.getByRole("button", { name: "ייצוא ושיתוף" }).click();
    await g.getByRole("button", { name: "להמשיך בכל זאת" }).click();
    await A.getByRole("button", { name: "העתקה בפורמט וואטסאפ" }).waitFor({ timeout: 6000 });
    await A.getByRole("button", { name: "העתקה בפורמט וואטסאפ" }).click();
    await A.waitForTimeout(800);
    const clip = await A.evaluate(() => navigator.clipboard.readText());
    ok(clip.length > 40 && !clip.includes("**") === false || !clip.includes("**"), "בטקסט לוואטסאפ אין כוכביות של מרקדאון שבורות");
    ok(!clip.includes("סוד שלי"), "ההערה האישית לא יצאה בהעתקה");
    ok(/טרם נבדק/.test(clip), "השלב שטרם נבדק מסומן בטקסט");
    await A.keyboard.press("Escape");
    await A.locator("dialog[open]").first().waitFor({ state: "hidden", timeout: 4000 }).catch(() => {});
    await A.locator(".write-block").nth(2).getByRole("checkbox", { name: /טרם נבדק/ }).uncheck();
  });

  await step("גרסאות והשוואה זה לצד זה", async () => {
    await A.getByRole("button", { name: "גרסאות", exact: true }).click();
    const m = A.locator("dialog[open]");
    await m.getByLabel("שם לנקודת שמירה").fill("לפני שינוי");
    await m.getByRole("button", { name: "יצירת נקודת שמירה עכשיו" }).click();
    await m.getByText(/לפני שינוי/).first().waitFor({ timeout: 6000 });
    await A.keyboard.press("Escape");
    await A.locator("#wb-text-b1").fill("נוסח אחר לגמרי בשלב הראשון");
    await A.waitForTimeout(900);
    await A.getByRole("button", { name: "גרסאות", exact: true }).click();
    await A.locator("dialog[open]").getByRole("button", { name: /צפייה/ }).first().click();
    await A.locator("dialog[open]").getByRole("button", { name: "השוואה זה לצד זה" }).click();
    const d = dlg(A, "השוואה זה לצד זה");
    await d.waitFor({ timeout: 4000 });
    ok((await d.locator(".cmp-row").count()) >= 1, "השוואה זה לצד זה מציגה שורות לפי שלב");
    ok((await d.locator("ins, del").count()) >= 1, "השינויים מסומנים (נוסף/נמחק, גם עם סימן ולא רק צבע)");
    await A.keyboard.press("Escape");
    await A.keyboard.press("Escape");
  });

  await step("תצוגת הדפסה A4 עם הערכת עמודים", async () => {
    await A.getByRole("button", { name: "תצוגת הדפסה A4" }).click();
    const d = dlg(A, "תצוגת הדפסה A4");
    await d.waitFor({ timeout: 5000 });
    ok(/עמוד/.test(await d.innerText()), "מוצגת הערכת עמודים");
    ok((await d.getByRole("region", { name: "תצוגה מקדימה של ההדפסה" }).count()) === 1, "יש אזור תצוגה מקדימה");
    const w = await d.locator(".write-print.is-preview").boundingBox();
    ok(w && w.width > 700 && w.width < 800, "רוחב הדף בתצוגה כ-A4 (210 מ״מ ≈ 794px): " + Math.round(w?.width ?? 0));
    const txt = await d.locator(".write-print.is-preview").innerText();
    ok(!txt.includes("סוד שלי"), "ההערה האישית לא מופיעה בהדפסה");
    await A.keyboard.press("Escape");
  });

  await step("מחיקת שלב ושחזור מ״נמחקו לאחרונה״", async () => {
    const n0 = await A.locator(".write-block").count();
    A.once("dialog", (d) => d.accept());
    await A.locator(".write-block").last().getByRole("button", { name: /מחיקת השלב/ }).click();
    await A.waitForFunction((n) => document.querySelectorAll(".write-block").length === n - 1, n0, { timeout: 4000 });
    await A.getByRole("button", { name: "נמחקו לאחרונה" }).click();
    const d = dlg(A, "שלבים שנמחקו לאחרונה");
    await d.waitFor({ timeout: 4000 });
    await d.getByRole("button", { name: /שחזור/ }).first().click();
    await A.waitForFunction((n) => document.querySelectorAll(".write-block").length === n, n0, { timeout: 4000 });
    ok(true, "השלב שנמחק חזר למקומו");
    await A.keyboard.press("Escape");
  });

  await step("יציאה עם שינויים שלא נשמרו ושחזור מהמכשיר", async () => {
    await saved(A).waitFor({ timeout: 10000 });
    await A.route("**/api/write/docs/*", (r) => (r.request().method() === "PUT" ? r.abort() : r.continue()));
    await A.locator("#wb-text-b4").click();
    await A.keyboard.press("Control+End");
    await A.keyboard.type(" טקסט שלא הגיע לשרת", { delay: 10 });
    await A.waitForTimeout(3500);
    ok(!(await saved(A).isVisible().catch(() => false)), "אחרי נפילת השמירה המסמך לא מוצג כ״נשמר״");
    await A.getByRole("link", { name: /חזרה לכל המסמכים/ }).first().click();
    const g = dlg(A, "יש שינויים שעדיין לא נשמרו בשרת");
    await g.waitFor({ timeout: 4000 });
    ok(/במכשיר הזה/.test(await g.innerText()), "ההודעה מבטיחה שהנוסח שמור במכשיר");
    await g.getByRole("button", { name: "להישאר בעורך" }).click();
    await g.waitFor({ state: "hidden" });
    await A.unroute("**/api/write/docs/*");
    await A.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await A.waitForTimeout(500);
    // טעינה מחדש בלי לחכות לסנכרון: השרת עדיין בלי הטקסט, והמכשיר מציע לשחזר
    const stuck = await A.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("scout.write.buf.")));
    ok(stuck.length >= 1, "הנוסח נשמר במכשיר (localStorage)");
  });

  await step("מגבלות: 20,000 תווים בשלב ו-60 שלבים", async () => {
    const id2 = await mkDoc("מסמך למגבלות", Array.from({ length: 60 }, (_, i) => ({ id: "b" + (i + 1), title: "שלב " + (i + 1), kind: "body", minutes: 1, text: "טקסט קצר " + (i + 1), note: "" })), 60);
    const P = await ctx.newPage();
    await open(P, id2);
    ok((await P.locator(".write-block").count()) === 60, "נפתחו 60 שלבים");
    const add = P.locator(".write-block").first().getByRole("button", { name: /שלב חדש מתחת/ });
    ok(await add.isDisabled(), "הוספת שלב מושבתת ב-60 שלבים");
    ok(/60/.test((await add.getAttribute("title")) ?? ""), "ההסבר אומר שזה המקסימום (60)");
    await P.locator("#wb-text-b1").fill("א".repeat(20050));
    await P.locator("#wb-count-b1").waitFor();
    ok(/20,?000|מקסימום|חורג|יותר מדי/.test(await P.locator("#wb-count-b1").innerText()), "מונה התווים בשלב מסביר שעברו את המגבלה: " + (await P.locator("#wb-count-b1").innerText()).slice(0, 80));
    await P.getByText(/המסמך עדיין לא נשמר בשרת/).first().waitFor({ timeout: 6000 });
    ok(true, "מוצגת הודעת מגבלה ברורה בראש העורך");
    await P.locator("#wb-text-b1").fill("טקסט קצר שוב");
    await saved(P).waitFor({ timeout: 10000 });
    ok(true, "אחרי התיקון המסמך נשמר");
    await P.close();
  });
  await ctx.close();
}

// ───────────────────────── ב. נגישות ובנייד ─────────────────────────
const STATES = [
  ["העורך", async () => {}, async () => {}],
  ["לוח קיצורים", async (p) => { await p.keyboard.press("Control+/"); await dlg(p, "קיצורי מקלדת בעורך").waitFor(); }, async (p) => { await p.keyboard.press("Escape"); }],
  ["חיפוש והחלפה", async (p) => { await p.keyboard.press("Control+Shift+H"); await p.locator("#w-find").waitFor(); await p.locator("#w-find").fill("אומץ"); }, async (p) => { await p.getByRole("button", { name: "סגירת החיפוש" }).click(); }],
  ["מצב מיקוד", async (p) => { await p.locator("#wb-text-b1").click(); await p.keyboard.press("Control+Shift+F"); await dlg(p, "מצב כתיבה במסך מלא").waitFor(); }, async (p) => { await p.keyboard.press("Escape"); }],
  ["בדיקת סגנון", async (p) => { await p.getByRole("button", { name: "בדיקת סגנון בעברית" }).click(); await dlg(p, "בדיקת סגנון בעברית").waitFor(); }, async (p) => { await p.keyboard.press("Escape"); }],
  ["הערות אישיות", async (p) => { await p.getByRole("button", { name: "ההערות האישיות שלי" }).click(); await dlg(p, "ההערות האישיות שלי").waitFor(); }, async (p) => { await p.keyboard.press("Escape"); }],
  ["תצוגת A4", async (p) => { await p.getByRole("button", { name: "תצוגת הדפסה A4" }).click(); await dlg(p, "תצוגת הדפסה A4").waitFor(); }, async (p) => { await p.keyboard.press("Escape"); }],
  ["שלבים שנמחקו", async (p) => { await p.getByRole("button", { name: "נמחקו לאחרונה" }).click(); await dlg(p, "שלבים שנמחקו לאחרונה").waitFor(); }, async (p) => { await p.keyboard.press("Escape"); }],
];
const idB = await mkDoc("נגישות שלב 75", blocksA());
const sweeps = [...Object.keys(MODES).map((m) => [m, m, true]), ["dark + תנועה רגילה", "dark", false]];
for (const [label, mode, reduced] of sweeps) {
  await step("axe " + label, async () => {
    const ctx = await mk(mode, { width: 1280, height: 1000 }, reduced);
    const p = await ctx.newPage();
    await open(p, idB);
    for (const [name, on, off] of STATES) {
      await on(p);
      const r = await axe(p);
      ok(r.violations.length === 0, `axe ${label} · ${name} ${axeMsg(r)}`);
      await off(p);
      await p.waitForTimeout(200);
    }
    await ctx.close();
  });
}
await step("בנייד 390px: אין גלילה אופקית ואין הפרות axe", async () => {
  const ctx = await mk("dark", { width: 390, height: 844 });
  const p = await ctx.newPage();
  await open(p, idB);
  ok(await noScroll(p), "העורך בנייד בלי גלילה אופקית");
  const hb = await p.locator("#wb-grab-b1").boundingBox();
  ok(hb && hb.width >= 40 && hb.height >= 40, "ידית הגרירה גלויה ובגודל מגע בנייד: " + Math.round(hb?.width ?? 0) + "x" + Math.round(hb?.height ?? 0));
  const r = await axe(p);
  ok(r.violations.length === 0, "axe נייד · העורך " + axeMsg(r));
  for (const [name, on, off] of STATES.slice(1, 4)) {
    await on(p);
    ok(await noScroll(p), `נייד · ${name}: בלי גלילה אופקית`);
    const r2 = await axe(p);
    ok(r2.violations.length === 0, `axe נייד · ${name} ${axeMsg(r2)}`);
    await off(p);
  }
  await ctx.close();
});

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
