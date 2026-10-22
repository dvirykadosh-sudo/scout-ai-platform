"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage, storageGet, storageSet } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import type { Brief } from "@/lib/organizer";
import { Field } from "./ui";

interface Gear {
  id: string;
  label: string;
}
interface Result {
  total: number;
  items: Brief[];
  unlocks: { item: string; count: number }[];
}

const KEY = "scout.cupboard";

/** "מה יש בארון": המדריך מסמן ציוד שיש לו, והאתר מציג פעולות שאפשר להפעיל מיד. */
export function CupboardPage() {
  const [gear, setGear] = useState<Gear[]>([]);
  const [have, setHave] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [age, setAge] = useState("");
  const [maxMin, setMaxMin] = useState("");
  const [allow, setAllow] = useState("0");
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<Gear[]>("/api/gear")
      .then(setGear)
      .catch((e) => setError(errorMessage(e)));
    try {
      const saved = JSON.parse(storageGet(KEY) ?? "null");
      if (saved) {
        if (Array.isArray(saved.have)) setHave(saved.have);
        if (typeof saved.extra === "string") setExtra(saved.extra);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    storageSet(KEY, JSON.stringify({ have, extra }));
    const t = window.setTimeout(() => {
      api<Result>("/api/by-equipment", {
        method: "POST",
        body: { have, extra, allowMissing: Number(allow), ...(age ? { age } : {}), ...(maxMin ? { maxMinutes: Number(maxMin) } : {}) },
      })
        .then((r) => {
          setRes(r);
          setError("");
        })
        .catch((e) => setError(errorMessage(e)));
    }, 250);
    return () => window.clearTimeout(t);
  }, [ready, have, extra, allow, age, maxMin]);

  const toggle = (id: string) => setHave((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <>
      <form className="card glass" onSubmit={(e) => e.preventDefault()} aria-label="מה יש בארון">
        <fieldset className="grade-picker">
          <legend>מה יש לכם בארון של המועדון?</legend>
          <div className="grade-options">
            {gear.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={have.includes(g.id)} onChange={() => toggle(g.id)} />
                <span>{g.label}</span>
              </label>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={() => setHave(gear.map((g) => g.id))}>
              סימון הכול
            </button>
            <button type="button" className="btn btn-small" onClick={() => setHave([])}>
              ניקוי
            </button>
          </div>
        </fieldset>
        <div className="form-grid">
          <Field label="עוד דברים שיש לכם (לא חובה)" htmlFor="cb-extra" hint="למשל: חפץ אוצר, אוהל, כדורגל. מופרד ברווח או בפסיק." className="span-2">
            <input id="cb-extra" value={extra} maxLength={200} onChange={(e) => setExtra(e.target.value)} />
          </Field>
          <Field label="שכבת גיל" htmlFor="cb-age">
            <select id="cb-age" value={age} onChange={(e) => setAge(e.target.value)}>
              <option value="">כל השכבות</option>
              {AGE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="זמן מקסימלי" htmlFor="cb-min">
            <select id="cb-min" value={maxMin} onChange={(e) => setMaxMin(e.target.value)}>
              <option value="">בלי הגבלה</option>
              {[15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  עד {m} דקות
                </option>
              ))}
            </select>
          </Field>
          <Field label="כמה מותר שיחסר" htmlFor="cb-allow">
            <select id="cb-allow" value={allow} onChange={(e) => setAllow(e.target.value)}>
              <option value="0">רק פעולות שמוכנות</option>
              <option value="1">עד פריט אחד חסר</option>
              <option value="2">עד שני פריטים חסרים</option>
            </select>
          </Field>
        </div>
      </form>

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      <p className="count" role="status" aria-live="polite">
        {res ? (res.total === 0 ? "אין פעולות שמתאימות למה שיש בארון" : `נמצאו ${res.total} פעולות שאפשר להפעיל${res.total > res.items.length ? ` (מוצגות ${res.items.length})` : ""}`) : "טוען..."}
      </p>

      {res && res.unlocks.length > 0 && (
        <section className="card glass insight" aria-labelledby="unlock-title">
          <h2 id="unlock-title" className="section-title">
            מה כדאי להשיג
          </h2>
          <p className="hint">פריטים שאם יהיו בארון, ייפתחו עוד פעולות (פעולות שחסר להן רק הפריט הזה).</p>
          <ul>
            {res.unlocks.map((u) => (
              <li key={u.item}>
                <strong>{u.item}</strong>: {u.count === 1 ? "פעולה אחת" : `${u.count} פעולות`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="list">
        {res?.items.map((a) => (
          <li key={a.id} className="card glass activity-card">
            <h2 className="card-title">
              <Link href={`/library/${a.id}`}>{a.title}</Link>
            </h2>
            <ul className="chips" aria-label="פרטי הפעולה">
              <li className="chip">{a.durationMin} דקות</li>
              <li className="chip">{a.ageGroup}</li>
              <li className="chip">ערך: {a.leadingValue}</li>
              {a.ready ? <li className="chip chip-accent">מוכנה להפעלה</li> : <li className="chip">חסר: {a.missing?.join(", ")}</li>}
            </ul>
            <p className="meta">ציוד: {a.equipment}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
