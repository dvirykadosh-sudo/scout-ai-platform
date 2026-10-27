"use client";

// שלב 40 (271–285): עומק עדין, תגי גיל, איורים ואפקטים. הכול נכבה בהפחתת תנועה.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./Providers";

const FIRST: Record<string, "young" | "mid" | "old"> = { א: "young", ב: "young", ג: "young", ד: "young", ה: "young", ו: "mid", ז: "mid", ח: "mid", ט: "old", י: "old" };
export const AGE_LABEL = { young: "צעירים", mid: "בינוניים", old: "בוגרים" } as const;
export function ageLevel(grade: string): "young" | "mid" | "old" | null {
  const m = /כית(?:ה|ות)\s+([א-י])/.exec(grade);
  return m ? FIRST[m[1]] ?? null : null;
}

/** 284: תג צבעוני לשכבת גיל. הטקסט נשאר, הצבע רק מוסיף. */
export function AgeBadge({ grade }: { grade: string }) {
  const lv = ageLevel(grade);
  return <li className={`chip age-chip ${lv ? "age-" + lv : ""}`}>{grade}{lv ? ` · ${AGE_LABEL[lv]}` : ""}</li>;
}

/** 281: איור קווי למצבים ריקים. */
export function EmptyArt() {
  return (
    <svg className="empty-art" viewBox="0 0 120 90" aria-hidden="true" focusable="false">
      <rect x="22" y="22" width="76" height="52" rx="8" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M34 40h36M34 52h24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M84 14l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="94" cy="68" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M103 77l9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** 283: במקום ברכה כללית, הפעולה האחרונה שעבדתם עליה. */
export function LastDocHero() {
  const { token, user } = useAuth();
  const [d, setD] = useState<{ id: number; title: string; stages: number; words: number; ageGroup: string } | null>(null);
  useEffect(() => {
    if (!token) return;
    api<{ id: number; title: string; stages: number; words: number; ageGroup: string; archived: boolean; template: boolean }[]>("/api/write/docs", { token })
      .then((x) => setD(x.find((z) => !z.archived && !z.template) ?? null))
      .catch(() => {});
  }, [token]);
  if (!user || !d) return null;
  return (
    <section className="card glass last-hero" aria-labelledby="lh-title">
      <p className="hint">ממשיכים מאיפה שעצרתם</p>
      <h2 id="lh-title" className="section-title">{d.title}</h2>
      <p>{d.stages} שלבים · {d.words} מילים{d.ageGroup ? ` · ${d.ageGroup}` : ""}</p>
      <Link className="btn btn-primary" href={`/write/${d.id}`}>המשך עריכה</Link>
    </section>
  );
}

/** 271, 272, 277, 278, 285: אפקטים גלובליים. כבויים בהפחתת תנועה ובניגודיות גבוהה. */
export function Effects() {
  const path = usePathname();

  // 285: עונה וחג, גוון עדין ברקע
  useEffect(() => {
    const d = new Date();
    const m = d.getMonth() + 1;
    const s = m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
    document.documentElement.dataset.season = s;
  }, []);

  // 277 + 278: מעבר עדין בין עמודים, והופעה הדרגתית של אזורים
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("hc");
    if (calm) return;
    const main = document.getElementById("main");
    main?.classList.remove("page-in");
    void main?.offsetWidth;
    main?.classList.add("page-in");
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("reveal-in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px" }
    );
    const t = window.setTimeout(() => {
      document.querySelectorAll<HTMLElement>("#main .card").forEach((el) => {
        if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add("reveal"); io.observe(el); }
      });
    }, 150);
    return () => { window.clearTimeout(t); io.disconnect(); };
  }, [path]);

  // 271 + 272: הטיה לכיוון העכבר ותזוזת רקע בגלילה
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("hc");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (calm) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; document.documentElement.style.setProperty("--scroll-y", String(Math.min(window.scrollY, 2000))); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".activity-card, .home-menu .card, .examples-list > li, .last-hero");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--tx", String((-y * 3).toFixed(2)) + "deg");
      el.style.setProperty("--ty", String((x * 3).toFixed(2)) + "deg");
      el.classList.add("tilting");
    };
    const leave = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".tilting");
      if (el && !el.contains(e.relatedTarget as Node)) { el.style.removeProperty("--tx"); el.style.removeProperty("--ty"); el.classList.remove("tilting"); }
    };
    if (fine) { document.addEventListener("pointermove", move); document.addEventListener("pointerout", leave); }
    return () => { window.removeEventListener("scroll", onScroll); document.removeEventListener("pointermove", move); document.removeEventListener("pointerout", leave); };
  }, []);

  return <div className="depth-bg" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>;
}

