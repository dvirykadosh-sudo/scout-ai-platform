import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/ui";
import { MethodWheel } from "@/components/Depth3D2";
import { METHODS } from "@/lib/constants";

export const metadata: Metadata = { title: "ספריית המתודות" };

export default function MethodsPage() {
  return (
    <>
      <PageTitle lead="12 שיטות ההדרכה: מה כל אחת עושה ומתי כדאי להשתמש בה.">ספריית המתודות</PageTitle>
      <MethodWheel methods={METHODS} />
      <ul className="grid-list">
        {METHODS.map((m) => (
          <li key={m.name} className="card glass method-info">
            <h2 className="card-title">{m.name}</h2>
            <p>{m.description}</p>
            <dl className="mini-facts">
              <div>
                <dt>מתי להשתמש</dt>
                <dd>{m.whenToUse}</dd>
              </div>
              <div>
                <dt>דוגמה</dt>
                <dd>{m.example}</dd>
              </div>
            </dl>
            <Link className="btn" href={`/?method=${encodeURIComponent(m.name)}`}>
              הוספה למחולל
              <span className="sr-only"> את השיטה {m.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
