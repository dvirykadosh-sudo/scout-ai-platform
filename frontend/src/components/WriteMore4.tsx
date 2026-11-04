"use client";

// כלים אחרונים לעורך (רעיונות 175–187): חיפוש בכל המסמכים, חלוקה לקבוצות, הודעה להורים,
// רשימת ציוד וביקורת עצמית, שלבים מוכנים, קובץ יומן, ובדיקת מסמכים דומים.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal } from "./ui";
import { emptyBlock, type Block, type Kind, type Snap } from "./WriteParts";

/** 175: קובץ יומן (.ics) לפעולה. שעון מקומי, בלי אזור זמן. */
export function icsFor(snap: Snap, total: number): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(snap.meta.date ?? "");
  if (!d) return null;
  const st = /^(\d{2}):(\d{2})$/.exec(snap.meta.startTime ?? "") ?? ["", "18", "00"];
  const mins = snap.meta.minutes || total || 45;
  const start = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(st[1]), Number(st[2]));
  const end = new Date(start.getTime() + mins * 60_000);
  const f = (x: Date) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}T${String(x.getHours()).padStart(2, "0")}${String(x.getMinutes()).padStart(2, "0")}00`;
  const esc = (t: string) => t.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
  const desc = snap.blocks.map((b) => `${b.title || "שלב"}${b.minutes ? ` (${b.minutes} דק')` : ""}`).join(" | ");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//scout-write//he", "BEGIN:VEVENT", `UID:write-${Date.now()}@scout`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(snap.title || "פעולה")}`, `DESCRIPTION:${esc(desc)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

/** 177: שלבים מוכנים להוספה. */
export const PRESETS: { id: string; label: string; kind: Kind; minutes: number; title: string; text: string }[] = [
  { id: "ask", label: "פתיחה בשאלה", kind: "open", minutes: 5, title: "פתיחה בשאלה", text: "שאלה לפתיחה: \nמה עונים בקבוצות: \nאיך עוברים לנושא: " },
  { id: "game", label: "משחק קצר", kind: "body", minutes: 10, title: "משחק", text: "שם המשחק: \nחוקים בשלושה משפטים: \nמה מחברים בסוף: " },
  { id: "talk", label: "דיון בקבוצות קטנות", kind: "body", minutes: 15, title: "דיון", text: "שאלה לדיון: \nזמן בקבוצות: \nמי מציג במליאה: " },
  { id: "circle", label: "מעגל סיכום", kind: "close", minutes: 5, title: "מעגל סיכום", text: "משפט אחד מכל חניך: \nמה לוקחים איתנו: \nשיר או ברכה: " },
];
export const presetBlock = (id: string): Block | null => {
  const p = PRESETS.find((x) => x.id === id);
  return p ? { ...emptyBlock(p.kind), title: p.title, minutes: p.minutes, text: p.text } : null;
};

/** 176: חיפוש בכל המסמכים. */
export function SearchAllModal({ open, onClose, token }: { open: boolean; onClose: () => void; token: string | null }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: number; title: string; hits: { where: string; snippet: string }[] }[] | null>(null);
  const [err, setErr] = useState("");
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      setRes((await api<{ results: typeof res }>(`/api/write/search?q=${encodeURIComponent(q)}`, { token })).results);
    } catch (x) {
      setErr(errorMessage(x));
      setRes(null);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="חיפוש בכל המסמכים שלי" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <form onSubmit={go} className="inline-form">
        <Field label="מה לחפש" htmlFor="sa-q">
          <input id="sa-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={q.trim().length < 2}>
          חיפוש
        </button>
      </form>
      {err && <p className="error-box" role="alert">{err}</p>}
      {res && (res.length === 0 ? <p role="status">לא נמצא כלום.</p> : (
        <ul className="plain-list" aria-label="תוצאות חיפוש">
          {res.map((r) => (
            <li key={r.id}>
              <span>
                <Link href={`/write/${r.id}`}>
                  <strong>{r.title}</strong>
                </Link>
                {r.hits.map((h, i) => (
                  <span key={i} className="hint">
                    <br />
                    {h.where}: {h.snippet}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ))}
    </Modal>
  );
}

/** 182: מחלק קבוצות. מדביקים שמות, בוחרים כמה קבוצות, והאתר מערבב. */
export function GroupsModal({ open, onClose, size }: { open: boolean; onClose: () => void; size: number | null | undefined }) {
  const toast = useToast();
  const [names, setNames] = useState("");
  const [n, setN] = useState(3);
  const [out, setOut] = useState<string[][] | null>(null);
  const list = names.split(/[\n,،]/).map((x) => x.trim()).filter(Boolean);
  const count = list.length || size || 0;
  const sizes = n > 0 && count ? Array.from({ length: n }, (_, i) => Math.floor(count / n) + (i < count % n ? 1 : 0)) : [];
  const shuffle = () => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const groups: string[][] = Array.from({ length: n }, () => []);
    a.forEach((x, i) => groups[i % n].push(x));
    setOut(groups);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText((out ?? []).map((g, i) => `קבוצה ${i + 1}: ${g.join(", ")}`).join("\n"));
      toast("הקבוצות הועתקו", { kind: "success" });
    } catch {
      toast("ההעתקה נכשלה. סמנו ידנית", { kind: "error" });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="חלוקה לקבוצות" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <Field label="שמות החניכים (שורה או פסיק בין שם לשם, לא חובה)" htmlFor="gr-names">
        <textarea id="gr-names" rows={4} value={names} onChange={(e) => setNames(e.target.value)} />
      </Field>
      <Field label="מספר קבוצות" htmlFor="gr-n">
        <input id="gr-n" type="number" min={1} max={20} dir="ltr" value={n} onChange={(e) => setN(Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))))} />
      </Field>
      {sizes.length > 0 && (
        <p role="status">
          {count} משתתפים ב-{n} קבוצות: {sizes.join(", ")} בכל קבוצה.
        </p>
      )}
      <button type="button" className="btn btn-primary" disabled={!list.length} onClick={shuffle}>
        ערבוב לקבוצות
      </button>
      {out && (
        <>
          <ul className="plain-list" aria-label="הקבוצות">
            {out.map((g, i) => (
              <li key={i}>
                <strong>קבוצה {i + 1}:</strong> {g.join(", ")}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-small" onClick={copy}>
            העתקת הקבוצות
          </button>
        </>
      )}
    </Modal>
  );
}

/** 184: הודעה להורים, כטיוטה לעריכה והעתקה. */
export function ParentsModal({ open, onClose, snap, token }: { open: boolean; onClose: () => void; snap: Snap; token: string | null }) {
  const toast = useToast();
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) return;
    api<{ gear: string[] }>("/api/write/prep", { method: "POST", token, body: { title: snap.title, meta: snap.meta, blocks: snap.blocks } })
      .then((p) => {
        const m = snap.meta;
        const when = [m.date && new Date(m.date + "T00:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" }), m.startTime && `בשעה ${m.startTime}`].filter(Boolean).join(" ");
        setText(
          [`שלום להורים,`, `ביום הפעולה${when ? ` (${when})` : ""} נעסוק בנושא "${snap.title || "פעולה"}"${m.value ? `, סביב הערך ${m.value}` : ""}.`, p.gear.length ? `מה כדאי שיהיה עם החניכים: ${(m.equipment?.length ? m.equipment : []).join(", ") || "אין צורך בציוד מיוחד"}.` : "אין צורך בציוד מיוחד.", `נשמח לראות את כולם בזמן.`, `תודה, ${m.leader || "צוות ההדרכה"}`].join("\n\n"),
        );
      })
      .catch(() => setText(""));
  }, [open, snap, token]);
  return (
    <Modal open={open} onClose={onClose} title="הודעה להורים" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">טיוטה שנבנית מפרטי המסמך. ערכו אותה לפני השליחה. רשימת הציוד היא מה שהוגדר ב"הציוד שלי לפעולה".</p>
      <Field label="נוסח ההודעה" htmlFor="pm-text">
        <textarea id="pm-text" rows={9} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button
        type="button"
        className="btn btn-primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast("ההודעה הועתקה", { kind: "success" });
          } catch {
            toast("ההעתקה נכשלה. סמנו ידנית", { kind: "error" });
          }
        }}
      >
        העתקת ההודעה
      </button>
    </Modal>
  );
}

const REVIEW: [string, string][] = [
  ["q1", "יש שאלה או מעשה פותח שתופס את החבורה"],
  ["q2", "כל חניך יכול להשתתף, גם מי שביישן"],
  ["q3", "הזמנים ריאליים, ויש גמישות של כמה דקות"],
  ["q4", "הציוד מוכן ובדוק"],
  ["q5", "יש רגע שיא ברור"],
  ["q6", "ברור איך מסכמים ומה לוקחים הלאה"],
  ["q7", "חשבתי מה עושים אם יורד גשם או שהקבוצה גדולה מהצפוי"],
  ["q8", "הערך שבחרתי מופיע גם בשיחה ולא רק בכותרת"],
];

/** 181 + 187: ציוד שלי וביקורת עצמית. */
export function PrepPanel({ equipment, review, onEquipment, onReview }: { equipment: string[]; review: string[]; onEquipment: (e: string[]) => void; onReview: (r: string[]) => void }) {
  const [item, setItem] = useState("");
  const add = () => {
    const t = item.trim().slice(0, 40);
    if (t && !equipment.includes(t) && equipment.length < 20) onEquipment([...equipment, t]);
    setItem("");
  };
  return (
    <details className="card glass write-prep">
      <summary>
        הציוד שלי וביקורת עצמית ({review.length} מתוך {REVIEW.length})
      </summary>
      <h3 className="subtitle">הציוד שלי לפעולה</h3>
      <div className="inline-form">
        <Field label="פריט ציוד" htmlFor="eq-item">
          <input
            id="eq-item"
            value={item}
            maxLength={40}
            onChange={(e) => setItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </Field>
        <button type="button" className="btn btn-small" onClick={add} disabled={!item.trim()}>
          הוספה
        </button>
      </div>
      {equipment.length > 0 && (
        <ul className="plain-list" aria-label="ציוד">
          {equipment.map((e) => (
            <li key={e}>
              <span>{e}</span>
              <button type="button" className="btn btn-small" onClick={() => onEquipment(equipment.filter((x) => x !== e))}>
                הסרה<span className="sr-only">: {e}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="subtitle">ביקורת עצמית לפני הפעולה</h3>
      <ul className="plain-list">
        {REVIEW.map(([id, label]) => (
          <li key={id}>
            <label className="check">
              <input type="checkbox" checked={review.includes(id)} onChange={() => onReview(review.includes(id) ? review.filter((x) => x !== id) : [...review, id])} />
              <span>{label}</span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 185: אזהרה כשהמסמך דומה מאוד למסמך אחר שלי. */
export function SimilarNotice({ title, text, docId, token }: { title: string; text: string; docId: number; token: string | null }) {
  const [list, setList] = useState<{ id: number; title: string; percent: number }[]>([]);
  useEffect(() => {
    if (text.trim().length < 80) return setList([]);
    const t = window.setTimeout(() => {
      api<{ similar: { id: number; title: string; percent: number }[] }>("/api/write/similar", { method: "POST", token, body: { title, text: text.slice(0, 60000), excludeId: docId } })
        .then((r) => setList(r.similar))
        .catch(() => {});
    }, 4000);
    return () => window.clearTimeout(t);
  }, [title, text, docId, token]);
  if (!list.length) return null;
  return (
    <p className="warn-box" role="status">
      המסמך דומה מאוד ל:{" "}
      {list.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ", "}
          <Link href={`/write/${s.id}`}>{s.title}</Link> ({s.percent}%)
        </span>
      ))}
      . אולי כדאי לאחד או לשכפל במקום לכתוב מחדש.
    </p>
  );
}
