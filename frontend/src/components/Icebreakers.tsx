"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field } from "./ui";

interface Game {
  name: string;
  minutes: number;
  equipment: string;
  energetic: boolean;
  how: string;
}

export function Icebreakers() {
  const toast = useToast();
  const [energy, setEnergy] = useState("");
  const [noGear, setNoGear] = useState(false);
  const [maxMin, setMaxMin] = useState("");
  const [n, setN] = useState("3");
  const [games, setGames] = useState<Game[] | null>(null);
  const [seed, setSeed] = useState(1);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const p = new URLSearchParams({ n, seed: String(seed) });
    if (energy) p.set("energetic", energy);
    if (noGear) p.set("noEquipment", "1");
    if (maxMin) p.set("maxMinutes", maxMin);
    api<Game[]>(`/api/icebreakers?${p}`)
      .then((g) => {
        setGames(g);
        setError("");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [n, seed, energy, noGear, maxMin]);
  useEffect(load, [load]);

  const copy = async () => {
    if (!games) return;
    const text = games.map((g) => `${g.name} (${g.minutes} דקות${g.equipment ? `, ציוד: ${g.equipment}` : ", בלי ציוד"})\n${g.how}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("המשחקים הועתקו", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק", { kind: "error" });
    }
  };

  return (
    <>
      <form className="card glass" onSubmit={(e) => e.preventDefault()} aria-label="סינון משחקי היכרות">
        <div className="form-grid">
          <Field label="סוג" htmlFor="ib-energy">
            <select id="ib-energy" value={energy} onChange={(e) => setEnergy(e.target.value)}>
              <option value="">הכול</option>
              <option value="1">תנועתי</option>
              <option value="0">רגוע, בישיבה</option>
            </select>
          </Field>
          <Field label="זמן מקסימלי (דקות)" htmlFor="ib-max">
            <select id="ib-max" value={maxMin} onChange={(e) => setMaxMin(e.target.value)}>
              <option value="">בלי הגבלה</option>
              <option value="3">עד 3</option>
              <option value="5">עד 5</option>
              <option value="8">עד 8</option>
            </select>
          </Field>
          <Field label="כמה משחקים" htmlFor="ib-n">
            <select id="ib-n" value={n} onChange={(e) => setN(e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <div className="field">
            <label className="check">
              <input type="checkbox" checked={noGear} onChange={(e) => setNoGear(e.target.checked)} />
              <span>בלי ציוד בכלל</span>
            </label>
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => setSeed((s) => s + 1)}>
            עוד משחקים
          </button>
          <button type="button" className="btn" onClick={copy} disabled={!games?.length}>
            העתקת הרשימה
          </button>
        </div>
      </form>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div role="region" aria-live="polite" aria-label="משחקים מוצעים">
        {games && games.length === 0 && <p>אין משחקים שמתאימים לסינון. נסו להקל עליו.</p>}
        <ul className="list">
          {games?.map((g) => (
            <li key={g.name} className="card glass">
              <h2 className="card-title">{g.name}</h2>
              <p className="meta">
                {g.minutes} דקות · {g.energetic ? "תנועתי" : "רגוע"} · {g.equipment ? `ציוד: ${g.equipment}` : "בלי ציוד"}
              </p>
              <p>{g.how}</p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
