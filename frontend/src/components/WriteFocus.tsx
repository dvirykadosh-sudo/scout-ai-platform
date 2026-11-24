"use client";

// שלב 75: מצב מיקוד במסך מלא ומד הזמן החי.
import { memo, useEffect, useRef, useState } from "react";
import { timeMeter, type MeterLevel } from "@/lib/write75";
import { KIND_LABEL, type Block } from "./WriteParts";

const LEVEL_TEXT: Record<MeterLevel, string> = { empty: "טרם חולקו דקות", ok: "בתוך התכנון", near: "קרוב לתכנון", over: "חריגה מהתכנון", under: "חסר זמן בתכנון" };

/** מד זמן: סכום דקות השלבים מול המתוכנן, בצבע שאינו התלות היחידה (יש גם תווית). */
export const TimeMeter = memo(function TimeMeter({ blocks, planned, compact = false }: { blocks: Block[]; planned: number | null; compact?: boolean }) {
  const m = timeMeter(blocks, planned);
  return (
    <div className={`tmeter tm-${m.level}${compact ? " is-compact" : ""}`}>
      {!compact && (
        <div className="tmeter-bar" aria-hidden="true">
          {blocks.map((b) => (
            <span key={b.id} className={`kind-${b.kind}`} style={{ flexGrow: b.minutes ?? 0 }} title={`${b.title || KIND_LABEL[b.kind]}: ${b.minutes ?? 0} דק'`} />
          ))}
        </div>
      )}
      <p className="tmeter-label" role="status">
        <span className="tmeter-badge">{LEVEL_TEXT[m.level]}</span> {m.label}
        {m.missing > 0 ? ` · ב-${m.missing} שלבים עם טקסט לא הוגדר זמן` : ""}
      </p>
    </div>
  );
});

interface FocusProps {
  block: Block;
  index: number;
  total: number;
  blocks: Block[];
  planned: number | null;
  statusText: string;
  words: number;
  canUndo: boolean;
  locked: boolean;
  onChange: (patch: Partial<Block>, coalesce: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onUndo: () => void;
  onHelp: () => void;
  onExit: () => void;
}

/**
 * מסך מלא לשלב אחד, בלי תפריטים. הסרגל נעמם כשמקלידים וחוזר בתנועת עכבר או מיקוד.
 * השכבה עצמה מכסה את כל החלון בלי תפריטים. מסך מלא אמיתי של הדפדפן הוא כפתור אופציונלי (בלי הודעת "ESC ליציאה" בכל כניסה, ובלי להשתלט על הדפדפן בלי שביקשו).
 * Esc יוצא. Alt+PageUp/PageDown עוברים בין שלבים, Ctrl+Z מבטל בשלב.
 */
export function FocusMode({ block, index, total, blocks, planned, statusText, words, canUndo, locked, onChange, onPrev, onNext, onUndo, onHelp, onExit }: FocusProps) {
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [quiet, setQuiet] = useState(false);
  const [bfs, setBfs] = useState(false);
  const canFs = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
  const quietT = useRef<number | undefined>(undefined);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    const fs = () => setBfs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fs);
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) exitRef.current();
    };
    window.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("fullscreenchange", fs);
      window.removeEventListener("keydown", k);
      window.clearTimeout(quietT.current);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  // בכל מעבר שלב המיקוד חוזר לתיבת הטקסט
  useEffect(() => {
    area.current?.focus();
  }, [block.id]);

  const toggleFs = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void root.current?.requestFullscreen?.().catch(() => {});
    } catch {
      /* לא נתמך: השכבה ממילא מכסה את כל החלון */
    }
  };
  const wake = () => {
    setQuiet(false);
    window.clearTimeout(quietT.current);
  };
  return (
    <div ref={root} className="assist-focus focus75 no-print" role="dialog" aria-modal="true" aria-label="מצב כתיבה במסך מלא" onMouseMove={wake}>
      <div className={`assist-focus-bar${quiet ? " is-quiet" : ""}`} onFocus={wake}>
        <label htmlFor="wf-title">כותרת השלב</label>
        <input id="wf-title" style={{ width: "16rem" }} value={block.title} readOnly={locked} onChange={(e) => onChange({ title: e.target.value }, true)} />
        <span>
          שלב {index + 1} מתוך {total}
        </span>
        <button type="button" className="btn btn-small" onClick={onPrev} disabled={index <= 0}>
          השלב הקודם
        </button>
        <button type="button" className="btn btn-small" onClick={onNext} disabled={index >= total - 1}>
          השלב הבא
        </button>
        <button type="button" className="btn btn-small" onClick={onUndo} disabled={!canUndo}>
          ביטול
        </button>
        <button type="button" className="btn btn-small" onClick={onHelp}>
          קיצורים (Ctrl+/)
        </button>
        {canFs && (
          <button type="button" className="btn btn-small" aria-pressed={bfs} onClick={toggleFs}>
            מסך מלא בדפדפן
          </button>
        )}
        <span className="hint" role="status">
          {statusText}
        </span>
        <button type="button" className="btn btn-small btn-primary" onClick={onExit}>
          יציאה (Esc)
        </button>
      </div>
      <div className={`focus75-meter${quiet ? " is-quiet" : ""}`}>
        <TimeMeter blocks={blocks} planned={planned} compact />
        <span className="hint">{words} מילים במסמך</span>
      </div>
      <label htmlFor="wf-text" className="sr-only">
        טקסט השלב
      </label>
      <textarea
        id="wf-text"
        ref={area}
        className="assist-focus-text"
        value={block.text}
        readOnly={locked}
        onChange={(e) => onChange({ text: e.target.value }, true)}
        onKeyDown={() => {
          window.clearTimeout(quietT.current);
          quietT.current = window.setTimeout(() => setQuiet(true), 2500);
        }}
      />
      {locked && (
        <p className="warn-box" role="status">
          השלב נעול כרגע כי מדריך אחר מקליד בו.
        </p>
      )}
    </div>
  );
}