const KIND_PATHS: Record<string, string> = {
  peak: "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z",
  content: "M4 5h16v14H4zM8 9h8M8 13h6",
  value: "M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z",
  intro: "M5 12h14M13 6l6 6-6 6",
  summary: "M5 13l4 4L19 7",
  social: "M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5",
  field: "M3 20l6-11 4 6 3-4 5 9z",
};
/** 282: סמל אחיד לכל סוג פעולה. */
export function KindIcon({ kind }: { kind: string }) {
  const d = KIND_PATHS[kind];
  if (!d) return null;
  return (
    <svg className="kind-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** 290, 291: סרגל התקדמות שנשאר גלוי בעורך. */
export function EditorProgress({ total, target, blocks }: { total: number; target?: number; blocks: { text: string }[] }) {
  const filled = blocks.filter((b) => b.text.trim().split(/\s+/).filter(Boolean).length >= 15).length;
  const pct = blocks.length ? Math.round((filled / blocks.length) * 100) : 0;
  return (
    <div className="ed-progress">
      <span>{total} דקות{target ? ` מתוך ${target}` : ""}</span>
      <progress max={100} value={pct} aria-label="כמה מהשלבים כבר כתובים" />
      <span>{filled} מתוך {blocks.length} שלבים כתובים</span>
    </div>
  );
}

/** 293: תפריט תחתון בטלפון. */
export function BottomNav() {
  const path = usePathname() || "/";
  const items = [
    { href: "/", label: "בית", d: "M3 11l9-8 9 8v10H3z" },
    { href: "/write", label: "כתיבה", d: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4" },
    { href: "/library", label: "ספרייה", d: "M4 4h6v16H4zM14 4h6v16h-6z" },
    { href: "/team", label: "צוות", d: "M8 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M16 8a3 3 0 010 6M18 15c2 .5 4 2 4 5" },
  ];
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <nav className="bottom-nav no-print" aria-label="ניווט תחתון">
      <ul>
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={on(i.href) ? "page" : undefined}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={i.d} /></svg>
              <span>{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 295: מסך פתיחה קצר, בפעם הראשונה בלבד. */
export function Splash() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (calm || localStorage.getItem("scout.hero.seen") || localStorage.getItem("scout.splash")) return;
      localStorage.setItem("scout.splash", "1");
      setShow(true);
      const t = window.setTimeout(() => setShow(false), 1600);
      return () => window.clearTimeout(t);
    } catch {}
  }, []);
  if (!show) return null;
  return (
    <div className="splash" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-maoz.png" alt="" width={160} height={160} />
      <p>שבט מעוז</p>
    </div>
  );
}

const PALETTES = [["purple", "סגול"], ["blue", "כחול"], ["green", "ירוק"]] as const;
/** 296: ערכת צבעים לבחירה. */
export function PaletteToggle() {
  const [p, setP] = useState("purple");
  useEffect(() => { setP(document.documentElement.dataset.palette || "purple"); }, []);
  const next = () => {
    const i = PALETTES.findIndex((x) => x[0] === p);
    const n = PALETTES[(i + 1) % PALETTES.length][0];
    setP(n);
    document.documentElement.dataset.palette = n;
    try { localStorage.setItem("scout.palette", n); } catch {}
  };
  return <button type="button" className="a11y-btn" onClick={next}>צבעים: {PALETTES.find((x) => x[0] === p)?.[1]}</button>;
}
