"use client";

// שלב 61 (רעיון 2): מסך "היום". הפעולה הבאה עם ספירה לאחור, מזג האוויר במקום המפגש עם הצעה להתאמה,
// וטבעת הכנה שמתמלאת ככל שמסמנים ציוד ומשימות. מופיע רק למדריך מחובר שיש לו פעולה מתוזמנת.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, storageGet, storageSet } from "@/lib/api";
import { useAuth } from "../Providers";
import { Campfire } from "./illus";

interface Next {
  id: number;
  source: "schedule" | "write";
  href: string;
  title: string;
  date: string;
  startTime: string;
  daysLeft: number;
  minutes: number;
  equipment: string[];
  stages: number;
}
interface Today {
  today: string;
  next: Next | null;
  later: Next[];
}
interface Weather {
  ok: boolean;
  message?: string;
  place?: string;
  tempC?: number | null;
  popPct?: number | null;
  kind?: "clear" | "cloud" | "rain" | "storm" | "snow" | "fog" | "unknown";
  label?: string;
  advice?: { level: "ok" | "warn" | "danger"; adapt: string | null; text: string; tips: string[] };
}

const ICON: Record<string, string> = { clear: "☀️", cloud: "⛅", rain: "🌧️", storm: "⛈️", snow: "❄️", fog: "🌫️", unknown: "🌡️" };
const SEARCH: Record<string, string> = { rain: "גשם", storm: "גשם", heat: "מים", cold: "תנועה" };
const PLACE_KEY = "scout.today.place";

