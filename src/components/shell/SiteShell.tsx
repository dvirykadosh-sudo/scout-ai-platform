"use client";

// מעטפת האתר החדשה: מחליטה מתי להציג את הסרגל והדוק, מסמנת את html (כדי שה-CSS יפנה מקום),
// ומחזיקה את חלון "הגדרות מראה". בעמודים הקיימים, בלי בחירה, לא משתנה כלום.
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { GlassSidebar } from "./GlassSidebar";
import { FloatingDock } from "./FloatingDock";
import { SettingsSheet } from "./SettingsSheet";
import { APP_PATHS } from "./nav-config";
import { setPrefs, usePrefs } from "./shell-prefs";

export function SiteShell() {
  const pathname = usePathname() || "/";
  const prefs = usePrefs();
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const active = APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || prefs.sidebar === "all";

  // סימון html: data-shell (פעיל), data-sb (פתוח/מקופל), data-dock
  useEffect(() => {
    const d = document.documentElement;
    if (active) {
      d.dataset.shell = "on";
      d.dataset.sb = prefs.collapsed ? "closed" : "open";
      d.dataset.dock = prefs.dock ? "on" : "off";
    }
    return () => {
      delete d.dataset.shell;
      delete d.dataset.sb;
      delete d.dataset.dock;
    };
  }, [active, prefs.collapsed, prefs.dock]);

  useEffect(() => setMenu(false), [pathname]);

  useEffect(() => {
    const open = () => setSheet(true);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("scout:open-appearance", open);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("scout:open-appearance", open);
      window.removeEventListener("keydown", esc);
    };
  }, []);

  const toggle = useCallback(() => setPrefs({ collapsed: !prefs.collapsed }), [prefs.collapsed]);

  return (
    <MotionConfig reducedMotion="user">
      {active && <GlassSidebar collapsed={prefs.collapsed} onToggle={toggle} open={menu} onClose={() => setMenu(false)} />}
      {active && prefs.dock && <FloatingDock onMenu={() => setMenu(true)} />}
      <SettingsSheet open={sheet} onClose={() => setSheet(false)} />
    </MotionConfig>
  );
}
