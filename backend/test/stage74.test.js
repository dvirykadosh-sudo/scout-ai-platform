// שלב 74: מחולל הפעולות והמאגר (20 שדרוגים).
// לוגיקה טהורה נבדקת ישירות, והנתיבים נבדקים מול שרת אמיתי עם הרשאות ושיבוש קלט.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.API_READ_LIMIT = "1000000";
process.env.API_WRITE_LIMIT = "1000000";

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { getActivity, insertActivity } = await import("../src/activities.js");
const L = await import("../src/lab74.js");
const P = await import("../src/privacy-scan.js");
const X = await import("../src/access-tags.js");
const { AGE_GROUPS } = await import("../src/shared/constants.js");
const { normalizeSavedQuery } = await import("../src/routes-lab74.js");
// פריט 8 חי בצד הלקוח, בקובץ טהור שהשרת יכול לייבא
const T = await import("../../frontend/src/lib/lab74.ts");

let server, base, db, tpl;
const call = async (method, path, tok, body) => {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let n = 0;
const reg = async () => {
  const username = "s74u" + ++n + Math.random().toString(36).slice(2, 5);
  const r = await call("POST", "/api/auth/register", null, { username, password: "Str0ng!Passw0rd7" + n, displayName: "בודק " + n, acceptTerms: true, signupCode: "shevet-code" });
  return { token: r.body?.token, id: r.body?.user?.id, username };
};
const age = (g) => AGE_GROUPS.find((x) => x.startsWith(`כיתה ${g} `));
const stage = (name, minutes, content, layer = "x") => ({ name, minutes, layer, content });
/** פעולה בדוקה עם תוכן מבוקר, בבעלות משתמש (כדי שלא תנוקה כפעולת אורח) */
const make = (over = {}) => {
  const stages = over.stages ?? tpl.stages.map((s) => ({ ...s }));
  const id = insertActivity(db, { ...tpl, isSeed: false, ownerId: over.ownerId ?? null, status: "PUBLISHED", tags: [], ...over, stages, durationMin: stages.reduce((s, x) => s + x.minutes, 0) });
  return getActivity(db, id, { includeArchived: true });
};

before(async () => {
  db = openDb(":memory:");
  seedIfEmpty(db);
  ensureAdmin(db);
  tpl = getActivity(db, 1);
  server = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) }).listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

describe("שלב 74: גיל, יעד מדיד וציון איכות (פריטים 1, 2, 5, 6)", () => {
  it("שכבת גיל מזוהה, ושכבה לא מוכרת מחזירה null", () => {
    assert.equal(L.ageBand(age("ג'")).band, "young");
    assert.equal(L.ageBand(age("ד'")).band, "young");
    assert.equal(L.ageBand(age("ו'")).band, "mid");
    assert.equal(L.ageBand(age("ח'")).band, "teen");
    assert.equal(L.ageBand(age("יא'")).band, "senior");
    assert.equal(L.ageBand("סתם"), null);
    assert.equal(L.ageBand(undefined), null);
  });

  it("התאמה לגיל: ניסוח ארוך ומופשט נכשל בכיתה ג', ועובר בכיתה י'", () => {
    const long = "המושג של האוטונומיה האינדיבידואלית בתוך המסגרת הקולקטיבית דורש מאיתנו לחשוב לעומק על היחס בין הפרט לקבוצה בעולם המודרני ועל המשמעות הפילוסופית של בחירה חופשית.";
    const stages = ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => stage(nm, 10, long));
    const young = L.ageFit(make({ ageGroup: age("ג'"), stages }));
    assert.equal(young.band, "young");
    assert.equal(young.checks.find((c) => c.id === "sentence").ok, false);
    assert.equal(young.checks.find((c) => c.id === "abstract").ok, false);
    assert.equal(young.hints.length, 5);
    assert.ok(young.hints.every((h) => h.hint.length > 10));
    const senior = L.ageFit(make({ ageGroup: age("י'"), stages }));
    assert.equal(senior.checks.find((c) => c.id === "abstract").ok, true);
    assert.ok(senior.score > young.score);
    assert.equal(L.ageFit({ ageGroup: "לא ידוע", stages: [] }).score, null);
  });

  it("יעד מדיד: 70% בלי שגיאות עיגול, התאמה לפי מילה, וברירת מחדל כשאין ערך מוכר", () => {
    assert.match(L.measurableGoal({ leadingValue: "אחריות", groupSize: 30 }).goal, /לפחות 21 מתוך 30/);
    assert.match(L.measurableGoal({ leadingValue: "אחריות", groupSize: 3 }).goal, /לפחות 3 מתוך 3/);
    assert.match(L.measurableGoal({ leadingValue: "אחריות", groupSize: 1 }).goal, /לפחות 1 מתוך 1/);
    assert.equal(L.measurableGoal({ leadingValue: "אחריות לסביבה", groupSize: 20 }).indicators[0].includes("מעשה"), true, "סביבה קודמת לאחריות");
    assert.equal(L.measurableGoal({ leadingValue: "קדושה כהתייחדות", groupSize: 20 }).matched, false, "'התייחדות' לא נתפסת כ'יחד'");
    const g = L.measurableGoal({ leadingValue: "נושא חדש לגמרי", groupSize: 20 });
    assert.equal(g.matched, false);
    assert.match(g.goal, /נושא חדש לגמרי/);
    assert.equal(g.indicators.length, 3);
    assert.match(g.measure, /14 מתוך 20/);
  });

  it("ציון איכות: שישה ממדים שמשקלם 100, פעולה ריקה מקבלת פחות מפעולה מלאה, ויש הסבר וטיעון", () => {
    const good = L.qualityReport(tpl);
    assert.equal(good.dimensions.length, 6);
    assert.equal(good.dimensions.reduce((s, d) => s + d.weight, 0), 100);
    assert.ok(good.overall >= 0 && good.overall <= 100);
    assert.ok(good.dimensions.every((d) => d.score >= 0 && d.score <= 100));
    assert.ok(good.why.line.length > 20);
    const poor = L.qualityReport(make({ leadingValue: "", equipment: "", safetyNotes: "", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => stage(nm, nm === "משחק" ? 40 : 1, "טקסט")) }));
    assert.ok(poor.overall < good.overall, `${poor.overall} < ${good.overall}`);
    assert.ok(poor.top.length >= 1 && poor.top.every((t) => t.tip));
    assert.ok(["מצוינת", "טובה", "בסדר, כדאי לשפר", "דורשת עבודה"].includes(poor.grade));
    assert.equal(poor.dimensions.find((d) => d.key === "timing").score < 70, true);
  });

  it("טיעון 'למה הפעולה הזאת' כולל רק עובדות: דירוג והפעלות רק כשיש מספיק", () => {
    const base = L.whyThis(tpl, { best: { score: 90, label: "מבנה" } });
    assert.ok(!/דורגה/.test(base.line) && !/הופעלה/.test(base.line));
    const rich = L.whyThis(tpl, { rating: { count: 5, average: 4.6 }, runCount: 3 });
    assert.match(rich.line, /דורגה 4.6 מתוך 5 על ידי 5 מדריכים/);
    assert.match(rich.line, /הופעלה 3 פעמים/);
    assert.ok(rich.reasons.length <= 4);
  });
});

