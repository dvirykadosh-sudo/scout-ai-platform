"use client";

// שלב 74: הפאנלים החדשים בעמוד הפעולה: ציר זמן, כרטיס איכות, פרטיות, הצעות תגיות, "אותה פעולה לשכבה אחרת" והבדלי גרסאות שורה אחרי שורה.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import { PHASE_LABELS, timelineCheck, type AgeFit, type DiffOp, type GoalInfo, type PrivacyScanResult, type QualityReport, type VersionDiff } from "@/lib/lab74";
import type { Activity } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

// ───────── פריט 8: ציר זמן ─────────
export function TimelineBar({ stages, planned }: { stages: { name: string; minutes: number }[]; planned: number }) {
  const t = useMemo(() => timelineCheck(stages, planned), [stages, planned]);
  if (t.status === "empty") return null;
  const label = `ציר זמן: ${t.segments.map((s) => `${s.name} ${s.minutes} דקות`).join(", ")}. ${t.summary}`;
  return (
    <section className="tl no-print" aria-label="ציר זמן של הפעולה">
      <div className="tl-bar" role="img" aria-label={label}>
        {t.segments.map((s) => (
          <span key={s.index} className={`tl-seg tl-${s.phase}`} style={{ flexGrow: Math.max(s.minutes, 0.5) }} />
        ))}
      </div>
      <ol className="tl-legend">
        {t.segments.map((s) => (
          <li key={s.index}>
            <span className={`tl-dot tl-${s.phase}`} aria-hidden="true" /> {s.name} <strong>{s.minutes} דק׳</strong>{" "}
            <span className="hint">
              ({PHASE_LABELS[s.phase]}, {s.pct}%)
            </span>
          </li>
        ))}
      </ol>
      {t.warnings.length > 0 ? (
        <ul className="tl-warn" role="status">
          {t.warnings.map((w) => (
            <li key={w.id} className={w.level === "high" ? "tl-high" : ""}>
              {w.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{t.summary}</p>
      )}
    </section>
  );
}

// ───────── פריטים 1, 2, 5, 6: כרטיס איכות ─────────
interface QData {
  q: QualityReport;
  age: AgeFit;
  goal: GoalInfo;
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span className="q-meter" role="img" aria-label={`${label}: ${value} מתוך 100`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

export function QualityCard({ activityId }: { activityId: number }) {
  const [data, setData] = useState<QData | null>(null);
  const [error, setError] = useState("");
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!asked) return;
    let live = true;
    Promise.all([api<QualityReport>(`/api/activities/${activityId}/quality-report`), api<AgeFit>(`/api/activities/${activityId}/age-fit`), api<GoalInfo>(`/api/activities/${activityId}/goal`)])
      .then(([q, age, goal]) => live && setData({ q, age, goal }))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [asked, activityId]);

  return (
    <details id="quality" className="card glass insight no-print no-toc" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setAsked(true)}>
      <summary>כרטיס איכות{data ? `: ${data.q.overall} מתוך 100 (${data.q.grade})` : ""}</summary>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {asked && !data && !error && <p>בודק...</p>}
      {data && (
        <>
          <p className="q-why">{data.q.why.line}</p>
          <p className="hint">
            הציון הוא יוריסטיקה שמחושבת מהטקסט של הפעולה: מבנה, השתתפות, בטיחות, זמנים, לשון וערכים. הוא לא שיפוט פדגוגי ולא מחליף את שיקול הדעת של המדריך.
            {data.q.libraryAverage !== null ? ` ממוצע המאגר: ${data.q.libraryAverage}.` : ""}
          </p>
          <ul className="q-dims">
            {data.q.dimensions.map((d) => (
              <li key={d.key}>
                <span className="q-name">
                  {d.label} <span className="hint">({d.weight}%)</span>
                </span>
                <Meter value={d.score} label={d.label} />
                <span className="q-num">{d.score}</span>
              </li>
            ))}
          </ul>
          {data.q.top.length > 0 && (
            <>
              <p className="q-h"><strong>הכי כדאי לשפר</strong></p>
              <ul className="bullets">
                {data.q.top.map((d) => (
                  <li key={d.key}>
                    <strong>{d.label}:</strong> {d.tip}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="q-h"><strong>יעד חינוכי מדיד</strong></p>
          <p>{data.goal.goal}</p>
          <ul className="bullets">
            {data.goal.indicators.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="hint">{data.goal.measure}</p>
          <p className="q-h"><strong>
            התאמה לגיל ({data.age.bandLabel}){data.age.score !== null ? `: ${data.age.ok} מתוך ${data.age.total}` : ""}
          </strong></p>
          {data.age.score === null ? (
            <p className="hint">שכבת הגיל לא זוהתה, ולכן אי אפשר לבדוק התאמה.</p>
          ) : (
            <>
              <ul className="plain-list">
                {data.age.checks.map((c) => (
                  <li key={c.id}>
                    <span>
                      {c.label}
                      {!c.ok && (
                        <>
                          <br />
                          <span className="hint">{c.tip}</span>
                        </>
                      )}
                    </span>
                    <span className={c.ok ? "pill pill-ok" : "pill pill-warn"}>{c.ok ? "מתאים" : "כדאי לבדוק"}</span>
                  </li>
                ))}
              </ul>
              <details>
                <summary>איך מנסחים כל שלב לשכבה הזאת</summary>
                <ul className="bullets">
                  {data.age.hints.map((h) => (
                    <li key={h.stage}>
                      <strong>{h.stage}:</strong> {h.hint}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </>
      )}
    </details>
  );
}

// ───────── פריט 20: סריקת פרטיות ─────────
export function PrivacyPanel({ activityId, canManage, onChanged }: { activityId: number; canManage: boolean; onChanged: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<PrivacyScanResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (!token) return;
    api<PrivacyScanResult>(`/api/activities/${activityId}/privacy`, { token, cache: "no-store" })
      .then((r) => {
        setS(r);
        setError("");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [activityId, token]);
  useEffect(load, [load]);
  if (!canManage || !token) return null;

  const redact = async () => {
    setBusy(true);
    try {
      await api(`/api/activities/${activityId}/privacy/redact`, { method: "POST", token, body: {} });
      toast("הפרטים האישיים הוסרו, והגרסה הקודמת נשמרה בהיסטוריה", { kind: "success" });
      load();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <details id="privacy" className="card glass insight no-print" open={!!s && !s.ok}>
      <summary>בדיקת פרטיות{s ? (s.ok ? "" : ` (${s.count} ממצאים)`) : ""}</summary>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {s?.ok && <p>לא נמצאו בפעולה טלפונים, מיילים, קישורים, כתובות או שמות של חניכים. הבדיקה אוטומטית ולא מחליפה קריאה שלכם לפני פרסום.</p>}
      {s && !s.ok && (
        <>
          <p className="hint">פעולה שמתפרסמת במאגר רואים כל המדריכים. מספרי טלפון, מיילים, קישורים וכתובות אפשר להסיר בלחיצה. שמות של חניכים רק מסומנים, כי אי אפשר לדעת בוודאות שזה שם אמיתי.</p>
          <ul className="plain-list">
            {s.findings.map((f, i) => (
              <li key={`${f.field}-${i}`}>
                <span>
                  <strong>{f.label}</strong> ב{f.fieldLabel}
                  <br />
                  <bdi className="hint">…{f.context}…</bdi>
                </span>
                <span className={f.auto ? "pill pill-warn" : "pill"}>{f.auto ? "אפשר להסיר" : "לבדיקה ידנית"}</span>
              </li>
            ))}
          </ul>
          {s.autoCount > 0 && (
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={redact} disabled={busy}>
                {busy ? "מסיר..." : `הסרה אוטומטית (${s.autoCount})`}
              </button>
            </div>
          )}
        </>
      )}
    </details>
  );
}

// ───────── פריט 10: הצעות תגיות ─────────
export function TagSuggestions({ activityId, current, onPick, full }: { activityId: number; current: string[]; onPick: (tag: string) => void; full: boolean }) {
  const { token } = useAuth();
  const [items, setItems] = useState<{ tag: string; why: string }[]>([]);
  const key = current.join("|");
  useEffect(() => {
    if (!token) return;
    let live = true;
    api<{ tag: string; why: string }[]>(`/api/activities/${activityId}/tag-suggestions`, { token })
      .then((r) => live && setItems(r))
      .catch(() => {});
    return () => {
      live = false;
    };
    // key משקף את current: ההצעות מתרעננות אחרי כל הוספה
  }, [activityId, token, key]);
  const shown = items.filter((x) => !current.includes(x.tag));
  if (!shown.length || full) return null;
  return (
    <div className="tag-suggest">
      <p className="hint">הצעות לפי התוכן והתגיות שלכם:</p>
      <ul className="chip-list" aria-label="הצעות תגיות">
        {shown.map((x) => (
          <li key={x.tag}>
            <button type="button" className="btn btn-small" onClick={() => onPick(x.tag)} title={x.why}>
              + {x.tag}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────── פריט 14: אותה פעולה, שכבה או קבוצה אחרת ─────────
export function ForGroupModal({ open, onClose, activity }: { open: boolean; onClose: () => void; activity: Activity }) {
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const [ageGroup, setAgeGroup] = useState(activity.ageGroup);
  const [participants, setParticipants] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    const body: Record<string, string | number> = {};
    if (ageGroup !== activity.ageGroup) body.ageGroup = ageGroup;
    else body.ageGroup = activity.ageGroup;
    if (participants.trim()) body.participants = Number(participants);
    if (duration.trim()) body.durationMin = Number(duration);
    setBusy(true);
    try {
      const copy = await api<Activity>(`/api/activities/${activity.id}/for-group`, { method: "POST", token, body });
      onClose();
      toast("נוצר עותק לקבוצה החדשה. הפעולה המקורית לא השתנתה", { kind: "success" });
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
      title="אותה פעולה, קבוצה אחרת"
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={go} disabled={busy}>
            {busy ? "יוצר..." : "יצירת עותק"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            ביטול
          </button>
        </>
      }
    >
      <p>האתר יוצר עותק של "{activity.title}" עם הערת התאמה בכל שלב לשכבה החדשה, ואם צריך גם לגודל הקבוצה ולמשך. הטקסט עצמו נשאר שלכם לערוך.</p>
      <Field label="שכבת גיל" htmlFor={`fg-age-${activity.id}`}>
        <select id={`fg-age-${activity.id}`} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
          {AGE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </Field>
      <Field label="מספר משתתפים (לא חובה)" htmlFor={`fg-n-${activity.id}`}>
        <input id={`fg-n-${activity.id}`} type="number" min={1} max={200} value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder={String(activity.groupSize)} />
      </Field>
      <Field label="משך בדקות (לא חובה)" htmlFor={`fg-d-${activity.id}`}>
        <input id={`fg-d-${activity.id}`} type="number" min={10} max={240} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={String(activity.durationMin)} />
      </Field>
    </Modal>
  );
}

// ───────── פריט 15: הבדלי גרסאות שורה אחרי שורה ─────────
export function DiffOps({ ops }: { ops: DiffOp[] }) {
  return (
    <pre className="diff" dir="rtl">
      {ops.map((o, i) =>
        o.op === "skip" ? (
          <span key={i} className="diff-skip">
            … {o.n} שורות ללא שינוי
          </span>
        ) : (
          <span key={i} className={`diff-${o.op}`}>
            {o.op === "add" ? "+ " : o.op === "del" ? "− " : "  "}
            {o.text}
          </span>
        ),
      )}
    </pre>
  );
}

export function VersionLineDiff({ activityId, versionId, token }: { activityId: number; versionId: number; token: string | null }) {
  const [d, setD] = useState<VersionDiff | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<VersionDiff>(`/api/activities/${activityId}/versions/diff?from=${versionId}&to=current`, { token })
      .then((r) => live && setD(r))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [activityId, versionId, token]);
  if (error)
    return (
      <p className="error-box" role="alert">
        {error}
      </p>
    );
  if (!d) return <p>טוען פירוט...</p>;
  if (!d.changed) return <p className="hint">אין הבדלים מהגרסה הנוכחית.</p>;
  return (
    <div className="diff-wrap">
      {d.fields.map((f) => (
        <div key={f.field}>
          <p className="diff-h">{f.label}</p>
          <DiffOps ops={f.ops} />
        </div>
      ))}
      {d.stages.map((s) => (
        <div key={s.index}>
          <p className="diff-h">
            שלב {s.index + 1}: {s.name}
            {s.minutes ? ` (${s.minutes[0]} ← ${s.minutes[1]} דקות)` : ""}
          </p>
          {s.ops.length > 0 && <DiffOps ops={s.ops} />}
        </div>
      ))}
      {d.tags && (
        <div>
          <p className="diff-h">תגיות</p>
          <p>
            לפני: {d.tags.before.join(", ") || "(אין)"} · עכשיו: {d.tags.after.join(", ") || "(אין)"}
          </p>
        </div>
      )}
    </div>
  );
}
