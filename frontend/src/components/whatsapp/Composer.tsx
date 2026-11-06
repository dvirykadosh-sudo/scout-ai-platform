"use client";

// שליחה: בחירת נמענים, תבנית או טקסט חופשי, משתנים, תצוגה מקדימה ותזמון.
// שליחה לחניכים (קטינים) דורשת אישור מפורש, וכל שליחה עוברת שלב סיכום לפני שהיא נכנסת לתור.
import { useMemo, useRef, useState } from "react";
import { Eye, Send } from "lucide-react";
import { waApi, type WaVariable } from "@/lib/wa-api";
import { ContactPicker } from "./ContactPicker";
import { Alert, Check, Field, useAct, useLoad } from "./wa-ui";

type Preview = { text: string; missing: string[]; unknown: string[] };

export function VariableChips({ variables, onPick }: { variables: WaVariable[]; onPick: (token: string) => void }) {
  return (
    <div className="wa-row" role="group" aria-label="משתנים להוספה לטקסט" style={{ gap: 6 }}>
      {variables.map((v) => (
        <button key={v.key} type="button" className="wa-btn soft small" title={`${v.help} (למשל: ${v.sample})`} onClick={() => onPick(`{{${v.name}}}`)}>
          {v.name.replace(/_/g, " ")}
        </button>
      ))}
    </div>
  );
}

/** מוסיף טקסט במקום הסמן של שדה טקסט */
export function insertAtCaret(el: HTMLTextAreaElement | null, current: string, add: string): string {
  if (!el) return `${current}${add}`;
  const s = el.selectionStart ?? current.length;
  const e = el.selectionEnd ?? current.length;
  return `${current.slice(0, s)}${add}${current.slice(e)}`;
}

