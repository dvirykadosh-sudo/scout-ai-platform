"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { KIND_LABELS } from "@/lib/kinds";
import type { Activity } from "@/lib/types";
import { useAuth, useToast } from "./Providers";

interface Action {
  type: string;
  label: string;
  minutes?: number;
  condition?: string;
  category?: string;
}
interface Suggestion {
  tip: string;
  action: Action;
}

/** Improvement ideas based on the instructor's latest log entry for this activity, and what has worked for them overall. */
export function RunSuggestions({ activityId, refreshKey }: { activityId: number; refreshKey: number }) {
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [learned, setLearned] = useState<{ best: { kind: string; count: number; avg: number } | null } | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    api<{ items: Suggestion[] }>(`/api/activities/${activityId}/run-suggestions`, { token })
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
    api<{ best: { kind: string; count: number; avg: number } | null }>("/api/me/learned", { token })
      .then(setLearned)
      .catch(() => setLearned(null));
  }, [token, activityId]);
  useEffect(load, [load, refreshKey]);

  const run = async (s: Suggestion) => {
    const a = s.action;
    const key = `${a.type}:${a.condition ?? a.minutes ?? ""}`;
    const call = (path: string, body: unknown) => api<Activity>(`/api/activities/${activityId}/${path}`, { method: "POST", token, body });
    try {
      if (a.type === "questions") {
        const el = document.getElementById("questions") as HTMLDetailsElement | null;
        if (el) {
          el.open = true;
          el.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }
      setBusy(key);
      let copy: Activity | null = null;
      if (a.type === "shorten") copy = await call("shorten", { minutes: a.minutes });
      else if (a.type === "adapt") copy = await call("adapt", { condition: a.condition });
      else if (a.type === "upgrade-peak") copy = await call("upgrade-peak", {});
      if (copy) {
        toast("נוצר עותק. המקור לא השתנה", { kind: "success" });
        router.push(`/library/${copy.id}`);
      }
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
      setBusy("");
    }
  };

  const best = learned?.best;
  if (!items.length && !best) return null;
  return (
    <div className="run-suggestions" role="region" aria-label="הצעות לשיפור">
      {items.length > 0 && (
        <>
          <h3 className="sub-title">הצעות לשיפור לפי הרישום האחרון</h3>
          <ul className="plain-list">
            {items.map((s) => (
              <li key={`${s.action.type}:${s.action.condition ?? s.action.minutes ?? s.action.category ?? ""}`}>
                <span>{s.tip}</span>
                {s.action.type === "warmups" ? (
                  <Link className="btn btn-small" href="/warmups">
                    {s.action.label}
                  </Link>
                ) : (
                  <button type="button" className="btn btn-small" disabled={!!busy} onClick={() => run(s)}>
                    {s.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {best && (
        <p className="hint">
          מה עבד אצלך: בהפעלות שדירגתם, {KIND_LABELS[best.kind] ?? best.kind} קיבלו את ההשתתפות הכי גבוהה ({best.count} הפעלות).
        </p>
      )}
    </div>
  );
}
