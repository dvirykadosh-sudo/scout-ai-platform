// בדיקות לתוסף: הסתרת פרטים, סדר תאריכים, והתאמה להסתרה בשרת
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepare, prepareText, resolveTimes, scrubPII } from "../lib/mask.js";
import { maskMessages } from "../../backend/src/chat-parse.js";

const row = (who, text, mine = false, a = 12, b = 10, h = 18, mi = 5) => ({ who, mine, a, b, y: 2026, h, mi, ap: "", text });

describe("תוסף: הסתרה במחשב", () => {
  it("שמות הופכים לכינויים כולל תחיליות, והמדריך ל'המדריך'", () => {
    const p = prepare([row("דביר צופים", "היי דני, מחר ב-17:00", true), row("דני כהן", "היי דביר, אפשר לבוא מדני?"), row("נועה", "דני שלום")]);
    assert.equal(p.messages[0].who, "אני");
    assert.equal(p.messages[0].text, "היי חניך א', מחר ב-17:00");
    assert.equal(p.messages[1].text, "היי המדריך, אפשר לבוא מחניך א'?");
    assert.deepEqual(p.aliasMap, { "חניך א'": "דני כהן", "חניך ב'": "נועה" });
    assert.ok(!JSON.stringify(p.messages).match(/דני|דביר|נועה/));
  });
  it("פרטים מזהים נמחקים", () => {
    assert.equal(scrubPII("052-123-4567, a@b.co, https://x.y/z, רחוב הרצל 5, @dani_1"), "[טלפון], [מייל], [קישור], [כתובת], [משתמש]");
    assert.equal(prepareText("התקשר 0521234567 לנועם", { extra: ["נועם"] }).messages[0].text, "התקשר [טלפון] ל[שם]");
  });
  it("סדר תאריכים: יום/חודש כברירת מחדל, חודש/יום כשצריך, 12 שעות", () => {
    assert.equal(new Date(resolveTimes([row("א", "x", false, 13, 10)])[0]).toISOString().slice(0, 10), "2026-10-13");
    assert.equal(new Date(resolveTimes([row("א", "x", false, 10, 13)])[0]).toISOString().slice(0, 10), "2026-10-13");
    assert.equal(new Date(resolveTimes([{ ...row("א", "x"), h: 6, ap: "PM" }])[0]).getUTCHours(), 18);
  });
  it("אותה תוצאה כמו ההסתרה בשרת", () => {
    const rows = [row("דביר צופים", "היי דני, התקשר 052-1234567", true), row("דני כהן", "היי דביר, מדני לדני!")];
    const ext = prepare(rows).messages.map((m) => m.text);
    const srv = maskMessages(rows.map((r) => ({ who: r.who, ts: null, text: r.text, kind: "text" })), { me: "דביר צופים" }).messages.map((m) => m.text);
    assert.deepEqual(ext, srv);
  });
});
