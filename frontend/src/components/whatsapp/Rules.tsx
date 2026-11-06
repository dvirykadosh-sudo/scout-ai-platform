"use client";

// כללים אוטומטיים: תזכורת שבועית קבועה, ותזכורת לפני כל פעולה ביומן. הכללים יוצרים משימות בתור, ועוברים את אותן הגנות.
// חניכים (קטינים) לא נכללים בכללים אוטומטיים: שליחה אליהם דורשת אישור ידני בכל פעם.
import { useState } from "react";
import { Play, Save, Trash2 } from "lucide-react";
import { waApi, type WaRule } from "@/lib/wa-api";
import { ContactPicker } from "./ContactPicker";
import { Alert, Check, Field, useAct, useLoad } from "./wa-ui";
import { VariableChips } from "./Composer";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);

interface Draft {
  id: number | null;
  name: string;
  kind: "weekly" | "before_activity";
  enabled: boolean;
  weekday: number;
  time: string;
  contactIds: number[];
  body: string;
  rsvp: boolean;
  eventTitle: string;
  offset: number;
  hours: number;
  also: number[];
}
const BLANK: Draft = { id: null, name: "", kind: "weekly", enabled: true, weekday: 4, time: "18:00", contactIds: [], body: "", rsvp: false, eventTitle: "", offset: 0, hours: 24, also: [] };

const fromRule = (r: WaRule): Draft => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  enabled: r.enabled,
  weekday: num(r.config.weekday, 4),
  time: str(r.config.time, "18:00"),
  contactIds: ids(r.config.contactIds),
  body: str(r.config.body),
  rsvp: Boolean(r.config.rsvp),
  eventTitle: str(r.config.eventTitle),
  offset: num(r.config.eventOffsetDays, 0),
  hours: num(r.config.hoursBefore, 24),
  also: ids(r.config.alsoContactIds),
});

