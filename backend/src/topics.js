// נושאים מוצעים לפי החגים והעונה. התאריך העברי מחושב במערכת, בלי טבלה קבועה.
const fmt = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", timeZone: "UTC" });

export function hebrewParts(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { month: p.month, day: Number(p.day) };
}

const T = (topic, value) => ({ topic, value });
// month: English month names of the Hebrew calendar as ICU prints them
const EVENTS = [
  { m: ["Tishri"], d: [1, 2], name: "ראש השנה", s: [T("התחלה חדשה וחשבון נפש", "אחריות"), T("מה אני לוקח איתי לשנה החדשה", "התפתחות אישית")] },
  { m: ["Tishri"], d: [10, 10], name: "יום כיפור", s: [T("סליחה ופיוס בין חברים", "ערבות הדדית"), T("לקיחת אחריות על טעות", "אחריות")] },
  { m: ["Tishri"], d: [15, 21], name: "סוכות", s: [T("בית זמני ומה שחשוב באמת", "הכנסת אורחים"), T("בניית סוכה משותפת", "עבודת צוות")] },
  { m: ["Tishri"], d: [22, 23], name: "שמחת תורה", s: [T("סיום והתחלה מחדש", "המשכיות")] },
  { m: ["Kislev"], d: [25, 30], name: "חנוכה", s: [T("אור קטן שמחזיק זמן", "אומץ"), T("מעטים מול רבים", "אמונה בדרך")] },
  { m: ["Tevet"], d: [1, 2], name: "חנוכה", s: [T("אור קטן שמחזיק זמן", "אומץ")] },
  { m: ["Shevat"], d: [15, 15], name: "ט\"ו בשבט", s: [T("שמירה על הטבע סביבנו", "אחריות לסביבה"), T("שתילה: מה אנחנו מטפחים", "סבלנות")] },
  { m: ["Adar", "Adar II"], d: [14, 14], name: "פורים", s: [T("מסכות ומי אני באמת", "כנות"), T("משלוח מנות ונתינה", "רעות")] },
  { m: ["Nisan"], d: [15, 21], name: "פסח", s: [T("חירות ומה משעבד אותנו היום", "חופש"), T("שאלות שחשוב לשאול", "סקרנות")] },
  { m: ["Nisan"], d: [27, 27], name: "יום השואה", s: [T("זיכרון ואחריות להמשיך", "זיכרון"), T("אומץ אזרחי ושמירה על הצלם", "אנושיות")] },
  { m: ["Iyar"], d: [4, 4], name: "יום הזיכרון", s: [T("זיכרון ואחריות כלפי הנופלים", "זיכרון"), T("מה אני יכול לתרום לקהילה", "מעורבות")] },
  { m: ["Iyar"], d: [5, 5], name: "יום העצמאות", s: [T("שייכות ושמחה במדינה שלנו", "שייכות"), T("מה אני אוהב כאן ומה אפשר לשפר", "מעורבות")] },
  { m: ["Iyar"], d: [18, 18], name: "ל\"ג בעומר", s: [T("מדורה ועשייה משותפת", "עבודת צוות"), T("אור בתוך החושך", "תקווה")] },
  { m: ["Iyar"], d: [28, 28], name: "יום ירושלים", s: [T("עיר שמחברת בין אנשים", "אחדות")] },
  { m: ["Sivan"], d: [6, 6], name: "שבועות", s: [T("קבלה והתחייבות", "מחויבות"), T("ביכורים: מה אנחנו מביאים לקהילה", "נתינה")] },
  { m: ["Av"], d: [15, 15], name: "ט\"ו באב", s: [T("חברות, אהבה והערכה", "חברות")] },
];

const SEASONS = [
  { months: [9], name: "פתיחת שנה", s: [T("היכרות וגיבוש הקבוצה", "חברות"), T("כללי הקבוצה שלנו", "אחריות")] },
  { months: [12, 1, 2], name: "חורף", s: [T("חום ואנרגיה בחדר סגור", "עבודת צוות"), T("נתינה למי שקר לו", "נתינה")] },
  { months: [6, 7, 8], name: "קיץ", s: [T("טיול ומחנה: להסתדר יחד", "שיתוף פעולה"), T("שמירה על הסביבה בטבע", "אחריות לסביבה")] },
];

const EVERGREEN = [T("אחריות אישית", "אחריות"), T("חברות ובריונות", "רעות"), T("מנהיגות בקבוצה", "מנהיגות"), T("הקשבה ושיח מכבד", "כבוד")];

export function suggestTopics(from = new Date(), days = 45) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const seen = new Set();
  const events = [];
  for (let i = 0; i < Math.min(120, Math.max(1, days)); i++) {
    const day = new Date(start.getTime() + i * 86400000);
    const h = hebrewParts(day);
    for (const e of EVENTS) {
      if (e.m.includes(h.month) && h.day >= e.d[0] && h.day <= e.d[1] && !seen.has(e.name)) {
        seen.add(e.name);
        events.push({ name: e.name, date: day.toISOString().slice(0, 10), inDays: i, suggestions: e.s });
      }
    }
  }
  const month = start.getUTCMonth() + 1;
  const seasonal = SEASONS.filter((s) => s.months.includes(month)).map((s) => ({ name: s.name, suggestions: s.s }));
  return { events, seasonal, evergreen: EVERGREEN };
}
