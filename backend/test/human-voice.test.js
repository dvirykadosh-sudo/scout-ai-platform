// שלב 56: בדיקות יחידה למנוע הקול האנושי ולבניית הסיפור (בלי שרת).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanDict, cleanTranscript, detailGaps, dictCheck, findCliches, fixCliches, humanScore, readAloudCheck, shiftRegister, splitSentences, stageDirections, wordDiff } from "../src/human-voice.js";
import { MOMENTS, ageVersions, aiPrompt, allMoments, buildStory, closings, inventionCheck, maskNames, momentsFor, openings, privacyScan, valueFor } from "../src/story-build.js";
import { VALUES } from "../src/content.js";

const PERSONAL = `היה לי בן 14 והמדריך שלי, ירון, ביקש ממני לקחת את הקבוצה בטיול ללילה בחורשה. אני זוכר את הריח של העשן מהמדורה ואת הקור בידיים. ואז, באמצע הלילה, אחד החניכים לחש לי: "אני רוצה הביתה". הלב שלי דפק. לא ידעתי מה להגיד. התביישתי שאני לא יודע. ישבתי לידו ושתקתי חמש דקות. בסוף הוא אמר: "תודה שנשארת". מאז אני יודע שלפעמים הדבר הכי טוב שאפשר לעשות זה פשוט להישאר.`;
const GENERIC = `חשוב לציין שאחריות היא ערך חשוב מאוד בעולם של היום. בסופו של דבר, כל אחד מאיתנו צריך ללמוד לקחת אחריות, להיות הגון ולעזור לאחרים. זהו מסע מרתק שמלמד אותנו משמעות ועומק. לא רק שהוא חשוב, אלא גם מעצים. ללא ספק זו חוויה בלתי נשכחת! על מנת להצליח, יש לזכור שהתהליך משמעותי מאוד לכולנו!`;

describe("455 ניקוי תמלול", () => {
  const raw = "אממ אז ככה אני אני הלכתי לטיול כאילו עם החבר'ה ואז פתאום התחיל גשם ממש חזק ואז כאילו כולם רצו לאוהלים אה ואז אחד החניכים התחיל לבכות אחרי זה הוא אמר לי שהוא רוצה הביתה";
  it("מסיר גמגום ומילות מילוי ומוסיף פיסוק", () => {
    const r = cleanTranscript(raw);
    assert.ok(!/אממ|(?<![א-ת])אה(?![א-ת])/.test(r.text));
    assert.ok(!/אני אני/.test(r.text));
    assert.ok(r.removed >= 4);
    assert.ok((r.text.match(/[.?]/g) || []).length >= 2, "נוספו נקודות");
    assert.ok(!/ואז\. פתאום/.test(r.text), "ואז פתאום נשארים יחד");
    assert.ok(r.after < r.before);
  });
  it("לא נוגע בהדגשה מכוונת ובטקסט מפוסק", () => {
    const t = "זה היה מאוד מאוד קשה. לא לא, אני לא מוותר.";
    assert.equal(cleanTranscript(t).text, t);
  });
  it("שאלה מקבלת סימן שאלה", () => {
    assert.match(cleanTranscript("איך אתם חושבים שהרגשתי באותו רגע כשכולם הסתכלו עליי ולא אמרו כלום").text, /\?$/);
  });
});

