"use client";

// שלב 70: כרטיס "ה-DNA של הקבוצה". מציג מה היומן הפרטי של המדריך (הפעלות עם דירוג השתתפות) אומר על הקבוצה,
// ומכוון את מעוז, סימולטור החניכים והטיוטה. אפשר לבחור קבוצה לפי התווית ביומן, או לכבות.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { DNA_EVENT, getDnaChoice, setDnaChoice, type DnaResponse } from "@/lib/dna";
import { useAuth } from "../Providers";
import { Field } from "../ui";
import { StatStrip } from "./StatStrip";

const ENERGY: Record<string, string> = { high: "אנרגטית", calm: "רגועה", mixed: "מעורבת" };
const TIMING: Record<string, string> = { long: "נמשכות יותר מדי", short: "נגמרות מוקדם", ok: "בדיוק" };

export function GroupDnaCard({ compact = false }: { compact?: boolean }) {
  const { token } = useAuth();
  const [choice, setChoice] = useState("*");
  const [data, setData] = useState<DnaResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sync = () => setChoice(getDnaChoice());
    sync();
    window.addEventListener(DNA_EVENT, sync);
    return () => window.removeEventListener(DNA_EVENT, sync);
  }, []);

  const group = choice === "*" || choice === "" ? "" : choice;
  const load = useCallback(() => {
    if (!token) return;
    api<DnaResponse>(`/api/lux/dna${group ? `?group=${encodeURIComponent(group)}` : ""}`, { token })
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [token, group]);
  useEffect(load, [load]);

  if (!token) return null;
  const d = data?.dna;
  const on = choice !== "";
  const left = d ? Math.max(0, 3 - d.rated) : 3;

  return (
    <section className={`card glass dna70 no-print${compact ? " is-compact" : ""}`} aria-labelledby="dna-title">
      <h2 id="dna-title" className="section-title">
        ה-DNA של הקבוצה
      </h2>
      <p className="hint">מחושב מיומן ההפעלות הפרטי שלכם (רמת השתתפות, זמן וההערות שרשמתם) ומהמשוב האנונימי של החניכים. בלי שמות חניכים.</p>
      {failed && <p className="warn-box">לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב בעוד רגע.</p>}
      <div className="dna70-controls">
        <Field label="קבוצה" htmlFor="dna-group">
          <select id="dna-group" value={group} onChange={(e) => setDnaChoice(e.target.value || "*")} disabled={!on}>
            <option value="">כל ההפעלות</option>
            {data?.groups.map((g) => (
              <option key={g.label} value={g.label}>
                {g.label} ({g.rated} מדורגות)
              </option>
            ))}
          </select>
        </Field>
        <label className="check">
          <input type="checkbox" checked={on} onChange={(e) => setDnaChoice(e.target.checked ? (group || "*") : "")} />
          <span>לכוון את מעוז, סימולטור החניכים והטיוטה לפי הפרופיל</span>
        </label>
      </div>
      {d && !d.ready && (
        <p role="status">
          עוד אין מספיק נתונים. ביומן ההפעלות של פעולה, בחרו ״השתתפות״ (מעטה, בינונית, גבוהה) בעוד {left} הפעלות כדי שהפרופיל יתחיל לפעול. <Link href="/library">למאגר הפעולות</Link>
        </p>
      )}
      {d?.ready && (
        <>
          <StatStrip
            label="פרופיל הקבוצה"
            tiles={[
              { key: "energy", hero: "dark", label: "רמת אנרגיה מועדפת", value: d.energy.pref ? ENERGY[d.energy.pref] : "עוד לא ברור", sub: `${d.energy.highN} אנרגטיות · ${d.energy.calmN} רגועות` },
              { key: "rated", hero: "brand", label: "הפעלות מדורגות", value: d.rated, sub: `מתוך ${d.runs} · ${d.confidence === "high" ? "ביטחון גבוה" : d.confidence === "medium" ? "ביטחון בינוני" : "ביטחון נמוך"}` },
              { key: "timing", label: "הזמן שלנו", value: d.timing ? TIMING[d.timing] : "אין נתון", sub: d.timing ? "לפי ״האם הזמן הספיק״" : "מדווחים זמן ביומן" },
              ...(d.kids ? [{ key: "kids", label: "משוב חניכים", value: `${d.kids.avg}/5`, sub: `${d.kids.count} משובים · ${d.kids.wantMore}% רוצים עוד` }] : []),
            ]}
          />
          <div className="dna70-lists">
            <DnaList title="מתודות שעובדות" items={d.winMethods.map((m) => `${m.name} (${m.avg}/3)`)} empty="עוד אין מספיק הפעלות לכל מתודה" tone="up" />
            <DnaList title="נקודות תורפה" items={[...d.weakMethods.map((m) => `${m.name} (${m.avg}/3)`), ...d.failThemes.map((t) => t.label)]} empty="לא זוהו" tone="down" />
            <DnaList title="מה רשמתם שעבד" items={d.winThemes.map((t) => t.label)} empty="עוד אין חזרתיות בהערות" tone="up" />
          </div>
          {on && d.hint && <p className="hint dna70-hint">כך מעוז מקבל את זה (משפט אחד, בלי שמות): {d.hint}</p>}
        </>
      )}
    </section>
  );
}

function DnaList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "up" | "down" }) {
  return (
    <div className="dna70-list">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((t) => (
            <li key={t} className={`dna70-chip is-${tone}`}>
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{empty}</p>
      )}
    </div>
  );
}
