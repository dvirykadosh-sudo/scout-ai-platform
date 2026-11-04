// פריטי הסרגל והדוק. הפריט הראשון תמיד מוביל ללוח הבקרה.
import { BookOpen, Bot, CalendarDays, CalendarRange, LayoutDashboard, MessageCircle, MessagesSquare, PenLine, Shapes, ShieldCheck, Sparkles, UserRound, Wrench, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
  /** מוצג רק למנהל מחובר */
  adminOnly?: boolean;
  /** איזה מונה להציג על הפריט */
  badge?: "notifications" | "whatsapp";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "הלוח שלי", icon: LayoutDashboard, group: "ראשי" },
  { href: "/", label: "יצירת פעולה חכמה", icon: Sparkles, group: "ראשי" },
  { href: "/write", label: "פעולה חדשה משלי", icon: PenLine, group: "יצירה" },
  { href: "/assistant", label: "עוזר כתיבה", icon: Bot, group: "יצירה" },
  { href: "/library", label: "מאגר פעולות קיים", icon: BookOpen, group: "מאגר" },
  { href: "/types", label: "סוגי פעולות", icon: Shapes, group: "מאגר" },
  { href: "/tools", label: "כלים ורעיונות", icon: Wrench, group: "מאגר" },
  { href: "/methods", label: "ספריית המתודות", icon: BookOpen, group: "מאגר" },
  { href: "/plan", label: "תכנון תקופתי", icon: CalendarRange, group: "תכנון" },
  { href: "/calendar", label: "יומן הפעולות", icon: CalendarDays, group: "תכנון" },
  { href: "/chat", label: "עוזר שיחות", icon: MessagesSquare, group: "תכנון" },
  { href: "/whatsapp", label: "מרכז וואטסאפ", icon: MessageCircle, group: "ניהול", adminOnly: true, badge: "whatsapp" },
  { href: "/admin", label: "לוח בקרה לאדמין", icon: ShieldCheck, group: "ניהול", adminOnly: true },
  { href: "/account", label: "האזור האישי", icon: UserRound, group: "חשבון", badge: "notifications" },
];

/** נתיבים שבהם הסרגל מוצג תמיד, גם בלי לבחור "בכל האתר" */
export const APP_PATHS = ["/dashboard", "/whatsapp"];

export const isActivePath = (pathname: string, href: string): boolean => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
