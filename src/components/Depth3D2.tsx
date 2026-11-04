"use client";

// שלב 48: הרעיונות שנדחו משלב 46 (307, 308, 313, 316, 317, 318, 319, 321, 324).
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Activity, Stage } from "@/lib/types";
import type { MethodInfo } from "@/lib/constants";
import { Modal } from "./ui";
import type { Block } from "./WriteParts";

const calm = () => typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("hc");

/** 307: גלגל מתודות תלת-ממדי. בהפחתת תנועה הוא הופך לרשימת כפתורים רגילה. */
export function MethodWheel({ methods }: { methods: MethodInfo[] }) {
  const [on, setOn] = useState(false);
  const [i, setI] = useState(0);
  const n = methods.length;
  const m = methods[i];
  const go = (d: number) => setI((x) => (x + d + n) % n);
  return (
    <section className="wheel-wrap" aria-label="גלגל מתודות">
      <button type="button" className="btn" aria-pressed={on} onClick={() => setOn(!on)}>{on ? "הסתרת הגלגל" : "תצוגת גלגל"}</button>
      {on && (
        <div className="wheel-box">
          <div className="wheel-scene">
            <ul className="wheel-ring" style={{ ["--wheel-rot" as string]: `${-i * (360 / n)}deg`, ["--wheel-n" as string]: n }} aria-label="המתודות">
              {methods.map((x, k) => (
                <li key={x.name} style={{ ["--k" as string]: k }}>
                  <button type="button" className="wheel-item" aria-current={k === i ? "true" : undefined} onClick={() => setI(k)}>{x.name}</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={() => go(1)}>הקודמת</button>
            <button type="button" className="btn btn-small" onClick={() => go(-1)}>הבאה</button>
          </div>
          <div className="card wheel-detail" role="status" aria-live="polite">
            <h3>{m.name}</h3>
            <p>{m.description}</p>
            <p><strong>מתי:</strong> {m.whenToUse}</p>
            <p><strong>דוגמה:</strong> {m.example}</p>
          </div>
        </div>
      )}
    </section>
  );
}

/** 308: שלבי הפעולה כשביל בפרספקטיבה. */
export function TrailStages({ stages }: { stages: Stage[] }) {
  const n = stages.length;
  const pts = stages.map((_, i) => ({ x: 50 + (n > 1 ? (i * 500) / (n - 1) : 250), y: 150 + Math.sin(i * 1.4) * 70 }));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  return (
    <div className="trail">
      <div className="trail-scene" aria-hidden="true">
        <svg className="trail-plane" viewBox="0 0 600 300">
          <rect width="600" height="300" rx="20" fill="#dff3df" />
          <path d={d} fill="none" stroke="#b5a37a" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="2 14" strokeLinecap="round" />
          {pts.map((p, i) => (
            <g key={i} transform={`translate(${p.x},${p.y})`}>
              <circle r="20" fill="#5d2fa3" stroke="#fff" strokeWidth="3" />
              <text textAnchor="middle" dy="7" fontSize="20" fontWeight="700" fill="#fff">{i + 1}</text>
            </g>
          ))}
        </svg>
      </div>
      <ol className="trail-list">
        {stages.map((s, i) => (<li key={i}><strong>{s.name}</strong> · {s.minutes} דקות. {s.content}</li>))}
      </ol>
    </div>
  );
}

const ISR: [number, number][] = [[35.10, 33.09], [35.62, 33.27], [35.84, 32.75], [35.55, 32.38], [35.40, 31.50], [35.55, 31.20], [35.45, 30.60], [35.15, 30.00], [34.90, 29.50], [34.27, 31.22], [34.55, 31.55], [34.75, 32.05], [34.95, 32.60]];
/** 317: מפת ישראל סכמטית בהבלטה, עם סימון ראשון לציון. */
export function IsraelMap3D() {
  const box = useRef<HTMLDivElement>(null);
  const X = (lon: number) => ((lon - 34.0) / 2.0) * 200 + 20;
  const Y = (lat: number) => ((33.5 - lat) / 4.2) * 300 + 10;
  const path = ISR.map(([a, b], i) => `${i ? "L" : "M"}${X(a).toFixed(1)} ${Y(b).toFixed(1)}`).join(" ") + "Z";
  useEffect(() => {
    const el = box.current;
    if (!el || calm()) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--ry", `${(Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 500)) * 18).toFixed(1)}deg`);
      el.style.setProperty("--rx", `${(30 - Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 400)) * 10).toFixed(1)}deg`);
    };
    document.addEventListener("pointermove", move);
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return (
    <section className="card glass" aria-labelledby="map3d-t">
      <h2 id="map3d-t" className="section-title">השבט על המפה</h2>
      <div className="map3d" ref={box}>
        <svg viewBox="0 0 240 320" className="map3d-svg" role="img" aria-label="מפה סכמטית של ישראל עם סימון של ראשון לציון">
          {Array.from({ length: 8 }, (_, k) => (<path key={k} d={path} transform={`translate(0 ${(8 - k) * 1.6})`} fill={`hsl(262 55% ${22 + k * 2}%)`} />))}
          <path d={path} fill="#8a4bf0" stroke="#dcc8ff" strokeWidth="1.5" />
          <g transform={`translate(${X(34.80)} ${Y(31.97)})`}>
            <circle r="9" fill="#ffd54a" stroke="#fff" strokeWidth="2" />
            <text y="-14" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" stroke="#2a1766" strokeWidth="3" paintOrder="stroke">ראשון לציון</text>
          </g>
        </svg>
      </div>
      <p className="hint">שרטוט סכמטי להמחשה, לא מפה מדויקת.</p>
    </section>
  );
}

interface BookActivity { id: number; title: string; a?: Activity }
/** 318, 319: עיון בחוברת כספר מתהפך. */
export function FlipBookModal({ open, onClose, title, picks }: { open: boolean; onClose: () => void; title: string; picks: { id: number; title: string }[] }) {
  const [items, setItems] = useState<BookActivity[]>([]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!open) return;
    setPage(0);
    setItems(picks.map((p) => ({ id: p.id, title: p.title })));
    picks.slice(0, 20).forEach((p) => api<Activity>(`/api/activities/${p.id}`).then((a) => setItems((l) => l.map((x) => (x.id === p.id ? { ...x, a } : x)))).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const total = items.length + 1;
  const go = useCallback((d: number) => setPage((p) => Math.max(0, Math.min(total - 1, p + d))), [total]);
  const key = (e: React.KeyboardEvent) => { if (e.key === "ArrowLeft") go(1); if (e.key === "ArrowRight") go(-1); };
  return (
    <Modal open={open} onClose={onClose} title="עיון בחוברת" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <div className="book" onKeyDown={key}>
        <div className="book-pages" aria-live="polite">
          <article className={`book-page${page > 0 ? " turned" : ""}`} aria-hidden={page !== 0} style={{ zIndex: total }}>
            <div className="book-cover"><h3>{title || "חוברת פעולות"}</h3><p>שבט מעוז · {items.length} פעולות</p></div>
          </article>
          {items.map((it, i) => (
            <article key={it.id} className={`book-page${page > i + 1 ? " turned" : ""}`} aria-hidden={page !== i + 1} style={{ zIndex: total - i - 1 }}>
              <h3>{it.title}</h3>
              {it.a ? (<><p className="hint">{it.a.durationMin} דקות · {it.a.ageGroup} · ערך: {it.a.leadingValue}</p><ol>{it.a.stages.map((s) => (<li key={s.name}><strong>{s.name}</strong> ({s.minutes} דק׳)</li>))}</ol></>) : <p>טוען…</p>}
            </article>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => go(-1)} disabled={page === 0}>הדף הקודם</button>
          <span role="status">עמוד {page + 1} מתוך {total}</span>
          <button type="button" className="btn" onClick={() => go(1)} disabled={page >= total - 1}>הדף הבא</button>
        </div>
      </div>
    </Modal>
  );
}

/** 321: אות תלת-ממדי לאבן דרך. */
export function Badge({ label, done }: { label: string; done: boolean }) {
  return (
    <li className={`badge3d${done ? " done" : ""}`}>
      <span className="badge3d-face" aria-hidden="true">{done ? "★" : "🔒"}</span>
      <span>{label}<span className="sr-only">{done ? " (הושלם)" : " (עוד לא)"}</span></span>
    </li>
  );
}

/** 324: מצב במה, שלב אחד גדול בכל פעם, עם שעון. */
export function StageModeModal({ open, onClose, blocks }: { open: boolean; onClose: () => void; blocks: Block[] }) {
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(0);
  const [run, setRun] = useState(false);
  const b = blocks[Math.min(i, blocks.length - 1)];
  useEffect(() => { if (open) { setI(0); setRun(false); } }, [open]);
  useEffect(() => { setLeft((b?.minutes ?? 0) * 60); setRun(false); }, [i, b?.minutes, open]);
  useEffect(() => {
    if (!run) return;
    const t = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [run]);
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const key = (e: React.KeyboardEvent) => { if (e.key === "ArrowLeft") setI((x) => Math.min(blocks.length - 1, x + 1)); if (e.key === "ArrowRight") setI((x) => Math.max(0, x - 1)); };
  const next = blocks[i + 1];
  return (
    <Modal open={open} onClose={onClose} title="מצב במה" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {!b ? <p>אין שלבים להצגה.</p> : (
        <div className="stage-mode" onKeyDown={key}>
          <p className="hint">שלב {i + 1} מתוך {blocks.length}. אפשר לעבור עם החצים במקלדת.</p>
          <div className="stage-deck">
            {next && <div className="stage-next" aria-hidden="true">הבא: {next.title}</div>}
            <article className="stage-card" aria-live="polite">
              <h3>{b.title || `שלב ${i + 1}`}</h3>
              <p className="stage-text">{b.text.replace(/[#>*|_`]/g, " ").trim() || "(אין טקסט בשלב הזה)"}</p>
            </article>
          </div>
          <p className="stage-clock" role="timer" aria-label="הזמן שנשאר בשלב">{b.minutes ? mm : "—"}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>הקודם</button>
            <button type="button" className="btn btn-primary" onClick={() => setRun(!run)} disabled={!b.minutes}>{run ? "השהיית שעון" : "הפעלת שעון"}</button>
            <button type="button" className="btn" onClick={() => setI((x) => Math.min(blocks.length - 1, x + 1))} disabled={i >= blocks.length - 1}>הבא</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