describe("שלב 74: נתיבי איכות (פריטים 1, 2, 5, 6) ללא התחברות", () => {
  it("quality-report, age-fit ו-goal לפעולה קיימת, 404 לא קיימת", async () => {
    const q = await call("GET", "/api/activities/1/quality-report");
    assert.equal(q.status, 200);
    assert.equal(q.body.dimensions.length, 6);
    assert.ok("libraryAverage" in q.body);
    const f = await call("GET", "/api/activities/1/age-fit");
    assert.equal(f.status, 200);
    assert.equal(f.body.checks.length, 6);
    const g = await call("GET", "/api/activities/1/goal");
    assert.equal(g.status, 200);
    assert.match(g.body.goal, /^בסוף הפעולה/);
    for (const p of ["quality-report", "age-fit", "goal", "safety-scan", "access-tags"]) assert.equal((await call("GET", `/api/activities/99999/${p}`)).status, 404, p);
    assert.equal((await call("GET", "/api/activities/abc/quality-report")).status, 404);
  });

  it("פעולה בארכיון לא נחשפת בנתיבי הקריאה", async () => {
    const a = make({ status: "ARCHIVED" });
    for (const p of ["quality-report", "age-fit", "goal", "safety-scan", "access-tags"]) assert.equal((await call("GET", `/api/activities/${a.id}/${p}`)).status, 404, p);
  });
});

describe("שלב 74: כפילויות לפני שמירה (פריט 3)", () => {
  it("אותו שם מזוהה גם כשכתוב אחרת, ופעולה שונה לא מזוהה", async () => {
    const t = tpl.title;
    const same = await call("POST", "/api/activities/check-duplicate", null, { title: `  ${t}  `, leadingValue: tpl.leadingValue, stages: tpl.stages.map((s) => ({ content: s.content })) });
    assert.equal(same.status, 200);
    assert.equal(same.body.hasNear, true);
    assert.equal(same.body.items[0].id, tpl.id);
    assert.equal(same.body.items[0].sameTitle, true);
    const other = await call("POST", "/api/activities/check-duplicate", null, { title: "בישול על אש בטיול שנתי", leadingValue: "עצמאות", stages: [] });
    assert.equal(other.status, 200);
    assert.equal(other.body.hasNear, false);
  });

  it("מתעלם מפעולה אחת (exceptId), ואינו מחזיר פעולות שלא פורסמו", async () => {
    const r = await call("POST", "/api/activities/check-duplicate", null, { title: tpl.title, leadingValue: tpl.leadingValue, stages: [], exceptId: tpl.id });
    assert.ok(!r.body.items.some((x) => x.id === tpl.id));
    const hidden = make({ title: "כותרת ייחודית לבדיקת כפילות סודית", status: "PENDING" });
    const r2 = await call("POST", "/api/activities/check-duplicate", null, { title: hidden.title, stages: [] });
    assert.ok(!r2.body.items.some((x) => x.id === hidden.id));
  });

  it("קלט שגוי נדחה: שם קצר, שדה זר, יותר מחמישה שלבים", async () => {
    assert.equal((await call("POST", "/api/activities/check-duplicate", null, { title: "א" })).status, 400);
    assert.equal((await call("POST", "/api/activities/check-duplicate", null, { title: "שם תקין", isAdmin: true })).status, 400);
    assert.equal((await call("POST", "/api/activities/check-duplicate", null, { title: "שם תקין", stages: Array.from({ length: 6 }, () => ({ content: "x" })) })).status, 400);
    assert.equal((await call("POST", "/api/activities/check-duplicate", null, { title: "שם תקין", stages: [{ content: "x".repeat(3001) }] })).status, 400);
  });
});

describe("שלב 74: בטיחות מורחבת (פריט 9)", () => {
  it("אש בגיל צעיר דורשת מבוגר צמוד, ואחרי הוספת ההנחיות הסריקה נקייה", () => {
    const a = make({ ageGroup: age("ג'"), safetyNotes: "זהירות.", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => stage(nm, 10, nm === "משימה" ? "מדליקים מדורה ושורפים נייר בקבוצות" : "עושים משהו פשוט יחד")) });
    const s = L.safetyScan(a);
    assert.ok(s.risks.some((r) => r.id === "young-supervision" && !r.covered), "כלל גיל");
    assert.ok(["attention", "high"].includes(s.level));
    assert.ok(s.addition.length > 0);
    const fixed = L.safetyScan({ ...a, safetyNotes: `${a.safetyNotes} ${s.addition}` });
    assert.equal(fixed.missingCount, 0, JSON.stringify(fixed.risks.filter((r) => !r.covered).map((r) => r.id)));
    assert.equal(fixed.level, "ok");
    assert.equal(fixed.score, 100);
  });

  it("סיכונים חדשים מזוהים: הדחה, קפטנים, חשמל, אינטרנט, שמש וחשיפה רגשית", () => {
    const text = "משחק הדחה: מי שנתפס יוצא. הקפטנים בוחרים קבוצות. מחברים מפצל חשמל. נכנסים לצ'אט באינטרנט. בשמש של צהריים. כל אחד חושף סוד.";
    const a = make({ stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm, i) => stage(nm, 10, i === 1 ? text : "מדברים")), safetyNotes: "" });
    const ids = new Set(L.safetyScan(a).risks.map((r) => r.id));
    for (const id of ["elimination", "captains", "electric", "online", "sun", "exposure"]) assert.ok(ids.has(id), id);
  });

  it("כל הצעה שהסריקה מוסיפה סוגרת את הסיכון שלה (הוספה חוזרת לא מוסיפה שוב)", () => {
    for (const r of L.RISKS_EXT) assert.ok(r.cover.test(r.suggestion), `ההצעה ל"${r.id}" לא עוברת את בדיקת הכיסוי של עצמה`);
    const text = L.RISKS_EXT.map((r) => r.re.source.split("|")[0].replace(/[\\()?]/g, "")).join(". ");
    const a = make({ ageGroup: age("ג'"), safetyNotes: "זהירות.", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm, i) => stage(nm, 10, i === 1 ? text : "מדברים")) });
    const s1 = L.safetyScan(a);
    assert.ok(s1.missingCount >= 8, `${s1.missingCount}`);
    const s2 = L.safetyScan({ ...a, safetyNotes: `${a.safetyNotes} ${s1.addition}`.slice(0, 1000) });
    assert.deepEqual(s2.risks.filter((r) => !r.covered).map((r) => r.id), [], "אחרי ההוספה אין חסרים");
    assert.equal(s2.addition, "");
  });

  it("סיכון שמכוסה בהערות לא נספר כחסר", () => {
    const a = make({ safetyNotes: "חניך שהודח לא יושב בצד, הוא מקבל תפקיד שופט. המדריך מחלק לקבוצות.", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm, i) => stage(nm, 10, i === 1 ? "משחק הדחה והקפטנים בוחרים קבוצות" : "מדברים")) });
    const s = L.safetyScan(a);
    assert.ok(s.risks.filter((r) => ["elimination", "captains"].includes(r.id)).every((r) => r.covered));
  });

  it("הערות בטיחות ריקות עם סיכון מסומנות, וההוספה לא חורגת מ-1000 תווים", () => {
    const a = make({ safetyNotes: "", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => stage(nm, 10, "מדליקים אש ורצים בשמש ליד מים וחשמל ואופניים")) });
    assert.ok(L.safetyScan(a).risks.some((r) => r.id === "empty-notes"));
    const longNotes = L.safetyScan({ ...a, safetyNotes: "ב".repeat(900) });
    assert.ok(longNotes.addition.length <= 99, `${longNotes.addition.length}`);
  });

  it("נתיב apply: רק בעלים, שומר גרסה, ו-409 כשאין מה להוסיף", async () => {
    const A = await reg();
    const B = await reg();
    const a = make({ ownerId: A.id, safetyNotes: "זהירות.", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm, i) => stage(nm, 10, i === 2 ? "מדליקים מדורה ורצים" : "מדברים")) });
    assert.equal((await call("POST", `/api/activities/${a.id}/safety-scan/apply`, null, {})).status, 401);
    assert.equal((await call("POST", `/api/activities/${a.id}/safety-scan/apply`, B.token, {})).status, 403);
    const ok = await call("POST", `/api/activities/${a.id}/safety-scan/apply`, A.token, {});
    assert.equal(ok.status, 200);
    assert.ok(ok.body.safetyNotes.length > a.safetyNotes.length);
    assert.equal((await call("GET", `/api/activities/${a.id}/safety-scan`)).body.missingCount, 0);
    assert.equal((await call("POST", `/api/activities/${a.id}/safety-scan/apply`, A.token, {})).status, 409);
    const v = await call("GET", `/api/activities/${a.id}/versions`, A.token);
    assert.ok(v.body.items.some((x) => /סריקת הבטיחות/.test(x.note || "")));
  });
});