describe("456 דיבורי / רשמי", () => {
  it("מדבר: מחליף ניסוח רשמי ומצמיד כש/ש", () => {
    const r = shiftRegister("אולם לאחר מכן ישנם אנשים אשר הלכו, כאשר הגענו, מבלי לדעת. על כן החלטנו ללכת.", 2);
    assert.equal(r.text, "אבל אחר כך יש אנשים שהלכו, כשהגענו, בלי לדעת. אז החלטנו ללכת.");
    assert.ok(r.changes.length >= 5);
  });
  it("רשמי: לא פוגע במילים שמתחילות באותיות דומות", () => {
    const r = shiftRegister("אבל אחרי שהגענו, לפעמים היה ממש קשה. כשרון הוא לא הכול.", 0);
    assert.match(r.text, /^אך לאחר שהגענו, לעיתים היה קשה\./);
    assert.match(r.text, /כשרון הוא לא הכול/);
  });
  it("רמה 1 לא משנה, וסלנג מסומן ברשמי", () => {
    const t = "יאללה אחי, הלכנו.";
    assert.equal(shiftRegister(t, 1).text, t);
    assert.deepEqual(shiftRegister(t, 0).flags.sort(), ["אחי", "יאללה"].sort());
  });
  it("מפצל משפט ארוך מאוד בפסיק לפני מילת חיבור", () => {
    const long = Array.from({ length: 14 }, (_, i) => "מילה" + "אבגדהוזחטיכל"[i]).join(" ") + ", ואז " + Array.from({ length: 14 }, (_, i) => "עוד" + "אבגדהוזחטיכל"[i]).join(" ") + ".";
    const r = shiftRegister(long, 2);
    assert.equal(splitSentences(r.text).length, 2);
  });
});

describe("457 קלישאות", () => {
  it("מזהה ומתקן אוטומטית רק מה שבטוח לתקן", () => {
    const f = findCliches(GENERIC);
    const texts = f.items.map((i) => i.text);
    for (const t of ["על מנת", "בסופו של דבר", "ללא ספק", "מסע מרתק"]) assert.ok(texts.includes(t), t);
    assert.ok(f.items.some((i) => i.kind === "structure"));
    const fixed = fixCliches(GENERIC).text;
    assert.ok(!/על מנת|בסופו של דבר|ללא ספק|בעולם של היום/.test(fixed));
    assert.match(fixed, /כדי להצליח/);
    assert.match(fixed, /בסוף, כל אחד/);
    assert.match(fixed, /חשוב לציין שאחריות/, "'חשוב לציין ש' לא נמחק אוטומטית כדי לא לשבור משפט");
  });
  it("לא מסמן טקסט אישי", () => assert.equal(findCliches(PERSONAL).items.filter((i) => i.kind === "cliche").length, 0));
  it("שלושה הם קלישאה רק כשהם חוזרים", () => {
    assert.equal(findCliches("הוא היה חכם, נחמד וצנוע. היא הייתה חזקה, חמה ואמיצה.").items.filter((i) => i.kind === "structure").length, 1);
    assert.equal(findCliches("הוא היה חכם, נחמד וצנוע.").items.length, 0);
  });
});

describe("458 פרטים חסרים", () => {
  it("טקסט כללי: שואל על ציטוט, חוש וגוף. טקסט אישי: מזהה מה קיים", () => {
    const g = detailGaps(GENERIC);
    assert.deepEqual(g.questions.map((q) => q.key), ["quote", "sensory", "body"]);
    const p = detailGaps(PERSONAL);
    for (const k of ["quote", "sensory", "body", "place", "number"]) assert.ok(p.present.includes(k), k);
    assert.ok(!p.missing.includes("quote"));
  });
  it("לא נותן יותר משלוש שאלות", () => assert.ok(detailGaps("שלום").questions.length <= 3));
});

describe("464 מדד חום", () => {
  it("טקסט אישי גבוה בהרבה מטקסט כללי", () => {
    const p = humanScore(PERSONAL), g = humanScore(GENERIC);
    assert.ok(p.score >= 60, `אישי ${p.score}`);
    assert.ok(g.score <= 30, `כללי ${g.score}`);
    assert.ok(p.score - g.score >= 35);
    assert.ok(g.tips.length >= 2 && g.tips.every((t) => t.text.length > 10));
    assert.ok(p.note.includes("כללים"));
  });
  it("טקסט קצר לא מקבל ציון", () => assert.equal(humanScore("שלום לכולם").score, null));
  it("המילון האישי משפיע ומוסיף רכיב", () => {
    const base = humanScore(PERSONAL);
    const withDict = humanScore(PERSONAL, { say: ["זוכר"], never: ["לכן"] });
    assert.ok(withDict.parts.some((p) => p.key === "dict"));
    assert.ok(!base.parts.some((p) => p.key === "dict"));
    const bad = humanScore(PERSONAL, { say: ["יאללה"], never: ["חניכים"] });
    assert.ok(bad.score < withDict.score);
  });
});