export function Composer({ token }: { token: string }) {
  const api = waApi(token);
  const contacts = useLoad(() => api.contacts(), [token]);
  const tpl = useLoad(() => api.templates(), [token]);
  const { act, busy } = useAct();
  const area = useRef<HTMLTextAreaElement>(null);

  const [ids, setIds] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [rsvp, setRsvp] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [trainees, setTrainees] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState("");

  const all = contacts.data ?? [];
  const chosen = useMemo(() => all.filter((c) => ids.includes(c.id)), [all, ids]);
  const hasTrainees = chosen.some((c) => c.audience === "trainees");
  const whenMs = when ? new Date(when).getTime() : 0;
  const pastWhen = Boolean(when) && whenMs < Date.now() - 60_000;
  const problem = ids.length === 0 ? "בחרו לפחות נמען אחד." : !text.trim() ? "כתבו את ההודעה." : pastWhen ? "מועד השליחה כבר עבר." : rsvp && !eventTitle.trim() ? "כתבו שם לאירוע כדי לאסוף אישורי הגעה." : "";

  const doPreview = async () => {
    const r = await act(() => api.preview(text, ids[0]));
    if (r) setPreview({ text: r.text, missing: r.missing, unknown: r.validation.unknown });
  };

  const send = async () => {
    const r = await act(
      () => api.broadcast({ contactIds: ids, template: text, whenIso: when ? new Date(when).toISOString() : undefined, rsvp: rsvp || undefined, eventTitle: rsvp ? eventTitle.trim() : undefined, confirmTrainees: hasTrainees ? trainees : undefined }),
      undefined,
    );
    if (!r) return;
    const n = r.created?.length ?? (r.jobId ? 1 : 0);
    const skipped = r.skipped?.length ?? 0;
    setConfirming(false);
    setText("");
    setIds([]);
    setPreview(null);
    setTrainees(false);
    setWhen("");
    setRsvp(false);
    setEventTitle("");
    // הודעה קבועה בדף (ולא רק טוסט) כדי שאפשר יהיה לקרוא אותה בנחת
    setDone(`נכנסו לתור ${n} הודעות${skipped ? `, ו-${skipped} דולגו (למשל מי שביקש להפסיק לקבל הודעות)` : ""}. תוכלו לעקוב אחריהן בלשונית "סקירה".`);
  };

  return (
    <section className="wa-card" aria-label="שליחת הודעות">
      <h2>שליחת הודעות</h2>
      <p className="wa-muted">ההודעות נכנסות לתור ויוצאות בקצב אנושי, בהתאם להגדרות ההגנה. אפשר לשלוח עד 60 נמענים בבת אחת.</p>
      {done && <Alert info>{done}</Alert>}
      {contacts.error && <Alert>{contacts.error}</Alert>}

      <ContactPicker contacts={all} value={ids} onChange={setIds} />

      <div style={{ marginTop: 14 }}>
        <Field label="תבנית (לא חובה)">
          {(id) => (
            <select id={id} value="" onChange={(e) => { const t = tpl.data?.templates.find((x) => String(x.id) === e.target.value); if (t) setText(t.body); }}>
              <option value="">בחרו תבנית כדי למלא את הטקסט…</option>
              {(tpl.data?.templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="הטקסט">
          {(id) => <textarea id={id} ref={area} value={text} maxLength={4000} rows={6} onChange={(e) => { setText(e.target.value); setPreview(null); }} />}
        </Field>
        {tpl.data && <VariableChips variables={tpl.data.variables} onPick={(t) => { setText((cur) => insertAtCaret(area.current, cur, t)); setPreview(null); }} />}
      </div>

      <div className="wa-row" style={{ marginTop: 12, alignItems: "flex-end" }}>
        <Field label="מועד שליחה (ריק = מיד)">{(id) => <input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
        <Check checked={rsvp} onChange={setRsvp}>לבקש אישור הגעה (כן / לא / אולי)</Check>
      </div>
      {rsvp && <Field label="שם האירוע לאישורי ההגעה">{(id) => <input id={id} value={eventTitle} maxLength={80} onChange={(e) => setEventTitle(e.target.value)} />}</Field>}

      {preview && (
        <div className="wa-bubble out" style={{ marginTop: 12 }} role="status" aria-label="תצוגה מקדימה">
          {preview.text}
          <small>תצוגה מקדימה לפי הנמען הראשון</small>
          {preview.unknown.length > 0 && <small className="wa-bad" style={{ display: "block" }}>משתנים לא מוכרים: {preview.unknown.join(", ")}</small>}
          {preview.missing.length > 0 && <small className="wa-bad" style={{ display: "block" }}>חסר מידע עבור: {preview.missing.join(", ")}</small>}
        </div>
      )}

      {problem && <p className="wa-muted" style={{ marginTop: 10 }}>{problem}</p>}

      {!confirming ? (
        <div className="wa-row" style={{ marginTop: 12 }}>
          <button type="button" className="wa-btn soft" disabled={busy || !text.trim()} onClick={doPreview}><Eye size={18} aria-hidden="true" />תצוגה מקדימה</button>
          <button type="button" className="wa-btn" disabled={busy || Boolean(problem)} onClick={() => { setDone(""); setConfirming(true); }}><Send size={18} aria-hidden="true" />המשך לשליחה</button>
        </div>
      ) : (
        <div className="wa-confirm" role="group" aria-label="אישור שליחה" style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 800 }}>
            תישלח הודעה ל-{ids.length} נמענים {when ? `בתאריך ${new Date(when).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}` : "מיד"}.
          </p>
          <p className="wa-muted" style={{ margin: "0 0 8px" }}>{chosen.slice(0, 6).map((c) => c.name).join(", ")}{chosen.length > 6 ? ` ועוד ${chosen.length - 6}` : ""}</p>
          {hasTrainees && (
            <Check checked={trainees} onChange={setTrainees}>
              <b>בין הנמענים יש חניכים (קטינים).</b> אני מאשר/ת ששליחה אליהם מתאימה לגילם, ואין בה מידע אישי או רגיש.
            </Check>
          )}
          <div className="wa-row" style={{ marginTop: 10 }}>
            <button type="button" className="wa-btn" disabled={busy || (hasTrainees && !trainees)} onClick={send}><Send size={18} aria-hidden="true" />אישור ושליחה לתור</button>
            <button type="button" className="wa-btn soft" disabled={busy} onClick={() => setConfirming(false)}>חזרה לעריכה</button>
          </div>
        </div>
      )}
    </section>
  );
}