describe("שלב 74: תגיות נגישות וסינון במאגר (פריט 19)", () => {
  it("תגיות נגזרות מהתוכן, ושלילה כמו 'לא רצים' לא נחשבת", () => {
    const quiet = make({ equipment: "אין", energeticMode: false, stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => stage(nm, 10, "יושבים במעגל ומדברים. לא רצים. בלי מגע.")) });
    const ids = X.accessTags(quiet).map((t) => t.id);
    for (const id of ["noRun", "seated", "quiet", "noReadWrite", "noContact", "noFood"]) assert.ok(ids.includes(id), id);
    const loud = make({ equipment: "חבלים, כדורים, קונוסים, רמקול, מחסומים", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => stage(nm, 10, "רצים בין תחנות וצועקים, כותבים על דף, אוכלים עוגה, ויש מגע")) });
    const ids2 = X.accessTags(loud).map((t) => t.id);
    for (const id of ["noRun", "quiet", "noReadWrite", "noContact", "noFood", "seated", "lightGear"]) assert.ok(!ids2.includes(id), id);
  });

  it("סינון לפי access במאגר, ושילוב עם מסננים אחרים", async () => {
    const q = make({ title: "שקטה לבדיקת נגישות", equipment: "אין", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => stage(nm, 10, "יושבים במעגל ומדברים בשקט")) });
    const r = await call("GET", "/api/activities?access=seated,quiet&pageSize=50");
    assert.equal(r.status, 200);
    assert.ok(r.body.items.some((x) => x.id === q.id));
    assert.ok(r.body.items.every((x) => X.hasAccess(getActivity(db, x.id), ["seated", "quiet"])));
    const none = await call("GET", "/api/activities?access=seated&q=zzzzקלטלאקיים");
    assert.equal(none.body.items.length, 0);
    assert.ok((await call("GET", "/api/activities?access=lightGear&access2=x")).status === 200);
  });

  it("ערך לא מוכר או הזרקה ב-access נדחה", async () => {
    for (const bad of ["foo", "quiet,foo", "quiet;DROP TABLE activities", "quiet,quiet,quiet,quiet", "' OR 1=1 --", ""]) {
      const r = await call("GET", `/api/activities?access=${encodeURIComponent(bad)}`);
      assert.ok(r.status === 400 || (bad === "" && r.status === 200), `${bad} => ${r.status}`);
    }
    assert.ok(db.prepare("SELECT COUNT(*) AS c FROM activities").get().c > 0);
  });

  it("רשימת התגיות והתגיות של פעולה", async () => {
    const all = await call("GET", "/api/access-tags");
    assert.equal(all.body.length, 7);
    const t = await call("GET", "/api/activities/1/access-tags");
    assert.ok(Array.isArray(t.body));
  });
});