function eventTime(n: Next): Date {
  const [h, m] = (n.startTime || "17:00").split(":").map(Number);
  const d = new Date(`${n.date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}
function countdown(n: Next, now: number): { big: string; small: string } {
  const t = eventTime(n).getTime();
  const diff = t - now;
  if (n.daysLeft === 0 && n.startTime) {
    if (diff <= 0) return { big: "עכשיו", small: "הפעולה אמורה להתחיל" };
    const mins = Math.round(diff / 60000);
    if (mins < 60) return { big: `${mins}`, small: "דקות עד הפעולה" };
    const h = Math.floor(mins / 60);
    return { big: `${h}:${String(mins % 60).padStart(2, "0")}`, small: "שעות עד הפעולה" };
  }
  if (n.daysLeft === 0) return { big: "היום", small: "הפעולה היום" };
  if (n.daysLeft === 1) return { big: "מחר", small: n.startTime ? `בשעה ${n.startTime}` : "הפעולה מחר" };
  return { big: `${n.daysLeft}`, small: "ימים עד הפעולה" };
}

function Ring({ value, label }: { value: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="lux-pring" role="img" aria-label={`${label}: ${Math.round(value * 100)} אחוז`}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle className="bg" cx="42" cy="42" r={r} />
        <circle className="fg" cx="42" cy="42" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - value)} transform="rotate(-90 42 42)" />
      </svg>
      <span aria-hidden="true">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function TodayCard() {
  const { token, user } = useAuth();
  const [t, setT] = useState<Today | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [place, setPlace] = useState("ראשון לציון");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [w, setW] = useState<Weather | null>(null);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    const p = storageGet(PLACE_KEY);
    if (p) setPlace(p);
  }, []);
  useEffect(() => {
    if (!token) return;
    api<Today>("/api/lux/today", { token })
      .then(setT)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [token]);
  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(i);
  }, []);

  const next = t?.next ?? null;
  const prepKey = next ? `scout.today.prep.${next.source}.${next.id}` : "";
  const items = useMemo(() => (next ? [...next.equipment.map((e) => `ציוד: ${e}`), "קראתי את הפעולה מההתחלה ועד הסוף", "בדקתי את המקום ואת הזמנים"] : []), [next]);
  useEffect(() => {
    if (!prepKey) return;
    try {
      setDone(JSON.parse(storageGet(prepKey) ?? "[]"));
    } catch {
      setDone([]);
    }
  }, [prepKey]);

  const nid = next?.id;
  const ndate = next?.date;
  const ntime = next?.startTime;
  useEffect(() => {
    if (!token || !nid || !ndate) return;
    let alive = true;
    setW(null);
    const hour = Number((ntime || "17:00").split(":")[0]);
    api<Weather>(`/api/lux/weather?place=${encodeURIComponent(place)}&date=${ndate}&hour=${hour}`, { token })
      .then((x) => alive && setW(x))
      .catch(() => alive && setW({ ok: false, message: "אין חיבור לשירות מזג האוויר כרגע" }));
    return () => {
      alive = false;
    };
  }, [token, nid, ndate, ntime, place]);

  if (!user || !token || !loaded) return null;

  if (!next)
    return (
      <section className="card glass lux-today lux-today-empty" aria-labelledby="td-h">
        <Campfire size={72} className="lux-today-art" />
        <div>
          <h2 id="td-h" className="section-title">
            היום
          </h2>
          <p>אין עדיין פעולה מתוזמנת. כשתוסיפו תאריך לפעולה שלכם, כאן תראו ספירה לאחור, מזג אוויר והכנות.</p>
          <Link className="btn btn-primary" href="/write">
            לכתיבת פעולה חדשה
          </Link>
        </div>
      </section>
    );

  const cd = countdown(next, now);
  const frac = items.length ? done.filter((d) => items.includes(d)).length / items.length : 0;
  const toggle = (it: string) => {
    const nx = done.includes(it) ? done.filter((x) => x !== it) : [...done, it];
    setDone(nx);
    storageSet(prepKey, JSON.stringify(nx));
  };
  const dateLabel = new Date(`${next.date}T00:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="card glass lux-today" aria-labelledby="td-h">
      <div className="lux-today-main">
        <p className="lux-eyebrow-sm">היום · הפעולה הבאה</p>
        <h2 id="td-h" className="section-title lux-today-title">
          {next.title}
        </h2>
        <p className="lux-today-when">
          {dateLabel}
          {next.startTime ? ` · ${next.startTime}` : ""} · {next.minutes} דקות{next.stages ? ` · ${next.stages} שלבים` : ""}
        </p>
        <div className="lux-today-cd" aria-live="off">
          <strong>{cd.big}</strong>
          <span>{cd.small}</span>
        </div>
        <div className="actions">
          <Link className="btn btn-primary" href={next.href}>
            פתיחת הפעולה
          </Link>
          {t && t.later.length > 0 && <span className="hint">ועוד {t.later.length} בהמשך</span>}
        </div>
      </div>

      <div className="lux-today-weather" aria-label="מזג אוויר במקום המפגש">
        {w === null && <p className="hint">בודק מזג אוויר...</p>}
        {w && !w.ok && <p className="hint">{w.message ?? "אין תחזית כרגע"}</p>}
        {w?.ok && (
          <>
            <p className="lux-wx-head">
              <span className="lux-wx-ico" aria-hidden="true">
                {ICON[w.kind ?? "unknown"]}
              </span>
              <span>
                <strong>{w.tempC != null ? `${Math.round(w.tempC)}°` : "—"}</strong> {w.label}
                {w.popPct != null && ` · סיכוי לגשם ${Math.round(w.popPct)}%`}
              </span>
            </p>
            {w.advice && (
              <p className={`lux-wx-advice lux-wx-${w.advice.level}`} role={w.advice.level === "danger" ? "alert" : "status"}>
                {w.advice.text}
              </p>
            )}
            {w.advice?.adapt && (
              <p className="actions">
                <Link className="btn btn-small" href={`/library?q=${encodeURIComponent(SEARCH[w.advice.adapt] ?? "")}`}>
                  חלופה מהמאגר
                </Link>
                <Link className="btn btn-small" href="/quick">
                  פעולה מהירה
                </Link>
              </p>
            )}
          </>
        )}
        <div className="lux-wx-place">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = draft.trim();
                if (v.length >= 2) {
                  setPlace(v);
                  storageSet(PLACE_KEY, v);
                }
                setEditing(false);
              }}
            >
              <label className="sr-only" htmlFor="td-place">
                מקום המפגש
              </label>
              <input id="td-place" className="lux-wx-input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} autoFocus />
              <button type="submit" className="btn btn-small">
                שמירה
              </button>
            </form>
          ) : (
            <>
              <span className="hint">מקום: {w?.ok && w.place ? w.place : place}</span>{" "}
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setDraft(place);
                  setEditing(true);
                }}
              >
                שינוי
              </button>
            </>
          )}
        </div>
      </div>

      <div className="lux-today-prep">
        <Ring value={frac} label="התקדמות ההכנה" />
        <fieldset className="lux-prep-list">
          <legend>הכנות</legend>
          {items.map((it) => (
            <label key={it} className="check">
              <input type="checkbox" checked={done.includes(it)} onChange={() => toggle(it)} />
              <span>{it}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
