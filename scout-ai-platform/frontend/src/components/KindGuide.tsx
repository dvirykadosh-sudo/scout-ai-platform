"use client";

import Link from "next/link";
import type { KindInfo } from "@/lib/kinds";
import { useKinds } from "@/lib/kinds";

/** What a kind is, when to use it, and how its five stages are built. */
export function KindDetails({ k }: { k: KindInfo }) {
  return (
    <div className="kind-details">
      <p>{k.what}</p>
      <p>
        <strong>מתי מתאים: </strong>
        {k.when}
      </p>
      <p>
        <strong>המבנה: </strong>
      </p>
      <ol className="kind-structure">
        {k.structure.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p>
        <strong>דוגמה: </strong>
        {k.example}
      </p>
      <p className="meta">אורך רגיל: {k.minutes} דקות</p>
    </div>
  );
}

export function KindGuide() {
  const kinds = useKinds();
  if (!kinds.length) return <p className="meta" role="status">טוען...</p>;
  return (
    <ul className="kind-guide">
      {kinds.map((k) => (
        <li key={k.id} className="card glass">
          <h2 className="card-title">{k.label}</h2>
          <p className="lead-small">{k.short}</p>
          <KindDetails k={k} />
          <div className="actions">
            <Link className="btn btn-primary" href={`/?kind=${k.id}#quick`}>
              יצירת {k.label}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