describe("שלב 74: סריקת פרטיות (פריט 20)", () => {
  it("מוצא טלפון, מייל, קישור, ת.ז. תקינה, שם משתמש, כתובת ושם חניך עם מידע רפואי", () => {
    const t = "התקשרו 050-1234567, מייל a@b.co.il, אתר https://x.com/a, @dani_s123, ת.ז. 123456782, גר ברחוב הרצל 12, החניך נועם סובל מאלרגיה.";
    const kinds = P.scanText(t).map((f) => f.kind);
    for (const k of ["phone", "email", "link", "handle", "id", "address", "childHealth"]) assert.ok(kinds.includes(k), k);
  });

  it("לא מסמן שגוי: 9 ספרות שאינן ת.ז. תקינה, 'החניך הראשון', ומספר טלפון לא נספר גם כת.ז.", () => {
    assert.equal(P.scanText("מספר 123456789 ללא משמעות").filter((f) => f.kind === "id").length, 0);
    assert.equal(P.scanText("החניך הראשון מתחיל והחניך שמוביל עומד").length, 0);
    assert.equal(P.scanText("03-1234567").filter((f) => f.kind === "id").length, 0);
    assert.equal(P.scanText("שלום עולם, זה טקסט רגיל לגמרי").length, 0);
    assert.equal(P.validIsraeliId("123456782"), true);
    assert.equal(P.validIsraeliId("12345678"), false);
  });

  it("הסרה אוטומטית משאירה שם חניך ומסמנת אותו בלבד, וכתובת מוחלפת בסימון", () => {
    const out = P.redactText("גר ברחוב הרצל 12 ובטלפון 050-1234567. החניך נועם סובל מאלרגיה.");
    assert.ok(!out.includes("הרצל"));
    assert.ok(!out.includes("1234567"));
    assert.ok(out.includes("[כתובת הוסרה]"));
    assert.ok(out.includes("החניך נועם סובל"), "שם חניך נשאר לבדיקה ידנית");
    assert.equal(P.redactText("אין כאן כלום"), "אין כאן כלום");
  });

  it("נתיבים: רק בעלים או אדמין, הסרה שומרת גרסה, וקריאה חוזרת מחזירה 409", async () => {
    const A = await reg();
    const B = await reg();
    const a = make({ ownerId: A.id, equipment: "טלפון 050-1234567", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm, i) => stage(nm, 10, i === 0 ? "כתבו למייל dani@example.com או @dani_s1" : "מדברים")) });
    assert.equal((await call("GET", `/api/activities/${a.id}/privacy`)).status, 401);
    assert.equal((await call("GET", `/api/activities/${a.id}/privacy`, B.token)).status, 403);
    const scan = await call("GET", `/api/activities/${a.id}/privacy`, A.token);
    assert.equal(scan.status, 200);
    assert.equal(scan.body.autoCount, 3);
    assert.equal(scan.body.ok, false);
    assert.equal((await call("POST", `/api/activities/${a.id}/privacy/redact`, B.token, {})).status, 403);
    const red = await call("POST", `/api/activities/${a.id}/privacy/redact`, A.token, {});
    assert.equal(red.status, 200);
    assert.ok(!/example|1234567|dani_s1/.test(JSON.stringify(red.body)));
    assert.equal((await call("GET", `/api/activities/${a.id}/privacy`, A.token)).body.count, 0);
    assert.equal((await call("POST", `/api/activities/${a.id}/privacy/redact`, A.token, {})).status, 409);
    const v = await call("GET", `/api/activities/${a.id}/versions`, A.token);
    assert.ok(v.body.items.some((x) => /פרטים אישיים/.test(x.note || "")));
  });

  it("בהתראה לאדמין על פעולה שממתינה לאישור מופיע מספר הפרטים האישיים", () => {
    const A = db.prepare("SELECT id FROM users LIMIT 1").get();
    make({ ownerId: A.id, status: "PENDING", title: "ממתינה עם פרטים", equipment: "טלפון 050-7654321" });
    const note = db.prepare("SELECT * FROM notifications WHERE kind = 'pending' AND text LIKE '%ממתינה עם פרטים%' ORDER BY id DESC LIMIT 1").get();
    assert.ok(note, "נוצרה התראה");
    assert.match(note.text, /נמצאו 1 פרטים אישיים אפשריים/);
    make({ ownerId: A.id, status: "PENDING", title: "ממתינה נקייה לגמרי", equipment: "חבלים" });
    const clean = db.prepare("SELECT * FROM notifications WHERE kind = 'pending' AND text LIKE '%ממתינה נקייה לגמרי%' LIMIT 1").get();
    assert.ok(clean && !/פרטים אישיים/.test(clean.text), "בלי ממצאים אין הערה");
  });
});

describe("שלב 74: התאמה לכמה תנאים (פריט 7) ופעולה לשכבה אחרת (פריט 14)", () => {
  it("רשימת התנאים כוללת חושך, בלי ציוד וקור לצד התנאים הקיימים", async () => {
    const r = await call("GET", "/api/adapt/conditions-all");
    const keys = r.body.map((c) => c.key);
    for (const k of ["rain", "heat", "few", "many", "dark", "no-gear", "cold"]) assert.ok(keys.includes(k), k);
    assert.ok(r.body.every((c) => c.group && c.label));
    assert.equal(r.body.length, 17);
  });

  it("שלושה תנאים ביחד: עותק חדש עם כל ההתאמות, והמקור לא משתנה", async () => {
    const before = JSON.stringify(getActivity(db, 1));
    const r = await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["rain", "no-gear", "dark"] });
    assert.equal(r.status, 201);
    assert.notEqual(r.body.id, 1);
    assert.match(r.body.title, /גרסת גשם \+ בלי ציוד \+ חושך או ערב/);
    assert.equal(r.body.adaptation.applied.length, 3);
    for (const s of r.body.stages) assert.equal((s.content.match(/התאמה \(/g) || []).length, 3, s.name);
    assert.match(r.body.safetyNotes, /בחושך/);
    assert.equal(JSON.stringify(getActivity(db, 1)), before);
  });

  it("דחיות: ארבעה תנאים, סתירה, תנאי לא מוכר, כפילות כמו תנאי אחד", async () => {
    assert.equal((await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["rain", "heat", "few", "dark"] })).status, 400);
    const c = await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["few", "many"] });
    assert.equal(c.status, 400);
    assert.match(c.body.error?.message ?? c.body.message ?? JSON.stringify(c.body), /אי אפשר לשלב/);
    assert.equal((await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["beginners", "strong"] })).status, 400);
    assert.equal((await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["nope"] })).status, 400);
    assert.equal((await call("POST", "/api/activities/1/adapt-multi", null, { conditions: [] })).status, 400);
    assert.equal((await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["__proto__"] })).status, 400);
    assert.equal((await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["constructor"] })).status, 400);
    const dup = await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["rain", "rain"] });
    assert.equal(dup.status, 201);
    assert.equal(dup.body.adaptation.applied.length, 1);
    assert.equal((await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["rain"], status: "PUBLISHED" })).status, 400);
  });

  it("התאמות שלא נכנסות במגבלת האורך לא נחתכות באמצע משפט, ומסומן trimmed", () => {
    const a = make({ stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => stage(nm, 10, "א".repeat(2990))) });
    const r = L.adaptMany(a, ["rain", "dark", "cold"]);
    assert.equal(r.trimmed, true);
    assert.ok(r.stages.every((s) => s.content.length <= 3000));
    assert.ok(r.title.length <= 120);
  });

  it("פעולה לשכבה אחרת: הערות גיל בכל שלב, גודל קבוצה, אורך מתחלק מחדש, ו-400 כשלא השתנה דבר", async () => {
    const src = getActivity(db, 1);
    const target = age("ד'");
    const r = await call("POST", "/api/activities/1/for-group", null, { ageGroup: target, participants: 40, durationMin: 30 });
    assert.equal(r.status, 201);
    assert.equal(r.body.ageGroup, target);
    assert.equal(r.body.groupSize, 40);
    assert.equal(r.body.durationMin, 30);
    assert.equal(r.body.stages.reduce((s, x) => s + x.minutes, 0), 30);
    assert.ok(r.body.stages.every((s) => /התאמה לכיתות ג'–ד'/.test(s.content)));
    assert.ok(r.body.stages.every((s) => /התאמה \(/.test(s.content)), "גם התאמה לקבוצה גדולה");
    assert.ok(r.body.tags.includes("התאמה לשכבה אחרת"));
    assert.equal(getActivity(db, 1).durationMin, src.durationMin);
    assert.equal((await call("POST", "/api/activities/1/for-group", null, { ageGroup: src.ageGroup })).status, 400);
    assert.equal((await call("POST", "/api/activities/1/for-group", null, { ageGroup: "כיתה ט' - נבלות" })).status, 400);
    assert.equal((await call("POST", "/api/activities/1/for-group", null, { ageGroup: target, participants: 0 })).status, 400);
    assert.equal((await call("POST", "/api/activities/1/for-group", null, { ageGroup: target, ownerId: 1 })).status, 400);
  });
});

