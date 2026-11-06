// שלב 57: בדיקות יחידה למנוע עוזר השיחות (פענוח, הסתרה, ניתוח, בטיחות, תגובות)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterRange, maskMessages, parseChat, scrubPII } from "../src/chat-parse.js";
import { analyzeChat, classifyIntent, fading, faqBuckets, heat, nextSteps, openQuestions, rhythm, safetyScan, toneOf } from "../src/chat-analyze.js";
import { buildAnnouncement, checkReply, groupMessages, inflect, outreachStarters, replySuggestions } from "../src/chat-reply.js";

const ANDROID = `‎12.10.2026, 18:02 - ההודעות והשיחות מוצפנות מקצה לקצה.
12.10.2026, 18:05 - דביר צופים: היי דני, מחר פעולה ב-17:00 בחורשה
12.10.2026, 18:20 - דני כהן: היי דביר, אפשר להגיע באיחור? יש לי חוג עד 17:30
12.10.2026, 18:21 - דני כהן: ואיפה בדיוק בחורשה?
13.10.2026, 09:10 - דביר צופים: בטח דני, תגיע כשאפשר. הטלפון שלי 052-1234567
13.10.2026, 22:40 - דני כהן: <מדיה לא נכללה>
14.10.2026, 20:00 - דני כהן: אני לא רוצה לבוא יותר, משעמם לי
ועוד שורה`;

const T = (d, h = 12, mi = 0) => Date.UTC(2026, 9, d, h, mi);
const M = (who, text, ts = null, kind = "text") => ({ who, text, ts, kind });

describe("שלב 57: פענוח שיחה (470–474)", () => {
  it("ייצוא אנדרואיד: הודעות, הודעות מערכת, שורות המשך, מדיה", () => {
    const p = parseChat(ANDROID);
    assert.equal(p.format, "android");
    assert.equal(p.systemCount, 1);
    assert.equal(p.messages.length, 6);
    assert.equal(p.messages[4].kind, "media");
    assert.match(p.messages[5].text, /משעמם לי\nועוד שורה/);
    assert.deepEqual(p.participants.map((x) => [x.name, x.count]), [["דני כהן", 4], ["דביר צופים", 2]]);
    assert.equal(p.from, "2026-10-12T18:05");
    assert.equal(p.to, "2026-10-14T20:00");
  });

  it("ייצוא אייפון עם סימני כיוון נסתרים", () => {
    const p = parseChat("[12/10/2026, 18:05:11] דביר: שלום לכולם\n[12/10/2026, 18:20:03] ‎‏נועה: ‏מתי מתחילים?\n");
    assert.equal(p.format, "ios");
    assert.equal(p.messages.length, 2);
    assert.equal(p.messages[1].who, "נועה");
    assert.equal(p.messages[1].text, "מתי מתחילים?");
  });

  it("סדר יום וחודש מזוהה לפי המספרים, ושעון 12 שעות", () => {
    const dm = parseChat("13/10/2026, 18:05 - א: ב\n14/10/2026, 18:06 - א: ג");
    assert.equal(dm.from, "2026-10-13T18:05");
    const md = parseChat("10/13/2026, 6:05 PM - א: ב\n10/14/2026, 6:06 AM - א: ג");
    assert.equal(md.from, "2026-10-13T18:05");
    assert.equal(md.to, "2026-10-14T06:06");
  });

  it("הדבקה פשוטה והודעה בודדת", () => {
    assert.equal(parseChat("דני: היי\nמיכל: שלום").format, "plain");
    const one = parseChat("מתי הפעולה מחר?");
    assert.equal(one.format, "single");
    assert.equal(one.messages.length, 1);
    assert.ok(one.warnings.some((w) => /תאריכים/.test(w)));
    assert.equal(parseChat("").messages.length, 0);
  });

  it("קיצוץ לשיחה ארוכה ופילטר טווח", () => {
    const lines = Array.from({ length: 6100 }, (_, i) => `12.10.2026, 18:${String(i % 60).padStart(2, "0")} - א: הודעה ${i}`).join("\n");
    const p = parseChat(lines);
    assert.equal(p.messages.length, 6000);
    assert.equal(p.truncated, true);
    const msgs = [M("א", "x", T(1)), M("א", "y", T(20)), M("א", "z", T(21))];
    assert.equal(filterRange(msgs, { lastDays: 3 }).length, 2);
    assert.equal(filterRange(msgs, { lastN: 1 }).length, 1);
  });
});

