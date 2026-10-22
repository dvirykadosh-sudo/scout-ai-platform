"use client";

// חלקים משותפים לכלי עוזר הכתיבה.
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";

export type ToolId = "swap" | "inspire" | "templates" | "gear" | "script" | "schedule" | "share" | "reflect" | "group" | "style" | "inclusion" | "parents" | "history" | "board" | "stations" | "booklet" | "growth";
export interface ToolRequest {
  id: ToolId;
  method?: string;
}
export interface Profile {
  name: string;
  size: number | null;
  traits: string[];
}

export interface ToolsProps {
  valueText: string;
  score: number | null;
  tool: ToolRequest | null;
  onClose: () => void;
  text: string;
  setText: (s: string) => void;
  append: (s: string) => void;
  edit: (fn: (cur: string) => string) => void;
  title: string;
  ageGroup: string;
  cloudId: number | null;
  setCloudId: (n: number | null) => void;
  activityId: number | null;
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
}


export const todayPlus = (d: number) => {
  const t = new Date(Date.now() + d * 86400000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};


export function useJson<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    load()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, setData };
}

export const CloseBtn = ({ onClose, label = "סגירה" }: { onClose: () => void; label?: string }) => (
  <button type="button" className="btn" onClick={onClose}>
    {label}
  </button>
);

