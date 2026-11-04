"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

/** On an activity: a similar one, an upgrade to a peak activity, and a shortened version. Each makes a copy. */
export function KindTools({ activity }: { activity: Activity }) {
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const [busy, setBusy] = useState("");
  const [shortOpen, setShortOpen] = useState(false);
  const [minutes, setMinutes] = useState("20");

  const act = async (key: string, path: string, body: unknown, ok: string) => {
    setBusy(key);
    try {
      const copy = await api<Activity>(`/api/activities/${activity.id}/${path}`, { method: "POST", token, body });
      setShortOpen(false);
      toast(ok, { kind: "success" });
      router.push(`/library/${copy.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
      setBusy("");
    }
  };

  return (
    <>
      <button type="button" className="btn" disabled={!!busy} onClick={() => act("similar", "similar", {}, "נוצרה פעולה דומה בנושא אחר")}>
        {busy === "similar" ? "יוצר..." : "פעולה כמו זו"}
      </button>
      {activity.kind !== "peak" && (
        <button type="button" className="btn" disabled={!!busy} onClick={() => act("peak", "upgrade-peak", {}, "נוצר עותק בגרסת שיא. המקור לא השתנה")}>
          {busy === "peak" ? "משדרג..." : "הפוך לפעולת שיא"}
        </button>
      )}
      {activity.durationMin > 15 && (
        <button type="button" className="btn" disabled={!!busy} onClick={() => setShortOpen(true)}>
          גרסה מקוצרת
        </button>
      )}
      <Modal
        open={shortOpen}
        onClose={() => setShortOpen(false)}
        title="גרסה מקוצרת"
        footer={
          <>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => act("short", "shorten", { minutes: Number(minutes) }, "נוצרה גרסה מקוצרת. המקור לא השתנה")}>
              {busy === "short" ? "מקצר..." : "יצירת גרסה מקוצרת"}
            </button>
            <button type="button" className="btn" onClick={() => setShortOpen(false)}>
              ביטול
            </button>
          </>
        }
      >
        <p>יוצר עותק של "{activity.title}" שנשאר בו רק הליבה של כל שלב, עם זמנים חדשים. הפעולה המקורית לא משתנה.</p>
        <Field label="כמה דקות?" htmlFor={`short-${activity.id}`}>
          <select id={`short-${activity.id}`} value={minutes} onChange={(e) => setMinutes(e.target.value)}>
            {["15", "20", "30", "45"].filter((m) => Number(m) < activity.durationMin).map((m) => (
              <option key={m} value={m}>
                {m} דקות
              </option>
            ))}
          </select>
        </Field>
      </Modal>
    </>
  );
}