describe("שלב 57: הסתרת פרטים (472)", () => {
  it("שמות הופכים לכינויים, כולל תחיליות, והמדריך הופך ל'אני'", () => {
    const p = parseChat(ANDROID);
    const m = maskMessages(p.messages, { me: "דביר צופים" });
    assert.equal(m.meAlias, "אני");
    assert.equal(m.messages[0].who, "אני");
    assert.equal(m.messages[1].who, "חניך א'");
    assert.match(m.messages[0].text, /היי חניך א'/);
    assert.match(m.messages[1].text, /היי המדריך/);
    assert.ok(!m.messages.some((x) => /דני|דביר/.test(x.text)));
    assert.match(m.messages[3].text, /\[טלפון\]/);
    assert.equal(m.scrubbed.phone, 1);
    const pref = maskMessages([M("דני כהן", "מדני לדני וגם דני!"), M("אורי", "שלום")], { me: "אורי" });
    assert.equal(pref.messages[0].text, "מחניך א' לחניך א' וגם חניך א'!");
  });

  it("פרטים מזהים: טלפון, מייל, ת\"ז, קישור, כתובת, משתמש", () => {
    const s = scrubPII("התקשר 052-123-4567 או +972 54 765 4321, a.b@x.co.il, 123456789, https://x.com/y, רחוב הרצל 12, @dani_99");
    assert.equal(s.text, "התקשר [טלפון] או [טלפון], [מייל], [מספר], [קישור], [כתובת], [משתמש]");
  });

  it("שמות נוספים שהוזכרו, ושיחה שכבר הוסתרה לא משתנה", () => {
    const m = maskMessages([M("א", "דיברתי עם נועם והוא כועס")], { me: "", extra: ["נועם"] });
    assert.match(m.messages[0].text, /\[שם\]/);
    const again = maskMessages([M("אני", "היי חניך א'", null), M("חניך א'", "שלום")], { already: true });
    assert.equal(again.meAlias, "אני");
    assert.equal(again.messages[1].who, "חניך א'");
  });
});

describe("שלב 57: כוונה ומצב רוח (475–477)", () => {
  it("מזהה שאלה, היעדרות, בקשת רשות, תודה, שיתוף רגשי וריב", () => {
    assert.deepEqual(classifyIntent("אפשר להגיע באיחור? יש לי חוג").all.slice(0, 3), ["absence", "permission", "question"]);
    assert.equal(classifyIntent("איפה נפגשים מחר").primary, "question");
    assert.equal(classifyIntent("תודה רבה היה מדהים").primary, "thanks");
    assert.equal(classifyIntent("קשה לי בזמן האחרון ואני מרגיש לבד").primary, "emotional");
    assert.equal(classifyIntent("הם מציקים לי ורבנו אתמול").primary, "conflict");
    assert.equal(classifyIntent("אוקיי").primary, "ack");
    assert.equal(classifyIntent("חחחחח").primary, "joke");
    assert.equal(classifyIntent("משעמם לי בפעולות").primary, "complaint");
    assert.equal(classifyIntent("אני אבוא לבד").primary, "general", "'לבד' לבדו אינו שיתוף רגשי");
  });

  it("מצב רוח: מילים ואימוג'ים, עם אמינות נמוכה כשיש מעט ראיות", () => {
    const t = toneOf([M("ח", "משעמם לי 😴"), M("ח", "אני כועס כל כך")]);
    assert.ok(t.top.some((x) => x.id === "bored"));
    assert.ok(t.top.some((x) => x.id === "anger"));
    assert.match(t.note, /לא מבין עקיצה/);
    assert.equal(toneOf([M("ח", "שלום")]).top.length, 0);
  });
});

describe("שלב 57: בטיחות (479)", () => {
  it("משפט מצוקה חמור נתפס, גם עם תחילית, ומופיעות המלצות וקווי סיוע", () => {
    for (const t of ["אני רוצה למות", "ואני לא רוצה לחיות יותר", "הוא נגע בי ואמר שזה סוד בינינו", "אברח מהבית היום", "אני אהרוג אותו"]) {
      const s = safetyScan([M("חניך א'", t)]);
      assert.equal(s.level, "urgent", t);
      assert.ok(s.advice.do.some((x) => /אל תבטיחו סודיות/.test(x)));
      assert.ok(s.advice.safeReplies.length >= 2);
      assert.deepEqual(s.hotlines.map((h) => h.number), ["1201", "118", "105", "100", "101"]);
    }
  });

  it("סימנים בינוניים הם 'שימו לב' ולא אדום", () => {
    assert.equal(safetyScan([M("ח", "אני לא רוצה לבוא כי אין לי חברים")]).level, "attention");
    assert.equal(safetyScan([M("ח", "מציקים לי בכיתה")]).cats[0], "bullying");
  });

  it("הודעה תמימה, והודעות של המדריך עצמו, לא מדליקות", () => {
    assert.equal(safetyScan([M("חניך א'", "אפשר להביא סכין לפעולה בטבע?")]).level, "none");
    assert.equal(safetyScan([M("אני", "אל תחשוב שאתה רוצה למות מרוב עבודה")]).level, "none");
    assert.equal(safetyScan([M("חניך א'", "היה כיף בפעולה", null, "media")]).level, "none");
  });

  it("סדר הצעדים: דחוף ראשון", () => {
    const a = analyzeChat([M("אני", "היי", T(1)), M("חניך א'", "אני רוצה למות", T(2))], {});
    assert.equal(a.safety.level, "urgent");
    assert.equal(a.plan[0].level, "urgent");
    assert.match(a.plan[0].text, /רכז\/ת השבט/);
  });
});

describe("שלב 57: קצב, התרחקות ושכבה (478, 485–491)", () => {
  it("זמן תגובה, הודעות שלא נענו והודעה ממתינה", () => {
    const msgs = [M("אני", "היי", T(1, 9)), M("חניך א'", "מתי הפעולה?", T(1, 10)), M("אני", "ב-17:00", T(1, 12)), M("חניך א'", "אפשר להגיע באיחור?", T(3, 10)), M("חניך א'", "ואיפה?", T(3, 11))];
    const r = rhythm(msgs);
    assert.equal(r.myMedianMinutes, 120);
    assert.equal(r.unanswered.length, 1);
    assert.equal(r.unanswered[0].answered, false);
    const a = analyzeChat(msgs, {});
    assert.equal(a.pending.count, 2);
    assert.ok(a.pending.intent.all.includes("question"));
    assert.equal(a.pending.waitedHours, 1);
    assert.equal(a.mode, "one");
  });

  it("ללא מדריך בשיחה ארוכה: מבקשים לבחור מי אתם, ולא מניחים שכולן ממתינות", () => {
    const msgs = Array.from({ length: 8 }, (_, i) => M(i % 2 ? "חניך א'" : "חניך ב'", "הודעה", T(1 + i)));
    const a = analyzeChat(msgs, {});
    assert.equal(a.needMe, true);
    assert.equal(a.pending, null);
  });

  it("התרחקות: חניך ששתק ב-14 הימים האחרונים", () => {
    const msgs = [];
    for (let d = 1; d <= 10; d++) msgs.push(M("חניך א'", "הודעה " + d, T(d)));
    for (let d = 1; d <= 28; d++) msgs.push(M("חניך ב'", "עוד " + d, T(d)));
    msgs.push(M("אני", "סיכום", T(28)));
    const f = fading(msgs.sort((a, b) => a.ts - b.ts), {});
    assert.ok(f.find((x) => x.who === "חניך א'" && x.kind === "silent"));
    assert.ok(!f.find((x) => x.who === "חניך ב'"));
  });

  it("קבוצה: שאלות פתוחות, שאלות נפוצות, חום ושימוש בכינויים", () => {
    const msgs = [
      M("חניך א'", "מתי מתחילים מחר?", T(1, 10)), M("חניך ב'", "באיזו שעה זה?", T(1, 10, 5)), M("חניך ג'", "איפה נפגשים?", T(1, 10, 9)),
      M("חניך א'", "אתה מטומטם", T(1, 11)), M("חניך ב'", "שתוק יא זבל", T(1, 11, 1)), M("חניך ג'", "תעזוב את הקבוצה", T(1, 11, 2)),
      M("אני", "ב-17:00 בחורשה", T(2, 9)),
    ];
    const a = analyzeChat(msgs, {});
    assert.equal(a.mode, "group");
    assert.equal(a.counts.speakers, 3);
    assert.ok(a.faq.find((f) => f.id === "when" && f.count === 2));
    assert.equal(a.heat.level, "medium");
    assert.ok(a.heat.events.length >= 3);
    assert.ok(a.plan.some((p) => /כללי שיח/.test(p.text)));
    assert.equal(openQuestions(msgs.slice(0, 6), {}).length, 3);
    assert.equal(openQuestions(msgs, {}).length, 0, "אחרי שהמדריך ענה בתוך יומיים אין שאלות פתוחות");
    assert.equal(heat([M("א", "יום טוב", T(1))]).level, "none");
    assert.deepEqual(faqBuckets([M("א", "מתי?", T(1))], {}), []);
  });

  it("הודעה אחרונה שלי: ממתינים לתשובה", () => {
    const a = analyzeChat([M("חניך א'", "שלום", T(1)), M("אני", "מה שלומך?", T(2))], {});
    assert.equal(a.pending, null);
    assert.ok(a.waitingForThem);
    assert.ok(nextSteps(a).some((s) => /ממתינים/.test(s.why)));
  });
});

describe("שלב 57: ניסוח ובדיקת תגובה (481–484, 489, 490, 494)", () => {
  it("לשון זכר ונקבה וברירת מחדל ניטרלית", () => {
    assert.equal(inflect("<k:בוא|בואי> <g:שמח|שמחה> <k:אתה|את>", {}), "בוא/י שמח/ה את/ה");
    assert.equal(inflect("<k:בוא|בואי> <g:שמח|שמחה>", { kid: "f", guide: "m" }), "בואי שמח");
  });

  it("תגובות מוצעות מכבדות את המילון, מסמנות מקומות להשלמה ומוסיפות מה לא לומר", () => {
    const s = replySuggestions({ intent: "question", name: "דני", kid: "m", voice: { say: [], never: ["שאלה טובה"] } });
    assert.equal(s.intent, "question");
    assert.ok(s.variants.length >= 3);
    assert.deepEqual(s.variants[0].slots, ["[התשובה שלך]"]);
    assert.ok(s.variants[0].neverHits.length);
    assert.match(s.variants[0].text, /היי דני/);
    const e = replySuggestions({ intent: "emotional" });
    assert.ok(e.tip && /טלפון/.test(e.tip));
    assert.ok(e.avoid.some((x) => /לא "אל תדאג"/.test(x)));
    assert.equal(replySuggestions({ intent: "לא קיים" }).intent, "general");
    assert.ok(replySuggestions({ intent: "absence", text: "אני חולה" }).variants.some((x) => x.id === "sick"));
    assert.ok(replySuggestions({ intent: "absence", text: "אני מאחר" }).variants.some((x) => x.id === "late"));
  });

  it("בדיקת תגובה: הבטחת סודיות ופגישה לבד הן אדומות", () => {
    const r = checkReply("זה יישאר בינינו. ניפגש לבד אחרי הפעולה.");
    assert.equal(r.ok, false);
    assert.deepEqual(r.items.filter((i) => i.level === "red").map((i) => i.code).sort(), ["alone", "secrecy"]);
  });

  it("בדיקת תגובה: הקטנה, האשמה, אבל, שעה מאוחרת, והודעה טובה", () => {
    const r = checkReply("אל תדאג! זה לא נורא!!! תודה, אבל אתה תמיד מאחר", { hour: 23 });
    const codes = r.items.map((i) => i.code);
    for (const c of ["minimize", "blame", "but", "excl", "late"]) assert.ok(codes.includes(c), c);
    const good = checkReply("שמעתי אותך, נשמע שזה לא היה נעים. רוצה לספר לי יותר?", { intent: "emotional" });
    assert.equal(good.ok, true);
    assert.equal(checkReply("").ok, false);
  });

  it("בדיקת תגובה בקבוצה: נושא אישי אדום, ותיקון חניך מול כולם", () => {
    assert.ok(checkReply("הציונים שלך בבית הספר ירדו", { where: "group" }).items.some((i) => i.code === "public-private"));
    assert.ok(checkReply("חניך א' שוב אתה מפריע", { where: "group" }).items.some((i) => i.code === "shaming"));
    assert.ok(!checkReply("מחר ב-17:00 בחורשה", { where: "group" }).items.some((i) => i.level !== "ok" && i.level !== "tip"));
  });

  it("הודעת שכבה: מזהה מה חסר ומייצרת ארבע גרסאות", () => {
    const a = buildAnnouncement({ title: "פעולה", date: "יום ה'", time: "17:00", place: "החורשה", bring: "מים, חולצה" });
    assert.deepEqual(a.missing, ["שעת סיום או איסוף", "למי פונים עם שאלות"]);
    assert.equal(a.variants.length, 4);
    assert.match(a.variants[0].text, /^\*פעולה\*\n📅 יום ה', 17:00/);
    assert.ok(!buildAnnouncement({ title: "x", emoji: false }).variants[0].text.includes("📍"));
    assert.ok(buildAnnouncement({}).missing.length >= 6);
    assert.ok(groupMessages().find((g) => g.id === "cooldown"));
    const o = outreachStarters("absent", { name: "דני" });
    assert.match(o.variants[0].text, /^היי דני/);
    assert.equal(outreachStarters("???").reason, "???");
    assert.ok(o.reasons.length >= 5);
  });
});
