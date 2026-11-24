"use client";

// שלב 75: כרטיס של שלב אחד בעורך. הופרד מהעורך הגדול ועטוף ב-React.memo, כך שהקלדה בשלב אחד
// מרנדרת רק אותו ולא את כל 60 השלבים. הפעולות מגיעות באובייקט עם זהות קבועה (useStableApi).
import { memo, useRef, useState } from "react";
import type { LivePerson } from "@/lib/useTeamLive";
import { LIMITS, limitLevel, limitText, matchSlash, slashAt, type SlashCmd, type SlashHit, type SlashId } from "@/lib/write75";
import { BlockPeers } from "./v21/TeamEdit";
import { Field } from "./ui";
import { KINDS, KIND_LABEL, Md, type Block, type Kind } from "./WriteParts";

export interface BlockApi {
  setBlock: (id: string, patch: Partial<Block>, coalesce?: boolean) => void;
  setActive: (idx: number) => void;
  togglePreview: (id: string) => void;
  wrap: (id: string, mark: string, ph: string) => void;
  prefix: (id: string, kind: "h" | "ul" | "ol" | "quote") => void;
  table: (id: string) => void;
  move: (from: number, to: number) => void;
  duplicate: (idx: number) => void;
  split: (idx: number) => void;
  addAfter: (idx: number, kind: Kind) => void;
  remove: (idx: number) => void;
  help: (id: string) => void;
  toggleDict: (id: string) => void;
  slash: (id: string, cmd: SlashId, arg: string, hit: SlashHit) => void;
  openHistory: (id: string) => void;
  grab: (idx: number, e: React.PointerEvent<HTMLElement>) => void;
  keyGrab: (idx: number, e: React.KeyboardEvent<HTMLElement>) => void;
  release: () => void;
}

export interface BlockCardProps {
  b: Block;
  idx: number;
  total: number;
  active: boolean;
  preview: boolean;
  /** סימון ההכנסה בזמן גרירה: קו מעל השלב, או מתחתיו (אחרי האחרון) */
  dropMark: "before" | "after" | null;
  isDragging: boolean;
  held: boolean;
  clock: string | undefined;
  people: LivePerson[];
  me: string;
  /** שם מי שנועל את השלב עכשיו, אם זה לא אני */
  lockedBy: string | null;
  dictOn: boolean;
  dictSupported: boolean;
  atLimit: boolean;
  api: BlockApi;
}

