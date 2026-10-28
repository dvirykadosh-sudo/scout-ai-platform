"use client";

// שלב 46 (301–325): עומק ותלת-ממד. הכול נכבה בהפחתת תנועה ובניגודיות גבוהה, ויש תחליף סטטי.
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Stage } from "@/lib/types";

const calm = () => typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("hc");

/** 301, 302, 323: הלוגו בשכבות עומק, עם ברק מתכתי שנע עם הסמן או הטיית הטלפון. */
export function Logo3D({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || calm()) return;
    const set = (nx: number, ny: number) => {
      el.style.setProperty("--ry", `${(nx * 16).toFixed(1)}deg`);
      el.style.setProperty("--rx", `${(-ny * 12).toFixed(1)}deg`);
      el.style.setProperty("--mx", `${((nx + 1) * 50).toFixed(0)}%`);
      el.style.setProperty("--my", `${((ny + 1) * 50).toFixed(0)}%`);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 400));
      const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 300));
      set(nx, ny);
    };
    const tilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      set(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
    };
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (fine) document.addEventListener("pointermove", move);
    // iOS דורש אישור מפורש, ולכן שם הטיית המכשיר לא פעילה
    const needsPerm = typeof (window.DeviceOrientationEvent as unknown as { requestPermission?: unknown })?.requestPermission === "function";
    if (!fine && !needsPerm) window.addEventListener("deviceorientation", tilt);
    return () => { document.removeEventListener("pointermove", move); window.removeEventListener("deviceorientation", tilt); };
  }, []);
  return (
    <div className="logo3d" ref={box}>
      <div className="logo3d-stage">
        {/* eslint-disable @next/next/no-img-element */}
        <img className="logo3d-back l3" src={src} alt="" aria-hidden="true" />
        <img className="logo3d-back l2" src={src} alt="" aria-hidden="true" />
        <img className="logo3d-back l1" src={src} alt="" aria-hidden="true" />
        <img className="emblem-logo logo3d-front" src={src} alt="סמל שבט מעוז" />
        <span className="logo3d-sheen" aria-hidden="true" />
      </div>
    </div>
  );
}

/** 303: גחלי מדורה בערכת "מדורה". */
function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || calm()) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0;
    const n = window.innerWidth < 700 ? 14 : 30;
    const ps = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.4, v: 0.04 + Math.random() * 0.08, s: Math.random() * 6 }));
    const resize = () => { w = c.width = window.innerWidth; h = c.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const tick = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.v / 60; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        const x = (p.x + Math.sin(t / 1500 + p.s) * 0.02) * w, y = p.y * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, p.r * 4);
        g.addColorStop(0, "rgba(255,190,90,.9)"); g.addColorStop(1, "rgba(255,120,30,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, p.r * 4, 0, 7); ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(tick); };
    document.addEventListener("visibilitychange", vis);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return <canvas ref={ref} className="embers" aria-hidden="true" />;
}

