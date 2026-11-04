"use client";

import { useEffect, useState } from "react";

/** Registers the service worker (production only) and tells the user when the connection drops. */
export function PwaSupport() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="offline-banner no-print" role="status">
      אין חיבור לאינטרנט. פעולות ששמרתם למכשיר עדיין עובדות.
    </div>
  );
}
