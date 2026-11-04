"use client";

// דוק צף בתחתית המסך (במרכז): קיצורים מהירים עם קפיצה במעבר עכבר. במובייל כולל כפתור לפתיחת התפריט.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, LayoutDashboard, Library, Menu, Palette, Sparkles } from "lucide-react";
import { isActivePath } from "./nav-config";
import { openAppearance } from "./shell-prefs";

const LINKS = [
  { href: "/dashboard", label: "הלוח שלי", icon: LayoutDashboard },
  { href: "/", label: "פעולה חכמה", icon: Sparkles },
  { href: "/library", label: "מאגר פעולות", icon: Library },
  { href: "/calendar", label: "יומן", icon: CalendarDays },
];
const hover = { y: -8, scale: 1.12 };
const spring = { type: "spring" as const, stiffness: 320, damping: 18 };

export function FloatingDock({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname() || "/";
  return (
    <nav className="sh-dock no-print" aria-label="קיצורי דרך">
      {LINKS.map((l) => {
        const Icon = l.icon;
        return (
          <motion.div key={l.href} whileHover={hover} transition={spring}>
            <Link href={l.href} className="sh-dock-btn" data-tip={l.label} aria-label={l.label} aria-current={isActivePath(pathname, l.href) ? "page" : undefined}>
              <Icon size={22} aria-hidden="true" />
            </Link>
          </motion.div>
        );
      })}
      <span className="sh-dock-sep" aria-hidden="true" />
      <motion.div whileHover={hover} transition={spring}>
        <button type="button" className="sh-dock-btn" data-tip="הגדרות מראה" aria-label="הגדרות מראה" onClick={openAppearance}>
          <Palette size={22} aria-hidden="true" />
        </button>
      </motion.div>
      <motion.div className="sh-dock-menu" whileHover={hover} transition={spring}>
        <button type="button" className="sh-dock-btn" data-tip="תפריט" aria-label="פתיחת התפריט" onClick={onMenu}>
          <Menu size={22} aria-hidden="true" />
        </button>
      </motion.div>
    </nav>
  );
}
