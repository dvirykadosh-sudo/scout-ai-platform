// כלי ארגון למדריך: מצב מהיר, יומן ותזכורות, טקסט לוואטסאפ, טיפים למדריך חדש.
import { rowToActivity } from "./activities.js";
import { gearItems, gearLoad } from "./gear.js";
import { GRADES } from "./shared/constants.js";
import { activitySummary } from "./content.js";

// ───────────────────────── תאריכים ─────────────────────────

/** התאריך הנוכחי בישראל, בפורמט YYYY-MM-DD. */
export const israelToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

export const isRealDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000);

const addDays = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** "יום ראשון, 18.10" */
export function hebrewDay(s) {
  if (!isRealDate(s)) return s;
  return new Date(`${s}T12:00:00Z`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
}

// ───────────────────────── מצב מהיר ─────────────────────────

const gradeOf = (ageGroup) => {
  const m = /^כיתה (\S+) - /.exec(ageGroup || "");
  return m ? GRADES.indexOf(m[1]) : -1;
};
const genderOf = (ageGroup) => (ageGroup || "").split(" - ")[1] || "";

/** כמה "רחוק" שכבת הגיל של הפעולה מהשכבה המבוקשת: 0 זהה, 1 אותה כיתה, 2 סמוכה, 3 רחוקה. */
function ageTier(want, have) {
  if (!want) return 0;
  if (want === have) return 0;
  const gw = gradeOf(want);
  const gh = gradeOf(have);
  if (gw >= 0 && gw === gh) return 1;
  if (gw >= 0 && gh >= 0 && Math.abs(gw - gh) === 1) return 2;
  return 3;
}

const hash = (n) => {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  return (x % 1000) / 1000;
};

export const brief = (a, extra = {}) => ({
  id: a.id,
  title: a.title,
  durationMin: a.durationMin,
  ageGroup: a.ageGroup,
  leadingValue: a.leadingValue,
  equipment: a.equipment,
  kind: a.kind,
  energeticMode: a.energeticMode,
  gear: gearLoad(a.equipment),
  ...extra,
});

/**
 * בוחר פעולה מהמאגר בלחיצה אחת: לפי גיל, זמן פנוי, ציוד מינימלי ותנועתיות.
 * מעדיף פעולות שלא הופעלו לאחרונה ופעולות בדירוג גבוה.
 */
export function quickPick(db, { age, minutes, minimalGear = false, energetic = false, skip = [], userId = null, seed = 0 } = {}) {
  const rows = db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all().map(rowToActivity);
  const ratings = new Map(db.prepare("SELECT activity_id AS id, AVG(stars) AS avg, COUNT(*) AS c FROM ratings GROUP BY activity_id").all().map((r) => [r.id, r]));
  const recent = new Set(userId ? db.prepare("SELECT DISTINCT activity_id AS id FROM runs WHERE user_id = ? AND ran_on >= date('now','-60 day')").all(userId).map((r) => r.id) : []);
  const skipSet = new Set(skip);

  const scored = [];
  let tooLong = null;
  for (const a of rows) {
    if (skipSet.has(a.id)) continue;
    const load = gearLoad(a.equipment);
    if (minimalGear && load > 1) continue;
    if (minutes && a.durationMin > minutes + 5) {
      if (!tooLong || a.durationMin < tooLong.durationMin) tooLong = a;
      continue;
    }
    const tier = ageTier(age, a.ageGroup);
    const gap = minutes ? Math.abs(minutes - a.durationMin) : 0;
    const r = ratings.get(a.id);
    let score = tier * 40 + gap * 1.2 + load * 2 + hash(a.id + seed) * 6;
    if (r && r.c) score -= (r.avg - 3) * 4;
    if (recent.has(a.id)) score += 25;
    if (energetic) score += a.energeticMode ? -10 : 8;
    const reasons = [];
    if (tier === 0 && age) reasons.push("מתאימה בדיוק לשכבה שלכם");
    else if (tier === 1) reasons.push("נכתבה לאותה כיתה, בהרכב אחר");
    else if (tier === 2) reasons.push("נכתבה לכיתה סמוכה, כדאי להתאים קצת");
    else if (age) reasons.push("לא נכתבה לשכבה הזאת. כדאי לשכפל ולהתאים לפני שמפעילים");
    if (minutes) reasons.push(a.durationMin <= minutes ? `נכנסת בזמן: ${a.durationMin} דקות מתוך ${minutes}` : `חורגת בכמה דקות: ${a.durationMin} מתוך ${minutes}`);
    reasons.push(load === 0 ? "בלי ציוד בכלל" : load === 1 ? "ציוד מינימלי" : `ציוד: ${gearItems(a.equipment).filter((i) => !i.free && !i.optional).map((i) => i.text).join(", ")}`);
    if (r && r.c && r.avg >= 4) reasons.push("דורגה גבוה על ידי מדריכים");
    if (recent.has(a.id)) reasons.push("הפעלתם אותה בחודשיים האחרונים");
    scored.push({ a, score, reasons, tier });
  }
  scored.sort((x, y) => x.score - y.score || x.a.id - y.a.id);
  const top = scored.slice(0, 3);
  return {
    pick: top[0] ? brief(top[0].a, { reasons: top[0].reasons, exactAge: top[0].tier === 0 }) : null,
    alternatives: top.slice(1).map((s) => brief(s.a, { reasons: s.reasons, exactAge: s.tier === 0 })),
    candidates: scored.length,
    nearest: !top[0] && tooLong ? brief(tooLong, { reasons: [`הפעולה הקצרה ביותר שמצאנו אורכת ${tooLong.durationMin} דקות. אפשר לקצר אותה בלחיצה`] }) : null,
  };
}

// ───────────────────────── יומן, תזכורות וקובץ ICS ─────────────────────────

export function scheduleRow(r) {
  return {
    id: r.id,
    activityId: r.activity_id ?? null,
    title: r.a_title || r.title || "פעולה",
    date: r.date,
    time: r.time || "",
    durationMin: r.duration_min ?? r.a_duration ?? null,
    groupLabel: r.group_label || "",
    note: r.note || "",
    remindDays: r.remind_days ?? null,
    dismissed: r.dismissed >= 1,
    createdAt: r.created_at,
  };
}

export const SCHEDULE_SELECT = `SELECT s.*, a.title AS a_title, a.duration_min AS a_duration FROM schedule s LEFT JOIN activities a ON a.id = s.activity_id`;

const prepGear = (equipment) => gearItems(equipment).filter((i) => !i.free && !i.optional).map((i) => i.text);

/** תזכורות פעילות: הכנה לפעולה קרובה, ותיעוד של פעולה שכבר עברה. */
export function computeReminders(db, userId, today = israelToday()) {
  const rows = db
    .prepare(`${SCHEDULE_SELECT.replace("a.duration_min AS a_duration", "a.duration_min AS a_duration, a.equipment AS equipment")} WHERE s.user_id = ? AND s.dismissed < 2 AND s.date >= ? ORDER BY s.date, s.time`)
    .all(userId, addDays(today, -14));
  const out = [];
  for (const r of rows) {
    const left = daysBetween(today, r.date);
    const title = r.a_title || r.title || "פעולה";
    if (left >= 0 && r.dismissed === 0 && r.remind_days != null && left <= r.remind_days) {
      const gear = r.equipment ? prepGear(r.equipment) : [];
      const when = left === 0 ? "היום" : left === 1 ? "מחר" : `בעוד ${left} ימים`;
      out.push({
        id: r.id,
        type: "prep",
        activityId: r.activity_id ?? null,
        title,
        date: r.date,
        time: r.time || "",
        daysLeft: left,
        gear,
        message: `${when} פעולה: ${title}${r.group_label ? ` (${r.group_label})` : ""}.${gear.length ? ` להכין: ${gear.join(", ")}.` : " אין ציוד מיוחד להכין."}`,
      });
    } else if (left < 0 && r.activity_id) {
      const ran = db.prepare("SELECT 1 FROM runs WHERE user_id = ? AND activity_id = ? AND ran_on >= ? LIMIT 1").get(userId, r.activity_id, r.date);
      if (!ran) {
        out.push({
          id: r.id,
          type: "log",
          activityId: r.activity_id,
          title,
          date: r.date,
          time: r.time || "",
          daysLeft: left,
          gear: [],
          message: `הפעלתם את "${title}" ב${hebrewDay(r.date)}? שלושים שניות ביומן ההפעלות, ובפעם הבאה האתר ילמד מה עבד לכם.`,
        });
      }
    }
  }
  return out;
}

// RFC 5545
const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function fold(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 73) {
      out.push(cur);
      cur = " " + ch;
      bytes = 1 + b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}

const compactDate = (s) => s.replace(/-/g, "");
const addMinutes = (date, time, mins) => {
  const d = new Date(`${date}T${time}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  return d.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "T") + "00";
};

/** קובץ יומן (.ics) שנפתח בגוגל קלנדר, באאוטלוק ובטלפון, כולל התראה לפי ההגדרה של כל פעולה. */
export function buildIcs(items, { origin = "", calendarName = "פעולות שבט מעוז" } = {}) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Shevet Maoz//Activity Generator//HE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEsc(calendarName)}`, "X-WR-TIMEZONE:Asia/Jerusalem"];
  for (const it of items) {
    const desc = [it.groupLabel && `קבוצה: ${it.groupLabel}`, it.note, it.activityId && origin ? `הפעולה באתר: ${origin}/library/${it.activityId}` : ""].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:schedule-${it.id}-${compactDate(it.date)}@shevet-maoz`, `DTSTAMP:${stamp}Z`);
    if (it.time) {
      lines.push(`DTSTART:${compactDate(it.date)}T${it.time.replace(":", "")}00`, `DTEND:${addMinutes(it.date, it.time, it.durationMin || 60)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(it.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(it.date, 1))}`);
    }
    lines.push(`SUMMARY:${icsEsc(it.title)}`);
    if (desc) lines.push(`DESCRIPTION:${icsEsc(desc)}`);
    if (it.remindDays != null) {
      // התראה ב-9 בבוקר, n ימים לפני. לאירוע עם שעה: אותה שעה, n ימים לפני
      const trigger = it.time ? (it.remindDays === 0 ? "-PT30M" : `-P${it.remindDays}D`) : it.remindDays === 0 ? "PT9H" : `-P${it.remindDays - 1}DT15H`;
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("תזכורת: " + it.title)}`, `TRIGGER${it.time || it.remindDays !== 0 ? "" : ";RELATED=START"}:${trigger}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ───────────────────────── וואטסאפ ─────────────────────────

// בוואטסאפ *כוכביות* ו-_קו תחתון_ יוצרים עיצוב, ולכן מנקים אותם מהתוכן עצמו
const clean = (s) => String(s ?? "").replace(/[*_~`]/g, "").replace(/\s+\n/g, "\n").trim();

function firstSentences(text, max) {
  const t = clean(text).replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s\S*$/, "") + "…").trim();
}

