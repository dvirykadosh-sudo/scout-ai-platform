"use client";

// שלב 61 (רעיון 12): סטודיו ייצוא. רואים את המסמך בזמן שמשנים ערכת צבעים, מיקום לוגו וסימן מים, ורק אז מייצאים.
// ה-Word מופק בשרת באותן אפשרויות. ה-PDF מודפס מהתצוגה עצמה (מה שרואים הוא מה שמודפס).
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { tribeOrDefault } from "@/lib/lux/tribe";
import type { Activity } from "@/lib/types";
import { PageTitle, Skeleton } from "../ui";
import { PosterPanel } from "./Poster";

type ThemeKey = "classic" | "purple" | "blue" | "tribe";
type Align = "left" | "center" | "right";
const BAR: Record<ThemeKey, string> = { classic: "#4A3FC9", purple: "#5B2FA3", blue: "#1E5FA8", tribe: "#5B21B6" };
const THEME_LABEL: Record<ThemeKey, string> = { tribe: "צבעי הלוגו", purple: "סגול", blue: "כחול", classic: "ירוק וסגול" };
const SNAP: Record<Align, number> = { right: 0.84, center: 0.5, left: 0.16 }; // RTL: שמאל בעמוד = בקצה השמאלי
const lines = (t: string) => t.split(/\n+/).map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim()).filter((l) => l.length > 3);

