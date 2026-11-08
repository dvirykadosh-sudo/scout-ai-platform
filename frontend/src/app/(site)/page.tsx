import { Suspense } from "react";
import { HomeShell } from "@/components/HomeShell";

// עמוד הבית: שער כהה בסגנון Bento Glass (עיצוב בקובץ globals.css, בלוק "עמוד הבית"). כל הכלים נשארים בדיוק כמו קודם.
const CHIPS = ["חמישה שלבים בכל פעולה", "ייצוא ל-Word בלחיצה", "מאגר פעולות מוכן"];

export default function HomePage() {
  return (
    <div className="lux-home">
      <header className="page-title lux-hero">
        <span className="lux-orb lux-orb-a" aria-hidden="true" />
        <span className="lux-orb lux-orb-b" aria-hidden="true" />
        <p className="lux-eyebrow">שבט מעוז · מחולל פעולות</p>
        <h1 className="lux-title">יצירת פעולה חכמה</h1>
        <p className="lead lux-lead">ממלאים כמה פרטים, בוחרים שיטות וזמנים, ומקבלים פעולה מלאה בחמישה שלבים שאפשר לייצא ל-Word.</p>
        <ul className="lux-chips" aria-label="מה מקבלים">
          {CHIPS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </header>
      <Suspense fallback={null}>
        <HomeShell />
      </Suspense>
    </div>
  );
}
