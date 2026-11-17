// שלב 68: ספר המשחקים של מעוז לשטח. מצבי חירום ("ירד גשם", "חניכים היפראקטיביים", "נשאר לי רבע שעה") נענים מקומית, בלי מודל ובלי מפתח:
// משפט אמפתי אחד, שלושה צעדים שאפשר לבצע עכשיו, וכרטיסים של משחקים אמיתיים שנשלפים בזמן אמת מאינדקס ה-RAG לפי זמן, ציוד ואנרגיה.
// מצבי חירום אמיתיים (פציעה, חניך שנעלם) נענים בתשובה קבועה ומדויקת שמפנה לנוהל ולגורמי החירום, ולעולם לא נשלחים למודל.
import { ICEBREAKERS } from "./tools.js";
import { WARMUPS } from "./content.js";

const L = (label, href) => ({ label, href });

export const MEDICAL_ANSWER = {
  answer:
    "קודם כול בטיחות ועזרה. מרחיקים את שאר הקבוצה מהמקום, ומי שהוכשר לעזרה ראשונה מטפל. במצב חמור מחייגים מיד למד\"א 101 (או 100 למשטרה). לא מזיזים פצוע שיש חשד לפגיעה בצוואר או בגב. מעדכנים את רכז/ת השבט ואת ההורים לפי הנוהל. אני לא תחליף לעזרה ראשונה ולנוהל הבטיחות של התנועה.",
  links: [L("לעוזר השיחות", "/chat")],
  cards: [],
  topic: "emergency",
};
export const LOST_ANSWER = {
  answer:
    "עוצרים הכול ופועלים לפי נוהל חניך חסר. 1. סופרים מחדש את כל הקבוצה ומעבירים אותה להשגחה של מדריך נוסף, כך שאף אחד לא נשאר לבד. 2. בודקים איפה ראו אותו לאחרונה, ושולחים שני מדריכים לחפש בדרך ובסביבה. 3. אם הוא לא נמצא תוך דקות ספורות, מעדכנים מיד את רכז/ת השבט ומתקשרים למשטרה 100. 4. מעדכנים את ההורים לפי הנוהל. אל תחכו עם הדיווח.",
  links: [],
  cards: [],
  topic: "emergency",
};

/**
 * תרחישים לפי סדר עדיפות. lead: משפט פתיחה; steps: שלושה צעדים; terms: מילים לחיפוש משחקים באינדקס;
 * energetic: true=משחק תנועה, false=שקט, null=גם וגם; noEquip: לא להציע ציוד; maxMin: אורך מקסימלי ברירת מחדל לכרטיס.
 */