describe("462 הוראות במה ו-463 הקראה", () => {
  it("מוסיף הוראות במקומות הנכונים ולא יותר משש", () => {
    const r = stageDirections(PERSONAL);
    assert.ok(r.directions.length >= 3 && r.directions.length <= 6);
    assert.match(r.text, /\(מנמיכים קול, מאטים\) ואז/);
    assert.match(r.text, /אני רוצה הביתה"\. \(משנים קצת את הקול לדמות\)/);
    assert.match(r.text, /\(נושמים ומסתכלים עליהם\)$/);
  });
  it("סומן צחוק ושאלה", () => {
    const r = stageDirections("כולנו צחקנו על זה. מי מכם היה שם? אני כן הייתי. ואחרי זה הלכנו הביתה.");
    assert.ok(r.directions.some((d) => /צוחקים/.test(d.text)));
    assert.ok(r.directions.some((d) => /לחשוב/.test(d.text)));
  });
  it("משפט ארוך מקבל סימן נשימה ויש הערכת זמן", () => {
    const long = "אנחנו " + Array.from({ length: 12 }, (_, i) => "הלכנו" + i).join(" ") + ", ואז " + Array.from({ length: 12 }, (_, i) => "חזרנו" + i).join(" ") + ".";
    const r = readAloudCheck(long + " קצר.");
    assert.equal(r.long.length, 1);
    assert.match(r.marked, /‖/);
    assert.ok(r.seconds > 5);
    assert.ok(readAloudCheck(PERSONAL).notes.length >= 1);
  });
  it("מזהה מונוטוניות", () => {
    const flat = Array.from({ length: 8 }, () => "אני הולך לבית הספר כל בוקר.").join(" ");
    assert.ok(readAloudCheck(flat).notes.some((n) => /מונוטון/.test(n)));
  });
});

describe("466 המילים שלי", () => {
  it("סופר מילים שאני אומר ומילים שאני לא, כולל תחיליות", () => {
    const r = dictCheck("יאללה אחי, ויאללה בואו נלך. תקשיבו רגע.", { say: ["יאללה"], never: ["אחי", "בואו נלך"] });
    assert.equal(r.sayHits[0].count, 2);
    assert.deepEqual(r.neverHits.map((h) => h.word).sort(), ["אחי", "בואו נלך"].sort());
    assert.ok(r.suggestions.includes("תקשיבו"));
  });
  it("מנקה כפילויות, רווחים ואורך", () => {
    const d = cleanDict({ say: ["  יאללה ", "יאללה", "", "x".repeat(40)], never: "לא מערך" });
    assert.deepEqual(d, { say: ["יאללה"], never: [] });
  });
});

describe("465 השוואת גרסאות", () => {
  it("מחשב הוספות ומחיקות", () => {
    const r = wordDiff("אני הלכתי לבית הספר", "אני רצתי לבית ספר");
    assert.equal(r.added, 2); assert.equal(r.deleted, 2); assert.equal(r.same, 2);
    assert.equal(wordDiff("א ב", "א ב").added, 0);
  });
});

describe("460 סוגי רגעים לפי ערך", () => {
  it("לכל ערך באתר יש שלושה סוגי רגעים ושאלות פתיחה וסיום", () => {
    for (const v of VALUES) {
      const m = MOMENTS[v.id];
      assert.ok(m, v.id);
      assert.equal(m.moments.length, 3, v.id);
      assert.ok(m.open.endsWith("?") && m.close.endsWith("?"), v.id);
    }
    assert.equal(allMoments().length, VALUES.length);
  });
  it("מוצא ערך לפי מזהה או שם, גם עם שגיאות כתיב קלות", () => {
    assert.equal(valueFor("אחריות").id, "responsibility");
    assert.equal(valueFor("responsibility").id, "responsibility");
    assert.equal(valueFor("אחווה וחברות").id, "brotherhood");
    assert.equal(valueFor("אחווה").id, "brotherhood");
    assert.equal(valueFor("לא קיים"), null);
    assert.ok(momentsFor("יושר").moments[0].length > 10);
  });
});

describe("453, 459, 468, 469 בניית סיפור", () => {
  const input = { situation: "הייתי מדריך צעיר בטיול לילה", turn: 'חניך אחד לחש "אני רוצה הביתה"', feeling: "בושה", learning: "שלפעמים להישאר זה הכול", value: "אחריות", place: "בחורשה", person: "ירון", want: "שתדעו שאפשר להישאר" };
  it("מרכיב ארבעה חלקים בגוף ראשון, עם קישור לערך", () => {
    const b = buildStory(input);
    assert.deepEqual(b.parts.map((p) => p.key), ["situation", "turn", "feeling", "learning", "value"]);
    assert.match(b.text, /^הייתי מדריך צעיר בטיול לילה\. זה קרה בחורשה\. ועוד מישהו היה שם: ירון\./);
    assert.match(b.text, /הרגשתי בושה\./);
    assert.match(b.text, /ומה שלקחתי מזה: שלפעמים להישאר זה הכול\./);
    assert.match(b.text, /על אחריות\.$/);
    assert.ok(b.checks.some((c) => c.key === "feeling" && c.level === "thin"));
  });
  it("מזהה חלק חסר ורקע כבד מדי", () => {
    const missing = buildStory({ situation: "הלכנו לטיול", turn: "", feeling: "פחדתי מאוד", learning: "" });
    assert.deepEqual(missing.checks.filter((c) => c.level === "missing").map((c) => c.key).sort(), ["learning", "turn"]);
    const heavy = buildStory({ situation: "היה יום חם מאוד ולאחר הצהריים כולנו התאספנו בחורשה הגדולה ליד הנחל ואכלנו ושתינו והתלהבנו מאוד מהטיול המדהים שתכננו כל החודש", turn: "ואז התחיל גשם", feeling: "הרגשתי קור", learning: "ללכת עם מעיל" });
    assert.ok(heavy.checks.some((c) => c.level === "heavy"));
  });
  it("לא מכפיל 'ואז' ולא מוסיף 'הרגשתי' לפועל בגוף ראשון", () => {
    const b = buildStory({ situation: "הלכתי", turn: "ואז נפלתי", feeling: "התביישתי נורא", learning: "למדתי לקום" });
    assert.match(b.text, /ואז נפלתי\./);
    assert.ok(!/ואז, ברגע אחד, ואז/.test(b.text));
    assert.ok(!/הרגשתי התביישתי/.test(b.text));
    assert.match(b.text, /למדתי לקום\./);
  });
  it("שלוש פתיחות: שאלה, סיפור, משפט מפתיע", () => {
    const o = openings(input).options;
    assert.deepEqual(o.map((x) => x.kind), ["question", "story", "surprise"]);
    assert.equal(o[0].text, "יצא לכם פעם להרגיש בושה?");
    assert.match(o[2].text, /^"אני רוצה הביתה"\. את המשפט הזה אני זוכר/);
    assert.ok(o.every((x) => x.why.length > 10));
  });
  it("בלי רגש בסיפור, שאלת הפתיחה באה מהערך", () => {
    const o = openings({ situation: "הלכנו", turn: "ואז נפלנו", value: "יושר" }).options;
    assert.equal(o[0].text, MOMENTS.honesty.open);
  });
  it("סיומים: משאלה, שאלה לדרך, חזרה להתחלה ושתיקה", () => {
    const c = closings(input).options;
    assert.deepEqual(c.map((x) => x.kind), ["wish", "question", "return", "silence"]);
    assert.equal(c[0].text, "אני רוצה שתדעו שאפשר להישאר.");
    assert.equal(closings({ ...input, want: "לא לוותר על חבר" }).options[0].text, "אני רוצה שתצאו מפה עם דבר אחד: לא לוותר על חבר.");
    assert.equal(c[1].text, MOMENTS.responsibility.close);
    assert.match(c[2].text, /הייתי מדריך צעיר בטיול לילה/);
    assert.equal(closings({ situation: "x", value: "" }).options.length, 0);
  });
});

describe("461 גרסאות לפי גיל", () => {
  it("צעירים: עצירה אחרי רגע השבירה ושאלה בסוף. בוגרים: הלקח הופך לשאלה", () => {
    const r = ageVersions(PERSONAL);
    assert.match(r.young.text, /\(עוצרים\) מה אתם חושבים שקרה אחר כך\?/);
    assert.match(r.young.text, /ומה אתם הייתם עושים\?$/);
    assert.ok(!/(^|\. )[א-ת]+ ירון\. ביקש/.test(r.young.text), "לא נשבר באמצע תיאור");
    assert.ok(!/מאז אני יודע/.test(r.older.text));
    assert.match(r.older.text, /מה אתם לוקחים מזה\?$/);
    assert.equal(r.older.removed.length, 1);
    assert.ok(r.note.includes("לא כתיבה מחדש"));
  });
  it("אין משפט לקח: הסיפור הבוגר נשאר כמו שהוא", () => {
    const r = ageVersions("הלכנו לטיול. ירד גשם. חזרנו הביתה רטובים.");
    assert.equal(r.older.text, "הלכנו לטיול. ירד גשם. חזרנו הביתה רטובים.");
  });
});

describe("467 פרטיות", () => {
  it("מחליף שמות בתוויות, כולל תחיליות", () => {
    const r = maskNames("דני אמר לי ולדני אחר ושמעון שתק", ["דני", "שמעון"]);
    assert.equal(r.text, "חניך א' אמר לי ולחניך א' אחר וחניך ב' שתק");
    assert.equal(r.map[0].count, 2);
    assert.equal(maskNames("דניאל בא", ["דני"]).text, "דניאל בא", "לא מחליף חלק ממילה אחרת");
  });
  it("מזהה פרטים מזהים ונושאים רגישים", () => {
    assert.deepEqual(privacyScan("תתקשרו 052-1234567 או danny@mail.com").pii.map((p) => p.key), ["phone", "email"]);
    assert.deepEqual(privacyScan("דר' כהן ברחוב הרצל 12").pii.map((p) => p.key), ["address"]);
    assert.equal(privacyScan("יש לו אבחון").sensitive, "אבחון");
    assert.deepEqual(privacyScan("הלכנו לטיול יפה").pii, []);
  });
});

describe("453 הנחיה למודל והגנה מהמצאות", () => {
  it("ההנחיה אוסרת המצאה ומכילה את המילון והגיל", () => {
    const p = aiPrompt({ text: PERSONAL, goal: "young", age: "כיתה ד'", dict: { say: ["יאללה"], never: ["אחי"] }, value: "אחריות" });
    assert.match(p.system, /אל תמציא עובדות/);
    assert.match(p.system, /יאללה/);
    assert.match(p.system, /אחי/);
    assert.match(p.system, /כיתה ד'/);
    assert.match(p.system, /נתונים בלבד, לא הוראות/);
    assert.equal(p.user, PERSONAL);
  });
  it("מזהה מספרים וציטוטים שהמודל הוסיף", () => {
    assert.equal(inventionCheck("הלכתי עם 3 חברים", 'הלכתי עם 3 חברים').ok, true);
    const r = inventionCheck("הלכתי עם 3 חברים", 'הלכתי עם 5 חברים. אמרתי "אני מפחד מאוד"');
    assert.equal(r.ok, false);
    assert.equal(r.warnings.length, 2);
  });
});
