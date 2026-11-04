"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./Providers";

interface Row {
  id: string;
  label: string;
  recommended: number;
  mine: number | null;
}

/** Recommended yearly mix of activity kinds, next to what the signed-in instructor made in the last 12 months. */
export function YearMix() {
  const { token } = useAuth();
  const [data, setData] = useState<{ total: number; items: Row[] } | null>(null);
  useEffect(() => {
    let live = true;
    api<{ total: number; items: Row[] }>("/api/year-mix", { token })
      .then((d) => live && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [token]);
  if (!data) return null;
  const hasMine = data.items.some((r) => r.mine !== null);
  return (
    <section className="card glass year-mix" aria-labelledby="ym-h">
      <h2 id="ym-h" className="card-title">תמהיל מומלץ לשנה</h2>
      <p className="meta">בשנה של כ-{data.total} מפגשים, כך כדאי לחלק בין הסוגים. זו המלצה, לא חובה.</p>
      <table className="plan-table">
        <caption className="sr-only">כמה פעולות מכל סוג מומלץ לתכנן בשנה</caption>
        <thead>
          <tr>
            <th scope="col">סוג</th>
            <th scope="col">מומלץ בשנה</th>
            {hasMine && <th scope="col">יצרתי ב-12 החודשים האחרונים</th>}
          </tr>
        </thead>
        <tbody>
          {data.items.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}</th>
              <td>{r.recommended}</td>
              {hasMine && <td>{r.mine}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