function BlockCardInner({ b, idx, total, active, preview, dropMark, isDragging, held, clock, people, me, lockedBy, dictOn, dictSupported, atLimit, api }: BlockCardProps) {
  const [slash, setSlash] = useState<{ hit: SlashHit; cmds: SlashCmd[]; sel: number } | null>(null);
  const noteRef = useRef<HTMLDetailsElement>(null);
  const locked = !!lockedBy;
  const n = idx + 1;
  const textLevel = limitLevel(b.text.length, LIMITS.blockText);
  const noteLevel = limitLevel(b.note.length, LIMITS.blockNote);

  const refreshSlash = (el: HTMLTextAreaElement) => {
    const hit = slashAt(el.value, el.selectionStart ?? 0);
    if (!hit) return setSlash((s) => (s ? null : s));
    const cmds = matchSlash(hit.query);
    if (!cmds.length) return setSlash((s) => (s ? null : s));
    setSlash((s) => ({ hit, cmds, sel: Math.min(s?.sel ?? 0, cmds.length - 1) }));
  };
  const pick = (cmd: SlashCmd) => {
    if (!slash) return;
    const hit = slash.hit;
    setSlash(null);
    api.slash(b.id, cmd.id, hit.arg, hit);
    if (cmd.id === "note") {
      if (noteRef.current) noteRef.current.open = true;
      window.setTimeout(() => document.getElementById(`wb-note-${b.id}`)?.focus(), 40);
    }
  };
  const onTextKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!slash) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setSlash({ ...slash, sel: (slash.sel + d + slash.cmds.length) % slash.cmds.length });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(slash.cmds[slash.sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSlash(null);
    }
  };

  return (
    <li className={`card glass write-block kind-${b.kind} ${dropMark === "before" ? "is-drop" : ""} ${dropMark === "after" ? "is-drop-end" : ""} ${active ? "is-active" : ""} ${isDragging ? "is-dragging" : ""} ${held ? "is-held" : ""} ${b.unchecked ? "is-unchecked" : ""}`} onFocusCapture={() => api.setActive(idx)}>
      <h2 className="sr-only">
        שלב {n}: {b.title || KIND_LABEL[b.kind]}
      </h2>
      <BlockPeers people={people} me={me} blockId={b.id} />
      <div className="write-head">
        <button
          type="button"
          id={`wb-grab-${b.id}`}
          className="write-handle"
          aria-pressed={held}
          aria-label={`הזזת שלב ${n}`}
          aria-describedby="w-drag-help"
          title="גררו כדי לשנות סדר. במקלדת: רווח להרמה, חצים להזזה, רווח לשחרור"
          onPointerDown={(e) => api.grab(idx, e)}
          onKeyDown={(e) => api.keyGrab(idx, e)}
          onBlur={api.release}
        >
          <span aria-hidden="true">⋮⋮</span>
        </button>
        <span className="write-num" aria-hidden="true">
          {n}
        </span>
        <Field label="סוג" htmlFor={`wb-kind-${b.id}`} className="write-kind">
          <select id={`wb-kind-${b.id}`} value={b.kind} onChange={(e) => api.setBlock(b.id, { kind: e.target.value as Kind })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="כותרת השלב" htmlFor={`wb-title-${b.id}`} className="write-ttl">
          <input id={`wb-title-${b.id}`} value={b.title} maxLength={LIMITS.blockTitle} readOnly={locked} onChange={(e) => api.setBlock(b.id, { title: e.target.value }, true)} />
        </Field>
        <Field label="דקות" htmlFor={`wb-min-${b.id}`} className="write-mins">
          <input id={`wb-min-${b.id}`} type="number" min={0} max={300} dir="ltr" value={b.minutes ?? ""} onChange={(e) => api.setBlock(b.id, { minutes: e.target.value === "" ? null : Math.max(0, Math.min(300, Math.round(Number(e.target.value)))) }, true)} />
        </Field>
      </div>

      <div className="write-tools" role="toolbar" aria-label={`עיצוב טקסט בשלב ${n}`}>
        <button type="button" className="btn btn-small" onClick={() => api.wrap(b.id, "**", "טקסט מודגש")} disabled={preview}>
          <strong>מודגש</strong>
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.wrap(b.id, "*", "טקסט נטוי")} disabled={preview}>
          <em>נטוי</em>
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.prefix(b.id, "h")} disabled={preview}>
          כותרת
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.prefix(b.id, "ul")} disabled={preview}>
          רשימה
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.prefix(b.id, "ol")} disabled={preview}>
          ממוספרת
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.prefix(b.id, "quote")} disabled={preview}>
          ציטוט
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.table(b.id)} disabled={preview}>
          טבלה
        </button>
        <button type="button" className="btn btn-small" aria-pressed={preview} onClick={() => api.togglePreview(b.id)}>
          {preview ? "חזרה לכתיבה" : "תצוגה מקדימה"}
        </button>
      </div>

      {locked && (
        <p className="warn-box write-lock" role="status">
          {lockedBy} מקליד/ה בשלב הזה עכשיו, ולכן הוא נעול לעריכה כמה שניות. הנעילה משתחררת לבד כשהוא/היא מפסיק/ה.
        </p>
      )}

      {preview ? (
        <div className="write-preview" tabIndex={0} role="region" aria-label={`תצוגה מקדימה של שלב ${n}`}>
          <Md text={b.text} />
        </div>
      ) : (
        <div className="write-text-wrap">
          <label htmlFor={`wb-text-${b.id}`} className="sr-only">
            טקסט השלב {n}
          </label>
          <textarea
            id={`wb-text-${b.id}`}
            className="write-text"
            value={b.text}
            readOnly={locked}
            aria-describedby={textLevel !== "ok" ? `wb-count-${b.id}` : undefined}
            placeholder={b.hint || "כתבו כאן. בשורה חדשה אפשר להקליד / ולבחור פקודה (שלב, משחק, סיכום, דקות...)"}
            onChange={(e) => {
              api.setBlock(b.id, { text: e.target.value }, true);
              refreshSlash(e.target);
            }}
            onKeyDown={onTextKey}
            onKeyUp={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") refreshSlash(e.currentTarget);
            }}
            onClick={(e) => refreshSlash(e.currentTarget)}
            onBlur={() => window.setTimeout(() => setSlash((s) => (s ? null : s)), 120)}
            rows={Math.max(5, Math.min(18, b.text.split("\n").length + 2))}
          />
          {slash && (
            <ul className="slash-menu" role="listbox" aria-label="פקודות לשלב" onMouseDown={(e) => e.preventDefault()}>
              {slash.cmds.map((c, i) => (
                <li key={c.id} id={`slash-${b.id}-${c.id}`} role="option" aria-selected={i === slash.sel} className={i === slash.sel ? "is-sel" : ""} onClick={() => pick(c)}>
                  <strong>/{c.label}</strong> <span>{c.hint}</span>
                </li>
              ))}
              <li className="slash-help" aria-hidden="true">
                חצים לבחירה · Enter לאישור · Esc לסגירה
              </li>
            </ul>
          )}
          {slash && (
            <p className="sr-only" role="status">
              {`תפריט פקודות: ${slash.cmds.length} אפשרויות. נבחרה ${slash.cmds[slash.sel].label}: ${slash.cmds[slash.sel].hint}`}
            </p>
          )}
          {textLevel !== "ok" && (
            <p id={`wb-count-${b.id}`} className={`write-count lv-${textLevel}`} role="status">
              {textLevel === "over" ? `השלב ארוך מדי: ${limitText(b.text.length, LIMITS.blockText)}. קצרו או פצלו אותו לשניים כדי שיישמר` : `מתקרבים לגבול: ${limitText(b.text.length, LIMITS.blockText)}`}
            </p>
          )}
        </div>
      )}

      <details className="write-note" ref={noteRef}>
        <summary>הערה לעצמי{b.note.trim() ? " (יש הערה)" : ""}</summary>
        <label htmlFor={`wb-note-${b.id}`} className="sr-only">
          הערה אישית לשלב {n}
        </label>
        <textarea id={`wb-note-${b.id}`} className="write-note-text" value={b.note} maxLength={LIMITS.blockNote + 500} onChange={(e) => api.setBlock(b.id, { note: e.target.value }, true)} placeholder="רעיונות, תזכורות, ציוד. ההערה לא נכנסת להעתקה, לייצוא, להדפסה או לקישור השיתוף" rows={3} />
        {noteLevel !== "ok" && (
          <p className={`write-count lv-${noteLevel}`} role="status">
            {limitText(b.note.length, LIMITS.blockNote)}
            {noteLevel === "over" ? ". ההערה ארוכה מדי ולכן השלב לא יישמר עד שתקצרו אותה" : ""}
          </p>
        )}
      </details>

      {clock && <p className="hint write-clock">מתחיל בשעה {clock}</p>}
      <div className="actions write-foot">
        <button type="button" className="btn btn-small btn-primary" onClick={() => api.help(b.id)}>
          עזרה במתודות<span className="sr-only">: שלב {n}</span>
        </button>
        <button type="button" id={`wb-up-${b.id}`} className="btn btn-small" onClick={() => api.move(idx, idx - 1)} disabled={idx === 0}>
          הזזה למעלה<span className="sr-only">: שלב {n}</span>
        </button>
        <button type="button" id={`wb-down-${b.id}`} className="btn btn-small" onClick={() => api.move(idx, idx + 1)} disabled={idx === total - 1}>
          הזזה למטה<span className="sr-only">: שלב {n}</span>
        </button>
        {dictSupported && (
          <button type="button" className="btn btn-small" aria-pressed={dictOn} onClick={() => api.toggleDict(b.id)}>
            {dictOn ? "עצירת הכתבה" : "הכתבה בקול"}
            <span className="sr-only">: שלב {n}</span>
          </button>
        )}
        <label className="check-inline">
          <input type="checkbox" checked={!!b.done} onChange={(e) => api.setBlock(b.id, { done: e.target.checked })} />
          השלב מוכן<span className="sr-only">: שלב {n}</span>
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={!!b.unchecked} onChange={(e) => api.setBlock(b.id, { unchecked: e.target.checked || undefined })} />
          טרם נבדק<span className="sr-only">: שלב {n}</span>
        </label>
        <button type="button" className="btn btn-small" onClick={() => api.duplicate(idx)} disabled={atLimit} title={atLimit ? `יש כבר ${LIMITS.blocks} שלבים, זה המקסימום` : undefined}>
          שכפול השלב<span className="sr-only">: שלב {n}</span>
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.split(idx)} disabled={atLimit} title={atLimit ? `יש כבר ${LIMITS.blocks} שלבים, זה המקסימום` : undefined}>
          פיצול במיקום הסמן<span className="sr-only">: שלב {n}</span>
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.addAfter(idx, "free")} disabled={atLimit} title={atLimit ? `יש כבר ${LIMITS.blocks} שלבים, זה המקסימום` : undefined}>
          שלב חדש מתחת<span className="sr-only">: שלב {n}</span>
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.openHistory(b.id)}>
          היסטוריית השלב<span className="sr-only">: שלב {n}</span>
        </button>
        <button type="button" className="btn btn-small" onClick={() => api.remove(idx)}>
          מחיקת השלב<span className="sr-only">: שלב {n}</span>
        </button>
      </div>
    </li>
  );
}

export const BlockCard = memo(BlockCardInner);
