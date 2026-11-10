"use client";

// שלב 61 (רעיון 11): תצוגת הכרזה האוטומטית, תמונה ממוזערת למאגר, ופאנל הורדה ושיתוף בעמוד הפעולה.
import { useEffect, useMemo, useState } from "react";
import type { Activity } from "@/lib/types";
import { GLYPHS, glyphFor, logoDataUri, posterPng, posterSvg, svgDataUri, type PosterFormat, type PosterInput, type PosterTheme } from "@/lib/lux/poster";

export const posterInput = (a: Activity): PosterInput => ({ title: a.title, value: a.leadingValue, age: a.ageGroup, minutes: a.durationMin, stages: a.stages?.length });

export function PosterImg({ a, theme = "tribe", format = "card", className, alt = "" }: { a: Activity; theme?: PosterTheme; format?: PosterFormat; className?: string; alt?: string }) {
  const [logo, setLogo] = useState("");
  const [, bump] = useState(0);
  useEffect(() => {
    void logoDataUri().then(setLogo);
    const on = () => bump((n) => n + 1);
    window.addEventListener("scout:appearance", on);
    return () => window.removeEventListener("scout:appearance", on);
  }, []);
  const src = useMemo(() => svgDataUri(posterSvg(posterInput(a), { theme, format, logo })), [a, theme, format, logo]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />;
}

/** איור הערך בלבד (מונוכרום), לכרטיסים מודפסים */
export function PosterGlyph({ a, size = 28 }: { a: Pick<Activity, "title" | "leadingValue">; size?: number }) {
  const g = GLYPHS[glyphFor({ title: a.title, value: a.leadingValue })];
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: g.replace(/class="[aft]"/g, "") }} />
  );
}

const THEMES: [PosterTheme, string][] = [
  ["tribe", "צבעי הלוגו"],
  ["dark", "כהה"],
  ["paper", "בהיר להדפסה"],
];

export function PosterPanel({ a }: { a: Activity }) {
  const [theme, setTheme] = useState<PosterTheme>("tribe");
  const [format, setFormat] = useState<PosterFormat>("story");
  const [logo, setLogo] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void logoDataUri().then(setLogo);
  }, []);
  const svg = useMemo(() => posterSvg(posterInput(a), { theme, format, logo }), [a, theme, format, logo]);

  const file = async () => new File([await posterPng(svg, format)], `כרזה-${a.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40)}.png`, { type: "image/png" });
  const download = async () => {
    setBusy(true);
    try {
      const f = await file();
      const url = URL.createObjectURL(f);
      const el = document.createElement("a");
      el.href = url;
      el.download = f.name;
      el.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setMsg("הכרזה ירדה כקובץ PNG.");
    } catch {
      setMsg("לא הצלחתי ליצור את הקובץ בדפדפן הזה.");
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    setBusy(true);
    try {
      const f = await file();
      const data: ShareData = { files: [f], title: a.title, text: `${a.title} · שבט מעוז` };
      if (navigator.canShare?.(data)) {
        await navigator.share(data);
        setMsg("נשלח לשיתוף.");
      } else {
        setMsg("הדפדפן הזה לא תומך בשיתוף קבצים. אפשר להוריד ולצרף ידנית.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("השיתוף לא הצליח.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card glass lux-poster no-print" aria-labelledby="poster-h">
      <div className="lux-poster-prev">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgDataUri(svg)} alt={`כרזה אוטומטית לפעולה ${a.title}`} />
      </div>
      <div className="lux-poster-side">
        <h2 id="poster-h" className="section-title">
          כרזה אוטומטית
        </h2>
        <p className="hint">נוצרת מהכותרת, הערך והגיל. מתאימה לוואטסאפ, לאינסטגרם ולתלייה בסניף.</p>
        <fieldset className="lux-fs">
          <legend>צבעים</legend>
          <div className="actions" role="radiogroup" aria-label="ערכת צבעים לכרזה">
            {THEMES.map(([k, l]) => (
              <label key={k} className="check">
                <input type="radio" name="poster-theme" checked={theme === k} onChange={() => setTheme(k)} />
                <span>{l}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="lux-fs">
          <legend>גודל</legend>
          <div className="actions" role="radiogroup" aria-label="גודל הכרזה">
            {(
              [
                ["story", "לוואטסאפ ולסטורי (4:5)"],
                ["og", "לתצוגה מקדימה (רחב)"],
                ["card", "כרטיס קטן"],
              ] as [PosterFormat, string][]
            ).map(([k, l]) => (
              <label key={k} className="check">
                <input type="radio" name="poster-format" checked={format === k} onChange={() => setFormat(k)} />
                <span>{l}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>
            הורדת PNG
          </button>
          <button type="button" className="btn" onClick={share} disabled={busy}>
            שיתוף (וואטסאפ ועוד)
          </button>
        </div>
        <p className="hint" role="status" aria-live="polite">
          {msg}
        </p>
      </div>
    </section>
  );
}

/** תמונה ממוזערת בכרטיס המאגר (דקורטיבית: הכותרת כבר בטקסט) */
export function PosterThumb({ a }: { a: Activity }) {
  return <PosterImg a={a} theme="tribe" format="card" className="lux-thumb" />;
}
