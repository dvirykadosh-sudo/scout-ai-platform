"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api, downloadDocx, errorMessage } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import type { Activity } from "@/lib/types";
import { EditActivityModal } from "./EditActivityModal";
import { AdaptModal } from "./AdaptModal";
import { CollectionModal } from "./CollectionModal";
import { AddStoryModal } from "./AddStoryModal";
import { KindTools } from "./KindTools";
import { CollaboratorsModal } from "./CollaboratorsModal";
import { ScheduleModal } from "./ScheduleModal";
import { FlagButton } from "./CareParts";
import { WhatsAppModal } from "./WhatsAppModal";
import { useAccess } from "@/lib/organizer";
import { OfflineButton } from "./OfflineButton";
import { ShareModal } from "./ShareModal";
import { VersionsModal } from "./VersionsModal";
import { useFavorites } from "@/lib/favorites";
import { isAdminUser, useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

export function ActivityActions({ activity, onChanged, onDeleted, compact = false }: { activity: Activity; onChanged: () => void; onDeleted?: () => void; compact?: boolean }) {
  const { token, user, clear } = useAuth();
  const toast = useToast();
  const router = useRouter();
  // the owner of an activity and any admin may edit/delete it (the server enforces this too)
  const isOwner = !!token && !!user && !user.mustChangePw && (isAdminUser(user) || (!activity.isSeed && activity.ownerId === user.id));
  const { access, reload: reloadAccess } = useAccess(activity.id, compact || isOwner ? null : token);
  // בעלים ואדמין עורכים ומוחקים; שותף לעריכה רק עורך
  const canManage = isOwner || !!access?.canEdit;

  const [busy, setBusy] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [dupAge, setDupAge] = useState(activity.ageGroup);
  const [dupMin, setDupMin] = useState(String(activity.durationMin));
  const [seedOk, setSeedOk] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [verOpen, setVerOpen] = useState(false);
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [colOpen, setColOpen] = useState(false);
  const [fbOpen, setFbOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabs, setCollabs] = useState<import("@/lib/organizer").Collaborator[]>([]);
  const loadCollabs = () => {
    if (!isOwner || compact) return;
    api<import("@/lib/organizer").Access>(`/api/activities/${activity.id}/access`, { token })
      .then((a) => setCollabs(a.collaborators))
      .catch(() => {});
  };
  useEffect(loadCollabs, [isOwner, compact, activity.id, token]); // eslint-disable-line react-hooks/exhaustive-deps
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
            <button type="button" className="btn" onClick={() => setAdaptOpen(true)}>
              התאמה לתנאים
            </button>
            <button type="button" className="btn" onClick={() => setColOpen(true)}>
              הוספה לאוסף
            </button>
            <KindTools activity={activity} />
            <Link className="btn" href={`/library/${activity.id}/cards`}>
              כרטיסים להדפסה
            </Link>
            <Link className="btn" href={`/library/${activity.id}/brief`}>
              דף למדריך מחליף
            </Link>
            <OfflineButton activityId={activity.id} />
            <button type="button" className="btn" onClick={() => setWaOpen(true)}>
              שיתוף בוואטסאפ
            </button>
            <Link className="btn" href={`/present/${activity.id}`}>
              מצגת
            </Link>
            <button type="button" className="btn" onClick={() => setSchedOpen(true)}>
              שיבוץ ביומן
            </button>
            <FlagButton activityId={activity.id} />
          </>
        )}
        {canManage && (
          <>
            <button type="button" className="btn" onClick={() => setEditOpen(true)}>
              עריכה
            </button>
            <button type="button" className="btn" onClick={() => setStoryOpen(true)}>
              הוספת סיפור
            </button>
            <button type="button" className="btn" onClick={() => setFbOpen(true)}>
              משוב מחניכים
            </button>
            <button type="button" className="btn" onClick={() => setVerOpen(true)}>
              היסטוריית גרסאות
            </button>
            {isOwner && !activity.isSeed && (
              <button type="button" className="btn" onClick={() => setCollabOpen(true)}>
                שותפים לעריכה{collabs.length ? ` (${collabs.length})` : ""}
              </button>
            )}
            {isOwner && (
              <button type="button" className="btn btn-danger" onClick={() => setDelOpen(true)}>
                מחיקה
              </button>
            )}
          </>
        )}
      </div>

      {!compact && <WhatsAppModal open={waOpen} onClose={() => setWaOpen(false)} activityId={activity.id} />}
      {!compact && schedOpen && <ScheduleModal open onClose={() => setSchedOpen(false)} activity={{ id: activity.id, title: activity.title, durationMin: activity.durationMin }} />}
      {isOwner && !compact && (
        <CollaboratorsModal
          open={collabOpen}
          onClose={() => setCollabOpen(false)}
          activityId={activity.id}
          token={token}
          list={collabs}
          onChanged={() => {
            loadCollabs();
            reloadAccess();
          }}
        />
      )}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} activityId={activity.id} title={activity.title} />
      {canManage && <AddStoryModal open={storyOpen} onClose={() => setStoryOpen(false)} activity={activity} onChanged={onChanged} />}
      <AdaptModal open={adaptOpen} onClose={() => setAdaptOpen(false)} activity={activity} />
      <CollectionModal open={colOpen} onClose={() => setColOpen(false)} activityId={activity.id} />
      <ShareModal open={fbOpen} onClose={() => setFbOpen(false)} activityId={activity.id} title={activity.title} path={`/feedback/${activity.id}`} heading="משוב מחניכים" intro="הקישור פותח שאלון קצר ואנונימי של שלוש שאלות. אפשר להקרין את ה-QR בסוף הפעולה." />

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
        <VersionsModal
          open={verOpen}
          activityId={activity.id}
          token={token}
          onClose={() => setVerOpen(false)}
          onRestored={() => {
            setVerOpen(false);
            onChanged();
          }}
          onAuthError={handleAuthError}
        />
      )}

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
