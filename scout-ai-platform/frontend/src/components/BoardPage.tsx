"use client";

// 76: לוח תכנון פעולות לפי שכבות ושבועות.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { GRADES } from "@/lib/constants";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

interface Cell {
  grade: string;
  week: string;
  title: string;
  value: string;
  status: string;
  note: string;
  draftId: number | null;
  activityId: number | null;
}
interface Board {
  from: string;
  weeks: string[];
  cells: Cell[];
  warnings: string[];
}
const STATUS: Record<string, string> = { planned: "מתוכננת", writing: "בכתיבה", ready: "מוכנה", done: "הופעלה" };
const MARK: Record<string, string> = { planned: "○", writing: "✎", ready: "✓", done: "★" };

const shiftWeeks = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const short = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

export function BoardPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const [from, setFrom] = useState<string | undefined>();
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<{ grade: string; week: string; cell: Cell | null } | null>(null);
  const [f, setF] = useState({ title: "", value: "", status: "planned", note: "" });

  const load = useCallback(() => {
    if (!token) return;
    api<Board>(`/api/assist/board?weeks=8${from ? `&from=${from}` : ""}`, { token })
      .then(setBoard)
      .catch((e) => setErr(errorMessage(e)));
  }, [token, from]);
  useEffect(load, [load]);

  const open = (grade: string, week: string) => {
    const cell = board?.cells.find((c) => c.grade === grade && c.week === week) ?? null;
    setF({ title: cell?.title ?? "", value: cell?.value ?? "", status: cell?.status ?? "planned", note: cell?.note ?? "" });
    setEdit({ grade, week, cell });
  };
  const save = async () => {
    if (!edit) return;
    try {
      await api("/api/assist/board/cell", { method: "PUT", token, body: { grade: edit.grade, week: edit.week, ...f, draftId: edit.cell?.draftId ?? null, activityId: edit.cell?.activityId ?? null } });
      setEdit(null);
      load();
      toast("נשמר בלוח", { kind: "success" });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const remove = async () => {
    if (!edit) return;
    try {
      await api(`/api/assist/board/cell?grade=${encodeURIComponent(edit.grade)}&week=${edit.week}`, { method: "DELETE", token });
      setEdit(null);
      load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <div className="page">
      <h1>לוח תכנון שנתי</h1>
      <p className="hint">שכבות בשורות, שבועות בעמודות. לחצו על תא כדי לתכנן פעולה, לשנות מצב או למחוק. <Link href="/assistant">חזרה לעוזר הכתיבה</Link></p>
      {!user && (
        <p className="warn-box">
          צריך להתחבר כדי להשתמש בלוח. <Link href="/account">להתחברות</Link>
        </p>
      )}
      {err && <p className="error-text" role="alert">{err}</p>}
      {board && (
        <>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setFrom(shiftWeeks(board.from, -8))}>8 שבועות אחורה</button>
            <button type="button" className="btn" onClick={() => setFrom(undefined)}>השבוע</button>
            <button type="button" className="btn" onClick={() => setFrom(shiftWeeks(board.from, 8))}>8 שבועות קדימה</button>
          </div>
          {board.warnings.length > 0 && (
            <ul className="warn-box" aria-label="אזהרות תכנון">
              {board.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="assist-board-wrap" tabIndex={0} role="region" aria-label="לוח התכנון">
            <table className="assist-board">
              <caption className="sr-only">פעולות מתוכננות לפי שכבה ושבוע</caption>
              <thead>
                <tr>
                  <th scope="col">שכבה</th>
                  {board.weeks.map((w) => (
                    <th key={w} scope="col">שבוע {short(w)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GRADES.map((g) => (
                  <tr key={g}>
                    <th scope="row">{g}</th>
                    {board.weeks.map((w) => {
                      const c = board.cells.find((x) => x.grade === g && x.week === w);
                      return (
                        <td key={w}>
                          <button type="button" className={c ? `assist-cell st-${c.status}` : "assist-cell"} onClick={() => open(g, w)}>
                            {c ? (
                              <>
                                <span aria-hidden="true">{MARK[c.status]} </span>
                                {c.title}
                                <span className="sr-only"> ({STATUS[c.status]}), שכבה {g}, שבוע {short(w)}</span>
                              </>
                            ) : (
                              <>
                                <span aria-hidden="true">+</span>
                                <span className="sr-only">הוספה: שכבה {g}, שבוע {short(w)}</span>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">מצבים: ○ מתוכננת · ✎ בכתיבה · ✓ מוכנה · ★ הופעלה</p>
        </>
      )}
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={`שכבה ${edit.grade}, שבוע ${short(edit.week)}`}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setEdit(null)}>ביטול</button>
              {edit.cell && (
                <button type="button" className="btn" onClick={remove}>מחיקה מהלוח</button>
              )}
              <button type="button" className="btn btn-primary" onClick={save} disabled={f.title.trim().length < 2}>שמירה</button>
            </>
          }
        >
          <Field label="שם הפעולה" htmlFor="bc-title">
            <input id="bc-title" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="ערך" htmlFor="bc-value">
            <input id="bc-value" value={f.value} maxLength={160} onChange={(e) => setF({ ...f, value: e.target.value })} />
          </Field>
          <Field label="מצב" htmlFor="bc-status">
            <select id="bc-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="הערה" htmlFor="bc-note">
            <input id="bc-note" value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
          {edit.cell?.draftId && <p className="hint"><Link href={`/assistant?draft=${edit.cell.draftId}`}>פתיחת הטיוטה בעוזר</Link></p>}
        </Modal>
      )}
    </div>
  );
}
