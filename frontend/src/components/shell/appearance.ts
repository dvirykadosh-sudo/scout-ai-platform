"use client";

// מודל "הגדרות מראה": קריאת המצב הנוכחי, השוואה (לפס השינויים הממתינים) והחלה.
// ההחלה משתמשת בפקדים הקיימים של האתר (ניגודיות, גודל טקסט, ערכת נושא) ובאותם מפתחות אחסון, כדי שהכל יישאר מסונכרן.
import { storageSet } from "@/lib/api";
import { setPrefs, type ShellPrefs } from "./shell-prefs";

export type ThemeMode = "auto" | "light" | "dark";
export type Palette = "purple" | "blue" | "green" | "fire"; // "purple" הוא שם פנימי של ברירת המחדל (כתום)
export type Panel = "light" | "dark";

export interface Appearance {
  theme: ThemeMode;
  palette: Palette;
  panel: Panel;
  contrast: boolean;
  large: boolean;
  compact: boolean;
  comfy: boolean;
  saver: boolean;
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
const PALETTE_LABEL: Record<Palette, string> = { purple: "כתום", blue: "כחול", green: "ירוק", fire: "אדום" };
const PANEL_LABEL: Record<Panel, string> = { light: "בהיר", dark: "כהה" };
const onOff = (v: boolean) => (v ? "פעיל" : "כבוי");

export const THEME_CHOICES = THEME_ORDER.map((v) => [v, THEME_LABEL[v]] as const);
export const PANEL_CHOICES = (Object.keys(PANEL_LABEL) as Panel[]).map((v) => [v, PANEL_LABEL[v]] as const);
export const PALETTE_CHOICES = (Object.keys(PALETTE_LABEL) as Palette[]).map((v) => [v, PALETTE_LABEL[v]] as const);

/** המצב החי של האתר, כפי שהוא עכשיו */
export function readAppearance(a: Pick<A11yApi, "theme" | "highContrast" | "largeText">, prefs: ShellPrefs): Appearance {
  const d = document.documentElement;
  const p = d.dataset.palette;
  return {
    theme: a.theme,
    palette: p === "blue" || p === "green" || p === "fire" ? p : "purple",
    panel: d.dataset.panel === "dark" ? "dark" : "light",
    contrast: a.highContrast,
    large: a.largeText,
    compact: d.classList.contains("compact"),
    comfy: d.classList.contains("comfy"),
    saver: d.classList.contains("saver"),
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
  if (k === "panel") return PANEL_LABEL[v as Panel];
  return onOff(v as boolean);
};
const LABELS: Record<keyof Appearance, string> = {
  theme: "ערכת נושא",
  palette: "צבעי האתר",
  panel: "משטח התוכן",
  contrast: "ניגודיות גבוהה",
  large: "הגדלת טקסט",
  compact: "תצוגה קומפקטית",
  comfy: "קריאה נוחה",
  saver: "חיסכון בנתונים ובאנימציות",
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
  if (next.panel !== cur.panel) {
    if (next.panel === "dark") document.documentElement.dataset.panel = "dark";
    else delete document.documentElement.dataset.panel;
    storageSet("scout.panel", next.panel);
  }
  if (next.dock !== cur.dock) setPrefs({ dock: next.dock });
  window.dispatchEvent(new Event("scout:appearance")); // מעדכן את הכפתורים שבראש האתר
}
