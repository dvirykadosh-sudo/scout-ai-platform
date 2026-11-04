"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { CONDITIONS } from "@/lib/constants";
import type { Activity } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

export function AdaptModal({ open, onClose, activity }: { open: boolean; onClose: () => void; activity: Activity }) {
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const [cond, setCond] = useState<string>("rain");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const copy = await api<Activity>(`/api/activities/${activity.id}/adapt`, { method: "POST", token, body: { condition: cond } });
      onClose();
      toast("נוצר עותק מותאם. הפעולה המקורית לא השתנתה", { kind: "success" });
      router.push(`/library/${copy.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="התאמה לתנאים"
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={go} disabled={busy}>
            {busy ? "יוצר..." : "יצירת עותק מותאם"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            ביטול
          </button>
        </>
      }
    >
      <p>האתר יוצר עותק של "{activity.title}" עם הערות התאמה בכל שלב, ציוד והערת בטיחות מתאימים. את ההערות אפשר לערוך אחר כך.</p>
      <Field label="מה התנאים?" htmlFor={`adapt-${activity.id}`}>
        <select id={`adapt-${activity.id}`} value={cond} onChange={(e) => setCond(e.target.value)}>
          {CONDITIONS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}
