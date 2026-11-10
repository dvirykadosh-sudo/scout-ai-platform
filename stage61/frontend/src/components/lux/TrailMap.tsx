"use client";

// שלב 61 (רעיון 15): התכנון השנתי כמסע. שביל מתפתל מספטמבר עד אוגוסט, ועליו תחנות: חגים, מחנות, טקסים, פעולות ואירועי שבט.
// המפה היא תצוגה; כל התחנות מופיעות גם כרשימה נגישה לפי חודש (לקוראי מסך ולמי שמעדיף טקסט).
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "../Providers";
import { PageTitle, Skeleton } from "../ui";
import { Eagle, ILLUS, type IllusName } from "./illus";

type Kind = "holiday" | "camp" | "ceremony" | "activity" | "team";
interface Station {
  date: string;
  title: string;
  kind: Kind;
  href?: string;
  time?: string;
}
interface Trail {
  year: number;
  from: string;
  to: string;
  today: string;
  stations: Station[];
}

const KIND: Record<Kind, { label: string; icon: IllusName; color: string }> = {
  holiday: { label: "חגים", icon: "campfire", color: "#fb923c" },
  camp: { label: "מחנות", icon: "tent", color: "#34d399" },
  ceremony: { label: "טקסים", icon: "flag", color: "#a78bfa" },
  activity: { label: "הפעולות שלי", icon: "compass", color: "#60a5fa" },
  team: { label: "אירועי שבט", icon: "star", color: "#f472b6" },
};
const MONTHS = ["ספטמבר", "אוקטובר", "נובמבר", "דצמבר", "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט"];
// 12 חודשים בשלוש שורות של ארבעה, בנחש. ציר X כפי שנראה על המסך (RTL: השורה הראשונה מתחילה מימין).
const W = 1000;
const H = 640;
const ROWS = [110, 320, 530];
const X0 = 90;
const X1 = 910;
const PATH = `M ${X1} ${ROWS[0]} L ${X0} ${ROWS[0]} C ${X0 - 150} ${ROWS[0]}, ${X0 - 150} ${ROWS[1]}, ${X0} ${ROWS[1]} L ${X1} ${ROWS[1]} C ${X1 + 150} ${ROWS[1]}, ${X1 + 150} ${ROWS[2]}, ${X1} ${ROWS[2]} L ${X0} ${ROWS[2]}`;

/** חודש-שנת צופים (0 = ספטמבר) וחלק היחסי בחודש */
function pos(date: string, from: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  const f = new Date(`${from}T12:00:00Z`);
  const idx = (d.getUTCFullYear() - f.getUTCFullYear()) * 12 + d.getUTCMonth() - f.getUTCMonth();
  const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.max(0, Math.min(11.999, idx + (d.getUTCDate() - 1) / dim));
}
const monthOf = (date: string, from: string) => Math.floor(pos(date, from));
const he = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "long" });

