"use client";

// עוד כלים לעורך (רעיונות 151–162): סטטיסטיקה אישית, יומן הרצות, שאלות לדיון,
// ייבוא שלבים ממסמך אחר, קיצורי מקלדת ודף מדריך להדפסה.
import { useEffect, useState } from "react";
import { api, errorMessage, fmtDate } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal, Skeleton } from "./ui";
import { KIND_LABEL, type Block, type Doc, type Snap } from "./WriteParts";

interface Stats {
  docs: number;
  words: number;
  minutes: number;
  runs: number;
  methods: { name: string; n: number }[];
  unusedMethods: string[];
  categories: { id: string; label: string; n: number; pct: number }[];
  values: { name: string; n: number }[];
  nextValues: string[];
  tip: string;
}

/** 151–152: מה כתבתי עד עכשיו. */
export function StatsModal({ open, onClose, token }: { open: boolean; onClose: () => void; token: string | null }) {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setS(null);
    setErr("");
    api<Stats>("/api/write/stats", { token })
      .then(setS)
      .catch((e) => setErr(errorMessage(e)));
  }, [open, token]);
  return (
    <Modal open={open} onClose={onClose} title="הסטטיסטיקה שלי" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {err && <p className="error-box" role="alert">{err}</p>}
      {!s && !err && <Skeleton lines={4} />}
      {s && (
        <>
          <p className="ok-box">{s.tip}</p>
          <p>
            {s.docs} מסמכים · {s.words} מילים · {s.minutes} דקות מתוכננות בסך הכול · {s.runs} הרצות ביומן
          </p>
          <h3 className="subtitle">איזון בין סוגי מתודות</h3>
          <ul className="plain-list" aria-label="איזון מתודות">
            {s.categories.map((c) => (
              <li key={c.id}>
                <span>
                  {c.label}: {c.n} ({c.pct}%)
                </span>
                <span className="stat-bar" aria-hidden="true">
                  <span style={{ width: `${c.pct}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <h3 className="subtitle">המתודות שבשימוש</h3>
          <p>{s.methods.length ? s.methods.map((m) => `${m.name} (${m.n})`).join(", ") : "עוד לא זוהו מתודות בטקסטים."}</p>
          {s.unusedMethods.length > 0 && <p className="hint">עוד לא השתמשתם ב: {s.unusedMethods.join(", ")}.</p>}
          <h3 className="subtitle">ערכים</h3>
          <p>{s.values.length ? s.values.map((v) => `${v.name} (${v.n})`).join(", ") : "עוד לא נבחר ערך באף מסמך."}</p>
          {s.nextValues.length > 0 && <p className="hint">ערכים שעוד לא נגעתם בהם: {s.nextValues.join(", ")}.</p>}
        </>
      )}
    </Modal>
  );
}

export interface Run {
  date: string;
  note: string;
  rating: number;
}

/** 155: יומן הרצות של המסמך. */
export function RunLogModal({ open, onClose, runs, onChange }: { open: boolean; onClose: () => void; runs: Run[]; onChange: (r: Run[]) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(0);
  return (
    <Modal open={open} onClose={onClose} title="יומן הרצות" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">אחרי שהעברתם את הפעולה, רשמו איך הלך. זה נשאר במסמך ועוזר לשפר אותו בפעם הבאה.</p>
      <div className="inline-form">
        <Field label="תאריך" htmlFor="rl-date">
          <input id="rl-date" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="דירוג (0 עד 5)" htmlFor="rl-rate">
          <input id="rl-rate" type="number" min={0} max={5} dir="ltr" value={rating} onChange={(e) => setRating(Math.max(0, Math.min(5, Math.round(Number(e.target.value) || 0))))} />
        </Field>
      </div>
      <div className="actions" role="group" aria-label="משפטים מוכנים">
        {["עבד מצוין", "היה צפוף בזמן", "החניכים התלהבו", "צריך יותר ציוד", "לשפר את הסיכום"].map((q) => (
          <button key={q} type="button" className="btn btn-small" onClick={() => setNote((n) => (n ? `${n}. ${q}` : q).slice(0, 600))}>
            {q}
          </button>
        ))}
      </div>
      <Field label="איך הלך? מה לשנות?" htmlFor="rl-note">
        <textarea id="rl-note" rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!note.trim() || runs.length >= 20}
        onClick={() => {
          onChange([{ date, note: note.trim(), rating }, ...runs]);
          setNote("");
          setRating(0);
        }}
      >
        הוספה ליומן
      </button>
      {runs.length >= 20 && <p className="hint">היומן מלא (20 רשומות). מחקו רשומה ישנה.</p>}
      {runs.length > 0 && (
        <ul className="plain-list" aria-label="הרצות קודמות">
          {runs.map((r, i) => (
            <li key={i}>
              <span>
                <strong>{r.date || "ללא תאריך"}</strong>
                {r.rating ? ` · דירוג ${r.rating} מתוך 5` : ""}
                <br />
                {r.note}
              </span>
              <button type="button" className="btn btn-small" onClick={() => onChange(runs.filter((_, j) => j !== i))}>
                מחיקה<span className="sr-only">: הרצה מתאריך {r.date || "לא ידוע"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** 156: שאלות לדיון לפי הערך והשכבה. */
export function QuestionsModal({ open, onClose, token, value, age, onInsert }: { open: boolean; onClose: () => void; token: string | null; value: string; age: string; onInsert: (text: string) => void }) {
  const [qs, setQs] = useState<string[]>([]);
  const [pick, setPick] = useState<Record<number, boolean>>({});
  useEffect(() => {
    if (!open) return;
    setPick({});
    api<{ questions: string[] }>(`/api/write/questions?value=${encodeURIComponent(value)}&age=${encodeURIComponent(age)}`, { token })
      .then((r) => setQs(r.questions))
      .catch(() => setQs([]));
  }, [open, token, value, age]);
  const chosen = qs.filter((_, i) => pick[i]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="שאלות לדיון"
      footer={
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!chosen.length}
            onClick={() => {
              onInsert(chosen.map((q, i) => `${i + 1}. ${q}`).join("\n"));
              onClose();
            }}
          >
            הכנסת הנבחרות לשלב
          </button>
          <button type="button" className="btn" onClick={onClose}>
            סגירה
          </button>
        </>
      }
    >
      <p className="hint">{value ? `לפי הערך "${value}"` : "לא נבחר ערך בכותרת המסמך, לכן השאלות כלליות."}</p>
      <ul className="plain-list">
        {qs.map((q, i) => (
          <li key={q}>
            <label className="check">
              <input type="checkbox" checked={!!pick[i]} onChange={() => setPick((p) => ({ ...p, [i]: !p[i] }))} />
              <span>{q}</span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

interface Row {
  id: number;
  title: string;
  stages: number;
  updatedAt: string;
}

/** 158: מביאים שלבים ממסמך אחר שלי. */
export function ImportStagesModal({ open, onClose, token, currentId, onApply }: { open: boolean; onClose: () => void; token: string | null; currentId: number; onApply: (blocks: Block[]) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [src, setSrc] = useState<Doc | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!open) return;
    setSrc(null);
    setPick({});
    api<Row[]>("/api/write/docs", { token })
      .then((r) => setRows(r.filter((x) => x.id !== currentId)))
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [open, token, currentId, toast]);
  const choose = async (id: number) => {
    try {
      setSrc(await api<Doc>(`/api/write/docs/${id}`, { token }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const chosen = src?.blocks.filter((b) => pick[b.id]) ?? [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="הבאת שלבים ממסמך אחר"
      wide
      footer={
        <>
          {src && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!chosen.length}
              onClick={() => {
                onApply(chosen);
                onClose();
              }}
            >
              הוספת {chosen.length} שלבים בסוף המסמך
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            סגירה
          </button>
        </>
      }
    >
      {!src ? (
        rows === null ? (
          <Skeleton lines={3} />
        ) : rows.length === 0 ? (
          <p>אין עוד מסמכים להביא מהם.</p>
        ) : (
          <ul className="plain-list">
            {rows.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.title}</strong>
                  <br />
                  <span className="hint">
                    {r.stages} שלבים · עודכן {fmtDate(r.updatedAt)}
                  </span>
                </span>
                <button type="button" className="btn btn-small" onClick={() => choose(r.id)}>
                  בחירה<span className="sr-only">: {r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <p>
            שלבים מתוך <strong>{src.title || "מסמך ללא שם"}</strong>:
          </p>
          <ul className="plain-list">
            {src.blocks.map((b) => (
              <li key={b.id}>
                <label className="check">
                  <input type="checkbox" checked={!!pick[b.id]} onChange={() => setPick((p) => ({ ...p, [b.id]: !p[b.id] }))} />
                  <span>
                    {b.title || KIND_LABEL[b.kind]} ({KIND_LABEL[b.kind]}
                    {b.minutes ? `, ${b.minutes} דקות` : ""})
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-small" onClick={() => setSrc(null)}>
            חזרה לרשימה
          </button>
        </>
      )}
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl+S", "שמירה עכשיו"],
  ["Ctrl+Z / Ctrl+Y", "ביטול ושחזור"],
  ["Ctrl+B", "הדגשת הטקסט המסומן"],
  ["Alt+חץ למעלה / למטה", "הזזת השלב הנוכחי"],
  ["Esc", "יציאה ממסך מלא או ממצב הרצה"],
];

/** 157: קיצורי מקלדת של העורך. */
export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="קיצורי מקלדת בעורך" footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <dl className="write-keys">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k}>
            <dt dir="ltr">{k}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/** 161: דף מדריך. עמוד אחד: שלבים, זמנים ושורת פתיחה של כל שלב. מוצג רק בהדפסה. */
export function SummarySheet({ snap }: { snap: Snap }) {
  const first = (t: string) => t.replace(/[#>*|-]/g, " ").split(/(?<=[.!?:])\s+|\n+/).map((x) => x.trim()).find(Boolean) ?? "";
  return (
    <div className="write-summary" aria-hidden="true">
      <h1>{snap.title || "פעולה ללא שם"}</h1>
      <p>{[snap.meta.leader, snap.meta.date, snap.meta.ageGroup, snap.meta.minutes ? `${snap.meta.minutes} דקות` : ""].filter(Boolean).join(" · ")}</p>
      <table>
        <tbody>
          {snap.blocks.map((b) => (
            <tr key={b.id}>
              <th scope="row">{b.title || KIND_LABEL[b.kind]}</th>
              <td>{b.minutes ? `${b.minutes} דק'` : ""}</td>
              <td>{first(b.text).slice(0, 140)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
