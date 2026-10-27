"use client";

// שלב 39 (261–270): בדיקת קול, בדיקת בטיחות, התאמה לגיל ושאלות לדיון אחרי כל שלב.
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal } from "./ui";
import type { Block, Snap } from "./WriteParts";

const docBody = (s: Snap) => ({ title: s.title, meta: s.meta, blocks: s.blocks });
const Close = ({ onClose }: { onClose: () => void }) => (
  <button type="button" className="btn" onClick={onClose}>
    סגירה
  </button>
);

interface Voice {
  totalSpeakMin: number;
  plannedMin: number;
  talkShare: number | null;
  blocks: { id: string; label: string; words: number; speakSec: number; plannedMin: number; ratio: number | null }[];
  hardSentences: { blockId: string; label: string; text: string; reasons: string[] }[];
}

/** 261, 262 */
export function VoiceCheckModal({ open, onClose, snap, token }: { open: boolean; onClose: () => void; snap: Snap; token: string | null }) {
  const toast = useToast();
  const [r, setR] = useState<Voice | null>(null);
  useEffect(() => {
    if (!open) return;
    setR(null);
    api<Voice>("/api/write/voice-check", { method: "POST", token, body: docBody(snap) }).then(setR).catch((e) => toast(errorMessage(e), { kind: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="בדיקת קול" wide footer={<Close onClose={onClose} />}>
      {!r ? <p>בודק…</p> : (
        <>
          <p role="status">
            אם תקראו את כל הטקסט בקול, זה ייקח כ-<strong>{r.totalSpeakMin} דקות</strong>
            {r.plannedMin ? ` מתוך ${r.plannedMin} דקות מתוכננות (${r.talkShare}% דיבור שלכם)` : ""}.
          </p>
          <ul className="plain-list" aria-label="זמן דיבור לפי שלב">
            {r.blocks.map((b) => (
              <li key={b.id}>
                <span>
                  <strong>{b.label}</strong>: {b.speakSec} שניות דיבור
                  {b.plannedMin ? ` מתוך ${b.plannedMin} דקות` : ""}
                  {b.ratio != null && b.ratio > 0.6 ? " ⚠ רוב השלב הוא דיבור שלכם" : ""}
                </span>
              </li>
            ))}
          </ul>
          <h3>משפטים שקשה להגיד בקול ({r.hardSentences.length})</h3>
          {r.hardSentences.length === 0 ? <p>אין משפטים בעייתיים. מצוין!</p> : (
            <ul className="plain-list">
              {r.hardSentences.map((h, i) => (
                <li key={i}>
                  <span>
                    <strong>{h.label}:</strong> {h.text}…<br />
                    <small>{h.reasons.join(" · ")}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">הערכה לפי קצב הדרכה של כ-125 מילים בדקה, כולל עצירות.</p>
        </>
      )}
    </Modal>
  );
}

interface Safety {
  risks: { id: string; label: string; stages: string[]; suggestion: string; covered: boolean }[];
  missing: number;
  ok: boolean;
  ratio: { perGuide: number; why: string[]; groupSize: number | null; guidesNeeded: number | null };
}
interface Emergency {
  contacts: { name: string; phone: string }[];
  national: { name: string; phone: string }[];
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 263, 264, 265 */
export function SafetyModal({ open, onClose, snap, token, onAddStage }: { open: boolean; onClose: () => void; snap: Snap; token: string | null; onAddStage: (title: string, text: string) => void }) {
  const toast = useToast();
  const [r, setR] = useState<Safety | null>(null);
  const [em, setEm] = useState<Emergency>({ contacts: [], national: [] });
  const [f, setF] = useState({ name: "", phone: "" });
  useEffect(() => {
    if (!open) return;
    setR(null);
    api<Safety>("/api/write/safety", { method: "POST", token, body: docBody(snap) }).then(setR).catch((e) => toast(errorMessage(e), { kind: "error" }));
    api<Emergency>("/api/write/emergency", { token }).then(setEm).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const saveContacts = async (contacts: Emergency["contacts"]) => {
    try {
      const x = await api<{ contacts: Emergency["contacts"] }>("/api/write/emergency", { method: "PUT", token, body: { contacts } });
      setEm((e) => ({ ...e, contacts: x.contacts }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const missing = r?.risks.filter((x) => !x.covered) ?? [];
  const addStage = () => {
    onAddStage("בטיחות", missing.map((m) => `**${m.label}:** ${m.suggestion}`).join("\n"));
    toast("נוסף שלב בטיחות. אפשר לערוך אותו.", { kind: "success" });
    onClose();
  };
  const printCard = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return toast("הדפדפן חסם את החלון. אפשרו חלונות קופצים ונסו שוב.", { kind: "error" });
    const phones = [...em.contacts, ...em.national].map((c) => `<li><strong>${esc(c.name)}</strong>: <span dir="ltr">${esc(c.phone)}</span></li>`).join("");
    const risks = (r?.risks ?? []).map((x) => `<li><strong>${esc(x.label)}</strong>: ${esc(x.suggestion)}</li>`).join("");
    w.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>כרטיס בטיחות</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.6}h1{border-bottom:4px solid #4a3fc9;padding-bottom:6px}li{margin:6px 0}</style></head><body><h1>כרטיס בטיחות: ${esc(snap.title || "פעולה")}</h1><p>${r?.ratio.groupSize ? `${r.ratio.groupSize} חניכים · ` : ""}נדרשים לפחות ${r?.ratio.guidesNeeded ?? "?"} מדריכים (מדריך לכל ${r?.ratio.perGuide ?? "?"})</p><h2>הנחיות לפעולה</h2><ul>${risks || "<li>לא זוהו סיכונים מיוחדים</li>"}</ul><h2>טלפונים לחירום</h2><ul>${phones}</ul><h2>לפני שמתחילים</h2><ul><li>ספירת חניכים ורשימת נוכחות</li><li>ארגז עזרה ראשונה זמין</li><li>ידוע מי הרכז האחראי</li></ul></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Modal open={open} onClose={onClose} title="בדיקת בטיחות" wide footer={<Close onClose={onClose} />}>
      {!r ? <p>בודק…</p> : (
        <>
          <p role="status">
            {r.risks.length === 0 ? "לא זוהו סיכונים מיוחדים בטקסט." : r.ok ? "כל הסיכונים שזוהו מכוסים בהנחיות. מצוין." : `זוהו ${r.risks.length} נושאי בטיחות, ו-${r.missing} מהם בלי הנחיה בטקסט.`}
          </p>
          <ul className="plain-list">
            {r.risks.map((x) => (
              <li key={x.id}>
                <span>
                  {x.covered ? "✅" : "⚠"} <strong>{x.label}</strong> (בשלבים: {x.stages.join(", ") || "בציוד"})<br />
                  {!x.covered && <small>{x.suggestion}</small>}
                </span>
              </li>
            ))}
          </ul>
          <p>
            <strong>יחס מדריכים מומלץ:</strong> מדריך לכל {r.ratio.perGuide} חניכים
            {r.ratio.guidesNeeded ? `, כלומר לפחות ${r.ratio.guidesNeeded} מדריכים ל-${r.ratio.groupSize} חניכים` : " (הגדירו גודל קבוצה במסמך כדי לראות מספר)"}.
            {r.ratio.why.length > 0 && <small> סיבה: {r.ratio.why.join(", ")}.</small>}
          </p>
          <div className="actions">
            {missing.length > 0 && <button type="button" className="btn btn-primary" onClick={addStage}>הוספת שלב בטיחות</button>}
            <button type="button" className="btn" onClick={printCard}>הדפסת כרטיס בטיחות</button>
          </div>
          <h3>טלפונים לחירום (נשמרים אצלכם)</h3>
          <ul className="plain-list">
            {em.contacts.map((c, i) => (
              <li key={i}>
                <span>{c.name}: <bdi dir="ltr">{c.phone}</bdi></span>
                <button type="button" className="btn btn-small" onClick={() => saveContacts(em.contacts.filter((_, j) => j !== i))}>מחיקה<span className="sr-only">: {c.name}</span></button>
              </li>
            ))}
            {em.national.map((c) => (
              <li key={c.phone}>{c.name}: <bdi dir="ltr">{c.phone}</bdi></li>
            ))}
          </ul>
          <div className="inline-form">
            <Field label="שם (רכז, הורה אחראי, מרפאה)" htmlFor="em-name"><input id="em-name" maxLength={40} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="טלפון" htmlFor="em-phone"><input id="em-phone" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          </div>
          <button type="button" className="btn btn-small" disabled={!f.name.trim() || !f.phone.trim() || em.contacts.length >= 6} onClick={() => { void saveContacts([...em.contacts, { name: f.name.trim(), phone: f.phone.trim() }]); setF({ name: "", phone: "" }); }}>
            הוספת איש קשר
          </button>
          <p className="hint">זו בדיקה לפי מילות מפתח ולא תחליף לשיקול דעת ולנהלי השבט.</p>
        </>
      )}
    </Modal>
  );
}

interface Adapt {
  label: string;
  changes: { blockId: string; label: string; what: string }[];
}
const LEVELS: [string, string][] = [["young", "צעירים (כיתות ג-ה)"], ["mid", "בינוניים (כיתות ו-ח)"], ["old", "בוגרים (כיתות ט-יב)"]];

/** 266, 267, 268 */
export function AgeAdaptModal({ open, onClose, snap, token, docId, onOpened }: { open: boolean; onClose: () => void; snap: Snap; token: string | null; docId: number; onOpened: (id: number) => void }) {
  const toast = useToast();
  const [level, setLevel] = useState("young");
  const [r, setR] = useState<Adapt | null>(null);
  useEffect(() => {
    if (!open) return;
    setR(null);
    api<Adapt>("/api/write/age-adapt", { method: "POST", token, body: { level, doc: docBody(snap) } }).then(setR).catch((e) => toast(errorMessage(e), { kind: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, level]);
  const make = async () => {
    try {
      const x = await api<{ id: number }>(`/api/write/docs/${docId}/age-copy`, { method: "POST", token, body: { level } });
      toast("נוצר עותק מותאם. המקור לא השתנה.", { kind: "success" });
      onOpened(x.id);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="התאמה לגיל" wide footer={<Close onClose={onClose} />}>
      <fieldset>
        <legend>לאיזו רמה להתאים?</legend>
        {LEVELS.map(([k, label]) => (
          <label key={k} className="check">
            <input type="radio" name="age-level" checked={level === k} onChange={() => setLevel(k)} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      {!r ? <p>מחשב…</p> : (
        <>
          <p role="status">{r.changes.length ? `${r.changes.length} שינויים מוצעים:` : "אין שינויים מוצעים לרמה הזו."}</p>
          <ul className="plain-list">
            {r.changes.map((c, i) => (
              <li key={i}><span><strong>{c.label}:</strong> {c.what}</span></li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={make}>יצירת עותק מותאם</button>
          <p className="hint">ההתאמה לפי כללים פשוטים (מילים, אורך משפטים וזמני שלבים). עברו על העותק לפני שימוש.</p>
        </>
      )}
    </Modal>
  );
}

interface SQ {
  questions: { q: string; from: string }[];
  fromBank: { id: number; text: string }[];
}

/** 269, 270 */
export function StageQuestionsModal({ open, onClose, block, snap, token, onInsert }: { open: boolean; onClose: () => void; block: Block | undefined; snap: Snap; token: string | null; onInsert: (t: string) => void }) {
  const toast = useToast();
  const [r, setR] = useState<SQ | null>(null);
  const load = useCallback(() => {
    if (!block) return;
    api<SQ>("/api/write/stage-questions", { method: "POST", token, body: { block, value: snap.meta.value ?? "", ageGroup: snap.meta.ageGroup ?? "" } }).then(setR).catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [block, snap.meta.value, snap.meta.ageGroup, token, toast]);
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const add = (qs: string[]) => {
    onInsert(`\n**שאלות לדיון:**\n${qs.map((q) => `- ${q}`).join("\n")}\n`);
    for (const q of qs) void api("/api/write/question-bank", { method: "POST", token, body: { text: q, used: true } }).catch(() => {});
    toast("השאלות נוספו לשלב ונשמרו בבנק שלכם", { kind: "success" });
  };
  const save = (q: string) => api("/api/write/question-bank", { method: "POST", token, body: { text: q } }).then(() => toast("נשמר בבנק", { kind: "success" })).catch((e) => toast(errorMessage(e), { kind: "error" }));
  return (
    <Modal open={open} onClose={onClose} title={`שאלות לדיון: ${block?.title || "השלב הנוכחי"}`} wide footer={<Close onClose={onClose} />}>
      {!block ? <p>בחרו שלב בעורך.</p> : !r ? <p>מכין…</p> : (
        <>
          <ul className="plain-list">
            {r.questions.map((x) => (
              <li key={x.q}>
                <span>
                  {x.q} <small>({x.from})</small>
                </span>
                <span className="actions">
                  <button type="button" className="btn btn-small" onClick={() => add([x.q])}>הוספה לשלב</button>
                  <button type="button" className="btn btn-small" onClick={() => void save(x.q)}>שמירה בבנק</button>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => add(r.questions.map((x) => x.q))}>הוספת שלוש השאלות</button>
          {r.fromBank.length > 0 && (
            <>
              <h3>מהבנק שלי</h3>
              <ul className="plain-list">
                {r.fromBank.map((b) => (
                  <li key={b.id}>
                    <span>{b.text}</span>
                    <button type="button" className="btn btn-small" onClick={() => add([b.text])}>הוספה לשלב</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
