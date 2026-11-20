"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api, errorMessage, fieldErrorLines } from "@/lib/api";
import { clashText, todayLocal, type Clash, type ScheduleItem } from "@/lib/organizer";
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
  // שלב 71: חדר וציוד, ובדיקת התנגשות חיה מול שאר המדריכים בשבט
  const [room, setRoom] = useState("");
  const [gear, setGear] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<{ id: string; label: string }[]>([]);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [serverClash, setServerClash] = useState("");

  useEffect(() => {
    if (!open) return;
    setServerClash("");
    api<{ id: string; label: string }[]>("/api/gear")
      .then(setCatalog)
      .catch(() => {});
  }, [open]);

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
      setRoom(item.room ?? "");
      setGear(item.gear ?? []);
    } else {
      setD(date ?? todayLocal());
      setTime("");
      setGroup("");
      setNote("");
      setRemind("1");
      setTitle("");
      setActId(activity?.id ?? null);
      setRoom("");
      setGear([]);
    }
    setClashes([]);
  }, [open, item, activity, date]);

  // בדיקת התנגשות חיה: כל שינוי בתאריך, שעה, חדר או ציוד נבדק מול היומנים של השבט (בלי לשמור כלום)
  const wantsCheck = open && !!token && !!time && (room.trim().length > 0 || gear.length > 0);
  useEffect(() => {
    setServerClash("");
    if (!wantsCheck) {
      setClashes([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      api<{ clashes: Clash[] }>("/api/me/schedule/check", {
        method: "POST",
        token,
        body: { date: d, time, room: room.trim(), gear, ...(item ? { excludeId: item.id, durationMin: item.durationMin } : {}), ...((actId ?? activity?.id) ? { activityId: actId ?? activity?.id } : {}) },
      })
        .then((r) => live && setClashes(r.clashes))
        .catch(() => live && setClashes([]));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [wantsCheck, token, d, time, room, gear, item, actId, activity]);
  const toggleGear = (id: string) => setGear((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const clashing = clashes.length > 0 || !!serverClash;

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

  const save = async (force = false) => {
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
      room: room.trim(),
      gear,
      ...(force ? { force: true } : {}),
    };
    try {
      if (item) await api(`/api/me/schedule/${item.id}`, { method: "PATCH", token, body });
      else await api("/api/me/schedule", { method: "POST", token, body });
      toast(item ? "האירוע עודכן" : "הפעולה נוספה ליומן", { kind: "success" });
      onSaved?.();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESOURCE_CLASH") setServerClash(e.message);
      else {
        const lines = fieldErrorLines(e);
        setErrors(lines.length ? lines : [errorMessage(e)]);
      }
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
            <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={busy || clashing} aria-describedby={clashing ? "sc-clash" : undefined}>
              {busy ? "שומר..." : "שמירה"}
            </button>
            {clashing && (
              <button type="button" className="btn" onClick={() => save(true)} disabled={busy}>
                לשבץ בכל זאת
              </button>
            )}
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
            <Field label="חדר או מקום (לא חובה)" htmlFor="sc-room" hint="אם מישהו אחר בשבט משבץ את אותו חדר באותה שעה, תראו כאן התראה.">
              <input id="sc-room" value={room} maxLength={60} onChange={(e) => setRoom(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="הערה לעצמכם (לא חובה)" htmlFor="sc-note">
              <input id="sc-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          {catalog.length > 0 && (
            <fieldset className="grade-picker sc71-gear">
              <legend>ציוד מהארון שתצטרכו (לא חובה)</legend>
              <div className="grade-options">
                {catalog.map((g) => (
                  <label key={g.id} className="check">
                    <input type="checkbox" checked={gear.includes(g.id)} onChange={() => toggleGear(g.id)} />
                    <span>{g.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {!time && (room.trim() || gear.length > 0) && <p className="hint">הוסיפו שעה כדי שנוכל לבדוק התנגשויות עם שאר המדריכים.</p>}
          {clashing && (
            <div id="sc-clash" className="warn-box sc71-clash" role="alert">
              <strong>יש התנגשות שיבוץ</strong>
              <ul>
                {clashes.map((c) => (
                  <li key={`${c.id}-${c.kind}-${c.what}`}>{clashText(c)}</li>
                ))}
                {clashes.length === 0 && serverClash && <li>{serverClash}</li>}
              </ul>
              <p className="hint">שנו שעה, חדר או ציוד, או שבצו בכל זאת אחרי שתיאמתם. מי שכבר משובץ יקבל התראה.</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