describe("שלב 74: השוואה בין פעולות (פריט 13)", () => {
  it("שתיים ושלוש פעולות, עם נקודות בולטות", async () => {
    const r = await call("GET", "/api/compare?ids=1,2");
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 2);
    for (const k of ["quality", "gearLoad", "safetyScore", "stageMinutes", "rating", "access", "methods"]) assert.ok(k in r.body.items[0], k);
    assert.equal(r.body.items[0].stageMinutes.length, 5);
    assert.equal((await call("GET", "/api/compare?ids=1,2,3")).body.items.length, 3);
  });

  it("קלט שגוי: אחת, ארבע, לא מספרים, פעולה לא קיימת, פעולה בארכיון", async () => {
    for (const q of ["1", "1,2,3,4", "a,b", "1,", ",1", "1,2;3", "", "1,99999"]) {
      const r = await call("GET", `/api/compare?ids=${encodeURIComponent(q)}`);
      assert.ok(r.status === 400 || r.status === 404, `${q} => ${r.status}`);
    }
    const arch = make({ status: "ARCHIVED" });
    assert.equal((await call("GET", `/api/compare?ids=1,${arch.id}`)).status, 404);
    assert.equal((await call("GET", "/api/compare")).status, 400);
  });
});

describe("שלב 74: הבדלי גרסאות שורה אחרי שורה (פריט 15)", () => {
  it("lineDiff ו-compactDiff", () => {
    const d = L.lineDiff("א\nב\nג\nד", "א\nב2\nג\nד\nה");
    assert.deepEqual(d.map((x) => x.op), ["same", "del", "add", "same", "same", "add"]);
    assert.equal(L.lineDiff("x", "x").every((o) => o.op === "same"), true);
    const c = L.compactDiff(L.lineDiff(Array.from({ length: 30 }, (_, i) => `ש${i}`).join("\n"), Array.from({ length: 30 }, (_, i) => (i === 15 ? "שונה" : `ש${i}`)).join("\n")));
    assert.ok(c.some((o) => o.op === "skip" && o.n > 5));
    assert.ok(c.length < 12);
    assert.equal(L.lineDiff("", "").length, 1);
  });

  it("מגביל קלט ענק ולא נתקע", () => {
    const big = Array.from({ length: 5000 }, (_, i) => `שורה ${i}`).join("\n");
    const t0 = Date.now();
    const d = L.lineDiff(big, big + "\nעוד");
    assert.ok(Date.now() - t0 < 2000);
    assert.ok(d.length <= 601);
  });

  it("נתיב: גרסה מול הנוכחית, רק לבעלים, וגרסה של פעולה אחרת לא נגישה", async () => {
    const A = await reg();
    const B = await reg();
    const a = make({ ownerId: A.id, title: "פעולה לגרסאות" });
    const b = make({ ownerId: A.id, title: "פעולה אחרת לגרסאות" });
    const full = await call("GET", `/api/activities/${a.id}`, A.token);
    const body = { ...full.body };
    delete body.id;
    const upd = await call("PUT", `/api/activities/${a.id}`, A.token, { ...body, title: "פעולה לגרסאות (עודכן)", stages: body.stages.map((s, i) => (i === 1 ? { ...s, content: `${s.content}\nשורה חדשה` } : s)) });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    const vs = (await call("GET", `/api/activities/${a.id}/versions`, A.token)).body.items;
    assert.ok(vs.length >= 1);
    const d = await call("GET", `/api/activities/${a.id}/versions/diff?from=${vs[0].id}&to=current`, A.token);
    assert.equal(d.status, 200);
    assert.equal(d.body.fields[0].label, "שם הפעולה");
    assert.ok(d.body.stages.some((s) => s.index === 1 && s.ops.some((o) => o.op === "add" && o.text === "שורה חדשה")));
    assert.equal((await call("GET", `/api/activities/${a.id}/versions/diff?from=${vs[0].id}&to=current`, B.token)).status, 403);
    assert.equal((await call("GET", `/api/activities/${a.id}/versions/diff?from=${vs[0].id}&to=current`)).status, 401);
    assert.equal((await call("GET", `/api/activities/${b.id}/versions/diff?from=${vs[0].id}`, A.token)).status, 404, "גרסה של פעולה אחרת");
    assert.equal((await call("GET", `/api/activities/${a.id}/versions/diff?from=abc`, A.token)).status, 404);
    assert.equal((await call("GET", `/api/activities/${a.id}/versions/diff`, A.token)).status, 404);
    const same = await call("GET", `/api/activities/${a.id}/versions/diff?from=current&to=current`, A.token);
    assert.equal(same.body.changed, 0);
  });
});

