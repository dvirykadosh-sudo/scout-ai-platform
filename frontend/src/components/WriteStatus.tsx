"use client";

// שלב 75: פס המצב של העורך (שמירה, התקדמות, מילים וזמן). ממוזער ומקבל את השלבים בגרסה המושהית, כדי שהקלדה לא תחכה לו.
import { memo } from "react";
import { EditorProgress } from "./Polish";
import { TimeMeter } from "./WriteFocus";
import { readAloud, type Block } from "./WriteParts";

export const StatusBar = memo(function StatusBar({ status, statusText, blocks, total, done, target, words, endClock, onSetTarget }: { status: string; statusText: string; blocks: Block[]; total: number; done: number; target: number | null; words: number; endClock: string; onSetTarget: (m: number) => void }) {
  const diff = target ? total - target : 0;
  return (
    <div className="write-bar card glass" role="region" aria-label="מצב המסמך">
      <p className={`write-status st-${status}`} role="status" aria-live="polite">
        {statusText}
      </p>
      <EditorProgress total={total} target={target ?? undefined} blocks={blocks} />
      <p className="hint" role="status">
        {words} מילים · זמן הקראה בערך {readAloud(words)} ·{" "}
        {target ? (
          diff === 0 ? (
            <span>השלבים מסתכמים ב-{total} דקות, כמו המשך המתוכנן</span>
          ) : diff > 0 ? (
            <strong>השלבים מסתכמים ב-{total} דקות, חורגים ב-{diff} דקות מהמשך המתוכנן</strong>
          ) : (
            <span>
              השלבים מסתכמים ב-{total} דקות, נשארו {-diff} דקות לתכנון
            </span>
          )
        ) : (
          <span>השלבים מסתכמים ב-{total} דקות</span>
        )}{" "}
        · {done} מתוך {blocks.length} שלבים מסומנים כמוכנים{endClock ? ` · הפעולה מסתיימת בערך בשעה ${endClock}` : ""}
      </p>
      <TimeMeter blocks={blocks} planned={target} />
      {target !== total && total > 0 && (
        <button type="button" className="btn btn-small" onClick={() => onSetTarget(total)}>
          לקבוע את המשך המתוכנן ל-{total} דקות
        </button>
      )}
    </div>
  );
});
