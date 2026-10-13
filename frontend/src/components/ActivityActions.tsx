"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api, downloadDocx, errorMessage } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import type { Activity } from "@/lib/types";
import { EditActivityModal } from "./EditActivityModal";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

export function ActivityActions({ activity, onChanged, onDeleted }: { activity: Activity; onChanged: () => void; onDeleted?: () => void }) {
  const { token, user, clear } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const isAdmin = !!token && !!user && !user.mustChangePw;

  const [busy, setBusy] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [dupAge, setDupAge] = useState(activity.ageGroup);
  const [dupMin, setDupMin] = useState(String(activity.durationMin));
  const [seedOk, setSeedOk] = useState(false);

  const handleAuthError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      clear();
      toast("ההתחברות פגה. יש להתחבר שוב בלוח הבקרה", { kind: "error" });
      return true;
    }
    if (e instanceof ApiError && e.code === "MUST_CHANGE_PASSWORD") {
      toast("יש להחליף סיסמה לפני המשך", { kind: "error" });
      router.push("/admin");
      return true;
    }
    return false;
  };

  const exportWord = async () => {
    setBusy(true);
    try {
      await downloadDocx(activity.id, activity.title);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  const duplicate = async () => {
    const minutes = Number(dupMin);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 180) {
      toast("משך הפעולה חייב להיות בין 5 ל-180 דקות", { kind: "error" });
      return;
    }
    setBusy(true);
    try {
      const copy = await api<Activity>(`/api/activities/${activity.id}/duplicate`, {
        method: "POST",
        token,
        body: { ageGroup: dupAge, durationMin: minutes },
      });
      setDupOpen(false);
      toast("הפעולה שוכפלה", { kind: "success" });
      router.push(`/library/${copy.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/activities/${activity.id}${activity.isSeed ? "?confirm=yes" : ""}`, { method: "DELETE", token });
      setDelOpen(false);
      onDeleted?.();
      toast(`"${activity.title}" נמחקה`, {
        kind: "success",
        action: {
          label: "ביטול",
          onClick: () => {
            api(`/api/activities/${activity.id}/restore`, { method: "POST", token })
              .then(() => {
                toast("הפעולה שוחזרה", { kind: "success" });
                onChanged();
              })
              .catch((e) => toast(errorMessage(e), { kind: "error" }));
          },
        },
      });
      onChanged();
    } catch (e) {
      if (!handleAuthError(e)) toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <>
      <div className="actions" role="group" aria-label={`פעולות עבור ${activity.title}`}>
        <button type="button" className="btn btn-primary" onClick={exportWord} disabled={busy}>
          ייצוא ל-Word
        </button>
        <button type="button" className="btn" onClick={() => setDupOpen(true)}>
          שכפול והתאמה
        </button>
        {isAdmin && (
          <>
            <button type="button" className="btn" onClick={() => setEditOpen(true)}>
              עריכה
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setDelOpen(true)}>
              מחיקה
            </button>
          </>
        )}
      </div>

      <Modal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title="שכפול והתאמה"
        footer={
          <>
            <button type="button" className="btn btn-primary" onClick={duplicate} disabled={busy}>
              צור עותק
            </button>
            <button type="button" className="btn" onClick={() => setDupOpen(false)}>
              ביטול
            </button>
          </>
        }
      >
        <p>יוצר עותק של "{activity.title}" עם שכבת גיל ומשך חדשים. זמני השלבים יותאמו אוטומטית.</p>
        <Field label="שכבת גיל" htmlFor={`dup-age-${activity.id}`}>
          <select id={`dup-age-${activity.id}`} value={dupAge} onChange={(e) => setDupAge(e.target.value)}>
            {AGE_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="משך בדקות" htmlFor={`dup-min-${activity.id}`} hint="בין 5 ל-180">
          <input id={`dup-min-${activity.id}`} type="number" min={5} max={180} value={dupMin} onChange={(e) => setDupMin(e.target.value)} />
        </Field>
      </Modal>

      {isAdmin && (
        <EditActivityModal
          open={editOpen}
          activity={activity}
          token={token}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            toast("הפעולה נשמרה", { kind: "success" });
            onChanged();
          }}
          onAuthError={handleAuthError}
        />
      )}

      <Modal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="מחיקת פעולה"
        footer={
          <>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy || (activity.isSeed && !seedOk)}>
              מחק
            </button>
            <button type="button" className="btn" onClick={() => setDelOpen(false)}>
              ביטול
            </button>
          </>
        }
      >
        <p>
          למחוק את "<strong>{activity.title}</strong>"? אחרי המחיקה יופיע כפתור ביטול למשך כמה שניות.
        </p>
        {activity.isSeed && (
          <label className="check">
            <input type="checkbox" checked={seedOk} onChange={(e) => setSeedOk(e.target.checked)} />
            <span>זו פעולה מובנית של המערכת. אני מבין/ה ורוצה למחוק אותה.</span>
          </label>
        )}
      </Modal>
    </>
  );
}
