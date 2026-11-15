"use client";

// שלב 67: כרטיס פיקוד מרכזי בעמוד הבית (בהשראת Spatial Liquid Glass).
// ליבה זוהרת במרכז = יצירת פעולה חכמה. סביבה שישה צמתים, וכולם קישורים או כפתורים אמיתיים (נגישים במקלדת).
// הטיית התלת-ממד, הזוהר והקווים הזורמים הם עיצוב בלבד: ב-RTL, בניגודיות גבוהה, בחיסכון ובהפחתת תנועה זה נראה שטוח.
import Link from "next/link";
import { useRef, type PointerEvent as RPointerEvent, type ReactNode } from "react";

const svg = (d: string): ReactNode => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);

interface NodeDef {
  key: string;
  label: string;
  hint: string;
  href?: string;
  ask?: boolean;
  icon: ReactNode;
}

// שלושה מימין ושלושה משמאל (פיזית). הסדר ב-DOM הוא סדר הקריאה: קודם הצד הימני.
const RIGHT: NodeDef[] = [
  { key: "write", label: "כתיבה חופשית", hint: "עורך עם הצעות מתודה", href: "/write", icon: svg("M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 8.5l3 3") },
  { key: "library", label: "מאגר הפעולות", hint: "לחפש ולהתאים", href: "/library", icon: svg("M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5zM8 7h6") },
  { key: "assistant", label: "עוזר הכתיבה", hint: "בודק ומשפר טיוטה", href: "/assistant", icon: svg("M5 9h14v9H5zM9 13h.01M15 13h.01M12 5v4") },
];
const LEFT: NodeDef[] = [
  { key: "ask", label: "שאל את מעוז", hint: "עונה ועוזר לכתוב", ask: true, icon: svg("M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 21 12z") },
  { key: "plan", label: "תכנון תקופתי", hint: "שבועות וחודשים", href: "/plan", icon: svg("M5 5h14v15H5zM5 10h14M9 3v4M15 3v4") },
  { key: "tools", label: "כלים ורעיונות", hint: "משחקים, סיפורים, שאלות", href: "/tools", icon: svg("M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.6-.6-.6-2.6 2.7-2.3z") },
];

function Node({ n, side, i }: { n: NodeDef; side: "r" | "l"; i: number }) {
  const body = (
    <>
      <span className="v21-node-ic">{n.icon}</span>
      <span className="v21-node-tx">
        <strong>{n.label}</strong>
        <span>{n.hint}</span>
      </span>
    </>
  );
  const cls = `v21-node v21-node-${side}`;
  const style = { ["--i" as string]: i };
  return (
    <li style={style}>
      {n.href ? (
        <Link href={n.href} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" className={cls} onClick={() => window.dispatchEvent(new CustomEvent("scout:eagle"))}>
          {body}
        </button>
      )}
    </li>
  );
}

export function SpatialCommand({ onCreate }: { onCreate: () => void }) {
  const stage = useRef<HTMLDivElement | null>(null);

  // הטיה עדינה אחרי העכבר. רק במכשיר עם עכבר, ורק כשהתנועה מותרת (ה-CSS מתעלם מהמשתנים בכל מצב אחר).
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const el = stage.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--px", (x * 2).toFixed(3));
    el.style.setProperty("--py", (y * 2).toFixed(3));
  };
  const leave = () => {
    stage.current?.style.setProperty("--px", "0");
    stage.current?.style.setProperty("--py", "0");
  };

  return (
    <section className="v21-stage" aria-labelledby="v21-cmd-title" ref={stage} onPointerMove={move} onPointerLeave={leave}>
      <span className="v21-atmos" aria-hidden="true" />
      <div className="v21-command">
        <h2 id="v21-cmd-title" className="v21-cmd-title">
          מרכז הפיקוד
        </h2>
        <div className="v21-cmd-grid">
          <svg className="v21-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {[16.7, 50, 83.3].flatMap((y, i) => [
              <path key={`a${i}`} className="v21-link" d={`M37 ${y} C 42 ${y}, 42 50, 45 50`} />,
              <path key={`b${i}`} className="v21-link" d={`M63 ${y} C 58 ${y}, 58 50, 55 50`} />,
            ])}
          </svg>
          <ul className="v21-nodes v21-nodes-r" aria-label="קיצורי דרך, צד ימין">
            {RIGHT.map((n, i) => (
              <Node key={n.key} n={n} side="r" i={i} />
            ))}
          </ul>
          <div className="v21-core-wrap">
            <button type="button" className="v21-core" onClick={onCreate} aria-label="יצירת פעולה חכמה">
              <span className="v21-core-ring" aria-hidden="true" />
              <span className="v21-core-ring v21-core-ring-2" aria-hidden="true" />
              <span className="v21-core-sq" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor" aria-hidden="true" focusable="false">
                  <path d="M12 2.5l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2 2-5.6zM19 15l.9 2.5 2.6.9-2.6.9L19 22l-.9-2.7-2.6-.9 2.6-.9L19 15z" />
                </svg>
              </span>
              <span className="v21-core-tx">
                <strong>מעוז</strong>
                <span>יצירת פעולה חכמה</span>
              </span>
            </button>
          </div>
          <ul className="v21-nodes v21-nodes-l" aria-label="קיצורי דרך, צד שמאל">
            {LEFT.map((n, i) => (
              <Node key={n.key} n={n} side="l" i={i} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
