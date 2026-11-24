"use client";

// שלב 75 (פריט 10): תבניות שנגזרות מהצלחות של המדריך עצמו.
// מסמך שהרצתם ודירגתם גבוה, או פעולה שסימנתם ״עבדה מצוין״, הופכים לנקודת פתיחה: אותם שלבים, סדר וזמנים, בלי הטקסט.
import { useEffect, useState } from "react";
import { api, errorMessage, fmtDate } from "@/lib/api";
import { useToast } from "./Providers";

interface DocRow {
  id: number;
  title: string;
  ageGroup: string;
  minutes: number | null;
  stages: number;
  runs: number;
  avgRating: number;
  lastRun: string | null;
  lastNote: string;
  score: number;
}
interface ActRow {
  id: number;
  title: string;
  ageGroup: string;
  minutes: number | null;
  stages: number;
  runs: number;
  lastRun: string | null;
}

export function RunTemplates({ token, busy, onOpen }: { token: string | null; busy: boolean; onOpen: (id: number) => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ docs: DocRow[]; activities: ActRow[] } | null>(null);
  const [working, setWorking] = useState("");

  useEffect(() => {
    if (!token) return;
    api<{ docs: DocRow[]; activities: ActRow[] }>("/api/write/templates/mine", { token })
      .then(setData)
      .catch(() => setData(null));
  }, [token]);

  if (!data || (!data.docs.length && !data.activities.length)) return null;
  const make = async (key: string, body: Record<string, unknown>) => {
    setWorking(key);
    try {
      const r = await api<{ id: number }>("/api/write/docs/from-run", { method: "POST", token, body });
      toast("נוצר מסמך חדש מהמבנה שעבד", { kind: "success" });
      onOpen(r.id);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
      setWorking("");
    }
  };
  const meta = (a: { ageGroup: string; minutes: number | null; stages: number }) => [a.ageGroup, a.minutes ? `${a.minutes} דקות` : "", `${a.stages} שלבים`].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby="w-runtpl" className="runtpl75">
      <h3 id="w-runtpl" className="subtitle">
        תבניות מהצלחות שלי
      </h3>
      <p className="hint">המבנה של פעולות שהצליחו אצלכם: אותם שלבים, סדר וזמנים, בלי הטקסט ובלי ההערות. ההצלחה נקבעת לפי הדירוג שנתתם ביומן ההרצות (ממוצע 4 ומעלה), או לפי פעולה שסימנתם ״עבדה מצוין״.</p>
      {data.docs.length > 0 && (
        <ul className="plain-list">
          {data.docs.slice(0, 5).map((d) => (
            <li key={`d${d.id}`}>
              <span>
                <strong>{d.title}</strong>{" "}
                <span className="hint">
                  · {meta(d)} · {d.runs} {d.runs === 1 ? "הרצה" : "הרצות"}, דירוג {d.avgRating.toFixed(1)} מתוך 5{d.lastRun ? ` · אחרונה ${fmtDate(d.lastRun)}` : ""}
                </span>
                {d.lastNote && <span className="hint"> · ״{d.lastNote.slice(0, 80)}״</span>}
              </span>
              <span className="actions">
                <button type="button" className="btn btn-small" disabled={busy || !!working} onClick={() => make(`d${d.id}s`, { docId: d.id, skeleton: true })}>
                  שלד חדש מהמבנה<span className="sr-only">: {d.title}</span>
                </button>
                <button type="button" className="btn btn-small" disabled={busy || !!working} onClick={() => make(`d${d.id}f`, { docId: d.id, skeleton: false })}>
                  עותק מלא<span className="sr-only">: {d.title}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.activities.length > 0 && (
        <>
          <h4 className="subtitle">פעולות שסימנתם ״עבדה מצוין״</h4>
          <ul className="plain-list">
            {data.activities.slice(0, 5).map((a) => (
              <li key={`a${a.id}`}>
                <span>
                  <strong>{a.title}</strong> <span className="hint">· {meta(a)}</span>
                </span>
                <button type="button" className="btn btn-small" disabled={busy || !!working} onClick={() => make(`a${a.id}`, { activityId: a.id, skeleton: true })}>
                  שלד חדש מהמבנה<span className="sr-only">: {a.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
