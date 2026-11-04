"use client";

// מונים לסרגל: התראות שלא נקראו, ופריטים שממתינים בתור הוואטסאפ (למנהל בלבד). רענון כל דקה, ורק כשהלשונית גלויה.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isAdminUser, useAuth } from "../Providers";

export interface Badges {
  notifications: number;
  whatsapp: number;
}

export function useBadges(): Badges {
  const { token, user, ready } = useAuth();
  const [b, setB] = useState<Badges>({ notifications: 0, whatsapp: 0 });
  const admin = isAdminUser(user);

  useEffect(() => {
    if (!ready || !token) {
      setB({ notifications: 0, whatsapp: 0 });
      return;
    }
    let live = true;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      const [n, w] = await Promise.all([
        api<{ unread: number }>("/api/me/notifications", { token }).then((r) => r.unread, () => 0),
        admin ? api<{ queue: { queued: number } }>("/api/admin/wa/status", { token }).then((r) => r.queue.queued, () => 0) : Promise.resolve(0),
      ]);
      if (live) setB({ notifications: n, whatsapp: w });
    };
    void load();
    const t = window.setInterval(load, 60_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [ready, token, admin]);

  return b;
}
