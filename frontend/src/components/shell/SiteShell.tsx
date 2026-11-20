"use client";

// מעטפת האתר: הסרגל הזכוכיתי והדוק בכל העמודים, סימון html (כדי שה-CSS יפנה להם מקום),
// והחזקת חלון "הגדרות מראה".
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LazyMotion, MotionConfig } from "framer-motion";
import { GlassSidebar } from "./GlassSidebar";
import { FloatingDock } from "./FloatingDock";
import { SettingsSheet } from "./SettingsSheet";
import { setPrefs, usePrefs } from "./shell-prefs";

// שלב 72: אנימציות ה-hover של הסרגל והדוק נטענות בנפרד אחרי העמוד (LazyMotion), כדי שחבילת העיצוב המלאה של framer-motion לא תכביד על כל עמוד.
const loadMotionFeatures = () => import("./motion-features").then((mod) => mod.default);

export function SiteShell() {
  const pathname = usePathname() || "/";
  const prefs = usePrefs();
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  // שלב 59: הסרגל והדוק פעילים בכל עמודי האתר (העיצוב האחיד החדש)
  const active = true;

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
    <LazyMotion features={loadMotionFeatures}>
    <MotionConfig reducedMotion="user">
      {active && <GlassSidebar collapsed={prefs.collapsed} onToggle={toggle} open={menu} onClose={() => setMenu(false)} />}
      {active && prefs.dock && <FloatingDock onMenu={() => setMenu(true)} />}
      <SettingsSheet open={sheet} onClose={() => setSheet(false)} />
    </MotionConfig>
    </LazyMotion>
  );
}
