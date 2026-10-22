"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Run } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { RunSuggestions } from "./RunSuggestions";
import { Field } from "./ui";

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("he-IL");

export function RunsLog({ activityId }: { activityId: number }) {
  const { token, user, clear } = useAuth();
  const toast = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [ranOn, setRanOn] = useState(today());
  const [group, setGroup] = useState("");
  const [worked, setWorked] = useState("");
  const [change, setChange] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [engagement, setEngagement] = useState("");
  const [timing, setTiming] = useState("");
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(() => {
    if (!token) return;
    api<Run[]>(`/api/activities/${activityId}/runs`, { token })
      .then(setRuns)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) clear();
      });
  }, [token, activityId, clear]);
  useEffect(load, [load]);

  if (!token || !user)
    return (
      <section className="card glass no-print" aria-labelledby="runs-title">
        <h2 id="runs-title" className="section-title">
          יומן הפעלות
        </h2>
        <p>
          כשמפעילים פעולה כדאי לרשום מה עבד ומה לשנות בפעם הבאה. היומן פרטי ושמור בחשבון שלכם. <Link href="/account">התחברות או הרשמה</Link>
        </p>
      </section>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/activities/${activityId}/runs`, { method: "POST", token, body: { ranOn, groupLabel: group, worked, changeNext: change, ...(engagement ? { engagement: Number(engagement) } : {}), ...(timing ? { timing } : {}) } });
      toast("הרישום נשמר ביומן", { kind: "success" });
      setGroup("");
      setWorked("");
      setChange("");
      setEngagement("");
      setTiming("");
      setOpen(false);
      setRefresh((n) => n + 1);
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
    setBusy(false);
  };

  const remove = async (r: Run) => {
    try {
      await api(`/api/runs/${r.id}`, { method: "DELETE", token });
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };

  const last = runs[0];
  return (
    <section id="runs" className="card glass no-print" aria-labelledby="runs-title">
      <h2 id="runs-title" className="section-title">
        יומן הפעלות (פרטי)
      </h2>
      {last && (last.worked || last.changeNext) && (
        <div className="last-run" role="note">
          <p>
            <strong>בפעם האחרונה שהפעלתם ({fmt(last.ranOn)}{last.groupLabel ? `, ${last.groupLabel}` : ""}):</strong>
          </p>
          {last.worked && <p>מה עבד: {last.worked}</p>}
          {last.changeNext && <p>מה לשנות: {last.changeNext}</p>}
        </div>
      )}
      {!open && (
        <button type="button" className="btn btn-primary" aria-expanded={false} onClick={() => setOpen(true)}>
          רישום הפעלה חדשה
        </button>
      )}
      {open && (
        <form onSubmit={submit} className="form-grid" aria-label="רישום הפעלה">
          <Field label="תאריך" htmlFor={`run-date-${activityId}`}>
            <input id={`run-date-${activityId}`} type="date" required value={ranOn} onChange={(e) => setRanOn(e.target.value)} />
          </Field>
          <Field label="קבוצה (לא חובה)" htmlFor={`run-group-${activityId}`}>
            <input id={`run-group-${activityId}`} maxLength={60} value={group} onChange={(e) => setGroup(e.target.value)} placeholder="למשל: ח' 2" />
          </Field>
          <Field label="כמה החניכים השתתפו" htmlFor={`run-eng-${activityId}`}>
            <select id={`run-eng-${activityId}`} value={engagement} onChange={(e) => setEngagement(e.target.value)}>
              <option value="">לא רושם</option>
              <option value="1">מעט</option>
              <option value="2">בינוני</option>
              <option value="3">הרבה</option>
            </select>
          </Field>
          <Field label="האם הזמן הספיק" htmlFor={`run-timing-${activityId}`}>
            <select id={`run-timing-${activityId}`} value={timing} onChange={(e) => setTiming(e.target.value)}>
              <option value="">לא רושם</option>
              <option value="short">נגמר מוקדם</option>
              <option value="ok">בדיוק</option>
              <option value="long">נמשך יותר מדי</option>
            </select>
          </Field>
          <Field label="מה עבד טוב" htmlFor={`run-worked-${activityId}`} className="span-2">
            <textarea id={`run-worked-${activityId}`} rows={2} maxLength={600} value={worked} onChange={(e) => setWorked(e.target.value)} />
          </Field>
          <Field label="מה לשנות בפעם הבאה" htmlFor={`run-change-${activityId}`} className="span-2">
            <textarea id={`run-change-${activityId}`} rows={2} maxLength={600} value={change} onChange={(e) => setChange(e.target.value)} />
          </Field>
          <div className="actions span-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "שומר..." : "שמירה ביומן"}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              ביטול
            </button>
          </div>
        </form>
      )}
      <RunSuggestions activityId={activityId} refreshKey={refresh} />
      {runs.length > 0 && (
        <ul className="plain-list runs-list" aria-label="הפעלות קודמות">
          {runs.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{fmt(r.ranOn)}</strong>
                {r.groupLabel ? ` · ${r.groupLabel}` : ""}
                {r.worked ? ` · עבד: ${r.worked}` : ""}
                {r.changeNext ? ` · לשנות: ${r.changeNext}` : ""}
                {r.engagement ? ` · השתתפות: ${["", "מעטה", "בינונית", "גבוהה"][r.engagement]}` : ""}
                {r.timing ? ` · זמן: ${({ short: "נגמר מוקדם", ok: "בדיוק", long: "נמשך יותר מדי" } as Record<string, string>)[r.timing] ?? ""}` : ""}
              </span>
              <button type="button" className="btn btn-small" onClick={() => remove(r)} aria-label={`מחיקת הרישום מתאריך ${fmt(r.ranOn)}`}>
                מחיקה
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
