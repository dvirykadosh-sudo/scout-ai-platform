"use client";

// שלב 75: השוואת גרסאות זה לצד זה, היסטוריית שלב בודד ושלבים שנמחקו לאחרונה.
import { useMemo, useState } from "react";
import { compareDocs, type CmpRow, type HistEntry, type Part, type RowStatus, type Trashed, type W75Snap } from "@/lib/write75";
import { Modal } from "./ui";
import { KIND_LABEL, type Block, type Kind, type Snap } from "./WriteParts";

const STATUS: Record<RowStatus, string> = { same: "ללא שינוי", changed: "השתנה", added: "נוסף", removed: "הוסר", moved: "הוזז" };
const asW = (s: Snap) => s as unknown as W75Snap;
const time = (at: number) => new Date(at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const day = (at: number) => new Date(at).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
const kindName = (k: string) => KIND_LABEL[k as Kind] ?? k;

function Parts({ parts, side }: { parts: Part[]; side: "left" | "right" }) {
  if (!parts.length) return <span className="hint">(ריק)</span>;
  return (
    <>
      {parts.map((p, i) => (p.k === "same" ? <span key={i}>{p.t}</span> : p.k === "add" ? <ins key={i}>{p.t}</ins> : <del key={i}>{p.t}</del>))}
      <span className="sr-only">{side === "left" ? " סוף הצד הישן" : " סוף הצד החדש"}</span>
    </>
  );
}

function Row({ row, leftLabel, rightLabel, onRestore }: { row: CmpRow; leftLabel: string; rightLabel: string; onRestore?: (id: string, text: string) => void }) {
  const title = (row.right ?? row.left)?.title || kindName((row.right ?? row.left)?.kind ?? "free");
  return (
    <li className={`cmp-row st-${row.status}`}>
      <div className="cmp-head">
        <strong>{title}</strong> <span className={`pill cmp-pill st-${row.status}`}>{STATUS[row.status]}</span>
        {row.fields.length > 0 && row.status === "changed" && <span className="hint"> · השתנו: {row.fields.join(", ")}</span>}
      </div>
      {row.status !== "same" && row.status !== "moved" && (
        <div className="cmp-grid">
          <div className="cmp-col" role="group" aria-label={leftLabel}>
            <h4>{leftLabel}</h4>
            <div className="cmp-text" dir="auto" tabIndex={0}>
              <Parts parts={row.leftParts} side="left" />
            </div>
          </div>
          <div className="cmp-col" role="group" aria-label={rightLabel}>
            <h4>{rightLabel}</h4>
            <div className="cmp-text" dir="auto" tabIndex={0}>
              <Parts parts={row.rightParts} side="right" />
            </div>
          </div>
        </div>
      )}
      {onRestore && row.left && (row.status === "changed" || row.status === "removed") && row.left.text !== (row.right?.text ?? "") && row.right && (
        <button type="button" className="btn btn-small" onClick={() => onRestore(row.right!.id, row.left!.text)}>
          החזרת הטקסט של ״{leftLabel}״ לשלב הזה<span className="sr-only">: {title}</span>
        </button>
      )}
    </li>
  );
}

/** שני נוסחים זה לצד זה: מילים שנמחקו באדום עם קו, מילים שנוספו בירוק. בצד ימין הישן, בצד שמאל החדש. */
export function SideBySideModal({ open, onClose, left, right, leftLabel, rightLabel, onRestore }: { open: boolean; onClose: () => void; left: Snap | null; right: Snap | null; leftLabel: string; rightLabel: string; onRestore?: (id: string, text: string) => void }) {
  const [onlyChanged, setOnlyChanged] = useState(true);
  const cmp = useMemo(() => (open && left && right ? compareDocs(asW(left), asW(right)) : null), [open, left, right]);
  const rows = cmp ? (onlyChanged ? cmp.rows.filter((r) => r.status !== "same") : cmp.rows) : [];
  return (
    <Modal open={open} onClose={onClose} title="השוואה זה לצד זה" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {!cmp ? (
        <p>אין מה להשוות.</p>
      ) : (
        <>
          <p className="hint" role="status">
            {leftLabel} מול {rightLabel}: {cmp.counts.changed} שלבים השתנו, {cmp.counts.added} נוספו, {cmp.counts.removed} הוסרו, {cmp.counts.moved} הוזזו{cmp.titleChanged ? ". גם שם המסמך השתנה" : ""}. ירוק: מילה שנוספה. אדום עם קו: מילה שנמחקה.
          </p>
          <label className="check-inline">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
            להציג רק שלבים שהשתנו
          </label>
          {rows.length === 0 ? (
            <p role="status">אין הבדלים בין שני הנוסחים.</p>
          ) : (
            <ul className="plain-list cmp-list">
              {rows.map((r) => (
                <Row key={r.key} row={r} leftLabel={leftLabel} rightLabel={rightLabel} onRestore={onRestore} />
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

/** מצבים קודמים של שלב אחד, מהמקומי במכשיר. כל שחזור נשמר בעצמו, ולכן אפשר לבטל גם אותו. */
export function BlockHistoryModal({ open, onClose, block, index, list, onRestore }: { open: boolean; onClose: () => void; block: Block | null; index: number; list: HistEntry[]; onRestore: (i: number) => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`היסטוריית שלב ${index + 1}${block?.title ? `: ${block.title}` : ""}`} wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">ההיסטוריה נשמרת במכשיר הזה בלבד, עד 40 מצבים לשלב. היא נפרדת מ״גרסאות״ השרת ומהביטול של כל המסמך.</p>
      {list.length === 0 ? (
        <p role="status">עוד אין מצבים קודמים לשלב הזה. הם נרשמים תוך כדי כתיבה.</p>
      ) : (
        <ul className="plain-list hist75-list">
          {list.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <div>
                <strong>
                  {day(e.at)} {time(e.at)}
                </strong>{" "}
                <span className="hint">
                  · {e.text.trim().split(/\s+/).filter(Boolean).length} מילים{e.title !== block?.title ? ` · כותרת: ${e.title || "ריקה"}` : ""}
                </span>
                <p className="hist75-text">{e.text.trim().slice(0, 160) || "(טקסט ריק)"}{e.text.length > 160 ? "…" : ""}</p>
              </div>
              <button type="button" className="btn btn-small" onClick={() => onRestore(i)}>
                שחזור המצב הזה<span className="sr-only">: {time(e.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** שלבים שנמחקו בשבוע האחרון (במכשיר הזה), לשחזור למקומם */
export function TrayModal({ open, onClose, tray, onRestore }: { open: boolean; onClose: () => void; tray: Trashed[]; onRestore: (id: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="שלבים שנמחקו לאחרונה" footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">שלב שמחקתם נשמר כאן 7 ימים, עד 20 שלבים, במכשיר הזה. שחזור מחזיר אותו למקומו. מסמכים שלמים שנמחקו נשמרים 30 יום ב״סל מחזור״ ברשימת המסמכים.</p>
      {tray.length === 0 ? (
        <p role="status">אין שלבים שנמחקו.</p>
      ) : (
        <ul className="plain-list tray75-list">
          {tray.map((t) => (
            <li key={t.block.id}>
              <div>
                <strong>{t.block.title || kindName(t.block.kind)}</strong>
                <span className="hint">
                  {" "}
                  · נמחק {day(t.at)} {time(t.at)} · היה שלב {t.index + 1}
                </span>
                <p className="hist75-text">{t.block.text.trim().slice(0, 140) || "(בלי טקסט)"}</p>
              </div>
              <button type="button" className="btn btn-small" onClick={() => onRestore(t.block.id)}>
                שחזור<span className="sr-only">: {t.block.title || "שלב"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
