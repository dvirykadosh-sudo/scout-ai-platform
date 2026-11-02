"use client";

// שלב 57: ניסוח ובדיקת תגובה, הודעות לשכבה ופתיחת שיחה.
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { ReplyList, SafetyBox, type Gender, type Replies, type Safety, type Variant } from "./Chat57";
import { Field } from "./ui";

const INTENTS: [string, string][] = [["", "זיהוי אוטומטי"], ["question", "שאלה"], ["absence", "היעדרות או איחור"], ["complaint", "תלונה או חוסר עניין"], ["apology", "התנצלות"], ["permission", "בקשת רשות"], ["thanks", "תודה או מחמאה"], ["joke", "הומור"], ["ack", "אישור קצר"], ["emotional", "שיתוף רגשי"], ["conflict", "ריב או פגיעה בין חברים"], ["general", "כללי"]];
type G = { kid: Gender; guide: Gender };

interface ReplyOut { detected: { primary: string; all: string[] } | null; tone: { top: { id: string; label: string }[]; confidence: string; note: string } | null; safety: Safety; replies: Replies; intentLabels: Record<string, string> }
interface CheckOut { ok: boolean; items: { level: string; code: string; text: string }[]; stats: { words: number; emojis: number }; note?: string }

/* ───────────── ניסוח ובדיקה ───────────── */
export function ReplyTab({ token, gender, setGender }: { token: string; gender: G; setGender: (g: G) => void }) {
  const toast = useToast();
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [out, setOut] = useState<ReplyOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [where, setWhere] = useState<"private" | "group">("private");
  const [chk, setChk] = useState<CheckOut | null>(null);

  const suggest = async () => {
    setBusy(true);
    try { setOut(await api<ReplyOut>("/api/chat/reply", { method: "POST", token, body: { message: msg, intent, name: name.trim(), kid: gender.kid, guide: gender.guide } })); } catch (e) { toast(errorMessage(e), { kind: "error" }); } finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true);
    try { setChk(await api<CheckOut>("/api/chat/check-reply", { method: "POST", token, body: { draft, where, intent: out?.replies?.intent ?? intent, hour: new Date().getHours(), kid: gender.kid } })); } catch (e) { toast(errorMessage(e), { kind: "error" }); } finally { setBusy(false); }
  };
  const lbl = (id: string) => out?.intentLabels[id] ?? id;
  return (
    <div className="ch-tools">
      <section className="card" aria-labelledby="rp-h">
        <h2 id="rp-h">מה לענות להודעה</h2>
        <p className="hint">הדביקו הודעה אחת של חניך. אל תכתבו שמות מלאים: מספרי טלפון וקישורים נמחקים אוטומטית, והשם שתכתבו כאן משמש רק לטיוטה ולא נשמר.</p>
        <Field label="ההודעה של החניך" htmlFor="rp-msg"><textarea id="rp-msg" rows={4} value={msg} maxLength={2000} dir="auto" onChange={(e) => setMsg(e.target.value)} /></Field>
        <div className="st-row">
          <Field label="סוג ההודעה" htmlFor="rp-intent"><select id="rp-intent" value={intent} onChange={(e) => setIntent(e.target.value)}>{INTENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="שם החניך (לטיוטה)" htmlFor="rp-name"><input id="rp-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="החניך" htmlFor="rp-kid"><select id="rp-kid" value={gender.kid} onChange={(e) => setGender({ ...gender, kid: e.target.value as Gender })}><option value="n">לא ידוע</option><option value="m">בן</option><option value="f">בת</option></select></Field>
          <Field label="אני" htmlFor="rp-guide"><select id="rp-guide" value={gender.guide} onChange={(e) => setGender({ ...gender, guide: e.target.value as Gender })}><option value="n">לא משנה</option><option value="m">מדריך</option><option value="f">מדריכה</option></select></Field>
        </div>
        <div className="actions"><button type="button" className="btn btn-primary" disabled={busy || (!msg.trim() && !intent)} onClick={suggest}>הצעת תגובות</button></div>
      </section>

      {out && (
        <div className="ch-results" aria-live="polite">
          <SafetyBox safety={out.safety} compact />
          {out.detected && <p><strong>זיהינו:</strong> {out.detected.all.length ? out.detected.all.map(lbl).join(", ") : "הודעה כללית"}.{out.tone && out.tone.top.length > 0 ? ` מצב רוח אפשרי: ${out.tone.top.map((t) => t.label).join(", ")} (אמינות ${out.tone.confidence}).` : ""}</p>}
          {out.replies.suppressed ? (
            <section className="card"><h3>תגובות בטוחות</h3><p>{out.replies.reason}</p><ReplyList label="תגובות שמתאימות לרגע כזה" variants={(out.replies.safe ?? []).map((t, i) => ({ id: `s${i}`, text: t }))} /></section>
          ) : (
            <section className="card">
              {out.replies.tip && <p className="warn-box card">{out.replies.tip}</p>}
              <ReplyList variants={out.replies.variants ?? []} />
              {out.replies.avoid && <><h4>מה לא להגיד</h4><ul>{out.replies.avoid.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
            </section>
          )}
        </div>
      )}

      <section className="card" aria-labelledby="rc-h">
        <h2 id="rc-h">בדיקת תגובה לפני שליחה</h2>
        <p className="hint">כתבתם תגובה בעצמכם? הדביקו כאן ובדקו אם יש בה הקטנה, האשמה, הבטחת סודיות או שפה שמתאימה יותר לנאום.</p>
        <Field label="הטיוטה שלכם" htmlFor="rp-draft"><textarea id="rp-draft" rows={4} value={draft} maxLength={3000} dir="auto" onChange={(e) => { setDraft(e.target.value); setChk(null); }} /></Field>
        <fieldset className="st-kind"><legend>לאן שולחים?</legend>
          <label className="st-choice"><input type="radio" name="rp-where" checked={where === "private"} onChange={() => setWhere("private")} /><span>בפרטי לחניך</span></label>
          <label className="st-choice"><input type="radio" name="rp-where" checked={where === "group"} onChange={() => setWhere("group")} /><span>לקבוצה</span></label>
        </fieldset>
        <div className="actions"><button type="button" className="btn btn-primary" disabled={busy || !draft.trim()} onClick={check}>בדיקה</button></div>
        {chk && (
          <div aria-live="polite" className="ch-check-out">
            <p className="st-status">{chk.ok ? "לא מצאנו בעיה חמורה." : "יש דברים לתקן לפני שליחה."} ({chk.stats.words} מילים)</p>
            <ul className="ch-checks">{chk.items.map((c, i) => <li key={i} className={`ch-lv-${c.level}`}><strong>{c.level === "red" ? "עצור: " : c.level === "warn" ? "שימו לב: " : c.level === "ok" ? "" : "הצעה: "}</strong>{c.text}</li>)}</ul>
            {chk.note && <p className="hint">{chk.note}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

/* ───────────── הודעות לשכבה ופתיחת שיחה ───────────── */
interface Ann { missing: string[]; variants: { id: string; label: string; text: string }[]; tip: string }
interface GroupMsg { id: string; label: string; text: string; slots: string[] }
interface Outreach { label: string; reasons: { id: string; label: string }[]; variants: Variant[]; avoid: string[] }

export function MessagesTab({ token, gender }: { token: string; gender: G }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", date: "", time: "", end: "", place: "", bring: "", contact: "", cost: "", rsvp: "", emoji: true });
  const [ann, setAnn] = useState<Ann | null>(null);
  const [groups, setGroups] = useState<GroupMsg[]>([]);
  const [reason, setReason] = useState("absent");
  const [oName, setOName] = useState("");
  const [oOut, setOOut] = useState<Outreach | null>(null);
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { api<{ items: GroupMsg[] }>("/api/chat/group-messages", { token }).then((r) => setGroups(r.items)).catch(() => setGroups([])); }, [token]);
  const make = async () => {
    try { setAnn(await api<Ann>("/api/chat/announce", { method: "POST", token, body: { ...f, bring: f.bring.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 12) } })); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const loadOut = async (r = reason, n = oName) => {
    try { setOOut(await api<Outreach>(`/api/chat/outreach?reason=${encodeURIComponent(r)}&name=${encodeURIComponent(n.trim())}&kid=${gender.kid}&guide=${gender.guide}`, { token })); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  return (
    <div className="ch-tools">
      <section className="card" aria-labelledby="an-h">
        <h2 id="an-h">הודעה לשכבה</h2>
        <p className="hint">ממלאים פרטים, ומקבלים הודעה מוכנה לוואטסאפ עם הדגשות, ואת מה שחסר בה. בקבוצה קוראים רק את השורה הראשונה, אז שם המידע החשוב.</p>
        <div className="st-row">
          <Field label="מה האירוע" htmlFor="an-title"><input id="an-title" value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="תאריך" htmlFor="an-date"><input id="an-date" value={f.date} maxLength={40} placeholder="יום חמישי 5.11" onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="שעת התחלה" htmlFor="an-time"><input id="an-time" value={f.time} maxLength={20} placeholder="17:00" onChange={(e) => set("time", e.target.value)} /></Field>
        </div>
        <div className="st-row">
          <Field label="שעת סיום או איסוף" htmlFor="an-end"><input id="an-end" value={f.end} maxLength={40} placeholder="19:00" onChange={(e) => set("end", e.target.value)} /></Field>
          <Field label="מקום" htmlFor="an-place"><input id="an-place" value={f.place} maxLength={100} onChange={(e) => set("place", e.target.value)} /></Field>
          <Field label="מה להביא (בפסיקים)" htmlFor="an-bring"><input id="an-bring" value={f.bring} maxLength={300} onChange={(e) => set("bring", e.target.value)} /></Field>
        </div>
        <div className="st-row">
          <Field label="למי פונים עם שאלות" htmlFor="an-contact"><input id="an-contact" value={f.contact} maxLength={80} onChange={(e) => set("contact", e.target.value)} /></Field>
          <Field label="עלות (לא חובה)" htmlFor="an-cost"><input id="an-cost" value={f.cost} maxLength={80} onChange={(e) => set("cost", e.target.value)} /></Field>
          <Field label="לאשר הגעה עד (לא חובה)" htmlFor="an-rsvp"><input id="an-rsvp" value={f.rsvp} maxLength={40} onChange={(e) => set("rsvp", e.target.value)} /></Field>
        </div>
        <label className="st-check"><input type="checkbox" checked={f.emoji} onChange={(e) => set("emoji", e.target.checked)} /><span>עם אימוג'ים</span></label>
        <div className="actions"><button type="button" className="btn btn-primary" onClick={make}>יצירת הודעה</button></div>
        {ann && (
          <div aria-live="polite">
            {ann.missing.length > 0 ? <p className="warn-box card"><strong>חסר בהודעה:</strong> {ann.missing.join(", ")}. מי שלא יודע ישאל אתכם בפרטי.</p> : <p className="st-status">ההודעה מלאה.</p>}
            <ReplyList label="גרסאות להעתקה" variants={ann.variants} />
            <p className="hint">{ann.tip}</p>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="gm-h">
        <h2 id="gm-h">הודעות מוכנות לקבוצה</h2>
        {groups.length > 0 && <ReplyList label="להרגעה, כללים, שעות שקט וריכוז שאלות" variants={groups.map((g) => ({ id: g.id, label: g.label, text: g.text, slots: g.slots }))} />}
      </section>

      <section className="card" aria-labelledby="ou-h">
        <h2 id="ou-h">איך פותחים שיחה</h2>
        <p className="hint">חניך שנעלם, שקט, או אחרי רגע קשה. הודעה אחת, קטנה, בלי לחץ.</p>
        <div className="st-row">
          <Field label="המצב" htmlFor="ou-reason">
            <select id="ou-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {(oOut?.reasons ?? [{ id: "absent", label: "לא הגיע/ה כמה פעולות" }, { id: "quiet", label: "חניך שקט שלא מדבר בקבוצה" }, { id: "afterConflict", label: "אחרי ריב או רגע קשה" }, { id: "returning", label: "חזר/ה אחרי הפסקה" }, { id: "newbie", label: "חניך חדש" }, { id: "birthday", label: "יום הולדת" }]).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="שם (לטיוטה)" htmlFor="ou-name"><input id="ou-name" value={oName} maxLength={30} onChange={(e) => setOName(e.target.value)} /></Field>
          <div className="actions"><button type="button" className="btn btn-primary" onClick={() => loadOut()}>הצעת הודעות</button></div>
        </div>
        {oOut && (
          <div aria-live="polite">
            <ReplyList label={oOut.label} variants={oOut.variants} />
            <h4>מה לא לעשות</h4><ul>{oOut.avoid.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
      </section>
    </div>
  );
}

