"use client";

// סרגל צד מזכוכית (בימין): פרופיל, ניווט עם קפסולות זוהרות ומוני התראות, וכפתור קיפול 80 ↔ 280 פיקסל.
// במובייל הוא מגירה שנפתחת מהדוק.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, LogOut, Palette } from "lucide-react";
import { isAdminUser, useAuth } from "../Providers";
import { SidebarProfile } from "./SidebarProfile";
import { NAV_ITEMS, isActivePath } from "./nav-config";
import { openAppearance } from "./shell-prefs";
import { useBadges } from "./useBadges";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  open: boolean;
  onClose: () => void;
}

export function GlassSidebar({ collapsed, onToggle, open, onClose }: Props) {
  const pathname = usePathname() || "/";
  const { user, clear } = useAuth();
  const badges = useBadges();
  const admin = isAdminUser(user);
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || admin);
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <>
      <button type="button" className={`sh-scrim ${open ? "is-open" : ""}`} aria-label="סגירת התפריט" tabIndex={open ? 0 : -1} onClick={onClose} />
      <aside className={`sh-sidebar tw:backdrop-blur-2xl no-print ${open ? "is-open" : ""}`} data-collapsed={collapsed} aria-label="סרגל צד">
        <div className="sh-top">
          <span className="sh-brand">שבט מעוז</span>
          <button type="button" className="sh-collapse" aria-expanded={!collapsed} aria-label={collapsed ? "הרחבת הסרגל" : "קיפול הסרגל"} onClick={onToggle}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        </div>

        <SidebarProfile />

        <nav className="sh-nav" aria-label="ניווט צד">
          {groups.map((g) => (
            <div key={g}>
              <p className="sh-group">{g}</p>
              <ul>
                {items.filter((i) => i.group === g).map((i) => {
                  const Icon = i.icon;
                  const count = i.badge ? badges[i.badge] : 0;
                  return (
                    <motion.li key={i.href} whileHover={{ x: -4 }} transition={{ type: "spring", stiffness: 380, damping: 24 }}>
                      <Link href={i.href} className="sh-item" aria-current={isActivePath(pathname, i.href) ? "page" : undefined} title={collapsed ? i.label : undefined} onClick={onClose}>
                        <Icon size={20} aria-hidden="true" />
                        <span className="sh-label">{i.label}</span>
                        {count > 0 && (
                          <>
                            <span className="sh-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>
                            <span className="sh-only-sr"> ({count} חדשים)</span>
                          </>
                        )}
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sh-foot">
          <button type="button" className="sh-item" onClick={() => { onClose(); openAppearance(); }}>
            <Palette size={20} aria-hidden="true" />
            <span className="sh-label">הגדרות מראה</span>
          </button>
          {user && (
            <button type="button" className="sh-item" onClick={clear}>
              <LogOut size={20} aria-hidden="true" />
              <span className="sh-label">התנתקות</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
