"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage, fieldErrorLines } from "@/lib/api";
import { todayLocal, type ScheduleItem } from "@/lib/organizer";
import type { ListResponse } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  /** פעולה מהמאגר לשבץ. בלי זה אפשר לחפש פעולה או לכתוב שם חופשי */
  activity?: { id: number; title: string; durationMin: number };
  /** אירוע קיים לעריכה */
  item?: ScheduleItem | null;
  /** תאריך התחלתי (YYYY-MM-DD) */
  date?: string;
  onSaved?: () => void;
}

const REMIND: { value: string; label: string }[] = [
  { value: "", label: "בלי תזכורת" },
  { value: "0", label: "ביום הפעולה" },
  { value: "1", label: "יום לפני" },
  { value: "2", label: "יומיים לפני" },
  { value: "3", label: "שלושה ימים לפני" },
  { value: "7", label: "שבוע לפני" },
];

/** שיבוץ פעולה ביומן (או עריכה של אירוע קיים), עם תזכורת הכנה. */
export function ScheduleModal({ open, onClose, activity, item, date, onSaved }: Props) {
  const { token } = useAuth();
  const toast = useToast();
  const [d, setD] = useState(todayLocal());
  const [time, setTime] = useState("");
  const [group, setGroup] = useState("");
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState("1");
  const [title, setTitle] = useState("");
  const [actId, setActId] = useState<number | null>(null);
  const [found, setFound] = useState<{ id: number; title: string }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors([]);
    setFound([]);
    if (item) {
      setD(item.date);
      setTime(item.time);
      setGroup(item.groupLabel);
      setNote(item.note);
      setRemind(item.remindDays == null ? "" : String(item.remindDays));
      setTitle(item.activityId ? "" : item.title);
      setActId(item.activityId);
    } else {
      setD(date ?? todayLocal());
      setTime("");
      setGroup("");
      setNote("");
      setRemind("1");
      setTitle("");
      setActId(activity?.id ?? null);
    }
  }, [open, item, activity, date]);

  // חיפוש פעולה מהמאגר כשכותבים שם
  useEffect(() => {
    if (!open || activity || actId || title.trim().length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      api<ListResponse>(`/api/activities?q=${encodeURIComponent(title.trim())}&pageSize=5`)
        .then((r) => live && setFound(r.items.map((x) => ({ id: x.id, title: x.title }))))
        .catch(() => {});
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, title, activity, actId]);

  const linkedTitle = activity?.title ?? (item?.activityId ? item.title : "");

  const save = async () => {
    setBusy(true);
    setErrors([]);
    const body = {
      activityId: actId,
      title: actId ? undefined : title.trim() || undefined,
      date: d,
      time: time || "",
      groupLabel: group.trim(),
      note: note.trim(),
      remindDays: remind === "" ? null : Number(remind),
    };
    try {
      if (item) await api(`/api/me/schedule/${item.id}`, { method: "PATCH", token, body });
      else await api("/api/me/schedule", { method: "POST", token, body });
      toast(item ? "האירוע עודכן" : "הפעולה נוספה ליומן", { kind: "success" });
      onSaved?.();
      onClose();
    } catch (e) {
      const lines = fieldErrorLines(e);
      setErrors(lines.length ? lines : [errorMessage(e)]);
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await api(`/api/me/schedule/${item.id}`, { method: "DELETE", token });
      toast("האירוע נמחק מהיומן", { kind: "success" });
      onSaved?.();
      onClose();
    } catch (e) {
      setErrors([errorMessage(e)]);
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? "עריכת אירוע ביומן" : "שיבוץ ביומן"}
      footer={
        token ? (
          <>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "שומר..." : "שמירה"}
            </button>
            {item && (
              <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                מחיקה
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>
              ביטול
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={onClose}>
            סגירה
          </button>
        )
      }
    >
      {!token ? (
        <p>
          כדי לשבץ פעולות ביומן ולקבל תזכורות צריך להתחבר. <Link href="/account">להתחברות או הרשמה</Link>
        </p>
      ) : (
        <>
          {errors.length > 0 && (
            <div className="error-box" role="alert">
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {linkedTitle ? (
            <p>
              הפעולה: <strong>{linkedTitle}</strong>
            </p>
          ) : (
            <Field label="שם האירוע, או חיפוש פעולה מהמאגר" htmlFor="sc-title" hint="אפשר לכתוב שם חופשי (למשל: טיול שבט) או להתחיל לכתוב שם של פעולה ולבחור.">
              <input id="sc-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          )}
          {!linkedTitle && found.length > 0 && (
            <ul className="chip-list" aria-label="פעולות מהמאגר">
              {found.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      setActId(f.id);
                      setTitle(f.title);
                      setFound([]);
                    }}
                  >
                    {f.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!linkedTitle && actId && (
            <p>
              נבחרה פעולה מהמאגר: <strong>{title}</strong>{" "}
              <button type="button" className="btn btn-small" onClick={() => setActId(null)}>
                ביטול הבחירה
              </button>
            </p>
          )}
          <div className="form-grid">
            <Field label="תאריך" htmlFor="sc-date">
              <input id="sc-date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
            </Field>
            <Field label="שעה (לא חובה)" htmlFor="sc-time">
              <input id="sc-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="קבוצה (לא חובה)" htmlFor="sc-group">
              <input id="sc-group" value={group} maxLength={60} onChange={(e) => setGroup(e.target.value)} />
            </Field>
            <Field label="תזכורת" htmlFor="sc-remind" hint="תזכורת הכנה: מה להכין לפני הפעולה.">
              <select id="sc-remind" value={remind} onChange={(e) => setRemind(e.target.value)}>
                {REMIND.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="הערה לעצמכם (לא חובה)" htmlFor="sc-note" className="span-2">
              <input id="sc-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </>
      )}
    </Modal>
  );
}
