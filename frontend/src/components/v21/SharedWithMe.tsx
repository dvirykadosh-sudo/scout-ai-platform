"use client";

// שלב 70: מסמכים של מדריכים אחרים שהוזמנתי לערוך (עריכה משותפת). לא מוצג כשאין כאלה.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/api";
import { useAuth } from "../Providers";

interface Row {
  id: number;
  title: string;
  owner: string;
  updatedAt: string;
}

export function SharedWithMe() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!token) return;
    api<Row[]>("/api/write/editing", { token })
      .then(setRows)
      .catch(() => setRows([]));
  }, [token]);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="w-shared" className="card glass">
      <h2 id="w-shared" className="section-title">
        שותפו איתי לעריכה
      </h2>
      <ul className="team70-shared">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/write/${r.id}`}>{r.title}</Link>
            <span className="hint">
              {" "}
              · של {r.owner} · עודכן {fmtDate(r.updatedAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
