"use client";

// לוח שנה חודשי עם נקודות צבעוניות לפי סוג האירוע. לחיצה על יום בוחרת אותו (והרשימה שלידו מתעדכנת).
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DashEvent, EventKind } from "./dash-calc";
import { KIND_LABEL } from "./dash-calc";
import { DOW_SHORT, MONTHS, monthGrid, todayIso } from "./dates";

const KINDS: EventKind[] = ["library", "free", "team", "remind"];

export function MonthCalendar({ events, selected, onSelect }: { events: DashEvent[]; selected: string | null; onSelect: (iso: string | null) => void }) {
  const today = todayIso();
  const [cur, setCur] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const cells = useMemo(() => monthGrid(cur.y, cur.m), [cur]);
  const byDay = useMemo(() => {
    const m = new Map<string, DashEvent[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);
  const step = (n: number) => setCur(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <section aria-label="לוח שנה">
      <div className="db-cal-head">
        <button type="button" className="db-cal-nav" aria-label="החודש הקודם" onClick={() => step(-1)}><ChevronRight size={18} aria-hidden="true" /></button>
        <strong aria-live="polite">{MONTHS[cur.m]} {cur.y}</strong>
        <button type="button" className="db-cal-nav" aria-label="החודש הבא" onClick={() => step(1)}><ChevronLeft size={18} aria-hidden="true" /></button>
      </div>
      <div className="db-cal-grid" role="group" aria-label={`ימי ${MONTHS[cur.m]}`}>
        {DOW_SHORT.map((d) => <span key={d} className="db-cal-dow" aria-hidden="true">{d}</span>)}
        {cells.map((c) => {
          const evs = byDay.get(c.iso) ?? [];
          const kinds = KINDS.filter((k) => evs.some((e) => e.kind === k));
          return (
            <button
              key={c.iso}
              type="button"
              className={`db-cal-day${c.inMonth ? "" : " out"}${c.iso === today ? " today" : ""}`}
              aria-pressed={selected === c.iso}
              aria-label={`${c.day} ${MONTHS[Number(c.iso.slice(5, 7)) - 1]}${evs.length ? `, ${evs.length} אירועים` : ""}${c.iso === today ? ", היום" : ""}`}
              onClick={() => onSelect(selected === c.iso ? null : c.iso)}
            >
              <span aria-hidden="true">{c.day}</span>
              <span className="db-cal-dots" aria-hidden="true">{kinds.slice(0, 3).map((k) => <i key={k} className={`dot-${k}`} />)}</span>
            </button>
          );
        })}
      </div>
      <ul className="db-cal-legend" aria-label="מקרא">
        {KINDS.map((k) => <li key={k}><i className={`dot-${k}`} aria-hidden="true" />{KIND_LABEL[k]}</li>)}
      </ul>
    </section>
  );
}
