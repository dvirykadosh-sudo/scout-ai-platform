import { PageTitle } from "@/components/ui";
import { EmptyArt, KindIcon, AgeBadge } from "@/components/Polish";

export const metadata = { title: "מדריך סגנון" };

const KINDS = ["peak", "content", "value", "intro", "summary", "social", "field"];
const COLORS = [
  ["--accent", "סגול ראשי: כפתורים ומסגרות"],
  ["--accent-2", "סגול בהיר: הדגשות"],
  ["--blue-violet", "כחול-סגול: מידע משני"],
  ["--mint", "מנטה: הצלחה ואישור בלבד"],
  ["--danger", "ורוד-אדום: שגיאות"],
];

/** 300: עמוד אחד שמראה את הרכיבים, כדי לשמור על אחידות. */
export default function Page() {
  return (
    <>
      <PageTitle lead="הרכיבים והכללים של האתר במקום אחד. שימושי למי שמוסיף עמוד חדש.">מדריך סגנון</PageTitle>
      <section className="card" aria-labelledby="sg-colors">
        <h2 id="sg-colors" className="section-title">צבעים</h2>
        <ul className="plain-list">
          {COLORS.map(([v, d]) => (
            <li key={v}>
              <span><span className="sg-swatch" style={{ background: `var(${v})` }} aria-hidden="true" /> {d}</span>
            </li>
          ))}
        </ul>
        <p className="hint">כלל: צבע לא נושא מידע לבד. תמיד מוסיפים טקסט או סמל.</p>
      </section>
      <section className="card" aria-labelledby="sg-btn">
        <h2 id="sg-btn" className="section-title">כפתורים</h2>
        <div className="actions">
          <button type="button" className="btn btn-primary">פעולה ראשית</button>
          <button type="button" className="btn">פעולה רגילה</button>
          <button type="button" className="btn btn-small">קטן</button>
          <button type="button" className="btn btn-danger">מחיקה</button>
        </div>
      </section>
      <section className="card" aria-labelledby="sg-icons">
        <h2 id="sg-icons" className="section-title">סמלים לסוגי פעולה ותגי גיל</h2>
        <p>{KINDS.map((k) => <span key={k} className="chip chip-accent sg-gap"><KindIcon kind={k} /> {k}</span>)}</p>
        <ul className="chips"><AgeBadge grade="כיתה ד'" /><AgeBadge grade="כיתה ז'" /><AgeBadge grade="כיתה י'" /></ul>
      </section>
      <section className="card empty" aria-labelledby="sg-empty">
        <h2 id="sg-empty" className="section-title">מצב ריק</h2>
        <EmptyArt />
        <p>משפט קצר שאומר מה חסר ומה עושים עכשיו.</p>
      </section>
      <section className="card" aria-labelledby="sg-rules">
        <h2 id="sg-rules" className="section-title">כללים</h2>
        <ul>
          <li>רדיוסים: 8, 14 ו-20 פיקסלים. צללים: שלוש רמות.</li>
          <li>כל תנועה מוגדרת בתוך prefers-reduced-motion: no-preference.</li>
          <li>כל חלון נפתח עם כותרת, וכפתור סגירה נגיש.</li>
          <li>כל שדה עם תווית גלויה. אין placeholder במקום תווית.</li>
          <li>ניגודיות לפחות 4.5:1 בכהה, בבהיר ובניגודיות גבוהה.</li>
        </ul>
      </section>
    </>
  );
}
