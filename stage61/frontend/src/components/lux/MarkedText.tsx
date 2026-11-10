"use client";

// שלב 61 (רעיון 18): הטקסט של הטיוטה עם הקטעים שהגיבו עליהם מסומנים, ובועת הערה בשוליים לכל קטע.
// במסך רחב הבועות בשוליים (במיקום האנכי של הקטע). במסך צר הבועה צמודה לקטע. לחיצה מובילה להערה ברשימה.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface MarkComment {
  id: number;
  authorName: string;
  quote: string;
  body: string;
  resolved: boolean;
}
interface Seg {
  text: string;
  cid?: number;
}

/** מפצל את הטקסט לקטעים. כל הערה (לא סגורה) תופסת את ההופעה הראשונה של הציטוט שלה, בלי חפיפות. */
export function segmentText(text: string, comments: MarkComment[]): Seg[] {
  const ranges: { a: number; b: number; id: number }[] = [];
  for (const c of comments) {
    const q = c.quote?.trim();
    if (!q || c.resolved) continue;
    const a = text.indexOf(q);
    if (a < 0) continue;
    const b = a + q.length;
    if (ranges.some((r) => a < r.b && b > r.a)) continue;
    ranges.push({ a, b, id: c.id });
  }
  ranges.sort((x, y) => x.a - y.a);
  const out: Seg[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.a > at) out.push({ text: text.slice(at, r.a) });
    out.push({ text: text.slice(r.a, r.b), cid: r.id });
    at = r.b;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

export function MarkedText({ text, comments, onOpen }: { text: string; comments: MarkComment[]; onOpen: (id: number) => void }) {
  const segs = useMemo(() => segmentText(text, comments), [text, comments]);
  const wrap = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<Record<number, number>>({});
  const byId = useMemo(() => new Map(comments.map((c, i) => [c.id, { c, n: i + 1 }])), [comments]);

  const measure = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const base = el.getBoundingClientRect().top;
    const next: Record<number, number> = {};
    let prev = -999;
    el.querySelectorAll<HTMLElement>("mark[data-cid]").forEach((m) => {
      const id = Number(m.dataset.cid);
      let t = m.getBoundingClientRect().top - base;
      if (t < prev + 34) t = prev + 34; // בועות סמוכות לא נערמות זו על זו
      next[id] = t;
      prev = t;
    });
    setTops((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
  }, []);
  useLayoutEffect(measure, [measure, segs]);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const label = (id: number) => {
    const x = byId.get(id);
    return x ? `הערה ${x.n} מאת ${x.c.authorName}: ${x.c.body.slice(0, 60)}` : "הערה";
  };
  return (
    <div className="lux-marked" ref={wrap}>
      <div className="lux-marked-text">
        {segs.map((s, i) =>
          s.cid ? (
            <mark key={i} id={`mark-${s.cid}`} data-cid={s.cid} className="lux-cmark">
              {s.text}
              <button type="button" className="lux-cbub lux-cbub-inline" aria-label={label(s.cid)} title={label(s.cid)} onClick={() => onOpen(s.cid!)}>
                {byId.get(s.cid)?.n}
              </button>
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
      <div className="lux-margin" aria-hidden={false}>
        {segs
          .filter((s) => s.cid)
          .map((s) => (
            <button key={s.cid} type="button" className="lux-cbub lux-cbub-margin" style={{ top: tops[s.cid!] ?? 0 }} aria-label={label(s.cid!)} title={label(s.cid!)} onClick={() => onOpen(s.cid!)} tabIndex={-1}>
              {byId.get(s.cid!)?.n}
            </button>
          ))}
      </div>
    </div>
  );
}
