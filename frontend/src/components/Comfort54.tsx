"use client";

// שלב 54: נוחות קריאה. קריאה נוחה (437), סרגל קריאה (438), חיסכון בנתונים (443), תוכן עניינים והתקדמות קריאה (440).
import { useCallback, useEffect, useRef, useState } from "react";
import { storageGet, storageSet } from "@/lib/api";

const useHtmlToggle = (key: string, cls: string) => {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(document.documentElement.classList.contains(cls)), [cls]);
  const toggle = useCallback(() => {
    setOn((v) => {
      document.documentElement.classList.toggle(cls, !v);
      storageSet(key, v ? "0" : "1");
      return !v;
    });
  }, [cls, key]);
  return [on, toggle] as const;
};

/** סרגל קריאה: פס מוארק סביב השורה שהעכבר או האצבע נמצאים בה. */
function ReadingRuler({ onClose }: { onClose: () => void }) {
  const [y, setY] = useState(240);
  useEffect(() => {
    const mv = (e: MouseEvent) => setY(e.clientY);
    const tc = (e: TouchEvent) => { if (e.touches[0]) setY(e.touches[0].clientY); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.altKey && e.key === "ArrowDown") setY((v) => Math.min(window.innerHeight - 20, v + 28));
      if (e.altKey && e.key === "ArrowUp") setY((v) => Math.max(20, v - 28));
    };
    window.addEventListener("mousemove", mv, { passive: true });
    window.addEventListener("touchmove", tc, { passive: true });
    window.addEventListener("touchstart", tc, { passive: true });
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("touchmove", tc); window.removeEventListener("touchstart", tc); window.removeEventListener("keydown", key); };
  }, [onClose]);
  const H = 44;
  return (
    <div className="ruler" aria-hidden="true" data-testid="ruler">
      <div className="ruler-dim" style={{ top: 0, height: Math.max(0, y - H / 2) }} />
      <div className="ruler-dim" style={{ top: y + H / 2, bottom: 0 }} />
    </div>
  );
}

export function ReadingToggles() {
  const [comfy, toggleComfy] = useHtmlToggle("scout.comfy", "comfy");
  const [saver, toggleSaver] = useHtmlToggle("scout.saver", "saver");
  const [ruler, setRuler] = useState(false);
  useEffect(() => setRuler(storageGet("scout.ruler") === "1"), []);
  const setR = (v: boolean) => { setRuler(v); storageSet("scout.ruler", v ? "1" : "0"); };
  return (
    <>
      <button type="button" className="a11y-btn" aria-pressed={comfy} onClick={toggleComfy}>קריאה נוחה</button>
      <button type="button" className="a11y-btn" aria-pressed={ruler} onClick={() => setR(!ruler)}>סרגל קריאה</button>
      <button type="button" className="a11y-btn" aria-pressed={saver} onClick={toggleSaver}>חיסכון בנתונים</button>
      {ruler && <ReadingRuler onClose={() => setR(false)} />}
    </>
  );
}

/** 440: תוכן עניינים צף ופס התקדמות. סורק את הכותרות שבתוך main ומתעדכן כשנטענים חלקים חדשים. */
export function PageToc() {
  const [items, setItems] = useState<{ id: string; text: string; level: number }[]>([]);
  const [active, setActive] = useState("");
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scan = () => {
      const hs = [...document.querySelectorAll<HTMLElement>("#main h2, #main h3")].filter((h) => !h.closest("dialog, .no-toc, nav") && (h.textContent || "").trim().length > 1);
      const out = hs.map((h, i) => {
        if (!h.id) h.id = `toc-${i}`;
        return { id: h.id, text: (h.textContent || "").trim().slice(0, 60), level: h.tagName === "H2" ? 2 : 3 };
      });
      setItems((prev) => (prev.length === out.length && prev.every((p, i) => p.id === out[i].id && p.text === out[i].text) ? prev : out));
    };
    scan();
    let t: number | undefined;
    const mo = new MutationObserver(() => { window.clearTimeout(t); t = window.setTimeout(scan, 400); });
    const main = document.getElementById("main");
    if (main) mo.observe(main, { childList: true, subtree: true });
    return () => { mo.disconnect(); window.clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: "-10% 0px -70% 0px" });
    for (const it of items) { const el = document.getElementById(it.id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [items]);

  useEffect(() => {
    let raf = 0;
    const upd = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement;
        const p = h.scrollHeight - h.clientHeight > 0 ? h.scrollTop / (h.scrollHeight - h.clientHeight) : 0;
        if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
      });
    };
    upd();
    window.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", upd); window.removeEventListener("resize", upd); };
  }, []);

  return (
    <>
      <div className="read-progress no-print" aria-hidden="true"><div ref={bar} className="read-progress-bar" /></div>
      {items.length >= 4 && (
        <nav className="toc no-print" aria-label="תוכן העמוד">
          <p className="toc-title">בעמוד הזה</p>
          <ol>
            {items.map((it) => (
              <li key={it.id} className={it.level === 3 ? "toc-sub" : ""}>
                <a href={`#${it.id}`} aria-current={active === it.id ? "location" : undefined} onClick={(e) => { e.preventDefault(); document.getElementById(it.id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }}>
                  {it.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </>
  );
}
