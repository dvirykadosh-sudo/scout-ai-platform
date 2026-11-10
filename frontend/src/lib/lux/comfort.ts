"use client";

// שלב 61 (רעיון 20): העדפות נוחות. נשמרות בדפדפן מיד, ובבקשה גם בחשבון (כדי שיעברו בין מכשירים).
// הכול משתמש באותם מפתחות אחסון ומחלקות של הפקדים הקיימים באתר, כך שחלון "הגדרות מראה" ממשיך להיות מסונכרן.
import { storageGet, storageSet } from "@/lib/api";
import { getSoundPrefs, setSoundPrefs } from "./sound";

export interface Comfort {
  fs: "100" | "115" | "130" | "150";
  motion: "full" | "calm" | "off";
  contrast: boolean;
  cvd: boolean;
  readAloud: boolean;
  rate: number;
  sound: boolean;
  haptics: boolean;
  mascot: boolean;
}
export const COMFORT_DEFAULT: Comfort = { fs: "100", motion: "full", contrast: false, cvd: false, readAloud: false, rate: 1, sound: false, haptics: true, mascot: true };
export const COMFORT_KEY = "scout.comfort"; // JSON של Comfort (fs, motion, cvd, readAloud, rate). שאר השדות במפתחות הקיימים שלהם.
export const COMFORT_AT = "scout.comfort.at"; // מתי נשמר בחשבון לאחרונה (ISO), להשוואה בין מכשירים

/** הערכים החיים: מהאחסון ומהמצב של האתר */
export function readComfort(): Comfort {
  let j: Partial<Comfort> = {};
  try {
    j = JSON.parse(storageGet(COMFORT_KEY) ?? "{}") ?? {};
  } catch {
    j = {};
  }
  const sp = getSoundPrefs();
  return {
    fs: j.fs === "115" || j.fs === "130" || j.fs === "150" ? j.fs : "100",
    motion: j.motion === "calm" || j.motion === "off" ? j.motion : "full",
    contrast: document.documentElement.classList.contains("hc"),
    cvd: !!j.cvd,
    readAloud: !!j.readAloud,
    rate: typeof j.rate === "number" ? Math.min(1.6, Math.max(0.6, j.rate)) : 1,
    sound: sp.on,
    haptics: sp.haptics,
    mascot: storageGet("scout.mascot") !== "off",
  };
}

/** מחיל על האתר ושומר בדפדפן */
export function applyComfort(c: Comfort): void {
  const d = document.documentElement;
  if (c.fs === "100") delete d.dataset.fs;
  else d.dataset.fs = c.fs;
  if (c.motion === "full") delete d.dataset.motion;
  else d.dataset.motion = c.motion;
  if (c.cvd) d.dataset.cvd = "1";
  else delete d.dataset.cvd;
  if (d.classList.contains("hc") !== c.contrast) {
    d.classList.toggle("hc", c.contrast);
    storageSet("scout.hc", c.contrast ? "1" : "0");
  }
  storageSet(COMFORT_KEY, JSON.stringify({ fs: c.fs, motion: c.motion, cvd: c.cvd, readAloud: c.readAloud, rate: c.rate }));
  setSoundPrefs({ on: c.sound, haptics: c.haptics });
  storageSet("scout.mascot", c.mascot ? "on" : "off");
  window.dispatchEvent(new Event("scout:mascot"));
  window.dispatchEvent(new Event("scout:comfort"));
  window.dispatchEvent(new Event("scout:appearance"));
}
