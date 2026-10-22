"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_URL, ApiError, api, errorMessage } from "@/lib/api";
import { fmtDay, todayLocal, type ScheduleItem } from "@/lib/organizer";
import { RemindersBanner } from "./RemindersBanner";
import { ScheduleModal } from "./ScheduleModal";
import { useAuth, useToast } from "./Providers";
import { Skeleton } from "./ui";

const DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MONTH_NAMES = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** יומן הפעולות של המדריך: חודש, רשימה, תזכורות וייצוא לטלפון. */
export function CalendarPage() {
  const { token } = useAuth();
  const toast = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<ScheduleItem | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>("unsupported");
  const [reloadKey, setReloadKey] = useState(0);

  const first = iso(year, month, 1);
  const last = iso(year, month, new Date(year, month + 1, 0).getDate());

  const load = useCallback(() => {
    if (!token) return;
    api<ScheduleItem[]>(`/api/me/schedule?from=${first}&to=${last}`, { token })
      .then((r) => {
        setItems(r);
        setError("");
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 401 ? "ההתחברות פגה. התחברו מחדש באזור האישי" : errorMessage(e)));
  }, [token, first, last]);
  useEffect(load, [load]);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);

  const refresh = () => {
    load();
    setReloadKey((k) => k + 1);
  };

  const downloadIcs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/me/schedule.ics`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("יצירת קובץ היומן נכשלה");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "shevet-maoz-schedule.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast("הקובץ ירד. פתחו אותו כדי להוסיף ליומן בטלפון או בגוגל", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  const askPermission = async () => {
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      toast(p === "granted" ? "התראות הופעלו. הן יופיעו כשהאתר פתוח" : "ההתראות לא הופעלו", { kind: p === "granted" ? "success" : "info" });
      setReloadKey((k) => k + 1);
    } catch {
      toast("הדפדפן לא תומך בהתראות", { kind: "error" });
    }
  };

  const move = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setItems(null);
  };

  if (!token)
    return (
      <div className="card glass">
        <p>
          היומן שמור לכל מדריך בנפרד. <Link href="/account">התחברו או הירשמו</Link> כדי לשבץ פעולות ולקבל תזכורות.
        </p>
      </div>
    );

  // תאים: רווחים לפני היום הראשון (יום ראשון = עמודה ראשונה)
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const byDate = new Map<string, ScheduleItem[]>();
  for (const it of items ?? []) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
  const today = todayLocal();

  return (
    <>
      <RemindersBanner key={reloadKey} limit={5} showEmpty />

      <section className="card glass" aria-labelledby="cal-title">
        <div className="cal-head">
          <button type="button" className="btn" onClick={() => move(-1)} aria-label="החודש הקודם">
            <span aria-hidden="true">›</span> הקודם
          </button>
          <h2 id="cal-title" className="section-title" aria-live="polite">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button type="button" className="btn" onClick={() => move(1)} aria-label="החודש הבא">
            הבא <span aria-hidden="true">‹</span>
          </button>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {!items && !error && <Skeleton lines={3} />}
        <div className="table-wrap">
          <table className="cal-grid">
            <caption className="sr-only">
              {MONTH_NAMES[month]} {year}. בכל יום מופיעות הפעולות שנקבעו
            </caption>
            <thead>
              <tr>
                {DAY_NAMES.map((d) => (
                  <th key={d} scope="col">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, w) => (
                <tr key={w}>
                  {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
                    if (!d) return <td key={i} className="cal-empty" />;
                    const key = iso(year, month, d);
                    const list = byDate.get(key) ?? [];
                    return (
                      <td key={i} className={key === today ? "cal-today" : ""}>
                        <button type="button" className="cal-day" onClick={() => setAdding(key)} aria-label={`הוספת אירוע ב-${d} ב${MONTH_NAMES[month]}`}>
                          {d}
                        </button>
                        {list.map((it) => (
                          <button key={it.id} type="button" className="cal-event" onClick={() => setEdit(it)}>
                            {it.time && <span className="cal-time">{it.time} </span>}
                            {it.title}
                          </button>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => setAdding(today)}>
            אירוע חדש
          </button>
          <Link className="btn" href="/calendar/print">
            השבוע להדפסה
          </Link>
          <button type="button" className="btn" onClick={downloadIcs}>
            הורדת היומן לטלפון (ICS)
          </button>
          {perm === "default" && (
            <button type="button" className="btn" onClick={askPermission}>
              הפעלת התראות בדפדפן
            </button>
          )}
        </div>
        {perm === "denied" && <p className="hint">ההתראות חסומות בדפדפן. אפשר לאפשר אותן בהגדרות האתר.</p>}
        <p className="hint">התראות הדפדפן מופיעות רק כשהאתר פתוח. כדי לקבל תזכורת גם כשהאתר סגור, הורידו את קובץ היומן ופתחו אותו בטלפון: ההתראות יגיעו מיומן הטלפון.</p>
      </section>

      <section aria-labelledby="cal-list">
        <h2 id="cal-list" className="section-title">
          הפעולות החודש
        </h2>
        {items && items.length === 0 ? (
          <p>עוד לא שיבצתם פעולות בחודש הזה.</p>
        ) : (
          <ul className="plain-list">
            {items?.map((it) => (
              <li key={it.id}>
                <span>
                  <strong>{fmtDay(it.date)}</strong>
                  {it.time ? ` · ${it.time}` : ""} · {it.activityId ? <Link href={`/library/${it.activityId}`}>{it.title}</Link> : it.title}
                  {it.groupLabel ? ` · ${it.groupLabel}` : ""}
                  {it.remindDays != null ? ` · תזכורת ${it.remindDays === 0 ? "ביום עצמו" : it.remindDays === 1 ? "יום לפני" : `${it.remindDays} ימים לפני`}` : ""}
                </span>
                <span className="actions">
                  <button type="button" className="btn btn-small" onClick={() => setEdit(it)}>
                    עריכה
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && <ScheduleModal open onClose={() => setAdding(null)} date={adding} onSaved={refresh} />}
      {edit && <ScheduleModal open onClose={() => setEdit(null)} item={edit} onSaved={refresh} />}
    </>
  );
}