describe("שלב 74: ייבוא עם דוח (פריט 16)", () => {
  const draft = (over = {}) => ({ title: "פעולה מיובאת לבדיקה", ageGroup: age("ח'"), leadingValue: "אחריות", equipment: "דפים", safetyNotes: "זהירות", stages: ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((nm) => ({ name: nm, minutes: 10, content: "בשלב הזה כל החניכים עושים משהו משותף וחשוב ומדברים עליו יחד בקבוצה" })), ...over });

  it("טיוטה מלאה מוכנה לפרסום, ופחות כשחסרים דברים", async () => {
    const ok = await call("POST", "/api/activities/import-report", null, draft());
    assert.equal(ok.status, 200);
    assert.equal(ok.body.readiness, 100);
    assert.equal(ok.body.label, "מוכנה לפרסום");
    const ph = "(לא זוהה תוכן לשלב הזה. כדאי להשלים אותו בעריכה)";
    const bad = await call("POST", "/api/activities/import-report", null, draft({ equipment: "", safetyNotes: "", leadingValue: "", ageGroup: "", stages: draft().stages.map((s, i) => (i < 2 ? { ...s, content: ph } : s)) }));
    assert.ok(bad.body.readiness < 60, bad.body.readiness);
    assert.ok(bad.body.issues.filter((i) => i.level === "high").length >= 2);
    assert.ok(bad.body.issues.some((i) => i.id === "equipment"));
    assert.equal(bad.body.label, "דורשת השלמות");
  });

  it("מזהה כפילות ופרטים אישיים בטיוטה", async () => {
    const dup = await call("POST", "/api/activities/import-report", null, draft({ title: tpl.title, leadingValue: tpl.leadingValue, stages: tpl.stages.map((s) => ({ name: s.name, minutes: s.minutes, content: s.content })) }));
    assert.ok(dup.body.issues.some((i) => i.id === "duplicate"));
    assert.ok(dup.body.duplicates.length >= 1);
    const pii = await call("POST", "/api/activities/import-report", null, draft({ equipment: "להתקשר 052-1112233" }));
    assert.ok(pii.body.issues.some((i) => i.id === "privacy"));
  });

  it("קלט שגוי נדחה", async () => {
    assert.equal((await call("POST", "/api/activities/import-report", null, draft({ stages: [] }))).status, 400);
    assert.equal((await call("POST", "/api/activities/import-report", null, draft({ extra: 1 }))).status, 400);
    assert.equal((await call("POST", "/api/activities/import-report", null, draft({ stages: [{ name: "א", minutes: 999, content: "x" }] }))).status, 400);
  });

  it("import-file מחזיר דוח לצד הפעולה שנקראה", async () => {
    const txt = "פעולה מקובץ\nפתיחה 10 דקות\nשואלים שאלה.\nמשחק 15 דקות\nמשחקים.\nמשימה 10 דקות\nעושים.\nדיון 10 דקות\nמדברים.\nסיכום 5 דקות\nמסכמים.";
    const r = await fetch(`${base}/api/activities/import-file?name=${encodeURIComponent("פעולה.txt")}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: Buffer.from(txt, "utf8") });
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
    assert.ok(body.report && typeof body.report.readiness === "number");
    assert.ok(Array.isArray(body.report.issues));
    assert.equal(body.stages.length, 5);
  });
});

describe("שלב 74: כיסוי חגים (פריט 17)", () => {
  it("לכל חג יש ספירה, חג בלי פעולה מסומן כפער, ופעולה עם שם החג סוגרת את הפער", async () => {
    const r = await call("GET", "/api/holidays/coverage?from=2026-12-01&days=60");
    assert.equal(r.status, 200);
    assert.ok(r.body.events.length >= 1);
    assert.ok(r.body.events.every((e) => e.gap === (e.have === 0) && typeof e.inDays === "number"));
    const gap = r.body.events.find((e) => e.gap);
    assert.ok(gap, "יש חג בלי פעולה במאגר הבדיקה");
    make({ title: `פעולה מיוחדת ל${gap.name}` });
    const r2 = await call("GET", "/api/holidays/coverage?from=2026-12-01&days=60");
    const same = r2.body.events.find((e) => e.name === gap.name);
    assert.ok(same.have >= 1 && !same.gap);
    assert.ok(r2.body.gaps < r.body.gaps);
  });

  it("פרמטרים לא תקינים לא שוברים: תאריך מזויף וימים קיצוניים", async () => {
    assert.equal((await call("GET", "/api/holidays/coverage?from=nope&days=99999")).status, 200);
    assert.equal((await call("GET", "/api/holidays/coverage?from=2026-02-31&days=-5")).status, 200);
  });
});

describe("שלב 74: תגיות מוצעות (פריט 10)", () => {
  it("דורש התחברות, מקדים את התגיות שלי, ולא מציע תגית שכבר קיימת", async () => {
    const U = await reg();
    assert.equal((await call("GET", "/api/activities/1/tag-suggestions")).status, 401);
    const a = make({ title: "פעולת חנוכה במדורה", ownerId: U.id });
    const base0 = await call("GET", `/api/activities/${a.id}/tag-suggestions`, U.token);
    assert.equal(base0.status, 200);
    assert.ok(base0.body.some((t) => t.tag === "חנוכה" && t.why === "מהתוכן"));
    assert.equal((await call("PUT", `/api/activities/${a.id}/tags`, U.token, { tags: ["מדורה"] })).status < 300, true);
    const other = make({ title: "ערב מדורה גדול", ownerId: U.id });
    const s2 = await call("GET", `/api/activities/${other.id}/tag-suggestions`, U.token);
    const mine = s2.body.find((t) => t.tag === "מדורה");
    assert.ok(mine && mine.why === "התגית שלך", JSON.stringify(s2.body));
    const s3 = await call("GET", `/api/activities/${a.id}/tag-suggestions`, U.token);
    assert.ok(!s3.body.some((t) => t.tag === "מדורה"), "כבר מתויגת");
    assert.ok(s3.body.length <= 8);
  });
});

describe("שלב 74: מה עבד לי ומגוון (פריטים 4, 12)", () => {
  it("בלי הפעלות אין ציון מגוון, ובלי פעולות אין רשימה", async () => {
    const U = await reg();
    assert.equal((await call("GET", "/api/me/worked")).status, 401);
    assert.equal((await call("GET", "/api/me/diversity")).status, 401);
    const d = await call("GET", "/api/me/diversity", U.token);
    assert.equal(d.status, 200);
    assert.equal(d.body.score, null);
    assert.equal(d.body.level, "none");
    assert.ok(d.body.note.length > 5);
    assert.equal((await call("GET", "/api/me/worked", U.token)).body.items.length, 0);
  });

  it("מדורג לפי מעורבות, מסמן 'כדאי לחזור', ולא חושף הפעלות של אחרים", async () => {
    const U = await reg();
    const V = await reg();
    const today = new Date().toISOString().slice(0, 10);
    const old = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
    const a1 = make({ title: "אהובה" });
    const a2 = make({ title: "פחות אהובה" });
    const run = (aid, tok, ranOn, engagement, worked = "") => call("POST", `/api/activities/${aid}/runs`, tok, { ranOn, groupLabel: "ז1", worked, changeNext: "", notes: "", engagement, timing: "ok" });
    assert.equal((await run(a1.id, U.token, old, 3, "הילדים התלהבו")).status < 300, true);
    assert.equal((await run(a1.id, U.token, old, 3)).status < 300, true);
    assert.equal((await run(a2.id, U.token, today, 1)).status < 300, true);
    assert.equal((await run(a2.id, V.token, today, 3)).status < 300, true);
    const w = await call("GET", "/api/me/worked", U.token);
    assert.equal(w.body.items[0].id, a1.id);
    assert.equal(w.body.items[0].repeatable, true);
    assert.equal(w.body.items[0].note, "הילדים התלהבו");
    assert.equal(w.body.items[0].runs, 2);
    assert.equal(w.body.items[1].id, a2.id);
    assert.equal(w.body.items[1].repeatable, false);
    assert.equal(w.body.items[1].avgEngagement, 1, "לא מתערבב עם ההפעלה של משתמש אחר");
    assert.equal(w.body.total, 2);
  });

  it("מגוון: ארבע פעולות מאותו סוג נותנות אזהרה וציון נמוך, ותקופה קיצונית נחתכת", async () => {
    const U = await reg();
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < 5; i++) {
      const a = make({ kind: "game", title: `משחק ${i}`, leadingValue: "רעות", methods: [{ name: "משחק תחרות", minutes: 20 }] });
      await call("POST", `/api/activities/${a.id}/runs`, U.token, { ranOn: today, groupLabel: "", worked: "", changeNext: "", notes: "", engagement: 2, timing: "ok" });
    }
    const d = await call("GET", "/api/me/diversity?days=99999", U.token);
    assert.equal(d.body.days, 365);
    assert.equal(d.body.source, "runs");
    assert.equal(d.body.count, 5);
    assert.ok(d.body.score !== null && d.body.score < 45, `score ${d.body.score}`);
    assert.equal(d.body.level, "low");
    assert.ok(d.body.flags.length >= 2, JSON.stringify(d.body.flags));
    assert.ok(d.body.missingKinds.length > 0);
    assert.equal((await call("GET", "/api/me/diversity?days=1", U.token)).body.days, 14);
  });
});

describe("שלב 74: חיפושים שמורים בחשבון (פריט 11)", () => {
  it("נרמול: מסננים תקינים בלבד, בלי עמוד ומזהים, ריק נדחה", () => {
    assert.equal(normalizeSavedQuery(""), null);
    assert.equal(normalizeSavedQuery("page=2&pageSize=10"), null);
    assert.equal(normalizeSavedQuery("sort=bogus"), null);
    assert.equal(normalizeSavedQuery("method=לא-קיים"), null);
    const r = normalizeSavedQuery("?q=משחק&page=3&ids=1,2&since=2020-01-01&junk=1&access=quiet");
    assert.equal(r.qs, "q=%D7%9E%D7%A9%D7%97%D7%A7&access=quiet");
    assert.equal(r.filters.q, "משחק");
  });

  it("יצירה, כפילות, מגבלה של 20, רענון 'חדש מאז' ומחיקה", async () => {
    const U = await reg();
    assert.equal((await call("GET", "/api/me/saved-searches")).status, 401);
    const c = await call("POST", "/api/me/saved-searches", U.token, { name: "משחקים שקטים", qs: "?q=ייחודיתלבדיקה74&page=2" });
    assert.equal(c.status, 201);
    assert.equal(c.body.fresh, 0);
    const again = await call("POST", "/api/me/saved-searches", U.token, { name: "שם אחר", qs: "q=ייחודיתלבדיקה74" });
    assert.equal(again.status, 200);
    assert.equal(again.body.id, c.body.id);
    assert.equal((await call("GET", "/api/me/saved-searches", U.token)).body.length, 1);
    await new Promise((r) => setTimeout(r, 15));
    make({ title: "ייחודיתלבדיקה74 חדשה" });
    const list = (await call("GET", "/api/me/saved-searches", U.token)).body;
    assert.equal(list[0].fresh, 1);
    assert.equal((await call("POST", `/api/me/saved-searches/${c.body.id}/seen`, U.token)).status, 200);
    assert.equal((await call("GET", "/api/me/saved-searches", U.token)).body[0].fresh, 0);
    for (let i = 1; i < 20; i++) assert.equal((await call("POST", "/api/me/saved-searches", U.token, { name: `ח${i}`, qs: `q=נושא${i}` })).status, 201);
    const over = await call("POST", "/api/me/saved-searches", U.token, { name: "עודף", qs: "q=עודף" });
    assert.equal(over.status, 409);
    assert.equal((await call("DELETE", `/api/me/saved-searches/${c.body.id}`, U.token)).status, 200);
    assert.equal((await call("DELETE", `/api/me/saved-searches/${c.body.id}`, U.token)).status, 404);
  });

  it("בידוד בין משתמשים: ב' לא רואה, לא מסמן ולא מוחק של א'", async () => {
    const A = await reg();
    const B = await reg();
    const c = await call("POST", "/api/me/saved-searches", A.token, { name: "של א", qs: "q=פרטי" });
    assert.equal((await call("GET", "/api/me/saved-searches", B.token)).body.length, 0);
    assert.equal((await call("POST", `/api/me/saved-searches/${c.body.id}/seen`, B.token)).status, 404);
    assert.equal((await call("DELETE", `/api/me/saved-searches/${c.body.id}`, B.token)).status, 404);
    assert.equal((await call("GET", "/api/me/saved-searches", A.token)).body.length, 1);
    const same = await call("POST", "/api/me/saved-searches", B.token, { name: "אותו חיפוש", qs: "q=פרטי" });
    assert.equal(same.status, 201, "אותו חיפוש אצל משתמש אחר הוא רשומה נפרדת");
    assert.notEqual(same.body.id, c.body.id);
  });

  it("קלט שגוי: שם ריק או ארוך, qs ענק, שדה זר, חיפוש בלי מסננים, הזרקה", async () => {
    const U = await reg();
    for (const b of [{ name: "", qs: "q=a" }, { name: "x".repeat(41), qs: "q=a" }, { name: "ok", qs: "q=" + "a".repeat(600) }, { name: "ok", qs: "q=a", userId: 1 }, { name: "ok", qs: "page=2" }, { name: "ok", qs: "q=a'; DROP TABLE saved_searches;--&sort=new" }, { name: "ok", qs: "sort=x" }]) {
      const r = await call("POST", "/api/me/saved-searches", U.token, b);
      assert.ok(r.status === 400 || (r.status === 201 && b.qs.includes("DROP")), `${JSON.stringify(b).slice(0, 60)} => ${r.status}`);
    }
    assert.ok(db.prepare("SELECT COUNT(*) AS c FROM saved_searches").get().c >= 0);
  });

  it("ייבוא מהדפדפן: עד 8, בלי כפילויות ובלי לחרוג מהמגבלה", async () => {
    const U = await reg();
    const items = Array.from({ length: 5 }, (_, i) => ({ name: `מקומי ${i}`, qs: `q=מקומי${i}` }));
    const r = await call("POST", "/api/me/saved-searches/import", U.token, { items: [...items, { name: "כפול", qs: "q=מקומי0" }, { name: "ריק", qs: "" }] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { added: 5, skipped: 2 });
    assert.equal((await call("POST", "/api/me/saved-searches/import", U.token, { items: Array.from({ length: 9 }, (_, i) => ({ name: "x", qs: `q=x${i}` })) })).status, 400);
  });
});

describe("שלב 74: ממוצע הספרייה ושימוש בנתיבים (פריט 1)", () => {
  it("quality-report מחזיר ממוצע ספרייה כשיש לפחות חמש פעולות", async () => {
    const r = await call("GET", "/api/activities/1/quality-report");
    assert.ok(db.prepare("SELECT COUNT(*) AS c FROM activities WHERE status='PUBLISHED'").get().c >= 5);
    assert.equal(typeof r.body.libraryAverage, "number");
    assert.ok(r.body.libraryAverage >= 0 && r.body.libraryAverage <= 100);
  });
});

describe("שלב 74: ציר זמן (פריט 8), בקובץ הלקוח", () => {
  const five = (m) => ["פתיחה", "משחק", "משימה", "דיון", "סיכום"].map((name, i) => ({ name, minutes: m[i] }));

  it("חלוקה מאוזנת: בלי הערות, והשלבים מסווגים לפתיחה, גוף וסיום", () => {
    const r = T.timelineCheck(five([5, 15, 15, 10, 5]), 50);
    assert.equal(r.status, "ok");
    assert.equal(r.warnings.length, 0);
    assert.deepEqual(r.segments.map((s) => s.phase), ["opening", "body", "body", "body", "closing"]);
    assert.equal(r.total, 50);
    assert.equal(r.segments[1].pct, 30);
  });

  it("הפעולה מהמאגר עומדת בבדיקה", () => {
    const r = T.timelineCheck(tpl.stages, tpl.durationMin);
    assert.equal(r.status, "ok", JSON.stringify(r.warnings));
  });

  it("סכום שונה מהמשך: סטייה קטנה מותרת, גדולה מתריעה, וגדולה מאוד היא 'חשוב'", () => {
    assert.equal(T.timelineCheck(five([5, 15, 15, 10, 7]), 50).status, "ok", "סטייה של 2 דקות מותרת");
    const small = T.timelineCheck(five([5, 15, 15, 10, 9]), 50);
    assert.equal(small.status, "long");
    assert.equal(small.warnings[0].level, "medium");
    assert.match(small.warnings[0].text, /גדול ב-4 דקות/);
    const edge = T.timelineCheck(five([5, 10, 10, 10, 5]), 50);
    assert.equal(edge.status, "short");
    assert.equal(edge.warnings[0].level, "medium", "10 דקות בדיוק עדיין לא 'חשוב'");
    assert.match(edge.warnings[0].text, /קטן ב-10 דקות/);
    const mid = T.timelineCheck(five([5, 10, 10, 5, 5]), 50);
    assert.equal(mid.warnings[0].level, "high");
    assert.match(mid.warnings[0].text, /קטן ב-15 דקות/);
    assert.equal(T.timelineTolerance(50), 3);
    assert.equal(T.timelineTolerance(10), 2);
  });

  it("שלב בלי דקות, שלב שולט, פתיחה ארוכה וסיום קצר מקבלים הערות", () => {
    const ids = (r) => r.warnings.map((w) => w.id);
    assert.ok(ids(T.timelineCheck(five([5, 0, 20, 20, 5]), 50)).includes("zero-1"));
    assert.ok(ids(T.timelineCheck(five([2, 35, 5, 5, 3]), 50)).includes("dominant"));
    assert.ok(ids(T.timelineCheck(five([20, 10, 10, 5, 5]), 50)).includes("long-opening"));
    assert.ok(ids(T.timelineCheck(five([5, 15, 15, 13, 2]), 50)).includes("short-closing"));
    assert.ok(!ids(T.timelineCheck(five([2, 3, 3, 2, 1]), 11)).includes("short-closing"), "פעולה קצרה מ-30 דקות לא נבדקת על סיום");
  });

  it("קלט חריג לא שובר: ריק, שלב יחיד, מספרים שליליים ולא מספריים, בלי משך מתוכנן", () => {
    assert.equal(T.timelineCheck([], 30).status, "empty");
    assert.equal(T.timelineCheck([{ name: "א", minutes: 0 }], 30).status, "empty");
    const one = T.timelineCheck([{ name: "הכול", minutes: 30 }], 30);
    assert.equal(one.segments[0].phase, "body");
    assert.equal(one.warnings.length, 0);
    const weird = T.timelineCheck([{ name: "א", minutes: -5 }, { name: "ב", minutes: Number.NaN }, { name: "ג", minutes: 20 }], 20);
    assert.equal(weird.total, 20);
    assert.ok(weird.segments.every((s) => s.minutes >= 0 && Number.isFinite(s.pct)));
    const noPlan = T.timelineCheck(five([5, 15, 15, 10, 5]), 0);
    assert.equal(noPlan.status, "ok", "בלי משך מתוכנן אין מה להשוות לו");
    assert.equal(T.timelineCheck(null, undefined).status, "empty");
  });

  it("הקבועים בלקוח זהים לשרת: תגיות נגישות וזוגות סותרים", () => {
    assert.deepEqual(T.ACCESS_FILTERS.map((x) => x.id), X.ACCESS_IDS);
    assert.deepEqual(T.CONDITION_CONFLICTS, L.CONTRADICTIONS);
    assert.equal(T.MAX_CONDITIONS, 3);
  });
});

describe("שלב 74: מכסת היצירה של אורחים חלה גם על הנתיבים החדשים", () => {
  before(() => {
    process.env.DAILY_CAPS = "1"; // המכסה היומית כבויה בבדיקות אלא אם מבקשים במפורש
  });
  after(() => {
    delete process.env.DAILY_CAPS;
  });

  it("adapt-multi ו-for-group נספרים במכסה לכתובת (כמו adapt), ואחרי שנגמרה המכסה מקבלים 429", async () => {
    const out = [];
    for (let i = 0; i < 50; i++) out.push((await call("POST", "/api/activities/1/adapt-multi", null, { conditions: ["rain"] })).status);
    const firstBlock = out.indexOf(429);
    assert.ok(firstBlock > 0, `adapt-multi לא נחסם: ${out.join(",")}`);
    assert.ok(out.slice(0, firstBlock).every((s) => s === 201), "לפני החסימה הכול עובר");
    assert.ok(out.slice(firstBlock).every((s) => s === 429), "אחרי החסימה הכול חסום");
    // המכסה משותפת לכל נתיבי היצירה, ולכן אצל אורח שנחסם גם for-group חסום
    assert.equal((await call("POST", "/api/activities/1/for-group", null, { ageGroup: age("ד'") })).status, 429);
    assert.equal((await call("POST", "/api/activities/1/adapt", null, { condition: "rain" })).status, 429, "כמו adapt הקיים");
  });

  it("מחובר לא נחסם במכסת האורחים", async () => {
    const U = await reg();
    for (let i = 0; i < 5; i++) assert.equal((await call("POST", "/api/activities/1/adapt-multi", U.token, { conditions: ["rain"] })).status, 201);
    assert.equal((await call("POST", "/api/activities/1/for-group", U.token, { ageGroup: age("ד'") })).status, 201);
  });
});
