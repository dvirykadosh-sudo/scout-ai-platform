"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { Activity } from "./types";

export interface KindInfo {
  id: string;
  label: string;
  short: string;
  what: string;
  when: string;
  structure: string[];
  example: string;
  minutes: number;
  methods: { name: string; minutes: number }[];
  energetic: boolean;
  scouting: boolean;
}

export { KIND_LABELS } from "./kind-labels";

let cache: Promise<KindInfo[]> | null = null;
const loadKinds = () => (cache ??= api<KindInfo[]>("/api/kinds").catch((e) => {
  cache = null;
  throw e;
}));

/** The seven activity kinds, loaded once per page load. */
export function useKinds(): KindInfo[] {
  const [kinds, setKinds] = useState<KindInfo[]>([]);
  useEffect(() => {
    let live = true;
    loadKinds()
      .then((k) => live && setKinds(k))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return kinds;
}

export interface QuickBody {
  topic?: string;
  value?: string;
  kind?: string;
  ageGroup?: string;
  minutes?: number;
  instructor?: string;
  seedText?: string;
  surprise?: boolean;
}

export const quickCreate = (token: string | null, body: QuickBody) => api<Activity>("/api/activities/quick", { method: "POST", token, body });
