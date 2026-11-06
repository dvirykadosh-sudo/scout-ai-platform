"use client";

// תבניות הודעה: שמירה, עריכה ומחיקה, עם משתנים כמו {{שם_מדריך}} ותצוגה מקדימה.
import { useRef, useState } from "react";
import { Eye, Save, Trash2 } from "lucide-react";
import { waApi, type WaTemplate } from "@/lib/wa-api";
import { Alert, Field, useAct, useLoad } from "./wa-ui";
import { VariableChips, insertAtCaret } from "./Composer";

export function Templates({ token }: { token: string }) {
  const api = waApi(token);
  const data = useLoad(() => api.templates(), [token]);
  const { act, busy } = useAct();
  const area = useRef<HTMLTextAreaElement>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("כללי");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState("");

  const load = (t: WaTemplate | null) => {
    setEditId(t?.id ?? null);
    setName(t?.name ?? "");
    setCategory(t?.category ?? "כללי");
    setBody(t?.body ?? "");
    setPreview("");
  };
  const save = async () => {
    const r = await act(() => api.saveTemplate(editId, { name: name.trim(), category: category.trim() || "כללי", body }), "התבנית נשמרה.");
    if (r) {
      load(null);
      void data.reload();
    }
  };
  const remove = async (t: WaTemplate) => {
    if (!window.confirm(`למחוק את התבנית "${t.name}"?`)) return;
    if (await act(() => api.deleteTemplate(t.id), "נמחקה.")) {
      if (editId === t.id) load(null);
      void data.reload();
    }
  };
  const doPreview = async () => {
    const r = await act(() => api.preview(body));
    if (r) setPreview(`${r.text}${r.validation.unknown.length ? `\n\nמשתנים לא מוכרים: ${r.validation.unknown.join(", ")}` : ""}`);
  };

  return (
    <section className="wa-card" aria-label="תבניות">
      <h2>תבניות הודעה</h2>
      <p className="wa-muted">משתנה נכתב בסוגריים כפולים, למשל {"{{שם_מדריך}}"}. אפשר להוסיף ברירת מחדל: {"{{שם_מדריך|חבר}}"}.</p>
      {data.error && <Alert>{data.error}</Alert>}

      <h3>{editId ? "עריכת תבנית" : "תבנית חדשה"}</h3>
      <div className="wa-row">
        <Field label="שם התבנית">{(id) => <input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="קטגוריה">{(id) => <input id={id} value={category} maxLength={30} onChange={(e) => setCategory(e.target.value)} />}</Field>
      </div>
      <Field label="הטקסט">{(id) => <textarea id={id} ref={area} rows={6} value={body} maxLength={4000} onChange={(e) => { setBody(e.target.value); setPreview(""); }} />}</Field>
      {data.data && <VariableChips variables={data.data.variables} onPick={(t) => setBody((cur) => insertAtCaret(area.current, cur, t))} />}
      {preview && <div className="wa-bubble out" style={{ marginTop: 10, whiteSpace: "pre-wrap" }} role="status"><small>תצוגה מקדימה עם ערכי דוגמה</small>{preview}</div>}
      <div className="wa-row" style={{ marginTop: 10 }}>
        <button type="button" className="wa-btn" disabled={busy || name.trim().length < 2 || !body.trim()} onClick={save}><Save size={18} aria-hidden="true" />שמירה</button>
        <button type="button" className="wa-btn soft" disabled={busy || !body.trim()} onClick={doPreview}><Eye size={18} aria-hidden="true" />תצוגה מקדימה</button>
        {editId && <button type="button" className="wa-btn soft" onClick={() => load(null)}>ביטול עריכה</button>}
      </div>

      <hr style={{ border: 0, borderTop: "1px solid var(--wa-line)", margin: "16px 0" }} />
      <h3>התבניות שלכם ({data.data?.templates.length ?? 0})</h3>
      {(data.data?.templates ?? []).length === 0 && <p className="wa-muted">אין עדיין תבניות.</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {(data.data?.templates ?? []).map((t) => (
          <li key={t.id} className="wa-job">
            <strong>{t.name}</strong> <span className="wa-tag">{t.category}</span>
            <p style={{ whiteSpace: "pre-wrap" }}>{t.body.length > 160 ? `${t.body.slice(0, 160)}…` : t.body}</p>
            <div className="wa-row">
              <button type="button" className="wa-btn soft small" onClick={() => load(t)}>עריכה</button>
              <button type="button" className="wa-btn danger small" disabled={busy} aria-label={`מחיקת התבנית ${t.name}`} onClick={() => remove(t)}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
