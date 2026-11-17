"use client";

// שלב 69: פס סטטיסטיקה של העורך (V21) ומד דופק פדגוגי חי.
// הגרף מתעדכן תוך כדי כתיבה, לפי סוג השלבים והמילים בהם. החישוב מקומי בדפדפן בלבד: הטקסט לא נשלח לשום מקום.
// הגרף: אנרגיה = קו רצוף עם עיגולים, קשב = קו מקווקו עם ריבועים, נקודת נפילה = מעוין. כך שאין תלות בצבע בלבד.
import { useDeferredValue, useMemo } from "react";
import { LEVEL_LABEL, MODE_LABEL, analyzePulse, transitionFor, type TransitionGame } from "@/lib/pulse";
import type { Block } from "../WriteParts";
import { StatPill } from "./StatPill";
import { StatStrip } from "./StatStrip";

const W = 400;
const H = 150;
const PX = 26;
const PY = 16;

export function WritePulse({ blocks, total, onInsert }: { blocks: Block[]; total: number; onInsert: (afterIndex: number, game: TransitionGame) => void }) {
  const slow = useDeferredValue(blocks);
  const r = useMemo(() => analyzePulse(slow), [slow]);
  const used = slow.filter((b) => b.title.startsWith("משחק מעבר")).length;
  const n = r.points.length;

  // RTL: השלב הראשון בימין
  const x = (i: number) => (n <= 1 ? W / 2 : W - PX - (i * (W - 2 * PX)) / (n - 1));
  const y = (v: number) => H - PY - (v / 100) * (H - 2 * PY);
  const line = (key: "energy" | "attention") => r.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const empty = r.level === "empty";
  const readyCount = Math.round(r.readyShare * n);

  return (
    <section className="v21-pulse no-print" aria-labelledby="pulse-title">
      <StatStrip
        label="מצב הפעולה בעורך"
        tiles={[
          { key: "stages", hero: "dark", label: "שלבים בפעולה", value: n, sub: `${total} דקות בסך הכול`, ring: { value: r.readyShare, label: `${readyCount} מתוך ${n} שלבים עם תוכן` } },
          { key: "pulse", hero: "brand", label: "דופק פדגוגי", value: LEVEL_LABEL[r.level], sub: empty ? "מחכה לטקסט" : `קשב נמוך ביותר: ${r.minAttention}%`, ring: { value: empty ? 0 : r.avgEnergy / 100, label: `אנרגיה ממוצעת ${r.avgEnergy} מתוך 100` } },
          {
            key: "drops",
            label: "נקודות נפילת קשב",
            value: r.drops.length,
            pill: empty ? undefined : r.drops.length > 0 ? <StatPill tone="down" srPrefix="דורש תשומת לב">אפשר לתקן בלחיצה</StatPill> : <StatPill tone="up" srPrefix="תקין">אין נקודות בעייתיות</StatPill>,
          },
        ]}
      />
      <div className="card glass pulse-card">
        <h2 id="pulse-title" className="section-title">
          מד דופק פדגוגי <span className="pulse-live" aria-hidden="true" />
        </h2>
        <p className="hint">החישוב חי, מתבצע במכשיר שלכם בלבד, והטקסט לא נשלח לשום מקום. זו הערכה לפי סוג השלבים והמילים בהם, לא מדידה של הקבוצה.</p>
        {empty ? (
          <p role="status">{r.summary}</p>
        ) : (
          <>
            <svg className="pulse-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`גרף אנרגיה וקשב לאורך ${n} שלבים. ${r.summary}`} focusable="false">
              {[0, 50, 100].map((v) => (
                <line key={v} className="pulse-grid" x1={PX - 6} x2={W - PX + 6} y1={y(v)} y2={y(v)} />
              ))}
              <line className="pulse-floor" x1={PX - 6} x2={W - PX + 6} y1={y(40)} y2={y(40)} />
              {r.drops.map((d) => {
                const xm = (x(d.insertAfter) + x(Math.min(n - 1, d.insertAfter + 1))) / 2;
                return (
                  <g key={d.insertAfter} className="pulse-drop">
                    <line x1={xm} x2={xm} y1={PY} y2={H - PY} />
                    <polygon points={`${xm},${PY - 12} ${xm + 6},${PY - 5} ${xm},${PY + 2} ${xm - 6},${PY - 5}`} />
                  </g>
                );
              })}
              <path className="pulse-att" d={line("attention")} fill="none" />
              <path className="pulse-energy" d={line("energy")} fill="none" />
              {r.points.map((p, i) => (
                <g key={p.id}>
                  <rect className="pulse-att-dot" x={x(i) - 3.5} y={y(p.attention) - 3.5} width={7} height={7} />
                  <circle className="pulse-en-dot" cx={x(i)} cy={y(p.energy)} r={4} />
                  <text className="pulse-num" x={x(i)} y={H - 2} textAnchor="middle">
                    {i + 1}
                  </text>
                </g>
              ))}
            </svg>
            <p className="pulse-legend">
              <span>קו רצוף: אנרגיה</span> · <span>קו מקווקו: קשב</span> · <span>מעוין: נקודת נפילה</span>
            </p>
            <table className="sr-only">
              <caption>נתוני הגרף לפי שלב</caption>
              <thead>
                <tr>
                  <th scope="col">שלב</th>
                  <th scope="col">סוג</th>
                  <th scope="col">דקות</th>
                  <th scope="col">אנרגיה</th>
                  <th scope="col">קשב</th>
                </tr>
              </thead>
              <tbody>
                {r.points.map((p, i) => (
                  <tr key={p.id}>
                    <th scope="row">{i + 1}</th>
                    <td>{MODE_LABEL[p.mode]}</td>
                    <td>{p.minutes}</td>
                    <td>{p.energy}</td>
                    <td>{p.attention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p role="status" className="pulse-sum">
              {r.summary}
            </p>
            {r.drops.length > 0 && (
              <ul className="pulse-drops" aria-label="נקודות שבהן הקשב עלול ליפול">
                {r.drops.map((d, k) => {
                  const g = transitionFor(d, used + k);
                  return (
                    <li key={d.insertAfter}>
                      <p>{d.message}</p>
                      <button type="button" className="btn btn-small" onClick={() => onInsert(d.insertAfter, g)}>
                        הוספת משחק מעבר: {g.title} (+{g.minutes} דקות)
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
