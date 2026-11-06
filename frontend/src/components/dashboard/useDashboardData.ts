"use client";

// טעינת נתוני הדשבורד מה-API הקיים. כל בקשה בנפרד: אם אחת נכשלת, השאר עדיין מוצגות.
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Reminder, ScheduleItem } from "@/lib/organizer";
import type { TeamEvent } from "./dash-calc";
import { addDays, todayIso } from "./dates";

export interface DashData {
  today: string;
  schedule: ScheduleItem[];
  team: TeamEvent[];
  reminders: Reminder[];
  unread: number;
  activities: number;
}

const count = (x: unknown): number => {
  if (Array.isArray(x)) return x.length;
  const o = x as { total?: number; items?: unknown[] } | null;
  return typeof o?.total === "number" ? o.total : Array.isArray(o?.items) ? o.items.length : 0;
};

export function useDashboardData(token: string | null) {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const today = todayIso();
    const get = <T,>(p: string) => api<T>(p, { token });
    const [sch, team, rem, nt, acts] = await Promise.allSettled([
      get<ScheduleItem[]>(`/api/me/schedule?from=${addDays(today, -45)}&to=${addDays(today, 120)}`),
      get<TeamEvent[]>("/api/team/events"),
      get<{ items: Reminder[] }>("/api/me/reminders"),
      get<{ unread: number }>("/api/me/notifications"),
      get<unknown>("/api/me/activities"),
    ]);
    setError(sch.status === "rejected" ? errorMessage(sch.reason) : "");
    setData({
      today,
      schedule: sch.status === "fulfilled" ? sch.value : [],
      team: team.status === "fulfilled" ? team.value : [],
      reminders: rem.status === "fulfilled" ? rem.value.items : [],
      unread: nt.status === "fulfilled" ? nt.value.unread : 0,
      activities: acts.status === "fulfilled" ? count(acts.value) : 0,
    });
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
