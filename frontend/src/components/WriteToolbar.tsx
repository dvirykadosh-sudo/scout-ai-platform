"use client";

// שלב 75: סרגל הכלים של העורך. כל לחצן שולח פקודה (מחרוזת) לפונקציה אחת, והרכיב ממוזער:
// הוא מרונדר מחדש רק כשאחד המצבים הקטנים שלו משתנה, ולא בכל הקלדה.
import { memo } from "react";
import { PRESETS } from "./WriteMore4";
import { TourButton } from "./WriteFinal";

export interface ToolbarProps {
  on: (cmd: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  findOpen: boolean;
  gapsOn: boolean;
  hasCur: boolean;
  hasBlocks: boolean;
  runs: number;
  comCount: number;
  isAdmin: boolean;
}

function TB({ on, cmd, children, disabled, primary, pressed, expanded }: { on: (cmd: string) => void; cmd: string; children: React.ReactNode; disabled?: boolean; primary?: boolean; pressed?: boolean; expanded?: boolean }) {
  return (
    <button type="button" className={`btn btn-small${primary ? " btn-primary" : ""}`} onClick={() => on(cmd)} disabled={disabled} aria-pressed={pressed} aria-expanded={expanded}>
      {children}
    </button>
  );
}

export const WriteToolbar = memo(function WriteToolbar({ on, canUndo, canRedo, findOpen, gapsOn, hasCur, hasBlocks, runs, comCount, isAdmin }: ToolbarProps) {
  return (
    <div className="write-actions-card card glass" role="region" aria-label="סרגל כלים ומצב המסמך">
      <div className="actions">
        <TB on={on} cmd="undo" disabled={!canUndo}>
          ביטול
        </TB>
        <TB on={on} cmd="redo" disabled={!canRedo}>
          שחזור
        </TB>
        <TB on={on} cmd="find" expanded={findOpen}>
          חיפוש והחלפה
        </TB>
        <TB on={on} cmd="focus" disabled={!hasCur}>
          מסך מלא לשלב הנוכחי
        </TB>
        <TB on={on} cmd="versions">גרסאות</TB>
        <TB on={on} cmd="searchMethod" disabled={!hasCur}>
          חיפוש מתודה
        </TB>
        <TB on={on} cmd="prefs">המתודות שלי</TB>
        <TB on={on} cmd="gaps" pressed={gapsOn}>
          {gapsOn ? "הסתרת מה חסר" : "הצגת מה חסר"}
        </TB>
        <TB on={on} cmd="copy">העתקה כטקסט</TB>
        <TB on={on} cmd="importText">הדבקת טקסט לשלבים</TB>
        <TB on={on} cmd="prep">דף הכנה</TB>
        <TB on={on} cmd="log">יומן הרצות ({runs})</TB>
        <TB on={on} cmd="questions" disabled={!hasCur}>
          שאלות לדיון
        </TB>
        <TB on={on} cmd="stages">שלבים ממסמך אחר</TB>
        <TB on={on} cmd="stations" disabled={!hasCur}>
          חישוב תחנות
        </TB>
        <TB on={on} cmd="backup">תוכנית גיבוי</TB>
        <TB on={on} cmd="ready">מוכנות להעברה</TB>
        <TB on={on} cmd="tribe" disabled={!hasCur}>
          מתודות השבט
        </TB>
        <TB on={on} cmd="more">כלים נוספים</TB>
        <TourButton kind="write" />
        <TB on={on} cmd="printSummary">דף מדריך להדפסה</TB>
        <TB on={on} cmd="keys">קיצורי מקלדת</TB>
        <TB on={on} cmd="searchAll">חיפוש בכל המסמכים</TB>
        <TB on={on} cmd="groups">חלוקה לקבוצות</TB>
        <TB on={on} cmd="parents">הודעה להורים</TB>
        <TB on={on} cmd="ics">קובץ יומן (ICS)</TB>
        <label className="write-preset">
          <span className="sr-only">הוספת שלב מוכן</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) on(`preset:${e.target.value}`);
            }}
          >
            <option value="">הוספת שלב מוכן…</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <TB on={on} cmd="comments">הערות מבקרים{comCount ? ` (${comCount})` : ""}</TB>
        {isAdmin && <TB on={on} cmd="publishTribe">פרסום כתבנית שבט</TB>}
        <TB on={on} cmd="autoMinutes">חלוקת זמן אוטומטית</TB>
        <TB on={on} cmd="readability">קריאוּת והצעות לשם</TB>
        <TB on={on} cmd="style">בדיקת סגנון בעברית</TB>
        <TB on={on} cmd="readMe" disabled={!hasBlocks}>
          הקרא לי
        </TB>
        <TB on={on} cmd="notes">ההערות האישיות שלי</TB>
        <TB on={on} cmd="tray">נמחקו לאחרונה</TB>
        <TB on={on} cmd="printA4">תצוגת הדפסה A4</TB>
        <TB on={on} cmd="snippets" disabled={!hasCur}>
          קטעים שמורים
        </TB>
        <TB on={on} cmd="run" disabled={!hasBlocks}>
          מצב הרצה
        </TB>
        <TB on={on} cmd="printCards">כרטיסי הדפסה לשלבים</TB>
        <TB on={on} cmd="share">שיתוף בקישור</TB>
        <TB on={on} cmd="export" primary>
          ייצוא ושיתוף
        </TB>
        <TB on={on} cmd="assistant" primary>
          בדיקה בעוזר הכתיבה
        </TB>
      </div>
    </div>
  );
});
