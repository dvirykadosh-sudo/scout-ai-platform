"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface Brief {
  id: number;
  title: string;
  durationMin: number;
  ageGroup: string;
  leadingValue: string;
  equipment: string;
  kind: string | null;
  energeticMode: boolean;
  gear: number;
  reasons?: string[];
  exactAge?: boolean;
  missing?: string[];
  optionalMissing?: string[];
  ready?: boolean;
}

export interface Collaborator {
  id: number;
  username: string;
  displayName: string;
  addedBy: string | null;
  addedAt: string;
}

export interface Access {
  canEdit: boolean;
  canDelete: boolean;
  isOwner: boolean;
  isCollaborator: boolean;
  collaborators: Collaborator[];
  lastEditor: { name: string; at: string } | null;
}

export interface ScheduleItem {
  id: number;
  activityId: number | null;
  title: string;
  date: string;
  time: string;
  durationMin: number | null;
  groupLabel: string;
  note: string;
  remindDays: number | null;
  dismissed: boolean;
}

export interface Reminder {
  id: number;
  type: "prep" | "log";
  activityId: number | null;
  title: string;
  date: string;
  time: string;
  daysLeft: number;
  gear: string[];
  message: string;
}

/** התאריך המקומי של המכשיר, בפורמט YYYY-MM-DD. */
export const todayLocal = (): string => new Date().toLocaleDateString("en-CA");

export const addDaysIso = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};

export const fmtDay = (iso: string): string => new Date(`${iso}T12:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });

/** מה מותר למשתמש המחובר לעשות בפעולה (בעלים, שותף לעריכה, אדמין). */
export function useAccess(activityId: number, token: string | null) {
  const [access, setAccess] = useState<Access | null>(null);
  const reload = useCallback(() => {
    if (!token) {
      setAccess(null);
      return;
    }
    api<Access>(`/api/activities/${activityId}/access`, { token })
      .then(setAccess)
      .catch(() => setAccess(null));
  }, [activityId, token]);
  useEffect(reload, [reload]);
  return { access, reload };
}
