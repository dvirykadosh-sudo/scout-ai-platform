"use client";

// מודל "הגדרות מראה": קריאת המצב הנוכחי, השוואה (לפס השינויים הממתינים) והחלה.
// ההחלה משתמשת בפקדים הקיימים של האתר (ניגודיות, גודל טקסט, ערכת נושא) ובאותם מפתחות אחסון, כדי שהכל יישאר מסונכרן.
import { storageSet } from "@/lib/api";
import { setPrefs, type ShellPrefs, type SidebarMode } from "./shell-prefs";

export type ThemeMode = "auto" | "light" | "dark";
export type Palette = "purple" | "blue" | "green" | "fire";

export interface Appearance {
  theme: ThemeMode;
  palette: Palette;
  contrast: boolean;
  large: boolean;
  compact: boolean;
  comfy: boolean;
  saver: boolean;
  sidebar: SidebarMode;
  dock: boolean;
}

export interface A11yApi {
  theme: ThemeMode;
  highContrast: boolean;
  largeText: boolean;
  toggleContrast: () => void;
  toggleLarge: () => void;
  cycleTheme: () => void;
}

const THEME_ORDER: ThemeMode[] = ["auto", "light", "dark"];
const THEME_LABEL: Record<ThemeMode, string> = { auto: "לפי המכשיר", light: "בהירה", dark: "כהה" };
const PALETTE_LABEL: Record<Palette, string> = { purple: "סגול", blue: "כחול", green: "ירוק", fire: "מדורה" };
const onOff = (v: boolean) => (v ? "פעיל" : "כבוי");

export const THEME_CHOICES = THEME_ORDER.map((v) => [v, THEME_LABEL[v]] as const);
export const PALETTE_CHOICES = (Object.keys(PALETTE_LABEL) as Palette[]).map((v) => [v, PALETTE_LABEL[v]] as const);

/** המצב החי של האתר, כפי שהוא עכשיו */
export function readAppearance(a: Pick<A11yApi, "theme" | "highContrast" | "largeText">, prefs: ShellPrefs): Appearance {
  const d = document.documentElement;
  const p = d.dataset.palette;
  return {
    theme: a.theme,
    palette: p === "blue" || p === "green" || p === "fire" ? p : "purple",
    contrast: a.highContrast,
    large: a.largeText,
    compact: d.classList.contains("compact"),
    comfy: d.classList.contains("comfy"),
    saver: d.classList.contains("saver"),
    sidebar: prefs.sidebar,
    dock: prefs.dock,
  };
}

export interface Change {
  key: keyof Appearance;
  label: string;
  from: string;
  to: string;
}

const text = (k: keyof Appearance, v: Appearance[keyof Appearance]): string => {
  if (k === "theme") return THEME_LABEL[v as ThemeMode];
  if (k === "palette") return PALETTE_LABEL[v as Palette];
  if (k === "sidebar") return v === "all" ? "בכל האתר" : "רק בלוח הבקרה ובוואטסאפ";
  return onOff(v as boolean);
};
const LABELS: Record<keyof Appearance, string> = {
  theme: "ערכת נושא",
  palette: "צבעי האתר",
  contrast: "ניגודיות גבוהה",
  large: "הגדלת טקסט",
  compact: "תצוגה קומפקטית",
  comfy: "קריאה נוחה",
  saver: "חיסכון בנתונים ובאנימציות",
  sidebar: "סרגל צד",
  dock: "דוק צף",
};

/** כל מה ששונה בין השמור לטיוטה (לפס "שינויים ממתינים" ולסקירה) */
export function diffAppearance(saved: Appearance, draft: Appearance): Change[] {
  return (Object.keys(LABELS) as (keyof Appearance)[])
    .filter((k) => saved[k] !== draft[k])
    .map((k) => ({ key: k, label: LABELS[k], from: text(k, saved[k]), to: text(k, draft[k]) }));
}

const flag = (cls: string, key: string, on: boolean) => {
  document.documentElement.classList.toggle(cls, on);
  storageSet(key, on ? "1" : "0");
};

/** מחיל את הטיוטה. מה שכבר זהה לא נוגעים בו. */
export function applyAppearance(next: Appearance, cur: Appearance, a: A11yApi): void {
  const steps = (THEME_ORDER.indexOf(next.theme) - THEME_ORDER.indexOf(cur.theme) + 3) % 3;
  for (let i = 0; i < steps; i++) a.cycleTheme();
  if (next.contrast !== cur.contrast) a.toggleContrast();
  if (next.large !== cur.large) a.toggleLarge();
  if (next.compact !== cur.compact) flag("compact", "scout.compact", next.compact);
  if (next.comfy !== cur.comfy) flag("comfy", "scout.comfy", next.comfy);
  if (next.saver !== cur.saver) flag("saver", "scout.saver", next.saver);
  if (next.palette !== cur.palette) {
    document.documentElement.dataset.palette = next.palette;
    storageSet("scout.palette", next.palette);
  }
  if (next.sidebar !== cur.sidebar || next.dock !== cur.dock) setPrefs({ sidebar: next.sidebar, dock: next.dock });
  window.dispatchEvent(new Event("scout:appearance")); // מעדכן את הכפתורים שבראש האתר
}
