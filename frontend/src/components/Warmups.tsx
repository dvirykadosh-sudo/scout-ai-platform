"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field } from "./ui";

interface Game {
  name: string;
  category: string;
  minutes: number;
  equipment: string;
  energetic: boolean;
  how: string;
}

/** Warm-ups, transitions between stages, quiet-down signals and quick endings. */
export function Warmups({ initialCategory = "" }: { initialCategory?: string }) {
  const toast = useToast();
  const [cats, setCats] = useState<string[]>([]);
  const [category, setCategory] = useState(initialCategory);
  const [energy, setEnergy] = useState("");
  const [noGear, setNoGear] = useState(false);
  const [n, setN] = useState("4");
  const [seed, setSeed] = useState(1);
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const p = new URLSearchParams({ n, seed: String(seed) });
    if (category) p.set("category", category);
    if (energy) p.set("energetic", energy);
    if (noGear) p.set("noEquipment", "1");
    api<{ categories: string[]; items: Game[] }>(`/api/warmups?${p}`)
      .then((r) => {
        setCats(r.categories);
        setGames(r.items);
        setError("");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [n, seed, category, energy, noGear]);
  useEffect(load, [load]);

  const copy = async () => {
    if (!games) return;
    const text = games.map((g) => `${g.name} (${g.category}, ${g.minutes} דקות${g.equipment ? `, ציוד: ${g.equipment}` : ", בלי ציוד"})\n${g.how}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("הרשימה הועתקה", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק", { kind: "error" });
    }
  };

  return (
    <>
      <form className="card glass" onSubmit={(e) => e.preventDefault()} aria-label="סינון משחקי חימום">
        <div className="form-grid">
          <Field label="מה צריך" htmlFor="wu-cat">
            <select id="wu-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">הכול</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="סוג" htmlFor="wu-energy">
            <select id="wu-energy" value={energy} onChange={(e) => setEnergy(e.target.value)}>
              <option value="">הכול</option>
              <option value="1">תנועתי</option>
              <option value="0">רגוע</option>
            </select>
          </Field>
          <Field label="כמה" htmlFor="wu-n">
            <select id="wu-n" value={n} onChange={(e) => setN(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 8].map((x) => (
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
            עוד רעיונות
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
      <div role="region" aria-live="polite" aria-label="רעיונות">
        {games && games.length === 0 && <p>אין רעיון שמתאים לסינון. נסו להקל עליו.</p>}
        <ul className="list">
          {games?.map((g) => (
            <li key={g.name} className="card glass">
              <h2 className="card-title">{g.name}</h2>
              <p className="meta">
                {g.category} · {g.minutes} דקות · {g.energetic ? "תנועתי" : "רגוע"} · {g.equipment ? `ציוד: ${g.equipment}` : "בלי ציוד"}
              </p>
              <p>{g.how}</p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
