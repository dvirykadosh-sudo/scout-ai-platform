// הערכים כאן זהים לאלה שבשרת (backend/src/shared/constants.js). אם משנים - לשנות בשני המקומות.

export const STAGE_NAMES = ["פתיחה", "ציר זמן/משחק", "זמן צופיות מעשי", "דיון", "סיכום"] as const;

export const CONDITIONS = [
  { key: "rain", label: "גשם" },
  { key: "heat", label: "חום" },
  { key: "small-room", label: "חדר קטן" },
  { key: "few", label: "קבוצה קטנה" },
  { key: "many", label: "קבוצה גדולה" },
  { key: "beginners", label: "קבוצה חדשה או מתחילה" },
  { key: "strong", label: "קבוצה ותיקה וחזקה" },
  { key: "mixed", label: "בנים ובנות יחד" },
  { key: "restless", label: "קבוצה עם הרבה אנרגיה" },
  { key: "mobility", label: "חניכים עם מגבלת ניידות" },
  { key: "vision", label: "חניכים עם לקות ראייה" },
  { key: "hearing", label: "חניכים עם לקות שמיעה" },
  { key: "attention", label: "חניכים עם קשיי קשב וריכוז" },
  { key: "language", label: "חניכים שהעברית אינה שפת אמם" },
] as const;

export const ROLES = ["מדריך", "מדריכה", "צוות הדרכה"] as const;

export const GRADES = ["ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", "י'", "יא'", "יב'"] as const;
export const GENDER_GROUPS = ["בנים", "בנות", "מעורב"] as const;
export const AGE_GROUPS: string[] = GRADES.flatMap((g) => GENDER_GROUPS.map((x) => `כיתה ${g} - ${x}`));

export interface MethodInfo {
  name: string;
  description: string;
  whenToUse: string;
  example: string;
}

export const METHODS: MethodInfo[] = [
  { name: "משחק תחרות", description: "משחק עם כללים ומתח תחרותי שמזניק אנרגיה ושיתוף פעולה בתוך הקבוצה.", whenToUse: "בפתיחה או באמצע הפעולה, כשהקבוצה צריכה אנרגיה.", example: "מירוץ תחנות בין קבוצות עם משימות קצרות." },
  { name: "עשייה", description: "פעולה מעשית משותפת שיוצרת תוצר או שינוי בפועל.", whenToUse: "כשרוצים שהערך יהפוך למעשה מוחשי.", example: "בניית כרזה או מתקן קטן שמבטאים את הערך." },
  { name: "ייצוג", description: "חניכים מייצגים דמות, עמדה או רעיון ומציגים אותם לקבוצה.", whenToUse: "בנושאים שבהם יש כמה נקודות מבט.", example: "כל קבוצה מייצגת עמדה בסוגיה ומציגה אותה." },
  { name: "הבעה יצירתית", description: "ביטוי אישי דרך ציור, כתיבה, דרמה או מוזיקה.", whenToUse: "כשרוצים לתת מקום לרגש ולדמיון.", example: "פסל גוף שמבטא את הנושא." },
  { name: "השראה", description: "סיפור, דמות או קטע שמעוררים מחשבה ורגש.", whenToUse: "בפתיחה או בסיכום, כדי לתת עומק.", example: "סיפור קצר על אדם שפעל מתוך הערך." },
  { name: "חשיבה משותפת", description: "הקבוצה פותרת בעיה או מקבלת החלטה יחד.", whenToUse: "כשרוצים לתרגל שיתוף פעולה והכרעה.", example: "הקבוצה מחליטה יחד איך לפתור דילמה." },
  { name: "דיון בשאלה", description: "שיחה מונחית סביב שאלה מרכזית.", whenToUse: "בשלב העומק, אחרי חוויה משותפת.", example: "שאלה אחת פתוחה, קודם בזוגות ואחר כך במליאה." },
  { name: "שיתוף", description: "כל חניך חולק חוויה, רגש או דעה אישית.", whenToUse: "בקבוצה שיש בה אמון, או כדי לבנות אותו.", example: "סבב שבו כל אחד מספר משפט אחד, ומותר לדלג." },
  { name: "משחק הדמייה", description: "הדמיית מצב אמיתי כדי לתרגל התמודדות.", whenToUse: "בנושאים חברתיים כמו בריונות וסכסוכים.", example: "הצגת תרחיש עם תפקידים מחולקים מראש." },
  { name: "התבוננות", description: "התבוננות ממוקדת בסביבה, בקבוצה או בעצמי.", whenToUse: "כשרוצים לחדד תשומת לב ולעורר שאלות.", example: "הליכה בשקט ורישום שלושה דברים שלא שמנו לב אליהם." },
  { name: "הסבר", description: "העברת מידע או מיומנות באופן ברור ותמציתי.", whenToUse: "כשיש רקע שהקבוצה צריכה לפני החוויה.", example: "הסבר קצר עם דוגמה אחת ושאלה לבדיקת הבנה." },
  { name: "פירוק", description: "פירוק רעיון או תופעה למרכיביה כדי להבין אותה לעומק.", whenToUse: "בנושאים מורכבים או מופשטים.", example: "פירוק מושג לגורמים, לתוצאות ולדוגמאות." },
];

