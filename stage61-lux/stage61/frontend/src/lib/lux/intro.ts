"use client";

// שלב 61: אנימציית הנשר הפותחת. מוצגת פעם אחת בכל מכשיר, למי שנוחת בעמוד הראשי, בהתחברות או בדף "ברוכים הבאים".
// קישור עם ?intro=1 מציג אותה בכוח (למשל בשיתוף), ?intro=0 מדלג. בדיקות אוטומטיות (webdriver) לא רואות אותה, כדי לא לשבור סקריפטים.
export const INTRO_KEY = "scout.intro";
export const INTRO_EVENT = "scout:intro";
const LANDING = /^\/(welcome|login)?\/?$/;

export function introShouldShow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("intro");
    if (q === "0") return false;
    if (q === "1") return true;
    if (navigator.webdriver) return false;
    if (!LANDING.test(window.location.pathname)) return false;
    return !window.localStorage.getItem(INTRO_KEY); // בלי אחסון (מצב פרטי חסום) לא מציגים בכל טעינה
  } catch {
    return false;
  }
}
export function markIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_KEY, "1");
  } catch {
    /* ignore */
  }
}
/** הצגה חוזרת, מכל מקום באתר */
export const replayIntro = (): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INTRO_EVENT));
};

export interface IntroStation {
  id: string;
  icon: "sparkles" | "book" | "calendar" | "stage" | "export" | "route" | "chart" | "pen" | "access";
  title: string;
  text: string;
  href: string;
}
/** כל תחנה היא יכולת אמיתית שקיימת באתר, עם הנתיב שלה. */
export const INTRO_STATIONS: IntroStation[] = [
  { id: "gen", icon: "sparkles", title: "מחולל פעולות חכם", text: "כותבים נושא, ערך וגיל, ומקבלים פעולה שלמה בחמישה שלבים עם חלוקת זמנים.", href: "/" },
  { id: "lib", icon: "book", title: "מאגר פעולות מוכן", text: "פעולות לפי גיל וערך. אפשר לפתוח, לדרג, להפעיל ולשתף.", href: "/library" },
  { id: "today", icon: "calendar", title: "מסך ״היום״", text: "הפעולה הבאה שלכם, ספירה לאחור, מזג האוויר במקום המפגש ורשימת הכנה.", href: "/" },
  { id: "stage", icon: "stage", title: "מצב במה ומצב מקרן", text: "בשטח: שלב אחד על המסך, טיימר ענק, והקרנה לכל הקבוצה עם QR.", href: "/library" },
  { id: "export", icon: "export", title: "סטודיו ייצוא", text: "Word, PDF וכרטיסים עם הלוגו וצבעי השבט, עם תצוגה מקדימה חיה.", href: "/library" },
  { id: "trail", icon: "route", title: "מפת שביל השנה", text: "חגים, מחנות וטקסים כתחנות על שביל אחד, עם הפעולות שלכם לאורכו.", href: "/trail" },
  { id: "ins", icon: "chart", title: "תובנות וסיכום שנה", text: "מפת חום, ערכים ומתודות, וסיפור של השנה שלכם.", href: "/insights" },
  { id: "write", icon: "pen", title: "כתיבה ושיתוף חי", text: "עורך עם שמירה אוטומטית, וטיוטות משותפות עם הערות בשוליים.", href: "/write" },
  { id: "a11y", icon: "access", title: "נוחות לכולם", text: "גודל טקסט, תנועה, ניגודיות, צבעים בטוחים והקראה, וזה עובר איתכם בין מכשירים.", href: "/comfort" },
];
