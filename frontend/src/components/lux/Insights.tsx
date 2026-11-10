"use client";

// שלב 61 (רעיון 16): תובנות. מפת חום של השנה, רדאר ערכים, תמהיל מתודות ומוני התקדמות.
// כל גרף מלווה ברשימה טקסטואלית (לקוראי מסך ולמי שלא מבחין בצבעים), והצבעים לא נושאים את המידע לבדם.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useCountUp } from "@/lib/lux/motion";
import { useAuth } from "../Providers";
import { PageTitle, Skeleton } from "../ui";
import { EmptyState } from "./illus";

interface Ins {
  from: string;
  to: string;
  today: string;
  total: number;
  activeDays: number;
  minutes: number;
  streakWeeks: number;
  bestStreakWeeks: number;
  avgRating: number | null;
  planned: number;
  heat: Record<string, number>;
  months: Record<string, number>;
  values: { label: string; n: number }[];
  methods: { label: string; n: number; minutes: number }[];
}

const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
const DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
// פלטת Okabe-Ito: ניתנת להבחנה גם בעיוורון צבעים
const CH = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#9aa0a6"];

const d0 = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(d0(s).getTime() + n * 86400000));
const he = (s: string) => d0(s).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function Counter({ value, label, suffix = "", dec = 0 }: { value: number; label: string; suffix?: string; dec?: number }) {
  const v = useCountUp(Math.round(value * 10 ** dec));
  return (
    <div className="lux-counter card glass">
      <b>
        {(v / 10 ** dec).toLocaleString("he-IL", { minimumFractionDigits: dec, maximumFractionDigits: dec })}
        {suffix}
      </b>
      <span>{label}</span>
    </div>
  );
}

function Heat({ data }: { data: Ins }) {
  const start = useMemo(() => {
    const f = d0(data.from);
    return addDays(data.from, -f.getUTCDay());
  }, [data.from]);
  const weeks = Math.floor((d0(data.today).getTime() - d0(start).getTime()) / (7 * 86400000)) + 1;
  const C = 16;
  const W = weeks * C + 30;
  const cells: { x: number; y: number; date: string; n: number }[] = [];
  const labels: { x: number; t: string }[] = [];
  let lastM = -1;
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const date = addDays(start, w * 7 + r);
      if (date < data.from || date > data.today) continue;
      cells.push({ x: (weeks - 1 - w) * C, y: 22 + r * C, date, n: data.heat[date] ?? 0 });
      if (r === 0) {
        const m = d0(date).getUTCMonth();
        if (m !== lastM) {
          labels.push({ x: (weeks - 1 - w) * C + C, t: MONTHS[m] });
          lastM = m;
        }
      }
    }
  }
  const lvl = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);
  return (
    <div className="lux-heat-scroll">
      <svg viewBox={`0 0 ${W} ${22 + 7 * C + 4}`} className="lux-heat" role="img" aria-label={`מפת חום: ${data.activeDays} ימי פעילות מתוך השנה האחרונה. הפירוט לפי חודש מופיע מתחת.`}>
        {labels.map((l, i) => (
          <text key={i} x={l.x} y={12} textAnchor="end" className="hm-t">
            {l.t}
          </text>
        ))}
        {DAYS.map((t, r) => (
          <text key={t} x={W - 6} y={22 + r * C + 11} textAnchor="middle" className="hm-t">
            {t}
          </text>
        ))}
        {cells.map((c) => (
          <rect key={c.date} x={c.x} y={c.y} width={C - 3} height={C - 3} rx={3} className={`hm-c l${lvl(c.n)}`}>
            <title>{`${he(c.date)}: ${c.n === 0 ? "ללא פעילות" : c.n === 1 ? "פעולה אחת" : `${c.n} פעולות`}`}</title>
          </rect>
        ))}
      </svg>
      <div className="lux-heat-key" aria-hidden="true">
        פחות
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`hm-c l${l}`} />
        ))}
        יותר
      </div>
    </div>
  );
}

