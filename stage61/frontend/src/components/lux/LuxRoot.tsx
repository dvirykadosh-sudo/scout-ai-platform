"use client";

// שלב 61: תוספות העיצוב החדש שרצות פעם אחת בכל האתר.
import { useEffect } from "react";
import { api } from "@/lib/api";
import { COMFORT_AT, applyComfort, type Comfort } from "@/lib/lux/comfort";
import { storageGet, storageSet } from "@/lib/api";
import { useAuth } from "../Providers";
import { ReadAloud } from "./ReadAloud";
import { CursorGlow } from "./CursorGlow";
import { Mascot } from "./Mascot";
import { SheetEnhancer } from "./SheetEnhancer";
import { applyTribe, ensureTribe } from "@/lib/lux/tribe";
import { ViewTransitions } from "./ViewTransitions";

/** שעת היום (רעיון 9): data-tod על html. ה-CSS צובע לפי זה את הרקע. מתעדכן כל כמה דקות. */
export const todOf = (d = new Date()): "morning" | "day" | "evening" | "night" => {
  const h = d.getHours();
  return h < 5 || h >= 21 ? "night" : h < 11 ? "morning" : h < 17 ? "day" : "evening";
};

export function LuxRoot() {
  const { token } = useAuth();
  // אשף נוחות: כשההעדפות נשמרו בחשבון במכשיר אחר (או חדשות יותר), מחילים אותן כאן
  useEffect(() => {
    if (!token) return;
    let off = false;
    api<{ saved: boolean; prefs: Comfort; updatedAt: string | null }>("/api/lux/comfort", { token })
      .then((r) => {
        if (off || !r.saved || !r.updatedAt) return;
        const mine = storageGet(COMFORT_AT);
        if (mine && mine >= r.updatedAt) return;
        applyComfort(r.prefs);
        storageSet(COMFORT_AT, r.updatedAt);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [token]);
  useEffect(() => {
    const set = () => {
      document.documentElement.dataset.tod = todOf();
    };
    set();
    const t = window.setInterval(set, 10 * 60_000);
    const vis = () => document.visibilityState === "visible" && set();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  // צבעי הלוגו (רעיון 14): חישוב פעם אחת לגרסת לוגו, והחלה בכל החלפת ערכה
  useEffect(() => {
    void ensureTribe();
    const on = () => applyTribe();
    window.addEventListener("scout:appearance", on);
    return () => window.removeEventListener("scout:appearance", on);
  }, []);
  return (
    <>
      <ViewTransitions />
      <CursorGlow />
      <SheetEnhancer />
      <Mascot />
      <ReadAloud />
    </>
  );
}