/** 312: קונפטי, פעם אחת, בייצוא הראשון. */
function runConfetti() {
  if (calm()) return;
  const c = document.createElement("canvas");
  c.className = "confetti"; c.setAttribute("aria-hidden", "true");
  c.width = window.innerWidth; c.height = window.innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext("2d")!;
  const cols = ["#8a4bf0", "#6f6cf0", "#7be0b8", "#ffd54a", "#ff9bd1"];
  const ps = Array.from({ length: 120 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, s: 6 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  const f = (t: number) => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    if (t - t0 < 3200) requestAnimationFrame(f); else c.remove();
  };
  requestAnimationFrame(f);
}

const HOLIDAYS: { id: string; label: string; glyphs: string[] }[] = [
  { id: "sukkot", label: "חג סוכות שמח", glyphs: ["🍋", "🌿", "🏕️"] },
  { id: "hanukkah", label: "חנוכה שמח", glyphs: ["🕎", "✨", "🍩"] },
  { id: "tubishvat", label: "ט״ו בשבט שמח", glyphs: ["🌳", "🌱", "🍇"] },
  { id: "purim", label: "פורים שמח", glyphs: ["🎭", "🎉", "👑"] },
  { id: "pesach", label: "חג פסח שמח", glyphs: ["🍷", "🌾", "✨"] },
  { id: "lagbaomer", label: "ל״ג בעומר שמח", glyphs: ["🔥", "🏹", "✨"] },
  { id: "shavuot", label: "חג שבועות שמח", glyphs: ["🌾", "🥛", "🌸"] },
];
/** 325: חג לפי הלוח העברי של הדפדפן, ±3 ימים. אפשר לכפות לבדיקה: localStorage scout.holiday. */
export function holidayNow(d = new Date()): string | null {
  try {
    const forced = localStorage.getItem("scout.holiday");
    if (forced) return forced;
  } catch {}
  const near = (off: number) => {
    const x = new Date(d.getTime() + off * 86400000);
    const p = new Intl.DateTimeFormat("en-u-ca-hebrew", { month: "long", day: "numeric" }).formatToParts(x);
    return { m: p.find((q) => q.type === "month")?.value ?? "", d: Number(p.find((q) => q.type === "day")?.value) };
  };
  for (let off = -3; off <= 3; off++) {
    const { m, d: day } = near(off);
    if (m === "Tishri" && day >= 15 && day <= 22) return "sukkot";
    if ((m === "Kislev" && day >= 25) || (m === "Tevet" && day <= 2)) return "hanukkah";
    if (m === "Shevat" && day === 15) return "tubishvat";
    if ((m === "Adar" || m === "Adar II") && day === 14) return "purim";
    if (m === "Nisan" && day >= 15 && day <= 21) return "pesach";
    if (m === "Iyar" && day === 18) return "lagbaomer";
    if (m === "Sivan" && day === 6) return "shavuot";
  }
  return null;
}

/** 309, 311, 312, 314, 315, 325: שכבות רקע עמוקות וחגים. */
export function DepthLayers() {
  const [pal, setPal] = useState("");
  const [hol, setHol] = useState<string | null>(null);
  useEffect(() => {
    const d = document.documentElement;
    const read = () => setPal(d.dataset.palette || "");
    read();
    const mo = new MutationObserver(read);
    mo.observe(d, { attributes: true, attributeFilter: ["data-palette"] });
    setHol(holidayNow());
    // 314: כיוון הצל לפי שעה (בוקר משמאל, ערב מימין)
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    d.style.setProperty("--sh-dx", `${(((hr - 12) / 6) * 6).toFixed(1)}px`);
    d.dataset.daypart = hr < 6 || hr >= 19 ? "night" : hr < 10 ? "morning" : hr < 17 ? "day" : "evening";
    const onC = () => runConfetti();
    window.addEventListener("scout:celebrate", onC);
    // 311: טשטוש שמשתנה בגלילה
    let raf = 0;
    const sc = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; d.style.setProperty("--blur", `${Math.min(18, 6 + window.scrollY / 40).toFixed(0)}px`); }); };
    window.addEventListener("scroll", sc, { passive: true });
    return () => { mo.disconnect(); window.removeEventListener("scout:celebrate", onC); window.removeEventListener("scroll", sc); };
  }, []);
  const h = HOLIDAYS.find((x) => x.id === hol);
  return (
    <>
      <div className="parallax-art" aria-hidden="true">
        <svg className="pl p1" viewBox="0 0 100 100" width="180" height="180"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M50 12l8 38-8 38-8-38z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        <svg className="pl p2" viewBox="0 0 100 100" width="140" height="140"><path d="M50 8L92 88H8z" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M50 40L70 88H30z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        <svg className="pl p3" viewBox="0 0 100 100" width="120" height="120"><path d="M50 8C70 30 78 48 64 70c-6 10-22 10-28 0C22 48 40 34 50 8z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </div>
      {pal === "fire" && <Embers />}
      {h && (
        <div className="holiday-float" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => <span key={i} style={{ insetInlineStart: `${6 + i * 11}%`, animationDelay: `${i * 0.7}s` }}>{h.glyphs[i % h.glyphs.length]}</span>)}
        </div>
      )}
      {h && <p className="holiday-chip" role="status">{h.label} 🎉</p>}
    </>
  );
}

