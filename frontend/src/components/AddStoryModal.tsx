"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { STAGE_NAMES } from "@/lib/constants";
import type { Activity } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import type { Story } from "./StoriesPage";
import { Field, Modal } from "./ui";

/** Adds one of the library stories to a chosen stage of the activity (a version is saved first). */
export function AddStoryModal({ open, onClose, activity, onChanged }: { open: boolean; onClose: () => void; activity: Activity; onChanged: () => void }) {
  const toast = useToast();
  const { token } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [storyId, setStoryId] = useState("");
  const [stage, setStage] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<Story[]>(`/api/stories?value=${encodeURIComponent(activity.leadingValue)}`)
      .then((s) => {
        setStories(s);
        setStoryId((cur) => (s.some((x) => x.id === cur) ? cur : (s[0]?.id ?? "")));
      })
      .catch(() => setStories([]));
  }, [open, activity.leadingValue]);

  const chosen = stories.find((s) => s.id === storyId);
  const go = async () => {
    setBusy(true);
    try {
      await api(`/api/activities/${activity.id}/add-story`, { method: "POST", token, body: { storyId, stage: Number(stage) } });
      toast("הסיפור נוסף. אפשר לחזור לגרסה הקודמת בהיסטוריית גרסאות", { kind: "success" });
      onClose();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="הוספת סיפור לפעולה"
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={go} disabled={busy || !storyId}>
            {busy ? "מוסיף..." : "הוספה לשלב"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            ביטול
          </button>
        </>
      }
    >
      <p>הסיפורים מסודרים לפי הערך של הפעולה ("{activity.leadingValue}"). הסיפור יתווסף בסוף השלב שתבחרו.</p>
      <Field label="סיפור" htmlFor={`story-${activity.id}`}>
        <select id={`story-${activity.id}`} value={storyId} onChange={(e) => setStoryId(e.target.value)}>
          {stories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.value})
            </option>
          ))}
        </select>
      </Field>
      {chosen && <p className="hint">{chosen.text}</p>}
      <Field label="באיזה שלב" htmlFor={`story-stage-${activity.id}`}>
        <select id={`story-stage-${activity.id}`} value={stage} onChange={(e) => setStage(e.target.value)}>
          {activity.stages.map((s, i) => (
            <option key={i} value={i}>
              {i + 1}. {s.name || STAGE_NAMES[i]}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}