export const ACTION_LABELS: Record<string, string> = {
  "login.2fa_required": "כניסה: נדרש קוד שני",
  "login.2fa_fail": "כניסה: קוד שני שגוי",
  "2fa.enabled": "הפעלת אימות דו-שלבי",
  "2fa.disabled": "כיבוי אימות דו-שלבי",
  "2fa.backup_used": "שימוש בקוד גיבוי",
  "2fa.backup_regenerated": "קודי גיבוי חדשים",
  "reset.requested": "בקשת איפוס סיסמה",
  "password.reset": "איפוס סיסמה בקוד",
  "magic.requested": "בקשת קישור כניסה",
  "verify.requested": "בקשת קוד אימות",
  "verify.confirmed": "אימות מייל או טלפון",
  "contact.updated": "עדכון מייל או טלפון",
  "session.revoke": "ניתוק מכשיר",
  "session.revoke_others": "ניתוק מכשירים אחרים",
  "session.admin_revoke": "ניתוק מכשיר על ידי אדמין",
  "user.create": "יצירת משתמש",
  "user.delete": "מחיקת משתמש",
  "audit.export": "ייצוא יומן פעולות",
  "activity.generate": "יצירת פעולה",
  "activity.import": "ייבוא פעולה מ-AI חיצוני",
  register: "הרשמת מדריך",
  "register.badcode": "הרשמה עם קוד שגוי",
  "user.update": "עדכון משתמש",
  "backup.create": "יצירת גיבוי",
  "backup.download": "הורדת גיבוי",
  "activity.update": "עריכת פעולה",
  "activity.archive": "מחיקת פעולה",
  "activity.restore": "שחזור פעולה",
  "activity.duplicate": "שכפול פעולה",
  "login.success": "התחברות",
  "login.fail": "ניסיון התחברות כושל",
  "login.locked": "חשבון נעול זמנית",
  "rating.create": "דירוג חדש",
  "rating.delete": "מחיקת תגובה",
  "password.changed": "החלפת סיסמה",
  "admin.created": "יצירת משתמש אדמין",
  "email.retry": "ניסיון חוזר לשליחת מייל",
  "email.failed": "שליחת מייל נכשלה",
  "block.add": "חסימת כתובת IP",
  "block.remove": "הסרת חסימת IP",
  "block.auto": "חסימה אוטומטית של כתובת",
  "security.settings": "שינוי הגדרות אבטחה ופרטיות",
  "privacy.purge": "ניקוי רשומות ישנות",
  "privacy.purge_ip": "מחיקת כתובות IP של משתמש",
  "terms.accepted": "אישור תנאי שימוש",
  "access.export": "ייצוא יומן כניסות",
  "users.export": "ייצוא רשימת משתמשים",
  "password.expired": "תוקף הסיסמה פג",
};

export const STYLE_OPTIONS = {
  tone: { label: "טון", options: { warm: "חם ואישי", humor: "הומוריסטי וקליל", serious: "רציני ומכבד", story: "סיפורי ודימויי", youth: "צעיר וקצבי" } },
  address: { label: "למי הטקסט פונה", options: { students: "לחניכים (מה אומרים להם)", guide: "הוראות למדריך", script: "תסריט בגוף ראשון" } },
  length: { label: "אורך", options: { short: "תמציתי", normal: "רגיל", long: "מפורט, עם טיפים" } },
  detail: { label: "רמת פירוט", options: { bullets: "נקודות קצרות", script: "ניסוח מלא של מה לומר" } },
  slang: { label: "סלנג", options: { none: "בלי", light: "קצת", heavy: "הרבה" } },
} as const;

export type StyleKey = "tone" | "address" | "length" | "detail" | "slang";
export interface StyleSettings {
  tone: string;
  address: string;
  length: string;
  detail: string;
  slang: string;
  extra: string;
  sample: string;
}
export const DEFAULT_STYLE: StyleSettings = { tone: "warm", address: "students", length: "normal", detail: "bullets", slang: "none", extra: "", sample: "" };

export interface StyleAnalysis {
  ok: boolean;
  reason?: string;
  traits?: string[];
  suggested?: Omit<StyleSettings, "extra" | "sample">;
}
