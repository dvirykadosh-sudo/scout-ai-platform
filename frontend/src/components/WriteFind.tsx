"use client";

// שלב 75: חיפוש והחלפה מתקדם, בדיקת סגנון בעברית וסקירת ההערות האישיות.
import { memo, useDeferredValue, useMemo, useState } from "react";
import { findAll, genderMode, replaceAllHits, replaceOneHit, styleCheck, type FindOpts, type Hit, type StyleIssue, type StyleKind } from "@/lib/write75";
import { Field, Modal } from "./ui";
import type { Block } from "./WriteParts";

const FIELD_NAME = { title: "כותרת", text: "טקסט", note: "הערה אישית" } as const;

/* ───────────── חיפוש והחלפה (פריט 11) ───────────── */

interface FindProps {
  blocks: Block[];
  activeId: string | null;
  /** מחיל רשימת שלבים חדשה כצעד ביטול אחד */
  apply: (next: Block[]) => void;
  /** קופץ למופע: פותח את השלב, מדגיש וממקד */
  go: (hit: Hit) => void;
  onClose: () => void;
}

export const FindPanel = memo(function FindPanel({ blocks, activeId, apply, go, onClose }: FindProps) {
  const [q, setQ] = useState("");
  const [r, setR] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [whole, setWhole] = useState(false);
  const [prefixes, setPrefixes] = useState(false);
  const [notes, setNotes] = useState(false);
  const [scope, setScope] = useState<"all" | "block">("all");
  const [cur, setCur] = useState(-1);
  const [msg, setMsg] = useState("");
  const dq = useDeferredValue(q);
  const dBlocks = useDeferredValue(blocks);

  const opts = useMemo<FindOpts>(() => ({ matchCase, whole, prefixes: whole && prefixes, fields: notes ? ["title", "text", "note"] : ["title", "text"], onlyBlock: scope === "block" ? (activeId ?? undefined) : undefined }), [matchCase, whole, prefixes, notes, scope, activeId]);
  const hits = useMemo(() => findAll(dBlocks, dq, opts), [dBlocks, dq, opts]);
  const shown = hits.slice(0, 40);

  const step = (d: 1 | -1) => {
    if (!hits.length) return setMsg("לא נמצא");
    setMsg("");
    const i = cur < 0 ? (d === 1 ? 0 : hits.length - 1) : (cur + d + hits.length) % hits.length;
    setCur(i);
    go(hits[i]);
  };
  const replaceOne = () => {
    const i = cur >= 0 && cur < hits.length ? cur : 0;
    const h = hits[i];
    if (!h) return setMsg("לא נמצא");
    apply(replaceOneHit(blocks, h, r) as Block[]);
    setMsg("הוחלף מופע אחד. אפשר לבטל");
    setCur(Math.max(0, i - 1));
  };
  const replaceAll = () => {
    if (!q) return setMsg("הקלידו מה לחפש");
    const res = replaceAllHits(blocks, q, r, opts);
    if (!res.count) return setMsg("לא נמצא");
    apply(res.blocks as Block[]);
    setMsg(res.count === 1 ? "הוחלף מופע אחד. אפשר לבטל" : `הוחלפו ${res.count} מופעים ב-${res.touched} שלבים. אפשר לבטל בלחיצה אחת`);
    setCur(-1);
  };
  const count = !q ? "הקלידו מה לחפש" : hits.length === 0 ? "לא נמצאו מופעים" : hits.length === 1 ? "נמצא מופע אחד" : `נמצאו ${hits.length} מופעים`;

  return (
    <div className="card glass write-find find75" role="search" aria-label="חיפוש והחלפה במסמך">
      <Field label="חיפוש" htmlFor="w-find">
        <input
          id="w-find"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCur(-1);
            setMsg("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
        />
      </Field>
      <Field label="החלפה ב" htmlFor="w-repl">
        <input id="w-repl" value={r} onChange={(e) => setR(e.target.value)} />
      </Field>
      <fieldset className="find75-opts">
        <legend>אפשרויות</legend>
        <label className="check-inline">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
          התאמת אותיות לטיניות
        </label>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={whole}
            onChange={(e) => {
              setWhole(e.target.checked);
              setCur(-1);
            }}
          />
          מילה שלמה
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={prefixes} disabled={!whole} onChange={(e) => setPrefixes(e.target.checked)} />
          כולל צורות עם ה, ו, ב, ל, כ, מ, ש בהתחלה
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
          לחפש ולהחליף גם בהערות האישיות
        </label>
        <label className="check-inline">
          <span>היקף: </span>
          <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "block")} aria-label="היקף החיפוש">
            <option value="all">כל המסמך</option>
            <option value="block">השלב הנוכחי בלבד</option>
          </select>
        </label>
      </fieldset>
      <div className="actions">
        <button type="button" className="btn btn-small" onClick={() => step(-1)}>
          הקודם
        </button>
        <button type="button" className="btn btn-small" onClick={() => step(1)}>
          הבא
        </button>
        <button type="button" className="btn btn-small" onClick={replaceOne}>
          החלפה
        </button>
        <button type="button" className="btn btn-small" onClick={replaceAll}>
          החלפת הכול
        </button>
        <button type="button" className="btn btn-small" onClick={onClose}>
          סגירת החיפוש
        </button>
      </div>
      <p className="hint" role="status">
        {count}
      </p>
      {msg && (
        <p className="hint" role="status">
          {msg}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="plain-list find75-list" aria-label="המופעים שנמצאו">
          {shown.map((h, i) => (
            <li key={`${h.id}-${h.field}-${h.start}`} className={cur === i ? "is-cur" : ""}>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setCur(i);
                  go(h);
                }}
              >
                <span className="pill">
                  שלב {h.b + 1} · {FIELD_NAME[h.field]}
                </span>{" "}
                <span className="find75-ctx">
                  …{h.before}
                  <mark>{h.hit}</mark>
                  {h.after}…
                </span>
              </button>
            </li>
          ))}
          {hits.length > shown.length && <li className="hint">ועוד {hits.length - shown.length} מופעים. צמצמו את החיפוש או עברו עם ״הבא״.</li>}
        </ul>
      )}
    </div>
  );
});