export const WHATSAPP_MODES = [
  { id: "staff", label: "לצוות ההדרכה", hint: "תקציר של הפעולה, הציוד והזמנים" },
  { id: "kids", label: "הודעה לחניכים", hint: "הזמנה קצרה ופשוטה" },
  { id: "parents", label: "סיכום להורים", hint: "מה עשינו ומה אפשר לשאול בבית" },
  { id: "full", label: "הפעולה המלאה", hint: "כל השלבים, להעתקה" },
];

export function whatsappText(a, { mode = "staff", date = "", time = "", place = "" } = {}) {
  const bold = (s) => `*${clean(s)}*`;
  if (mode === "parents") return activitySummary(a).parents;
  if (mode === "kids") {
    const when = date ? `${hebrewDay(date)}${time ? ` בשעה ${time}` : ""}` : "בפעולה הקרובה";
    return [
      `שלום חברים!`,
      `${when}${place ? ` ב${clean(place)}` : ""} נפגשים לפעולה: ${bold(a.title)}.`,
      a.energeticMode ? "תבואו עם נעליים סגורות ובגדים שנוח לרוץ בהם." : "תבואו עם מצב רוח טוב, ובלי טלפון ביד.",
      "נתראה!",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const head = [bold(a.title), `${clean(a.ageGroup)} · ${a.durationMin} דקות · ערך: ${clean(a.leadingValue)}`, `${clean(a.tribe)}${a.instructor ? ` · מדריך/ה: ${clean(a.instructor)}` : ""}`];
  if (date) head.push(`מתי: ${hebrewDay(date)}${time ? ` בשעה ${time}` : ""}${place ? ` · ${clean(place)}` : ""}`);
  const meta = [`${bold("ציוד")}: ${clean(a.equipment)}`, `${bold("בטיחות")}: ${clean(a.safetyNotes)}`];
  if (mode === "full") {
    const stages = a.stages.map((s, i) => `${bold(`${i + 1}. ${s.name} (${s.minutes} דקות)`)}\n${clean(s.content)}`);
    return [...head, "", ...meta, "", ...stages, a.conclusionNote ? `\n${bold("לסיום")}: ${clean(a.conclusionNote)}` : ""].filter((x, i, arr) => x !== "" || arr[i - 1] !== "").join("\n").trim();
  }
  const stages = a.stages.map((s, i) => `${i + 1}. ${bold(s.name)} (${s.minutes} דק') ${firstSentences(s.content, 170)}`);
  return [...head, "", ...meta, "", bold("מהלך הפעולה"), ...stages].join("\n").trim();
}

// ───────────────────────── מדריך חדש ─────────────────────────

const STAGE_TIPS = {
  "פתיחה": "עמדו במקום שכולם רואים אתכם, וחכו לשקט לפני שמתחילים. משפט פתיחה אחד: מה אנחנו עושים היום ולמה. אל תתנצלו ואל תסבירו יותר מדי.",
  "ציר זמן/משחק": "הסבירו את החוקים פעם אחת, הראו דוגמה, ובדקו שהבינו: 'מי יכול להסביר לי מה עושים?'. אם הרעש עולה, עצרו את המשחק, חכו, והמשיכו. לא צועקים מעל הקבוצה.",
  "זמן צופיות מעשי": "עברו בין הקבוצות ואל תישארו במקום אחד. תקנו בעדינות, ושבחו קודם את מי שמצליח. בטיחות לפני הכול: מי שלא בטוח, שואל.",
  "דיון": "שאלו שאלה אחת, וחכו שבע שניות של שקט לפני שאתם עונים בעצמכם. אין תשובה נכונה, ומותר לדלג. אם אחד מדבר הרבה, תודו לו ותנו לאחר. לא מצביעים על חניך בשם.",
  "סיכום": "סיימו בשני משפטים משלכם, בלי נאום. תודו לקבוצה, ואמרו מה לוקחים מכאן. אם נשאר זמן, בקשו מחניך אחד לומר מה נשאר לו מהפעולה.",
};

const STOCK_PROBLEMS = [
  { problem: "חניך לא רוצה להשתתף", answer: "אל תכריחו בפני כולם. בקשו ממנו תפקיד קטן (מחזיק שעון, כותב על הלוח), ודברו איתו אחר כך בארבע עיניים. לפעמים מספיק שתראו שהוא נראה." },
  { problem: "הקבוצה רועשת ולא מקשיבה", answer: "אל תתחרו ברעש. עצרו, הרימו יד, או הגידו 'כשהקבוצה שקטה אני ממשיך' וחכו. אם זה חוזר, שנו את הפורמט: עברו לעבודה בקבוצות קטנות." },
  { problem: "הזמן נגמר באמצע", answer: "דלגו על החלק האחרון של שלב המשחק ושמרו את הדיון והסיכום. דיון קצר של חמש דקות שווה יותר ממשחק שלם בלי שיחה." },
  { problem: "נשארו עשר דקות והכול נגמר", answer: "שאלו שאלה נוספת מהדיון, או בקשו מהקבוצה לחזור על המשחק עם שינוי אחד שהם ממציאים. משחק חימום מהבנק נותן פתרון מהיר." },
  { problem: "שואלים שאלה ואני לא יודע את התשובה", answer: "'שאלה מצוינת, אני לא בטוח. נברר ונחזור אליה בפעם הבאה'. זה הרבה יותר טוב מלהמציא, והחניכים זוכרים את הכנות." },
  { problem: "ריב או הקנטה באמצע הפעולה", answer: "עצרו בשקט וקצר, בלי לחפש אשמים מול כולם. הפרידו בין הצדדים, המשיכו עם הקבוצה, ודברו איתם אחרי. אם זה חוזר, ספרו להנהגת השבט." },
];

/** טיפים לפעולה מסוימת, בשביל מדריך שמפעיל בפעם הראשונה. */
export function newbieTips(a) {
  let at = 0;
  const during = a.stages.map((s) => {
    const row = { minute: at, stage: s.name, minutes: s.minutes, tip: STAGE_TIPS[s.name] || "", longStage: s.minutes >= 15 };
    at += s.minutes;
    return row;
  });
  const gear = gearItems(a.equipment).filter((i) => !i.free && !i.optional).map((i) => i.text);
  const before = [
    "קראו את הפעולה פעמיים: פעם כדי להבין, ופעם כדי לדמיין איך אתם אומרים אותה בקול.",
    gear.length ? `הכינו מראש: ${gear.join(", ")}. עדיף להגיע עשר דקות לפני.` : "אין ציוד מיוחד, אבל כדאי להגיע מוקדם ולהכין את המקום.",
    `בטיחות: ${a.safetyNotes}`,
    "עברו פיזית על המקום: איפה עומדים, איפה אפשר לרוץ, איפה יושבים לדיון.",
    "כתבו על דף קטן את שעת ההתחלה והסיום של כל שלב, והניחו אותו ביד. אפשר גם לפתוח את מצב ההדרכה בשטח בטלפון.",
  ];
  if (a.groupSize >= 25) before.push("הקבוצה גדולה. תחלקו מראש לשתי תתי-קבוצות עם אחראי לכל אחת, כדי לא לחפש במקום.");
  if (a.energeticMode) before.push("הפעולה תנועתית. הגדירו גבולות גזרה ברורים, והורידו שעונים וצמידים לפני שמתחילים לרוץ.");
  if (a.activeScouting) before.push("יש בפעולה זמן צופיות מעשי. תתרגלו את הקשר או את העזרה הראשונה בעצמכם לפני, כדי שלא תלמדו אותם לראשונה מול הקבוצה.");
  const after = [
    "רשמו ביומן ההפעלות מה עבד ומה הייתם משנים, כל עוד זה טרי.",
    "בקשו משוב אנונימי מהחניכים בעזרת ה-QR של הפעולה.",
    "אם משהו הדאיג אתכם בקבוצה או בחניך, ספרו להנהגת השבט, גם אם זה נראה קטן.",
  ];
  return { before, during, ifThen: STOCK_PROBLEMS, after, totalMinutes: at };
}

export const NEWBIE_JOURNEY = [
  { id: "know", title: "להכיר את המושגים", text: "קראו את המילון הקצר למטה. עשר דקות שיחסכו הרבה בלבול.", href: "/new#glossary", cta: "למילון" },
  { id: "pick", title: "לבחור פעולה ראשונה", text: "בחרו פעולה קלה: בלי ציוד, עד 30 דקות, לשכבה שלכם. המצב המהיר עושה את זה בלחיצה אחת.", href: "/quick", cta: "למצב מהיר" },
  { id: "read", title: "לקרוא ולהבין", text: "פתחו את הפעולה, ועברו על 'טיפים למדריך חדש' שמופיעים בתחתית העמוד.", href: "/library", cta: "למאגר" },
  { id: "prep", title: "להתכונן", text: "הכינו ציוד לפי רשימת ההכנה, ושבצו את הפעולה ביומן כדי לקבל תזכורת.", href: "/calendar", cta: "ליומן" },
  { id: "run", title: "להפעיל", text: "השתמשו במצב הדרכה בשטח בטלפון: שעון לכל שלב, והתראה כשהזמן נגמר.", href: "/library", cta: "לבחירת פעולה" },
  { id: "reflect", title: "לסכם לעצמכם", text: "רשמו ביומן ההפעלות מה עבד. אחרי כמה פעמים האתר יראה לכם מה מתאים לכם.", href: "/library", cta: "ליומן ההפעלות" },
];

export const GLOSSARY = [
  { term: "פעולה", text: "המפגש השבועי של החניכים עם המדריך. בדרך כלל 30 עד 60 דקות, עם נושא וערך מרכזי." },
  { term: "פעולת שיא", text: "פעולה גדולה ומיוחדת, עם חוויה שהקבוצה תזכור. לא עושים אחת כזאת כל שבוע." },
  { term: "פעולת תוכן", text: "פעולה שמלמדת נושא, כמו היסטוריה, חג או ערך, דרך משחק ודיון." },
  { term: "ציר זמן / משחק", text: "השלב שבו הקבוצה עושה משהו יחד: משחק, משימה או סימולציה. זה הלב של הפעולה." },
  { term: "זמן צופיות מעשי", text: "מיומנות צופית שמתרגלים בפועל: קשרים, עזרה ראשונה, ניווט, הקמת מתקן." },
  { term: "דיון", text: "שיחה מונחית אחרי החוויה, כדי להבין מה היא אומרת לנו על הערך." },
  { term: "ערך מוביל", text: "הרעיון המרכזי של הפעולה, כמו אחריות או חברות. כל השלבים נבנים סביבו." },
  { term: "שכבה", text: "קבוצת הגיל, לפי כיתה. לכל שכבה יש פעולות שמתאימות לה." },
  { term: "גדוד", text: "מסגרת בתוך השבט שמאגדת כמה שכבות." },
  { term: "מידה ד' ומידה ח'", text: "שתיים ממידות הצופה. הסיכום של כל פעולה מתחבר אליהן. את הנוסח המדויק רואים בעמוד הפעולה." },
];
