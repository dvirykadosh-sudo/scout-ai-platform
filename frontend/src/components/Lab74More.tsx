"use client";

// שלב 74: השוואה בין פעולות (13), כיסוי חגים (17), "מה עבד לי" (12), מגוון (4) ודוח ייבוא (16).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { CompareItem, CompareResult, DiversityResult, HolidayEvent, ImportReport, WorkedItem } from "@/lib/lab74";
import type { ListResponse } from "@/lib/types";
import { useAuth } from "./Providers";
import { Field, Skeleton } from "./ui";

// ───────── פריט 13: השוואה ─────────
const parseIds = (raw: string | null): number[] => [...new Set((raw ?? "").split(",").filter((x) => /^\d{1,9}$/.test(x)).map(Number))].slice(0, 3);

function CompareInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const ids = parseIds(sp.get("ids"));
  const key = ids.join(",");
  const [data, setData] = useState<CompareResult | null>(null);
  const [single, setSingle] = useState<{ id: number; title: string } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: number; title: string; ageGroup: string }[]>([]);

  useEffect(() => {
    let live = true;
    setError("");
    if (ids.length >= 2) {
      api<CompareResult>(`/api/compare?ids=${key}`)
        .then((r) => live && (setData(r), setSingle(null)))
        .catch((e) => live && (setData(null), setError(errorMessage(e))));
    } else if (ids.length === 1) {
      setData(null);
      api<{ id: number; title: string }>(`/api/activities/${ids[0]}`)
        .then((r) => live && setSingle({ id: r.id, title: r.title }))
        .catch((e) => live && setError(errorMessage(e)));
    } else {
      setData(null);
      setSingle(null);
    }
    return () => {
      live = false;
    };
    // ids נגזר מ-key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    const h = window.setTimeout(() => {
      api<ListResponse>(`/api/activities?q=${encodeURIComponent(t)}&pageSize=6`)
        .then((r) => live && setFound(r.items.filter((x) => !ids.includes(x.id)).map((x) => ({ id: x.id, title: x.title, ageGroup: x.ageGroup }))))
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, key]);

  const setIds = (next: number[]) => router.replace(next.length ? `/compare?ids=${next.join(",")}` : "/compare");
  const add = (id: number) => {
    setQ("");
    setFound([]);
    if (ids.length < 3) setIds([...ids, id]);
  };

  return (
    <>
      {ids.length < 3 && (
        <section className="card glass no-print" aria-label="חיפוש פעולה להוספה">
          <Field label={ids.length ? "הוספת פעולה להשוואה" : "חיפוש פעולה להשוואה"} htmlFor="cmp-q" hint="בחרו שתיים או שלוש פעולות">
            <input id="cmp-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם פעולה או מילה מהתוכן" />
          </Field>
          {found.length > 0 && (
            <ul className="plain-list" aria-label="תוצאות חיפוש">
              {found.map((f) => (
                <li key={f.id}>
                  <span>
                    {f.title} <span className="hint">({f.ageGroup})</span>
                  </span>
                  <button type="button" className="btn btn-small" onClick={() => add(f.id)}>
                    הוספה להשוואה
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {single && <p role="status">נבחרה "{single.title}". הוסיפו עוד פעולה כדי להשוות.</p>}
      {ids.length === 0 && !error && <p className="hint">אפשר גם לסמן פעולות בתיבות הסימון במאגר, ולהקליק על "השוואה".</p>}
      {ids.length >= 2 && !data && !error && <Skeleton lines={5} />}
      {data && <CompareTable data={data} onRemove={(id) => setIds(ids.filter((x) => x !== id))} />}
    </>
  );
}

const fmtStages = (m: number[]) => m.join(" / ");
const ROWS: { label: string; get: (x: CompareItem) => string }[] = [
  { label: "שכבת גיל", get: (x) => x.ageGroup },
  { label: "משך", get: (x) => `${x.durationMin} דקות` },
  { label: "חלוקת זמנים בשלבים", get: (x) => fmtStages(x.stageMinutes) },
  { label: "משתתפים", get: (x) => (x.groupSize ? String(x.groupSize) : "לא צוין") },
  { label: "ערך מוביל", get: (x) => x.leadingValue || "לא צוין" },
  { label: "סוג", get: (x) => x.kind || "לא צוין" },
  { label: "שיטות", get: (x) => x.methods.join(", ") || "לא צוינו" },
  { label: "ציון איכות", get: (x) => `${x.quality} (${x.qualityGrade})` },
  { label: "כיסוי בטיחות", get: (x) => `${x.safetyScore} מתוך 100${x.safetyMissing ? `, ${x.safetyMissing} חסרים` : ""}` },
  { label: "פריטי ציוד", get: (x) => (x.gearItems ? String(x.gearItems) : "אין") },
  { label: "דירוג", get: (x) => (x.rating.count ? `${x.rating.average} (${x.rating.count})` : "עוד לא דורגה") },
  { label: "הפעלות", get: (x) => String(x.runCount) },
  { label: "נגישות", get: (x) => x.access.join(", ") || "אין תגיות" },
];

function CompareTable({ data, onRemove }: { data: CompareResult; onRemove: (id: number) => void }) {
  return (
    <section className="card glass" aria-label="טבלת השוואה">
      {data.highlights.length > 0 && (
        <ul className="bullets" aria-label="נקודות בולטות">
          {data.highlights.map((h) => (
            <li key={h.label}>
              <strong>{h.label}:</strong> {h.title}
            </li>
          ))}
        </ul>
      )}
      <div className="cmp-wrap">
        <table className="cmp">
          <caption className="sr-only">השוואה בין {data.items.length} פעולות</caption>
          <thead>
            <tr>
              <td />
              {data.items.map((x) => (
                <th key={x.id} scope="col">
                  <Link href={`/library/${x.id}`}>{x.title}</Link>
                  <br />
                  <button type="button" className="btn btn-small no-print" onClick={() => onRemove(x.id)} aria-label={`הסרת ${x.title} מההשוואה`}>
                    הסרה
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {data.items.map((x) => (
                  <td key={x.id}>{r.get(x)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">ציון האיכות וכיסוי הבטיחות הם חישוב אוטומטי מהטקסט, ולא שיפוט של מדריך. הם נועדו להשוואה מהירה בלבד.</p>
    </section>
  );
}

export function ComparePage() {
  return (
    <Suspense fallback={<Skeleton lines={4} />}>
      <CompareInner />
    </Suspense>
  );
}

// ───────── פריט 17: כיסוי חגים ─────────
export function HolidayCoverage() {
  const [d, setD] = useState<{ events: HolidayEvent[]; gaps: number } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ events: HolidayEvent[]; gaps: number }>("/api/holidays/coverage?days=90")
      .then(setD)
      .catch((e) => setErr(errorMessage(e)));
  }, []);
  if (err)
    return (
      <p className="error-box" role="alert">
        {err}
      </p>
    );
  if (!d) return <Skeleton lines={3} />;
  if (!d.events.length) return null;
  return (
    <section className="card glass" aria-labelledby="hol-h">
      <h2 id="hol-h" className="section-title">
        חגים ומועדים בשלושת החודשים הקרובים
      </h2>
      <p className="hint">{d.gaps ? `ל-${d.gaps} מועדים אין עדיין פעולה במאגר. כדאי לכתוב אחת מראש.` : "לכל המועדים הקרובים יש לפחות פעולה אחת במאגר."}</p>
      <ul className="plain-list">
        {d.events.map((e) => (
          <li key={e.name}>
            <span>
              <strong>{e.name}</strong> <span className="hint">(בעוד {e.inDays} ימים)</span>
              <br />
              {e.gap ? (
                <span className="hint">{e.idea ? `רעיון: ${e.idea}` : "אין עדיין פעולה."}</span>
              ) : (
                <span>
                  {e.items.map((x, i) => (
                    <span key={x.id}>
                      {i > 0 && ", "}
                      <Link href={`/library/${x.id}`}>{x.title}</Link>
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className={e.gap ? "pill pill-warn" : "pill pill-ok"}>{e.gap ? "אין פעולה" : `${e.have} פעולות`}</span>
          </li>
        ))}
      </ul>
      {d.gaps > 0 && (
        <div className="actions">
          <Link className="btn" href="/new">
            כתיבת פעולה חדשה
          </Link>
        </div>
      )}
    </section>
  );
}

// ───────── פריטים 12 ו-4: מה עבד לי, ומגוון ─────────
const LEVEL: Record<DiversityResult["level"], string> = { none: "עוד אין מדידה", low: "מגוון נמוך", ok: "מגוון סביר", good: "מגוון טוב" };

export function WorkedAndDiversity() {
  const { token } = useAuth();
  const [worked, setWorked] = useState<{ items: WorkedItem[]; total: number } | null>(null);
  const [div, setDiv] = useState<DiversityResult | null>(null);
  useEffect(() => {
    if (!token) return;
    api<{ items: WorkedItem[]; total: number }>("/api/me/worked?limit=8", { token, cache: "no-store" })
      .then(setWorked)
      .catch(() => {});
    api<DiversityResult>("/api/me/diversity", { token, cache: "no-store" })
      .then(setDiv)
      .catch(() => {});
  }, [token]);
  if (!token || (!worked && !div)) return null;
  return (
    <>
      {div && (
        <section className="card glass" aria-labelledby="div-h">
          <h2 id="div-h" className="section-title">
            מגוון הפעולות שלי
          </h2>
          <p>
            {div.score === null ? (
              div.note
            ) : (
              <>
                <span className={div.level === "good" ? "pill pill-ok" : "pill pill-warn"}>{LEVEL[div.level]}</span> ציון {div.score} מתוך 100, על {div.count} פעולות מ-{div.days} הימים האחרונים.
              </>
            )}
          </p>
          {div.flags.length > 0 && (
            <ul className="bullets">
              {div.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {div.score !== null && div.missingKinds.length > 0 && <p className="hint">סוגי פעולות שלא הפעלתם לאחרונה: {div.missingKinds.join(", ")}.</p>}
        </section>
      )}
      {worked && (
        <section className="card glass" aria-labelledby="wk-h">
          <h2 id="wk-h" className="section-title">
            מה עבד לי
          </h2>
          {worked.items.length === 0 ? (
            <p className="hint">אחרי שתתעדו הפעלות עם מדד מעורבות, כאן יופיעו הפעולות שעבדו הכי טוב עם הקבוצות שלכם.</p>
          ) : (
            <ul className="plain-list">
              {worked.items.map((w) => (
                <li key={w.id}>
                  <span>
                    <Link href={`/library/${w.id}`}>{w.title}</Link>
                    <br />
                    <span className="hint">
                      {w.runs} הפעלות{w.avgEngagement !== null ? `, מעורבות ממוצעת ${w.avgEngagement} מתוך 3` : ""}, לפני {w.daysSince} ימים
                      {w.note ? `. "${w.note}"` : ""}
                    </span>
                  </span>
                  {w.repeatable && <span className="pill pill-ok">כדאי לחזור</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

// ───────── פריט 16: דוח ייבוא ─────────
export function ImportReportView({ report }: { report: ImportReport }) {
  const cls = report.readiness >= 85 ? "pill pill-ok" : "pill pill-warn";
  return (
    <div className="imp-report" role="group" aria-label="דוח ייבוא">
      <p>
        <span className={cls}>{report.label}</span> <span className="hint">מוכנות לפרסום: {report.readiness} מתוך 100</span>
      </p>
      {report.issues.length > 0 && (
        <ul className="bullets">
          {report.issues.map((i) => (
            <li key={i.id}>
              <strong>{i.level === "high" ? "חשוב: " : ""}</strong>
              {i.text}. <span className="hint">{i.tip}</span>
            </li>
          ))}
        </ul>
      )}
      {report.duplicates.length > 0 && (
        <p className="hint">
          פעולות דומות במאגר:{" "}
          {report.duplicates.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/library/${d.id}`}>{d.title}</Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