/* ───────────── בדיקת סגנון בעברית (פריט 8) ───────────── */

const KIND_NAME: Record<StyleKind, string> = { long: "משפטים ארוכים", repeat: "חזרות על אותה מילה", double: "מילה כפולה", opener: "פתיחות חוזרות", gender: "זכר ונקבה בקבוצה מעורבת" };

export function StyleModal({ open, onClose, blocks, ageGroup, onJump }: { open: boolean; onClose: () => void; blocks: Block[]; ageGroup: string; onJump: (i: StyleIssue) => void }) {
  const dBlocks = useDeferredValue(blocks);
  const mode = genderMode(ageGroup);
  const issues = useMemo(() => (open ? styleCheck(dBlocks, { mode }) : []), [open, dBlocks, mode]);
  const [only, setOnly] = useState<StyleKind | "">("");
  const kinds = useMemo(() => {
    const m = new Map<StyleKind, number>();
    for (const i of issues) m.set(i.kind, (m.get(i.kind) ?? 0) + 1);
    return [...m];
  }, [issues]);
  const list = (only ? issues.filter((i) => i.kind === only) : issues).slice(0, 80);
  return (
    <Modal open={open} onClose={onClose} title="בדיקת סגנון בעברית" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">הבדיקה רצה בדפדפן ולא שולחת את הטקסט לשום מקום. היא מציעה ולא מחליטה: אתם קובעים מה לשנות.{mode === "mixed" ? " השכבה שבחרתם מעורבת, ולכן מסומנים גם מקומות שבהם הפנייה רק בלשון זכר או רק בלשון נקבה." : ""}</p>
      {issues.length === 0 ? (
        <p role="status">לא נמצאו הערות סגנון. אפשר להמשיך.</p>
      ) : (
        <>
          <div className="chip-list" role="group" aria-label="סינון לפי סוג">
            <button type="button" className="btn btn-small" aria-pressed={only === ""} onClick={() => setOnly("")}>
              הכול ({issues.length})
            </button>
            {kinds.map(([k, n]) => (
              <button key={k} type="button" className="btn btn-small" aria-pressed={only === k} onClick={() => setOnly(k)}>
                {KIND_NAME[k]} ({n})
              </button>
            ))}
          </div>
          <ul className="plain-list style75-list">
            {list.map((i, n) => (
              <li key={`${i.id}-${i.start}-${n}`}>
                <div>
                  <span className="pill">
                    שלב {i.b + 1} · {KIND_NAME[i.kind]}
                  </span>
                  <p className="style75-text">״{i.text.length > 140 ? `${i.text.slice(0, 140)}…` : i.text}״</p>
                  <p className="hint">
                    {i.message}
                    {i.suggest ? ` הצעה: ${i.suggest}` : ""}
                  </p>
                </div>
                <button type="button" className="btn btn-small" onClick={() => onJump(i)}>
                  קפיצה למקום<span className="sr-only">: שלב {i.b + 1}</span>
                </button>
              </li>
            ))}
          </ul>
          {issues.length > list.length && <p className="hint">מוצגות {list.length} ההערות הראשונות. סננו לפי סוג כדי לראות את השאר.</p>}
        </>
      )}
    </Modal>
  );
}

/* ───────────── הערות אישיות במקום אחד (פריט 12) ───────────── */

export function NotesModal({ open, onClose, blocks, onChange, onJump }: { open: boolean; onClose: () => void; blocks: Block[]; onChange: (id: string, note: string) => void; onJump: (id: string) => void }) {
  const withNotes = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.note.trim());
  return (
    <Modal open={open} onClose={onClose} title="ההערות האישיות שלי" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="warn-box" role="note">
        ההערות האלה פרטיות: הן לא נכנסות להעתקה, להדפסה, לקובץ Word, לקישור השיתוף ולתבנית השבט. מי שמוזמן לערוך איתכם כן רואה אותן.
      </p>
      {withNotes.length === 0 ? (
        <p>עוד אין הערות. בכל שלב יש ״הערה לעצמי״ מתחת לטקסט.</p>
      ) : (
        <ul className="plain-list notes75-list">
          {withNotes.map(({ b, i }) => (
            <li key={b.id}>
              <label htmlFor={`n75-${b.id}`}>
                <strong>
                  שלב {i + 1}: {b.title || "ללא כותרת"}
                </strong>
              </label>
              <textarea id={`n75-${b.id}`} value={b.note} rows={3} maxLength={5500} onChange={(e) => onChange(b.id, e.target.value)} />
              <button type="button" className="btn btn-small" onClick={() => onJump(b.id)}>
                מעבר לשלב<span className="sr-only">: {i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