function Radar({ values }: { values: { label: string; n: number }[] }) {
  const v = values.slice(0, 8);
  const max = Math.max(...v.map((x) => x.n), 1);
  const R = 105;
  const pt = (i: number, k: number) => {
    const a = -Math.PI / 2 - (i / v.length) * Math.PI * 2; // נגד כיוון השעון: מתאים לקריאה מימין לשמאל
    return [Math.cos(a) * R * k, Math.sin(a) * R * k] as const;
  };
  if (v.length < 3)
    return (
      <ul className="lux-hbars">
        {v.map((x) => (
          <li key={x.label}>
            <span>{x.label}</span>
            <i style={{ width: `${(x.n / max) * 100}%` }} />
            <b>{x.n}</b>
          </li>
        ))}
      </ul>
    );
  const poly = v.map((x, i) => pt(i, x.n / max).join(",")).join(" ");
  return (
    <svg viewBox="-170 -140 340 280" className="lux-radar" role="img" aria-label={`רדאר ערכים: ${v.map((x) => `${x.label} ${x.n}`).join(", ")}`}>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={v.map((_, i) => pt(i, k).join(",")).join(" ")} className="rd-grid" />
      ))}
      {v.map((_, i) => (
        <line key={i} x1={0} y1={0} x2={pt(i, 1)[0]} y2={pt(i, 1)[1]} className="rd-grid" />
      ))}
      <polygon points={poly} className="rd-shape" />
      {v.map((x, i) => {
        const [px, py] = pt(i, x.n / max);
        const [lx, ly] = pt(i, 1.2);
        return (
          <g key={x.label}>
            <circle cx={px} cy={py} r={4} className="rd-dot" />
            <text x={lx} y={ly + 4} textAnchor={Math.abs(lx) < 8 ? "middle" : lx > 0 ? "start" : "end"} className="rd-t">
              {x.label.length > 14 ? `${x.label.slice(0, 13)}…` : x.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ methods }: { methods: Ins["methods"] }) {
  const useMin = methods.some((m) => m.minutes > 0);
  const items = methods.slice(0, 8).map((m) => ({ label: m.label, v: useMin ? m.minutes : m.n }));
  const sum = items.reduce((s, x) => s + x.v, 0) || 1;
  const Rr = 64;
  const C = 2 * Math.PI * Rr;
  let off = 0;
  return (
    <div className="lux-donut-wrap">
      <svg viewBox="0 0 180 180" className="lux-donut" role="img" aria-label={`תמהיל מתודות: ${items.map((x) => `${x.label} ${Math.round((x.v / sum) * 100)} אחוז`).join(", ")}`}>
        <g transform="rotate(-90 90 90)">
          {items.map((x, i) => {
            const len = (x.v / sum) * C;
            const el = <circle key={x.label} cx={90} cy={90} r={Rr} fill="none" stroke={CH[i % CH.length]} strokeWidth={26} strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`} strokeDashoffset={-off} className="dn-seg" style={{ ["--i" as string]: i }} />;
            off += len;
            return el;
          })}
        </g>
        <text x={90} y={86} textAnchor="middle" className="dn-big">
          {items.length}
        </text>
        <text x={90} y={106} textAnchor="middle" className="dn-sm">
          מתודות
        </text>
      </svg>
      <ul className="lux-legend">
        {items.map((x, i) => (
          <li key={x.label}>
            <i style={{ background: CH[i % CH.length] }} aria-hidden="true" />
            <span>{x.label}</span>
            <b>{Math.round((x.v / sum) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Insights() {
  const { token } = useAuth();
  const [d, setD] = useState<Ins | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    api<Ins>("/api/lux/insights", { token })
      .then(setD)
      .catch((e) => setError(errorMessage(e)));
  }, [token]);

  if (!token) return <p className="card">צריך להתחבר כדי לראות תובנות.</p>;
  if (error)
    return (
      <p className="error-box" role="alert">
        {error}
      </p>
    );
  if (!d) return <Skeleton lines={6} />;
  if (d.total === 0)
    return (
      <>
        <PageTitle lead="כל מה שעשיתם בשנה האחרונה, במבט אחד.">תובנות ומגמות</PageTitle>
        <EmptyState kind="trail" title="עוד אין נתונים לתובנות" text="אחרי שתתזמנו פעולות ביומן או תתעדו הפעלות, יופיעו כאן מפת חום, ערכים ומתודות.">
          <Link className="btn btn-primary" href="/calendar">
            ליומן הפעולות
          </Link>
        </EmptyState>
      </>
    );

  const keys: string[] = [];
  const t = d0(d.today);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1));
    keys.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const mMax = Math.max(...keys.map((k) => d.months[k] ?? 0), 1);

  return (
    <div className="lux-ins">
      <PageTitle lead={`השנה האחרונה (${he(d.from)} עד ${he(d.to)}). הנתונים שלכם בלבד.`}>תובנות ומגמות</PageTitle>
      <div className="lux-counters">
        <Counter value={d.total} label="פעולות שהתקיימו" />
        <Counter value={d.activeDays} label="ימי פעילות" />
        <Counter value={Math.round((d.minutes / 60) * 10) / 10} label="שעות עם החניכים" dec={1} />
        <Counter value={d.streakWeeks} label="שבועות ברצף" />
        {d.avgRating !== null && <Counter value={d.avgRating} label="דירוג ממוצע" dec={1} />}
      </div>
      {d.planned > 0 && <p className="hint">ועוד {d.planned} פעולות מתוכננות קדימה (לא נספרות כאן עד שיתקיימו).</p>}

      <section className="card glass" aria-labelledby="ins-heat">
        <h2 id="ins-heat" className="section-title">
          מפת חום: מתי פעלתם
        </h2>
        <Heat data={d} />
        <ul className="lux-monthlist" aria-label="פעולות לפי חודש">
          {keys.map((k) => (
            <li key={k}>
              <span>{MONTHS[Number(k.slice(5)) - 1]}</span>
              <i style={{ height: `${((d.months[k] ?? 0) / mMax) * 100}%` }} />
              <b>{d.months[k] ?? 0}</b>
            </li>
          ))}
        </ul>
        <p className="hint">הרצף הארוך ביותר שלכם בשנה: {d.bestStreakWeeks} שבועות.</p>
      </section>

      <div className="lux-ins-grid">
        <section className="card glass" aria-labelledby="ins-val">
          <h2 id="ins-val" className="section-title">
            רדאר ערכים
          </h2>
          {d.values.length === 0 ? <p>לפעולות שלכם עוד לא הוגדר ערך מוביל.</p> : <Radar values={d.values} />}
          {d.values.length > 0 && (
            <ul className="lux-legend plain">
              {d.values.map((v) => (
                <li key={v.label}>
                  <span>{v.label}</span>
                  <b>{v.n}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card glass" aria-labelledby="ins-met">
          <h2 id="ins-met" className="section-title">
            תמהיל מתודות
          </h2>
          {d.methods.length === 0 ? <p>כשתפעילו פעולות מהמחולל, יופיע כאן התמהיל של המתודות.</p> : <Donut methods={d.methods} />}
        </section>
      </div>
    </div>
  );
}