export function ExportStudio() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"doc" | "cards" | "poster">("doc");
  const [theme, setTheme] = useState<ThemeKey>("tribe");
  const [eco, setEco] = useState(false);
  const [wm, setWm] = useState(0.3);
  const [align, setAlign] = useState<Align>("center");
  const [dragX, setDragX] = useState<number | null>(null);
  const [tribe, setTribe] = useState("#5B21B6");
  const head = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Activity>(`/api/activities/${id}`).then(setA).catch((e) => setError(errorMessage(e)));
    setTribe(tribeOrDefault().wb);
  }, [id]);

  const color = theme === "tribe" ? tribe : BAR[theme];
  const accent = color.replace("#", "").toUpperCase();
  const docxUrl = useMemo(() => {
    const q = new URLSearchParams({ logo: align, wm: String(wm) });
    if (eco) q.set("eco", "1");
    if (theme === "tribe") q.set("accent", accent);
    else q.set("theme", theme);
    return `/api/activities/${id}/export/docx?${q}`;
  }, [id, align, wm, eco, theme, accent]);

  // גרירת הלוגו: מקבל מיקום חופשי תוך כדי גרירה, ונצמד לשלושת המיקומים בשחרור
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragX(SNAP[align]);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragX === null || !head.current) return;
    const r = head.current.getBoundingClientRect();
    setDragX(Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width)));
  };
  const onUp = () => {
    if (dragX === null) return;
    // x פיזי: שמאל = קטן. מתרגמים ל"שמאל / מרכז / ימין" של העמוד
    setAlign(dragX < 0.34 ? "left" : dragX > 0.66 ? "right" : "center");
    setDragX(null);
  };

  if (error)
    return (
      <p className="error-box" role="alert">
        {error}
      </p>
    );
  if (!a) return <Skeleton lines={5} />;

  const logoLeft = `${(dragX ?? { left: 0.16, center: 0.5, right: 0.84 }[align]) * 100}%`;
  const samples = a.stages.flatMap((s) => lines(s.content)).slice(0, 4);

  return (
    <div className="lux-studio">
      <p className="no-print">
        <Link href={`/library/${a.id}`}>חזרה לפעולה</Link>
      </p>
      <PageTitle lead={`שנו את המראה ועקבו אחרי המסמך של "${a.title}" בזמן אמת.`}>סטודיו ייצוא</PageTitle>

      <div className="lux-studio-grid">
        <aside className="card glass no-print lux-studio-side" aria-label="אפשרויות עיצוב">
          <fieldset className="lux-fs">
            <legend>ערכת צבעים</legend>
            <div role="radiogroup" aria-label="ערכת צבעים" className="lux-swatches">
              {(Object.keys(THEME_LABEL) as ThemeKey[]).map((k) => (
                <label key={k} className={`lux-swatch ${theme === k ? "on" : ""}`}>
                  <input type="radio" name="studio-theme" checked={theme === k} onChange={() => setTheme(k)} />
                  <span className="dot" style={{ background: k === "tribe" ? tribe : BAR[k] }} aria-hidden="true" />
                  {THEME_LABEL[k]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="lux-fs">
            <legend>מיקום הלוגו</legend>
            <div role="radiogroup" aria-label="מיקום הלוגו" className="actions">
              {(
                [
                  ["right", "ימין"],
                  ["center", "מרכז"],
                  ["left", "שמאל"],
                ] as [Align, string][]
              ).map(([k, l]) => (
                <label key={k} className="check">
                  <input type="radio" name="studio-logo" checked={align === k} onChange={() => setAlign(k)} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
            <p className="hint">אפשר גם לגרור את הלוגו בתצוגה.</p>
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={eco} onChange={(e) => setEco(e.target.checked)} />
            <span>חסכוני בדיו (בלי גלים וסימן מים)</span>
          </label>
          {!eco && (
            <label className="lux-range">
              <span>עוצמת סימן המים</span>
              <input type="range" min={0} max={0.8} step={0.05} value={wm} onChange={(e) => setWm(Number(e.target.value))} />
            </label>
          )}
          <div className="lux-studio-actions">
            <a className="btn btn-primary" href={docxUrl} download>
              הורדת Word
            </a>
            <button type="button" className="btn" onClick={() => window.print()}>
              הדפסה / שמירה כ-PDF
            </button>
            <Link className="btn" href={`/library/${a.id}/cards`}>
              כרטיסים להדפסה
            </Link>
          </div>
          <p className="hint">התצוגה קרובה מאוד לקובץ ה-Word, אך לא זהה לו בפיקסל. ה-PDF מודפס מהתצוגה עצמה.</p>
        </aside>

        <div className="lux-studio-main">
          <div role="tablist" aria-label="סוג התצוגה" className="tabs no-print">
            {(
              [
                ["doc", "מסמך"],
                ["cards", "כרטיסים"],
                ["poster", "כרזה"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>

          {tab === "doc" && (
            <div id="panel-doc" role="tabpanel" aria-labelledby="tab-doc" tabIndex={0}>
              <div className={`studio-page ${eco ? "eco" : ""}`} style={{ ["--sp" as string]: color }}>
                {!eco && <div className="studio-wave top" aria-hidden="true" />}
                <div ref={head} className="studio-head" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={`studio-logo ${dragX !== null ? "drag" : ""}`}
                    style={{ left: logoLeft }}
                    src="/api/logo"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/logo-maoz.png")}
                    alt="לוגו השבט (אפשר לגרור)"
                    onPointerDown={onDown}
                    draggable={false}
                  />
                </div>
                {!eco && wm > 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="studio-wm" style={{ opacity: wm * 0.55 }} src="/api/logo" onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/logo-maoz.png")} alt="" aria-hidden="true" />
                )}
                <h2 className="studio-title">{a.title}</h2>
                <dl className="studio-meta">
                  <div>
                    <dt>שכבת גיל</dt>
                    <dd>{a.ageGroup}</dd>
                  </div>
                  <div>
                    <dt>משך</dt>
                    <dd>{a.durationMin} דקות</dd>
                  </div>
                  <div>
                    <dt>ערך מוביל</dt>
                    <dd>{a.leadingValue}</dd>
                  </div>
                  <div>
                    <dt>ציוד</dt>
                    <dd>{a.equipment}</dd>
                  </div>
                </dl>
                <p className="studio-bar">מבנה הפעולה</p>
                <table className="studio-table">
                  <thead>
                    <tr>
                      <th scope="col">זמן / שלב</th>
                      <th scope="col">שכבה חינוכית</th>
                      <th scope="col">תוכן</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.stages.map((s) => (
                      <tr key={s.name}>
                        <th scope="row">
                          {s.name}
                          <small>{s.minutes} דקות</small>
                        </th>
                        <td>{s.layer}</td>
                        <td>{s.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!eco && <div className="studio-wave bottom" aria-hidden="true" />}
                <p className="studio-foot">{a.tribe || "שבט מעוז"} | הצופים העבריים בישראל</p>
              </div>
            </div>
          )}

          {tab === "cards" && (
            <div id="panel-cards" role="tabpanel" aria-labelledby="tab-cards" tabIndex={0} className="no-print">
              <p className="hint">כך ייראו הכרטיסים בצבעי הערכה שבחרתם. ההדפסה המלאה (שמונה בעמוד, קווי חיתוך) בעמוד הכרטיסים.</p>
              <ul className="lux-card-prev" style={{ ["--sp" as string]: color }}>
                {samples.map((t, i) => (
                  <li key={i}>
                    <span>שאלה {i + 1}</span>
                    <p>{t}</p>
                    <small>{a.title}</small>
                  </li>
                ))}
              </ul>
              <Link className="btn btn-primary" href={`/library/${a.id}/cards`}>
                לעמוד הכרטיסים
              </Link>
            </div>
          )}

          {tab === "poster" && (
            <div id="panel-poster" role="tabpanel" aria-labelledby="tab-poster" tabIndex={0}>
              <PosterPanel a={a} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
