"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";
import { useToast } from "./Providers";

/** Fetches everything the field mode needs so it works with no signal. The service worker keeps the responses. */
export function OfflineButton({ activityId }: { activityId: number }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const save = async () => {
    if (!("serviceWorker" in navigator)) {
      toast("הדפדפן הזה לא תומך בעבודה בלי קליטה", { kind: "error" });
      return;
    }
    setState("busy");
    try {
      await navigator.serviceWorker.ready;
      const urls = [`${API_URL}/api/activities/${activityId}`, `${API_URL}/api/meta`, `/field/${activityId}`, `/library/${activityId}`];
      const assets = new Set<string>();
      for (const u of urls) {
        const r = await fetch(u);
        if (!r.ok) continue;
        if (u.startsWith("/")) {
          const html = await r.text();
          for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)]+/g)) assets.add(m[0]);
        }
      }
      await Promise.all([...assets].map((a) => fetch(a).catch(() => null)));
      setState("done");
      toast("הפעולה נשמרה למכשיר ותעבוד גם בלי קליטה", { kind: "success" });
    } catch {
      setState("idle");
      toast("השמירה נכשלה. בדקו חיבור ונסו שוב", { kind: "error" });
    }
  };

  return (
    <button type="button" className="btn" onClick={save} disabled={state === "busy"}>
      {state === "busy" ? "שומר למכשיר..." : state === "done" ? "נשמר למכשיר ✓" : "שמירה לשימוש בלי קליטה"}
    </button>
  );
}
