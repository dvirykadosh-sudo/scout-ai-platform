"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api, downloadDocx, errorMessage } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import type { Activity } from "@/lib/types";
import { EditActivityModal } from "./EditActivityModal";
import { ShareModal } from "./ShareModal";
import { useFavorites } from "@/lib/favorites";
import { isAdminUser, useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

export function ActivityActions({ activity, onChanged, onDeleted, compact = false }: { activity: Activity; onChanged: () => void; onDeleted?: () => void; compact?: boolean }) {
  const { token, user, clear } = useAuth();
  const toast = useToast();
  const router = useRouter();
  // the owner of an activity and any admin may edit/delete it (the server enforces this too)
  const canManage = !!token && !!user && !user.mustChangePw && (isAdminUser(user) || (!activity.isSeed && activity.ownerId === user.id));

  const [busy, setBusy] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [dupAge, setDupAge] = useState(activity.ageGroup);
  const [dupMin, setDupMin] = useState(String(activity.durationMin));
  const [seedOk, setSeedOk] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { isFav, toggle: toggleFav } = useFavorites();
  const fav = isFav(activity.id);

  const handleAuthError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      clear();
      toast("ההתחברות פגה. יש להתחבר שוב באזור האישי", { kind: "error" });
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
        <Link className="btn" href={`/field/${activity.id}`}>
          מצב הדרכה בשטח
        </Link>
        <button
          type="button"
          className="btn"
          aria-pressed={fav}
          onClick={() => {
            toggleFav(activity.id);
            toast(fav ? "הוסרה מהמועדפים" : "נוספה למועדפים", { kind: "info" });
          }}
        >
          <span aria-hidden="true">{fav ? "★ " : "☆ "}</span>
          {fav ? "במועדפים" : "הוספה למועדפים"}
        </button>
        <button type="button" className="btn" onClick={() => setDupOpen(true)}>
          שכפול והתאמה
        </button>
        {!compact && (
          <>
            <button type="button" className="btn" onClick={() => setShareOpen(true)}>
              שיתוף וקוד QR
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              הדפסה / שמירה כ-PDF
            </button>
          </>
        )}
        {canManage && (
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

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} activityId={activity.id} title={activity.title} />

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

      {canManage && (
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