const SCENARIOS = {
  rain: {
    lead: "גשם לא מבטל את הפעולה, הוא רק מחליף לה מקום.",
    steps: ["מעבירים את הקבוצה מתחת לגג או למבנה, וסופרים אותם בדרך. בטיחות לפני הכול.", "בוחרים משהו שעושים בישיבה או בעמידה, בלי ריצה על משטח רטוב: מעגל, משחק מילים או שיחה.", "אם נשאר זמן, מחברים את זה לנושא: 'מה עושים כשהתוכנית משתנה?'"],
    terms: "מעגל ישיבה שיחה שקט מילים",
    energetic: false,
    noEquip: true,
    maxMin: 10,
  },
  heat: {
    lead: "בחום, הדבר הראשון הוא מים וצל, והפעולה אחרי.",
    steps: ["מעבירים לצל, מוודאים שכולם שותים, ומורידים קצב.", "בוחרים משהו בישיבה או בהליכה איטית. בלי ריצות ובלי תחרויות מאמצות.", "בודקים מי נראה חיוור, מסוחרר או שותק פתאום, ומטפלים בו מיד."],
    terms: "שקט מעגל ישיבה שיחה הליכה נשימות",
    energetic: false,
    noEquip: true,
    maxMin: 8,
  },
  cold: {
    lead: "בקור צריך להזיז אותם, כי חניך שקופא לא לומד כלום.",
    steps: ["מתחילים בתנועה: משחק שמחמם את הגוף, כמה דקות.", "שומרים על מקום מוגן מהרוח, ועל קבוצות קטנות שזזות.", "מקצרים את הישיבות. כל שלב עד עשר דקות, עם תנועה בין השלבים."],
    terms: "תנועה קצב חימום מעגל",
    energetic: true,
    noEquip: true,
    maxMin: 8,
  },
  hyper: {
    lead: "יש המון אנרגיה. לא נלחמים בה, מנתבים אותה.",
    steps: ["נותנים לה פורקן מוגדר של שתיים-שלוש דקות: משחק תנועה עם כללים ברורים.", "ואז איתות שקט מוסכם (יד למעלה או ספירה לאחור), במקום צעקה.", "ממשיכים במשימה בקבוצות קטנות, עם תפקיד לכל אחד. אנרגיה עם תפקיד היא כבר לא בלגן."],
    terms: "תנועה קצב מעגל תחרות שקט איסוף",
    energetic: null,
    noEquip: true,
    maxMin: 6,
  },
  bored: {
    lead: "כשמשעמם להם, בדרך כלל הם רק צופים ולא משתתפים.",
    steps: ["משנים מצב: מעמידים אותם, מחלקים לקבוצות קטנות, מזיזים את המקום.", "נותנים תפקיד אמיתי: שופט, אחראי זמן, מציג. מי שיש לו תפקיד לא משתעמם.", "מקצרים. אתגר של שלוש דקות בין קבוצות עובד טוב יותר מהסבר של עשר."],
    terms: "תחרות אתגר קבוצות מירוץ משחק",
    energetic: true,
    noEquip: true,
    maxMin: 8,
  },
  attention: {
    lead: "כשלא מקשיבים, בדרך כלל צריך לשנות פורמט ולא להגביה קול.",
    steps: ["עוצרים, מחכים שקט ומנמיכים את הקול. זה עובד יותר טוב מצעקה.", "נותנים משימה קצרה שכולם עושים בגוף: קמים, זזים, עונים בתנועה.", "אחרי הפעולה, שיחה קצרה עם מי שהפריע, בארבע עיניים ובלי להעליב."],
    terms: "הקשבה שקט איסוף מעגל",
    energetic: null,
    noEquip: true,
    maxMin: 6,
  },
  few: {
    lead: "קבוצה קטנה היא הזדמנות להתקרב, לא כישלון.",
    steps: ["מצמצמים: משהו בזוגות או במעגל אחד קטן, בלי תחרות בין קבוצות.", "משתמשים בזה לשיחה אמיתית. בקבוצה קטנה כולם מדברים.", "שומרים את החלק הגדול מהפעולה למפגש מלא, ומשאירים היום משהו עצמאי וקצר."],
    terms: "מעגל שיחה היכרות זוגות",
    energetic: null,
    noEquip: true,
    maxMin: 10,
  },
  many: {
    lead: "קבוצה גדולה עובדת טוב כשמחלקים אותה מהר.",
    steps: ["מחלקים לקבוצות של חמישה-שישה, ולכל קבוצה אחראי.", "בוחרים משחק שמתאים לקבוצות במקביל, עם כללים שאומרים פעם אחת בלבד.", "מסיימים בסבב משותף קצר, כל קבוצה במשפט אחד."],
    terms: "קבוצות תחרות מירוץ תחנות",
    energetic: true,
    noEquip: true,
    maxMin: 10,
  },
  nogear: {
    lead: "בלי ציוד אפשר להפעיל, כי רוב מה שעובד הוא אנשים ולא דברים.",
    steps: ["בוחרים משחק מעגל או משחק מילים, שלא צריך שום דבר.", "הציוד האבוד הופך לחלק מהמשחק: 'מה היינו עושים בלי...?'.", "מסכמים בשאלה אחת, ואחרי המפגש מעדכנים את רשימת הציוד."],
    terms: "מעגל מילים שיחה היכרות",
    energetic: null,
    noEquip: true,
    maxMin: 10,
  },
  dark: {
    lead: "חושך הוא אווירה, וגם עניין של בטיחות.",
    steps: ["מוודאים שכולם יחד, סופרים, ושומרים על מקום מוגן ומואר.", "עוברים למשהו שקט: סיפור, שירה או מעגל שיחה.", "מסיימים ברגע שקט, ובודקים שאף אחד לא נשאר לבד בדרך חזרה."],
    terms: "סיפור שקט מעגל שיחה",
    energetic: false,
    noEquip: true,
    maxMin: 10,
  },
  unprepared: {
    lead: "קורה לכולם. גם בלי הכנה אפשר להפעיל פעולה טובה, אם מסדרים אותה נכון.",
    steps: ["בוחרים נושא אחד פשוט וערך אחד, ולא מנסים לעשות הכול.", "שלושה חלקים: פתיחה קצרה (משחק או שאלה), חלק מרכזי (משחק או שיחה), וסיכום של משפט אחד.", "משתמשים בכרטיסים כאן כנקודת התחלה, ואחרי המפגש כותבים לעצמכם מה עבד."],
    terms: "פתיחה היכרות מעגל שיחה משחק",
    energetic: null,
    noEquip: true,
    maxMin: 10,
  },
  filler: {
    lead: "חור קטן בלו\"ז הוא מקום מצוין למשחק קצר.",
    steps: ["בוחרים משחק של שלוש-ארבע דקות שלא צריך להכין.", "מסבירים אותו במשפט אחד ומתחילים מיד, בלי נאום.", "אם הם נהנו, זה גם הזדמנות להכיר אותם טוב יותר."],
    terms: "משחק מעגל קצר היכרות",
    energetic: null,
    noEquip: true,
    maxMin: 5,
  },
  time: {
    lead: "לא צריך הרבה זמן כדי להפעיל כמו שצריך.",
    steps: ["בוחרים דבר אחד בלבד: משחק או שיחה.", "מסבירים בקצרה ומתחילים מיד.", "שומרים דקה לסיום: מה לקחתם מזה?"],
    terms: "משחק מעגל קצר שיחה",
    energetic: null,
    noEquip: true,
    maxMin: 8,
  },
};
const ORDER = ["rain", "heat", "cold", "hyper", "bored", "attention", "few", "many", "nogear", "dark", "unprepared", "filler", "time"];

