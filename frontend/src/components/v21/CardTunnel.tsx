"use client";

// שלב 67: "מנהרת כרטיסים" תלת-ממדית: ארבע פעולות אמיתיות מהמאגר, מוטות סביב מרכז המסך.
// כל כרטיס הוא קישור רגיל לפעולה. בנייד, בניגודיות גבוהה, בחיסכון ובהפחתת תנועה זה גריד שטוח בלי הטיה.
import Link from "next/link";
import type { Activity } from "@/lib/types";
import { KIND_LABELS } from "@/lib/kind-labels";

export function CardTunnel({ items }: { items: Activity[] }) {
  // ארבעה כרטיסים בדיוק: ההטיה מוגדרת לפי מיקום. עם פחות ממאגר קטן, המנהרה פשוט לא מוצגת
  if (items.length < 4) return null;
  const list = items.slice(0, 4);
  return (
    <section className="v21-tunnel-wrap" aria-labelledby="v21-tunnel-title">
      <h2 id="v21-tunnel-title" className="section-title">
        כמה פעולות מהמאגר
      </h2>
      <div className="v21-tunnel">
        <span className="v21-atmos v21-atmos-soft" aria-hidden="true" />
        <ul className="v21-tunnel-list">
          {list.map((a, i) => {
            const kind = a.kind ? KIND_LABELS[a.kind] : "";
            return (
              <li key={a.id} className={`v21-tcard v21-tcard-${i + 1}`}>
                <Link href={`/library/${a.id}`} className="v21-tcard-link">
                  {kind && <span className="v21-tcard-kind">{kind}</span>}
                  <strong className="v21-tcard-title">{a.title}</strong>
                  <span className="v21-tcard-meta">
                    <span>{a.durationMin} דקות</span>
                    <span>{a.ageGroup.replace("כיתה ", "")}</span>
                    <span>{a.stages.length} שלבים</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