/** 304: שלבי הפעולה ככרטיסים שמתהפכים. */
export function FlipStages({ stages }: { stages: Stage[] }) {
  const [on, setOn] = useState(false);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return (
    <div className="flip-wrap">
      <button type="button" className="btn btn-small" aria-pressed={on} onClick={() => setOn(!on)}>
        {on ? "חזרה לטבלה" : "תצוגת כרטיסים"}
      </button>
      {on && (
        <ul className="flip-grid" aria-label="שלבי הפעולה ככרטיסים">
          {stages.map((s, i) => (
            <li key={i}>
              <button type="button" className={`flip-card${flipped[i] ? " is-flipped" : ""}`} aria-pressed={!!flipped[i]} onClick={() => setFlipped({ ...flipped, [i]: !flipped[i] })}>
                <span className="flip-face flip-front">
                  <strong>{i + 1}. {s.name}</strong>
                  <small>{s.minutes} דקות · {s.layer}</small>
                  <em>לחצו כדי לקרוא</em>
                </span>
                <span className="flip-face flip-back">{s.content}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 306: קרוסלת Coverflow. */
export function Coverflow({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const items = Children.toArray(children);
  const update = useCallback(() => {
    const ul = ref.current;
    if (!ul) return;
    const mid = ul.scrollLeft + ul.clientWidth / 2;
    Array.from(ul.children).forEach((li) => {
      const e = li as HTMLElement;
      const d = (e.offsetLeft + e.offsetWidth / 2 - mid) / (ul.clientWidth / 2);
      const k = Math.max(-1, Math.min(1, d));
      e.style.setProperty("--cf-r", calm() ? "0deg" : `${(-k * 28).toFixed(1)}deg`);
      e.style.setProperty("--cf-s", calm() ? "1" : (1 - Math.abs(k) * 0.12).toFixed(2));
    });
  }, []);
  useEffect(() => { update(); }, [update, items.length]);
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.6), behavior: calm() ? "auto" : "smooth" });
  return (
    <div className="coverflow">
      <button type="button" className="btn btn-small cf-btn" onClick={() => go(1)} aria-label="הקודם">‹</button>
      <ul ref={ref} className="cf-track" aria-label={label} onScroll={update} tabIndex={0}>
        {items.map((c, i) => <li key={i} className="cf-item">{c}</li>)}
      </ul>
      <button type="button" className="btn btn-small cf-btn" onClick={() => go(-1)} aria-label="הבא">›</button>
    </div>
  );
}

/** 322: מד מוכנות אנלוגי. */
export function Gauge({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const ang = -90 + (s / 100) * 180;
  return (
    <svg className="gauge" viewBox="0 0 200 120" role="img" aria-label={`מד מוכנות: ${s} מתוך 100`}>
      <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stopColor="#ff9bd1" /><stop offset="0.5" stopColor="#ffd54a" /><stop offset="1" stopColor="#7be0b8" /></linearGradient></defs>
      <path d="M20 100A80 80 0 0 1 180 100" fill="none" stroke="url(#gg)" strokeWidth="14" strokeLinecap="round" />
      {[0, 25, 50, 75, 100].map((t) => { const a = ((-90 + (t / 100) * 180) * Math.PI) / 180; return <line key={t} x1={100 + Math.sin(a) * 66} y1={100 - Math.cos(a) * 66} x2={100 + Math.sin(a) * 74} y2={100 - Math.cos(a) * 74} stroke="currentColor" strokeWidth="2" />; })}
      <g className="gauge-needle" style={{ transform: `rotate(${ang}deg)`, transformOrigin: "100px 100px" }}>
        <path d="M100 100L96 100L100 34L104 100z" fill="currentColor" />
      </g>
      <circle cx="100" cy="100" r="8" fill="currentColor" />
    </svg>
  );
}
