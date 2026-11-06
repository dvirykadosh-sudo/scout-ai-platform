"use client";

// בורר אנשי קשר מרובה, עם חיפוש וסינון לפי קהל. משמש את השליחה ואת הכללים.
import { useMemo, useState } from "react";
import { AUDIENCE_LABEL, type Audience, type WaContact } from "@/lib/wa-api";
import { Check } from "./wa-ui";

export function ContactPicker({ contacts, value, onChange, max = 60, legend = "נמענים" }: { contacts: WaContact[]; value: number[]; onChange: (ids: number[]) => void; max?: number; legend?: string }) {
  const [q, setQ] = useState("");
  const [aud, setAud] = useState<"" | Audience>("");
  const shown = useMemo(() => contacts.filter((c) => !c.optedOut && (!aud || c.audience === aud) && (!q || c.name.includes(q) || c.battalion.includes(q))), [contacts, q, aud]);
  const toggle = (id: number, on: boolean) => onChange(on ? [...value, id].slice(0, max) : value.filter((x) => x !== id));
  const allShown = shown.slice(0, max).map((c) => c.id);

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ fontWeight: 800, color: "var(--wa-ink)" }}>{legend} ({value.length}{max ? ` מתוך ${max}` : ""})</legend>
      <div className="wa-row" style={{ margin: "8px 0" }}>
        <div className="wa-field"><label htmlFor="cp-q">חיפוש</label><input id="cp-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="wa-field">
          <label htmlFor="cp-aud">קהל</label>
          <select id="cp-aud" value={aud} onChange={(e) => setAud(e.target.value as "" | Audience)}>
            <option value="">הכל</option>
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </select>
        </div>
        <button type="button" className="wa-btn soft small" onClick={() => onChange([...new Set([...value, ...allShown])].slice(0, max))}>סימון המוצגים</button>
        <button type="button" className="wa-btn soft small" onClick={() => onChange([])}>ניקוי</button>
      </div>
      <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid var(--wa-line)", borderRadius: 14, padding: "4px 10px" }}>
        {shown.length === 0 && <p className="wa-muted">אין אנשי קשר מתאימים.</p>}
        {shown.map((c) => (
          <Check key={c.id} checked={value.includes(c.id)} onChange={(on) => toggle(c.id, on)}>
            {c.name}{c.battalion ? ` · ${c.battalion}` : ""} <span className="wa-tag">{AUDIENCE_LABEL[c.audience]}</span>{c.kind === "group" ? " (קבוצה)" : ""}
          </Check>
        ))}
      </div>
    </fieldset>
  );
}
