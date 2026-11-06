"use client";

// אנשי קשר וקבוצות: הוספה, קהל, הסכמה (הפסקת הודעות, הרשאת בוט), ויבוא קבוצות מהגשר.
// "חניכים" הם קטינים: כל שליחה אליהם דורשת אישור מפורש, והבוט אף פעם לא מוסר עליהם מידע.
import { useMemo, useState } from "react";
import { Download, Plus, Trash2, Users } from "lucide-react";
import { AUDIENCE_LABEL, waApi, type Audience, type ContactInput, type WaContact, type WaGroup } from "@/lib/wa-api";
import { Alert, Check, Field, useAct, useLoad } from "./wa-ui";

const EMPTY: ContactInput = { kind: "person", name: "", phone: "", waId: "", battalion: "", role: "", audience: "guides", botAllowed: false };

export function Contacts({ token }: { token: string }) {
  const api = waApi(token);
  const list = useLoad(() => api.contacts(), [token]);
  const { act, busy } = useAct();
  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [q, setQ] = useState("");
  const [aud, setAud] = useState<"" | Audience>("");
  const [groups, setGroups] = useState<WaGroup[] | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [groupAud, setGroupAud] = useState<Audience>("parents");

  const rows = useMemo(() => (list.data ?? []).filter((c) => (!aud || c.audience === aud) && (!q || c.name.includes(q) || c.battalion.includes(q))), [list.data, q, aud]);
  const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const add = async () => {
    const body: ContactInput = { ...form, name: form.name.trim() };
    if (body.kind === "person") delete body.waId;
    else delete body.phone;
    if (await act(() => api.addContact(body), "איש הקשר נוסף.")) {
      setForm({ ...EMPTY, audience: form.audience });
      void list.reload();
    }
  };
  const patch = async (c: WaContact, p: Partial<ContactInput>) => {
    if (await act(() => api.updateContact(c.id, p))) void list.reload();
  };
  const remove = async (c: WaContact) => {
    if (!window.confirm(`למחוק את "${c.name}"? הודעות שממתינות לו בתור יבוטלו.`)) return;
    if (await act(() => api.deleteContact(c.id), "נמחק.")) void list.reload();
  };
  const loadGroups = async () => {
    const r = await act(() => api.groups());
    if (r) {
      setGroups(r.items);
      setPick([]);
    }
  };
  const importPicked = async () => {
    const r = await act(() => api.importGroups(pick, groupAud));
    if (r) {
      setGroups(null);
      void list.reload();
    }
  };

  return (
    <section className="wa-card" aria-label="אנשי קשר">
      <h2>אנשי קשר וקבוצות</h2>
      <Alert info>הוסיפו רק אנשים שהסכימו לקבל הודעות. מי שמסומן "הפסקת הודעות" לא יקבל כלום, גם לא בשליחה לרבים.</Alert>
      {list.error && <Alert>{list.error}</Alert>}

      <h3>הוספה</h3>
      <div className="wa-row" style={{ alignItems: "flex-end" }}>
        <Field label="סוג">
          {(id) => (
            <select id={id} value={form.kind} onChange={(e) => set("kind", e.target.value as "person" | "group")}>
              <option value="person">אדם</option>
              <option value="group">קבוצה</option>
            </select>
          )}
        </Field>
        <Field label="שם">{(id) => <input id={id} value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />}</Field>
        {form.kind === "person" ? (
          <Field label="טלפון (עם 05…)">{(id) => <input id={id} dir="ltr" inputMode="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />}</Field>
        ) : (
          <Field label="מזהה קבוצה (…@g.us)">{(id) => <input id={id} dir="ltr" value={form.waId ?? ""} onChange={(e) => set("waId", e.target.value)} />}</Field>
        )}
        <Field label="קהל">
          {(id) => (
            <select id={id} value={form.audience} onChange={(e) => set("audience", e.target.value as Audience)}>
              {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
            </select>
          )}
        </Field>
        <Field label="גדוד / שכבה">{(id) => <input id={id} value={form.battalion ?? ""} maxLength={40} onChange={(e) => set("battalion", e.target.value)} />}</Field>
        <Field label="תפקיד">{(id) => <input id={id} value={form.role ?? ""} maxLength={40} onChange={(e) => set("role", e.target.value)} />}</Field>
      </div>
      <div className="wa-row" style={{ marginTop: 8 }}>
        <Check checked={Boolean(form.botAllowed)} onChange={(v) => set("botAllowed", v)}>לאפשר לבוט לענות לאיש הקשר הזה</Check>
        <button type="button" className="wa-btn" disabled={busy || form.name.trim().length < 2} onClick={add}><Plus size={18} aria-hidden="true" />הוספה</button>
      </div>

      <hr style={{ border: 0, borderTop: "1px solid var(--wa-line)", margin: "16px 0" }} />
      <h3>קבוצות מהוואטסאפ</h3>
      <p className="wa-muted">הגשר מדווח אילו קבוצות יש בחשבון. בחרו אילו להוסיף כאנשי קשר.</p>
      <button type="button" className="wa-btn soft" disabled={busy} onClick={loadGroups}><Download size={18} aria-hidden="true" />טעינת הקבוצות</button>
      {groups && (
        <div style={{ marginTop: 10 }}>
          {groups.length === 0 ? (
            <p className="wa-muted">הגשר עוד לא דיווח קבוצות. ודאו שהוא מחובר, ונסו שוב בעוד דקה.</p>
          ) : (
            <>
              <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid var(--wa-line)", borderRadius: 14, padding: "4px 10px" }}>
                {groups.map((g) => (
                  <Check key={g.id} checked={pick.includes(g.id)} onChange={(v) => setPick((p) => (v ? [...p, g.id] : p.filter((x) => x !== g.id)))}>
                    <Users size={14} aria-hidden="true" /> {g.name} <span className="wa-muted">({g.size} חברים)</span>
                  </Check>
                ))}
              </div>
              <div className="wa-row" style={{ marginTop: 8, alignItems: "flex-end" }}>
                <Field label="קהל הקבוצות">
                  {(id) => (
                    <select id={id} value={groupAud} onChange={(e) => setGroupAud(e.target.value as Audience)}>
                      {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                    </select>
                  )}
                </Field>
                <button type="button" className="wa-btn" disabled={busy || pick.length === 0} onClick={importPicked}>הוספת {pick.length} קבוצות</button>
              </div>
            </>
          )}
        </div>
      )}

      <hr style={{ border: 0, borderTop: "1px solid var(--wa-line)", margin: "16px 0" }} />
      <h3>הרשימה ({rows.length})</h3>
      <div className="wa-row" style={{ alignItems: "flex-end" }}>
        <Field label="חיפוש">{(id) => <input id={id} value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
        <Field label="קהל">
          {(id) => (
            <select id={id} value={aud} onChange={(e) => setAud(e.target.value as "" | Audience)}>
              <option value="">הכל</option>
              {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
            </select>
          )}
        </Field>
      </div>
      {rows.length === 0 ? (
        <p className="wa-muted">אין אנשי קשר להצגה.</p>
      ) : (
        <div className="wa-table-wrap">
          <table className="wa-table">
            <caption className="sh-only-sr">רשימת אנשי הקשר</caption>
            <thead>
              <tr><th scope="col">שם</th><th scope="col">קהל</th><th scope="col">גדוד</th><th scope="col">הפסקת הודעות</th><th scope="col">בוט</th><th scope="col">מחיקה</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}{c.kind === "group" ? " (קבוצה)" : ""}{c.role ? <small className="wa-muted" style={{ display: "block" }}>{c.role}</small> : null}</td>
                  <td>
                    <select aria-label={`קהל של ${c.name}`} value={c.audience} disabled={busy} onChange={(e) => patch(c, { audience: e.target.value as Audience })}>
                      {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                    </select>
                  </td>
                  <td>{c.battalion || "—"}</td>
                  <td><input type="checkbox" aria-label={`הפסקת הודעות ל${c.name}`} checked={c.optedOut} disabled={busy} onChange={(e) => patch(c, { optedOut: e.target.checked })} /></td>
                  <td>
                    <input type="checkbox" aria-label={`בוט מורשה ל${c.name}`} checked={c.botAllowed && c.audience !== "trainees"} disabled={busy || c.audience === "trainees"} onChange={(e) => patch(c, { botAllowed: e.target.checked })} />
                  </td>
                  <td><button type="button" className="wa-btn danger small" disabled={busy} aria-label={`מחיקת ${c.name}`} onClick={() => remove(c)}><Trash2 size={16} aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="wa-muted">אצל חניכים הבוט תמיד כבוי, ואי אפשר להפעיל אותו.</p>
    </section>
  );
}
