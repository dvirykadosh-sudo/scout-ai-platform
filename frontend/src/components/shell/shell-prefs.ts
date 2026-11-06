"use client";

// העדפות המעטפת (נשמרות במכשיר בלבד): איפה להציג את הסרגל, האם הוא מקופל, והאם יש דוק.
import { useSyncExternalStore } from "react";

export type SidebarMode = "app" | "all";
export interface ShellPrefs {
  sidebar: SidebarMode;
  collapsed: boolean;
  dock: boolean;
}

const KEY = "scout.shell";
const DEFAULTS: ShellPrefs = { sidebar: "app", collapsed: false, dock: true };
const listeners = new Set<() => void>();
let cache: ShellPrefs | null = null;

function read(): ShellPrefs {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return { sidebar: v.sidebar === "all" ? "all" : "app", collapsed: v.collapsed === true, dock: v.dock !== false };
  } catch {
    return { ...DEFAULTS };
  }
}

export const getPrefs = (): ShellPrefs => (cache ??= read());

export function setPrefs(patch: Partial<ShellPrefs>): void {
  cache = { ...getPrefs(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* אחסון לא זמין: ההעדפה חיה עד סגירת הלשונית */
  }
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export const usePrefs = (): ShellPrefs => useSyncExternalStore(subscribe, getPrefs, () => DEFAULTS);

/** פותח את חלון "הגדרות מראה" מכל מקום */
export const openAppearance = () => window.dispatchEvent(new Event("scout:open-appearance"));