/** חלוקת דקות פשוטה לפי הזמן שנשאר */
export function timePlan(min) {
  const m = Math.max(1, Math.round(min));
  if (m <= 3) return `יש ${m} דקות: משחק אחד קצר, ומשפט סיכום.`;
  const open = Math.max(1, Math.round(m * 0.2));
  const close = Math.max(1, Math.round(m * 0.2));
  const core = Math.max(1, m - open - close);
  return `ל-${m} דקות: ${open} לפתיחה, ${core} לחלק המרכזי, ${close} לסיכום.`;
}

const STATIC = [...ICEBREAKERS.map((b) => ({ ...b, kind: "icebreaker", href: "/icebreakers", how: b.how })), ...WARMUPS.map((w) => ({ ...w, kind: "warmup", href: "/tools" }))];
const cardOf = (h) => ({ title: h.title, meta: h.meta, href: h.href, text: h.snippet || "" });
const staticCard = (b) => ({ title: b.name, meta: `${b.kind === "icebreaker" ? "משחק היכרות" : b.category} · ${b.minutes} דקות${b.equipment ? ` · ${b.equipment}` : " · בלי ציוד"}`, href: b.href, text: String(b.how || "").slice(0, 220) });

/** כרטיסי משחקים: מהאינדקס לפי תרחיש, זמן וציוד; ואם הוא ריק, מהרשימות הקבועות */
export function fieldCards(ia, scn, { rag, rng = Math.random, n = 3 } = {}) {
  const maxMin = ia.minutes ? Math.max(2, Math.min(ia.minutes, 20)) : scn.maxMin || 10;
  const noEquip = ia.signals.includes("nogear") || scn.noEquip || (ia.minutes > 0 && ia.minutes <= 10);
  const terms = scn.terms.split(" ");
  const out = [];
  const seen = new Set();
  const take = (opts, count) => {
    if (!rag) return;
    let got = 0;
    for (const h of rag.search(terms, { limit: 8, maxMin, noEquip, ...opts }).hits) {
      const key = `${h.kind}:${h.ref}`;
      if (seen.has(key) || h.coverage <= 0) continue;
      seen.add(key);
      out.push(cardOf(h));
      if (++got >= count) break;
    }
  };
  const wanted = scn.energetic;
  if (wanted === null) {
    take({ kinds: ["icebreaker", "warmup"], energetic: true }, 1);
    take({ kinds: ["icebreaker", "warmup"], energetic: false }, 1);
  } else {
    take({ kinds: ["icebreaker", "warmup"], energetic: wanted }, 2);
  }
  take({ kinds: ["stage"], energetic: wanted === null ? undefined : wanted }, 1);
  if (out.length < n) take({ kinds: ["icebreaker", "warmup", "stage"] }, n - out.length);
  if (!out.length) {
    const pool = STATIC.filter((b) => (!noEquip || !b.equipment) && b.minutes <= maxMin && (wanted === null || !!b.energetic === wanted));
    const list = pool.length ? pool : STATIC.filter((b) => !b.equipment);
    const start = Math.floor(rng() * list.length);
    for (let i = 0; i < Math.min(n, list.length); i++) out.push(staticCard(list[(start + i) % list.length]));
  }
  return out.slice(0, n);
}

/** התשובה המקומית למצב בשטח. ia: תוצאת analyzeIntent */
export function fieldAnswer(ia, { rag, rng } = {}) {
  const key = ORDER.find((id) => ia.signals.includes(id)) || "time";
  const scn = SCENARIOS[key];
  const steps = [...scn.steps];
  const extra = [];
  if (ia.minutes && key !== "time") extra.push(timePlan(ia.minutes));
  if (ia.signals.includes("nogear") && key !== "nogear") extra.push("הכול בלי ציוד.");
  if (ia.kids && key !== "few" && key !== "many") extra.push(`יש ${ia.kids} חניכים, אז ${ia.kids <= 6 ? "אפשר מעגל אחד קטן" : ia.kids >= 25 ? "מחלקים לקבוצות" : "שתי קבוצות מספיקות"}.`);
  if (key === "time" && ia.minutes) steps.unshift(timePlan(ia.minutes));
  const body = steps.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join("\n");
  const answer = `${scn.lead}${extra.length ? ` ${extra.join(" ")}` : ""}\n${body}`;
  const cards = fieldCards(ia, scn, { rag, rng });
  return {
    answer,
    links: [L("לקופסת הרעיונות", "/tools"), L("מצב מהיר", "/quick")],
    cards,
    topic: "field",
    scenario: key,
    suggestions: key === "time" || ia.minutes ? [] : ["נשארו לי 10 דקות", "נשארו לי 5 דקות בלי ציוד"],
  };
}