export function TrailMap() {
  const { token } = useAuth();
  const [t, setT] = useState<Trail | null>(null);
  const [error, setError] = useState("");
  const [on, setOn] = useState<Record<Kind, boolean>>({ holiday: true, camp: true, ceremony: true, activity: true, team: true });
  const [sel, setSel] = useState<number | null>(null);
  const path = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Trail>(`/api/lux/trail${year ? `?year=${year}` : ""}`, { token })
      .then((d) => {
        setT(d);
        setSel((s) => s ?? monthOf(d.today >= d.from && d.today <= d.to ? d.today : d.from, d.from));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [token, year]);
  useLayoutEffect(() => setLen(path.current?.getTotalLength() ?? 0), [t]);

  const at = (p: number) => {
    const el = path.current;
    if (!el || !len) return { x: 0, y: 0 };
    const pt = el.getPointAtLength((p / 12) * len);
    return { x: pt.x, y: pt.y };
  };

  const shown = useMemo(() => (t?.stations ?? []).filter((s) => on[s.kind]), [t, on]);
  const byMonth = useMemo(() => {
    const m: Station[][] = Array.from({ length: 12 }, () => []);
    if (t) for (const s of shown) m[monthOf(s.date, t.from)].push(s);
    return m;
  }, [shown, t]);

  if (!token) return <p className="card">צריך להתחבר כדי לראות את שביל השנה.</p>;
  if (error)
    return (
      <p className="error-box" role="alert">
        {error}
      </p>
    );
  if (!t) return <Skeleton lines={6} />;

  const todayIn = t.today >= t.from && t.today <= t.to;
  const you = todayIn ? at(pos(t.today, t.from)) : null;
  const counts = Object.fromEntries((Object.keys(KIND) as Kind[]).map((k) => [k, t.stations.filter((s) => s.kind === k).length])) as Record<Kind, number>;

  return (
    <div className="lux-trail">
      <PageTitle lead={`שנת הצופים (ספטמבר ${t.year} עד אוגוסט ${t.year + 1}): ${t.stations.length} תחנות. לחצו על חודש כדי לראות את מה שבו.`}>מפת שביל השנה</PageTitle>

      <div className="lux-trail-tools no-print">
        <div className="actions" role="group" aria-label="סינון תחנות">
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <button key={k} type="button" className="chip lux-kchip" aria-pressed={on[k]} onClick={() => setOn({ ...on, [k]: !on[k] })} style={{ ["--kc" as string]: KIND[k].color }}>
              <span className="dot" aria-hidden="true" />
              {KIND[k].label} ({counts[k]})
            </button>
          ))}
        </div>
        <span className="actions">
          <button type="button" className="btn btn-small" onClick={() => setYear(t.year - 1)}>
            שנה קודמת
          </button>
          <button type="button" className="btn btn-small" onClick={() => setYear(t.year + 1)}>
            שנה הבאה
          </button>
        </span>
      </div>

      <div className="card glass lux-trail-map">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`מפת שביל השנה ${t.year} עם ${shown.length} תחנות. הרשימה המלאה מתחת למפה.`}>
          <defs>
            <linearGradient id="trail-g" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--lx-a, #f97316)" />
              <stop offset="1" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <path d={PATH} className="trail-bed" />
          <path ref={path} d={PATH} className="trail-line" stroke="url(#trail-g)" />
          {len > 0 &&
            MONTHS.map((m, i) => {
              const p = at(i + 0.04);
              const sx = i % 4;
              void sx;
              return (
                <g key={m} className={`trail-month ${sel === i ? "on" : ""}`} transform={`translate(${p.x} ${p.y})`}>
                  <circle r="9" className="tm-dot" />
                  <text y="46" textAnchor="middle" className="tm-label">
                    {m}
                  </text>
                </g>
              );
            })}
          {len > 0 &&
            byMonth.flatMap((list, mi) =>
              list.slice(0, 6).map((s, si) => {
                const frac = pos(s.date, t.from);
                const p = at(frac);
                const off = -(26 + (si % 4) * 20); // כל התחנות מעל השביל, והשם של החודש מתחתיו
                const sel2 = sel === mi;
                return (
                  <g key={`${s.kind}-${s.date}-${s.title}-${si}`} transform={`translate(${p.x} ${p.y + off})`} className={`trail-st ${sel2 ? "on" : ""}`} style={{ ["--kc" as string]: KIND[s.kind].color }}>
                    <line x1="0" y1="0" x2="0" y2={-off} className="stem" />
                    <circle r="11" className="pin" />
                    <circle r="4" className="core" />
                  </g>
                );
              }),
            )}
          {you && (
            <g transform={`translate(${you.x - 26} ${you.y - 72})`} className="trail-you">
              <foreignObject width="52" height="56">
                <Eagle mood="wave" size={52} />
              </foreignObject>
              <text x="26" y="70" textAnchor="middle" className="you-label">
                אתם כאן
              </text>
            </g>
          )}
        </svg>
        <ol className="lux-months" aria-label="חודשי השנה">
          {MONTHS.map((m, i) => (
            <li key={m}>
              <button type="button" aria-pressed={sel === i} onClick={() => setSel(i)} className={`lux-mchip ${sel === i ? "on" : ""}`}>
                {m}
                {byMonth[i].length > 0 && <span className="n">{byMonth[i].length}</span>}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {sel !== null && (
        <section className="card glass" aria-labelledby="trail-sel">
          <h2 id="trail-sel" className="section-title">
            {MONTHS[sel]}
          </h2>
          {byMonth[sel].length === 0 ? (
            <p>אין תחנות בחודש הזה לפי הסינון. אפשר לתזמן פעולה ביומן והיא תופיע כאן.</p>
          ) : (
            <ul className="lux-stlist">
              {byMonth[sel].map((s, i) => {
                const I = ILLUS[KIND[s.kind].icon];
                return (
                  <li key={i} style={{ ["--kc" as string]: KIND[s.kind].color }}>
                    <I size={34} className="ico" />
                    <span className="d">{he(s.date)}</span>
                    <span className="tt">{s.href ? <Link href={s.href}>{s.title}</Link> : s.title}</span>
                    <span className="kk">{KIND[s.kind].label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      <p className="hint">תאריכי החגים מחושבים מהלוח העברי ומציגים את היום הראשון של החג (יום העצמאות והזיכרון נומינליים, בלי הזזות שבת).</p>
    </div>
  );
}