export function Rules({ token }: { token: string }) {
  const api = waApi(token);
  const rules = useLoad(() => api.rules(), [token]);
  const contacts = useLoad(() => api.contacts(), [token]);
  const tpl = useLoad(() => api.templates(), [token]);
  const { act, busy } = useAct();
  const [d, setD] = useState<Draft>(BLANK);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  // חניכים לא מוצעים בכללים אוטומטיים
  const pickable = (contacts.data ?? []).filter((c) => c.audience !== "trainees");

  const config = (x: Draft): Record<string, unknown> =>
    x.kind === "weekly"
      ? { weekday: x.weekday, time: x.time, contactIds: x.contactIds, body: x.body, rsvp: x.rsvp || undefined, eventTitle: x.eventTitle.trim() || undefined, eventOffsetDays: x.offset }
      : { hoursBefore: x.hours, body: x.body, alsoContactIds: x.also };

  const valid = d.name.trim().length >= 2 && d.body.trim().length > 0 && (d.kind === "before_activity" || d.contactIds.length > 0) && (!d.rsvp || d.eventTitle.trim().length > 0);

  const save = async () => {
    const r = await act(() => api.saveRule(d.id, { name: d.name.trim(), kind: d.kind, enabled: d.enabled, config: config(d) }), "הכלל נשמר.");
    if (r) {
      setD(BLANK);
      void rules.reload();
    }
  };
  const toggle = async (r: WaRule) => {
    if (await act(() => api.saveRule(r.id, { name: r.name, kind: r.kind, enabled: !r.enabled, config: r.config }))) void rules.reload();
  };
  const remove = async (r: WaRule) => {
    if (!window.confirm(`למחוק את הכלל "${r.name}"?`)) return;
    if (await act(() => api.deleteRule(r.id), "נמחק.")) void rules.reload();
  };
  const runNow = async () => {
    const r = await act(() => api.runRules());
    if (r) void rules.reload();
    return r;
  };
  const [ran, setRan] = useState<number | null>(null);

  return (
    <section className="wa-card" aria-label="כללים אוטומטיים">
      <h2>כללים אוטומטיים</h2>
      <p className="wa-muted">הכללים נבדקים אוטומטית כל דקה כשהאתר פעיל. "הרצה עכשיו" בודקת אותם מיד. כלל שכבר רץ היום לא יישלח פעמיים.</p>
      <Alert info>חניכים (קטינים) לא נכללים בכללים אוטומטיים. אפשר לשלוח אליהם רק ידנית, בלשונית "שליחה" ועם אישור.</Alert>
      {rules.error && <Alert>{rules.error}</Alert>}

      <div className="wa-row" style={{ marginBottom: 10 }}>
        <button type="button" className="wa-btn soft" disabled={busy} onClick={async () => { const r = await runNow(); if (r) setRan(r.created); }}><Play size={18} aria-hidden="true" />הרצה עכשיו</button>
        {ran !== null && <span className="wa-muted" role="status">נוצרו {ran} משימות חדשות.</span>}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {(rules.data ?? []).length === 0 && <li className="wa-muted">אין עדיין כללים.</li>}
        {(rules.data ?? []).map((r) => (
          <li key={r.id} className="wa-job">
            <strong>{r.name}</strong> <span className="wa-tag">{r.kind === "weekly" ? "שבועי" : "לפני פעולה"}</span> {!r.enabled && <span className="wa-tag failed">כבוי</span>}
            <p>{r.summary}</p>
            <small>{r.lastRunAt ? `רץ לאחרונה: ${new Date(r.lastRunAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}` : "עוד לא רץ"}</small>
            <div className="wa-row">
              <button type="button" className="wa-btn soft small" onClick={() => setD(fromRule(r))}>עריכה</button>
              <button type="button" className="wa-btn soft small" disabled={busy} onClick={() => toggle(r)}>{r.enabled ? "כיבוי" : "הפעלה"}</button>
              <button type="button" className="wa-btn danger small" disabled={busy} aria-label={`מחיקת הכלל ${r.name}`} onClick={() => remove(r)}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          </li>
        ))}
      </ul>

      <hr style={{ border: 0, borderTop: "1px solid var(--wa-line)", margin: "16px 0" }} />
      <h3>{d.id ? "עריכת כלל" : "כלל חדש"}</h3>
      <div className="wa-row" style={{ alignItems: "flex-end" }}>
        <Field label="שם הכלל">{(id) => <input id={id} value={d.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="סוג">
          {(id) => (
            <select id={id} value={d.kind} disabled={d.id !== null} onChange={(e) => set("kind", e.target.value as Draft["kind"])}>
              <option value="weekly">תזכורת שבועית קבועה</option>
              <option value="before_activity">לפני כל פעולה ביומן</option>
            </select>
          )}
        </Field>
        <Check checked={d.enabled} onChange={(v) => set("enabled", v)}>פעיל</Check>
      </div>

      {d.kind === "weekly" ? (
        <>
          <div className="wa-row" style={{ alignItems: "flex-end", marginTop: 8 }}>
            <Field label="יום">{(id) => <select id={id} value={d.weekday} onChange={(e) => set("weekday", Number(e.target.value))}>{DAYS.map((n, i) => <option key={n} value={i}>יום {n}</option>)}</select>}</Field>
            <Field label="שעה">{(id) => <input id={id} type="time" value={d.time} onChange={(e) => set("time", e.target.value)} />}</Field>
            <Field label="האירוע בעוד כמה ימים (0 = היום)">{(id) => <input id={id} type="number" min={0} max={7} value={d.offset} onChange={(e) => set("offset", Math.min(7, Math.max(0, Math.round(Number(e.target.value) || 0))))} />}</Field>
          </div>
          <ContactPicker contacts={pickable} value={d.contactIds} onChange={(v) => set("contactIds", v)} legend="נמענים (חובה)" />
        </>
      ) : (
        <>
          <div className="wa-row" style={{ alignItems: "flex-end", marginTop: 8 }}>
            <Field label="כמה שעות לפני הפעולה (1 עד 72)">{(id) => <input id={id} type="number" min={1} max={72} value={d.hours} onChange={(e) => set("hours", Math.min(72, Math.max(1, Math.round(Number(e.target.value) || 1))))} />}</Field>
          </div>
          <p className="wa-muted">ההודעה נשלחת למדריך שיצר את הפעולה. אפשר להוסיף נמענים נוספים:</p>
          <ContactPicker contacts={pickable} value={d.also} onChange={(v) => set("also", v)} max={30} legend="נמענים נוספים (לא חובה)" />
        </>
      )}

      <Field label="הטקסט">{(id) => <textarea id={id} rows={5} value={d.body} maxLength={4000} onChange={(e) => set("body", e.target.value)} />}</Field>
      {tpl.data && <VariableChips variables={tpl.data.variables} onPick={(t) => set("body", `${d.body}${t}`)} />}

      {d.kind === "weekly" && (
        <div style={{ marginTop: 10 }}>
          <Check checked={d.rsvp} onChange={(v) => set("rsvp", v)}>לבקש אישור הגעה</Check>
          {d.rsvp && <Field label="שם האירוע">{(id) => <input id={id} value={d.eventTitle} maxLength={80} onChange={(e) => set("eventTitle", e.target.value)} />}</Field>}
        </div>
      )}

      <div className="wa-row" style={{ marginTop: 12 }}>
        <button type="button" className="wa-btn" disabled={busy || !valid} onClick={save}><Save size={18} aria-hidden="true" />שמירת הכלל</button>
        {d.id && <button type="button" className="wa-btn soft" onClick={() => setD(BLANK)}>ביטול עריכה</button>}
      </div>
    </section>
  );
}
