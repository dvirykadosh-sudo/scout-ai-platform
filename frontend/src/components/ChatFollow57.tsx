"use client";

// שלב 57 (492, 493, 496–502): מעקבים, סיכומים שמורים, ותוסף למחשב עם אסימון אישי.
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { copyText } from "./Chat57";
import { Field, Skeleton } from "./ui";

interface Follow { id: number; alias: string; note: string; due: string | null; done: boolean; overdue: boolean }
interface Saved { id: number; title: string; mode: string; createdAt: string; expiresAt: string; summary: { safety: { level: string }; counts: { messages: number | null }; plan: { level: string; text: string; why: string }[] } }
interface Tok { id: number; label: string; createdAt: string; lastUsedAt: string | null; expiresAt: string; revoked: boolean; active: boolean }
const day = (iso: string) => iso.slice(0, 10);

export function FollowTab({ token }: { token: string }) {
  const toast = useToast();
  const [items, setItems] = useState<Follow[] | null>(null);
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [f, setF] = useState({ alias: "", note: "", due: "" });
  const load = useCallback(() => {
    api<{ items: Follow[] }>("/api/chat/followups", { token }).then((r) => setItems(r.items)).catch(() => setItems([]));
    api<{ items: Saved[] }>("/api/chat/saved", { token }).then((r) => setSaved(r.items)).catch(() => setSaved([]));
  }, [token]);
  useEffect(load, [load]);
  const add = async () => {
    try { await api("/api/chat/followups", { method: "POST", token, body: { alias: f.alias, note: f.note, due: f.due || null } }); setF({ alias: "", note: "", due: "" }); toast("המעקב נוסף.", { kind: "success" }); load(); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const toggle = async (x: Follow) => { try { await api(`/api/chat/followups/${x.id}`, { method: "PATCH", token, body: { done: !x.done } }); load(); } catch (e) { toast(errorMessage(e), { kind: "error" }); } };
  const del = async (path: string, msg: string) => { try { await api(path, { method: "DELETE", token }); toast(msg); load(); } catch (e) { toast(errorMessage(e), { kind: "error" }); } };
  return (
    <div className="ch-tools">
      <section className="card" aria-labelledby="fo-h">
        <h2 id="fo-h">מעקבים</h2>
        <p className="hint">משימות קטנות כמו "לשאול מה שלומו אחרי הפעולה". כותבים כינוי (חניך א') ולא שם מלא, ולא כותבים כאן נושאים רגישים או מצוקה: אלה הולכים לרכז/ת השבט, לא לרשימת משימות.</p>
        <div className="st-row">
          <Field label="כינוי" htmlFor="fo-alias"><input id="fo-alias" value={f.alias} maxLength={40} onChange={(e) => setF({ ...f, alias: e.target.value })} placeholder="חניך א'" /></Field>
          <Field label="משימה" htmlFor="fo-note"><input id="fo-note" value={f.note} maxLength={140} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <Field label="תאריך" htmlFor="fo-due"><input id="fo-due" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        </div>
        <div className="actions"><button type="button" className="btn btn-primary" disabled={!f.alias.trim()} onClick={add}>הוספת מעקב</button></div>
        {!items ? <Skeleton lines={2} /> : !items.length ? <p className="hint">אין מעקבים עדיין.</p> : (
          <ul className="st-list">
            {items.map((x) => (
              <li key={x.id}>
                <label className="st-check"><input type="checkbox" checked={x.done} onChange={() => toggle(x)} /><span className={x.done ? "ch-done" : ""}><strong>{x.alias}</strong>{x.note ? `: ${x.note}` : ""}{x.due ? ` (עד ${x.due})` : ""}{x.overdue ? " · באיחור" : ""}</span></label>
                <button type="button" className="btn btn-small" aria-label={`מחיקת מעקב ${x.alias}`} onClick={() => del(`/api/chat/followups/${x.id}`, "המעקב נמחק.")}>מחיקה</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="sv-h">
        <h2 id="sv-h">סיכומים שמורים</h2>
        <p className="hint">סיכום הוא מספרים והמלצות, בלי טקסט של השיחה ובלי שמות. הוא נמחק אוטומטית אחרי 30 יום.</p>
        {!saved ? <Skeleton lines={2} /> : !saved.length ? <p className="hint">אין סיכומים שמורים. אחרי ניתוח אפשר לשמור סיכום.</p> : (
          <ul className="st-list">
            {saved.map((s) => (
              <li key={s.id}>
                <details>
                  <summary><strong>{s.title}</strong> · {s.mode === "group" ? "קבוצה" : "חניך"} · נשמר {day(s.createdAt)} · יימחק {day(s.expiresAt)}{s.summary.safety.level !== "none" ? " · היה סימן אזהרה" : ""}</summary>
                  <ol>{s.summary.plan.map((p, i) => <li key={i}>{p.text} <span className="hint">({p.why})</span></li>)}</ol>
                </details>
                <button type="button" className="btn btn-small" aria-label={`מחיקת הסיכום ${s.title}`} onClick={() => del(`/api/chat/saved/${s.id}`, "הסיכום נמחק.")}>מחיקה</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ExtensionTab({ token }: { token: string }) {
  const toast = useToast();
  const [list, setList] = useState<Tok[] | null>(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState("");
  const [origin, setOrigin] = useState("");
  const load = useCallback(() => { api<{ items: Tok[] }>("/api/chat/tokens", { token }).then((r) => setList(r.items)).catch(() => setList([])); }, [token]);
  useEffect(() => { load(); setOrigin(window.location.origin); }, [load]);
  const create = async () => {
    try { const r = await api<{ token: string }>("/api/chat/tokens", { method: "POST", token, body: { label } }); setFresh(r.token); setLabel(""); load(); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const revoke = async (t: Tok) => { try { await api(`/api/chat/tokens/${t.id}`, { method: "DELETE", token }); toast("האסימון בוטל. התוסף שמחזיק בו לא יוכל להתחבר."); if (fresh) setFresh(""); load(); } catch (e) { toast(errorMessage(e), { kind: "error" }); } };
  return (
    <div className="ch-tools">
      <section className="card" aria-labelledby="ex-h">
        <h2 id="ex-h">תוסף לכרום ולאדג' במחשב</h2>
        <p>התוסף יושב ליד וואטסאפ ווב, קורא את השיחה הפתוחה, <strong>מסתיר שמות וטלפונים במחשב שלכם לפני שהוא שולח משהו לאתר</strong>, ומציג ניתוח ותגובות מוצעות. הוא <strong>לא שולח הודעות בשמכם</strong> ולא קורא שיחות שלא פתחתם.</p>
        <h3>התקנה (פעם אחת, כ-3 דקות)</h3>
        <ol className="ch-steps">
          <li>בתיקיית הפרויקט במחשב (<span dir="ltr">Downloads\scout-ai-platform</span>) יש תיקייה בשם <strong dir="ltr">extension</strong>.</li>
          <li>בכרום פתחו את <span dir="ltr">chrome://extensions</span> (באדג': <span dir="ltr">edge://extensions</span>) והפעילו "מצב מפתח" (Developer mode).</li>
          <li>לחצו "טעינת תוסף שלא נארז" (Load unpacked) ובחרו את תיקיית <span dir="ltr">extension</span>.</li>
          <li>צרו כאן אסימון (למטה), פתחו את התוסף, לחצו "הגדרות" והדביקו את כתובת האתר ואת האסימון.</li>
          <li>פתחו וואטסאפ ווב, היכנסו לשיחה, ולחצו על סמל התוסף: "ניתוח השיחה הפתוחה".</li>
        </ol>
        <p>כתובת האתר להדבקה בתוסף: <code dir="ltr" className="ch-code">{origin}</code> <button type="button" className="btn btn-small" onClick={() => copyText(origin, toast)}>העתקה</button></p>
      </section>
      <section className="card" aria-labelledby="tk-h">
        <h2 id="tk-h">אסימון חיבור לתוסף</h2>
        <p className="hint">האסימון הוא סיסמה לתוסף בלבד. הוא יכול לנתח שיחות ולנסח תגובות, ולא לפתוח את החשבון שלכם או לראות את מה ששמרתם. אפשר לבטל אותו בכל רגע. הוא תקף 60 יום.</p>
        <div className="st-row">
          <Field label="שם למחשב" htmlFor="tk-label"><input id="tk-label" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="המחשב בבית" /></Field>
          <div className="actions"><button type="button" className="btn btn-primary" onClick={create}>יצירת אסימון</button></div>
        </div>
        {fresh && (
          <div className="st-privacy" role="status">
            <p><strong>האסימון מוצג פעם אחת בלבד.</strong> העתיקו אותו עכשיו לתוסף.</p>
            <p><input readOnly aria-label="האסימון החדש" className="ch-code" dir="ltr" value={fresh} onFocus={(e) => e.currentTarget.select()} /></p>
            <button type="button" className="btn btn-small" onClick={() => copyText(fresh, toast)}>העתקה</button>
          </div>
        )}
        {!list ? <Skeleton lines={2} /> : !list.length ? <p className="hint">אין אסימונים.</p> : (
          <ul className="st-list">
            {list.map((t) => (
              <li key={t.id}>
                <span><strong>{t.label}</strong> · {t.revoked ? "בוטל" : t.active ? "פעיל" : "פג תוקף"} · נוצר {day(t.createdAt)}{t.lastUsedAt ? ` · שימוש אחרון ${day(t.lastUsedAt)}` : " · עוד לא שומש"} · תוקף עד {day(t.expiresAt)}</span>
                {t.active && <button type="button" className="btn btn-small" aria-label={`ביטול האסימון ${t.label}`} onClick={() => revoke(t)}>ביטול</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="lm-h">
        <h2 id="lm-h">מה התוסף עושה ומה לא (בכנות)</h2>
        <ul>
          <li>פועל רק כשאתם לוחצים עליו, ורק על השיחה הפתוחה או על טקסט שסימנתם.</li>
          <li>קורא את ההודעות שמופיעות במסך של וואטסאפ ווב. וואטסאפ משנה את המבנה של הדף מדי פעם, ולכן הקריאה עלולה להפסיק לעבוד אחרי עדכון שלהם. במקרה כזה אפשר לסמן טקסט ולנתח אותו.</li>
          <li>לא שולח הודעות ולא לוחץ "שלח". הוא יכול לשים טיוטה בתיבת הכתיבה, ואתם קוראים ושולחים.</li>
          <li>לא שומר את השיחה בשום מקום. מה שנשמר בתוסף הוא רק כתובת האתר והאסימון.</li>
          <li>עובד בכרום ובאדג' במחשב. לא באפליקציה של וואטסאפ בטלפון.</li>
        </ul>
      </section>
    </div>
  );
}
