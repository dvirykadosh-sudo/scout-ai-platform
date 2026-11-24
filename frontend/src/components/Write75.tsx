"use client";

// שלב 75: חלונות והודעות קטנים של העורך: קיצורי מקלדת, אזהרת ״טרם נבדק״, יציאה עם שינויים, תצוגת הדפסה A4, שחזור ומגבלות.
import { useMemo } from "react";
import { SHORTCUTS75, SLASH_COMMANDS, exportWarning, paginate, uncheckedOf, type LimitProblem, type ShortcutDef, type W75Block } from "@/lib/write75";
import { Modal } from "./ui";
import type { Recover, SyncStatus } from "./WriteSync";
import { PrintSheet } from "./WriteExtras";
import type { Block, Snap } from "./WriteParts";

/* ───────────── קיצורי מקלדת (פריט 4) ───────────── */

export function ShortcutsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = useMemo(() => {
    const g = new Map<string, ShortcutDef[]>();
    for (const s of SHORTCUTS75) g.set(s.group, [...(g.get(s.group) ?? []), s]);
    return [...g];
  }, []);
  return (
    <Modal open={open} onClose={onClose} title="קיצורי מקלדת בעורך" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <div tabIndex={0} role="region" aria-label="רשימת הקיצורים">
      <p className="hint">הקיצורים פועלים גם כשהמקלדת בעברית, כי הם לפי המקש עצמו ולא לפי האות שהוא מקליד. ב-Mac במקום Ctrl לוחצים Cmd.</p>
      {groups.map(([name, list]) => (
        <section key={name} aria-label={name}>
          <h3 className="subtitle">{name}</h3>
          <dl className="write-keys">
            {list.map((s) => (
              <div key={s.keys}>
                <dt dir="ltr">{s.keys}</dt>
                <dd>{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section aria-label="פקודות בתוך הטקסט">
        <h3 className="subtitle">פקודות בתוך הטקסט</h3>
        <p className="hint">בשורה חדשה בתוך שלב מקלידים / ומתחילים לכתוב את שם הפקודה. חצים לבחירה, Enter לאישור, Esc לסגירה.</p>
        <dl className="write-keys">
          {SLASH_COMMANDS.map((c) => (
            <div key={c.id}>
              <dt>/{c.label}</dt>
              <dd>{c.hint}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="שינוי סדר בלי עכבר">
        <h3 className="subtitle">שינוי סדר בלי עכבר</h3>
        <p className="hint">מתמקדים בידית ⋮⋮ של השלב, רווח להרמה, חץ למעלה או למטה להזזה (Home ו-End לקצוות), רווח להנחה, Escape לביטול. קורא המסך מקריא כל הזזה.</p>
      </section>
      </div>
    </Modal>
  );
}

/* ───────────── ״טרם נבדק״ לפני ייצוא (פריט 14) ───────────── */

export function UncheckedGate({ open, blocks, onClose, onContinue, onJump }: { open: boolean; blocks: Block[]; onClose: () => void; onContinue: () => void; onJump: (id: string) => void }) {
  const warn = exportWarning(blocks as W75Block[]);
  const list = uncheckedOf(blocks as W75Block[]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="יש שלבים שטרם נבדקו"
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            חזרה לעריכה
          </button>
          <button type="button" className="btn" onClick={onContinue}>
            להמשיך בכל זאת
          </button>
        </>
      }
    >
      <p role="status">{warn}</p>
      <ul className="plain-list">
        {list.map(({ b, i }) => (
          <li key={b.id}>
            <span>
              שלב {i + 1}: {b.title || "ללא כותרת"}
            </span>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                onClose();
                onJump(b.id);
              }}
            >
              מעבר לשלב<span className="sr-only">: {i + 1}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ───────────── יציאה עם שינויים שלא נשמרו (פריט 17) ───────────── */

export function LeaveModal({ open, status, onSave, onLeave, onStay }: { open: boolean; status: SyncStatus; onSave: () => void; onLeave: () => void; onStay: () => void }) {
  const reach = status === "dirty" || status === "saving";
  return (
    <Modal
      open={open}
      onClose={onStay}
      title="יש שינויים שעדיין לא נשמרו בשרת"
      footer={
        <>
          {reach && (
            <button type="button" className="btn btn-primary" onClick={onSave}>
              שמירה ויציאה
            </button>
          )}
          <button type="button" className="btn" onClick={onStay}>
            להישאר בעורך
          </button>
          <button type="button" className="btn" onClick={onLeave}>
            יציאה בלי לחכות
          </button>
        </>
      }
    >
      <p>{reach ? "השינויים האחרונים עדיין בדרך לשרת." : status === "offline" ? "אין חיבור לשרת כרגע." : status === "limits" ? "המסמך חורג ממגבלות ולכן לא נשמר בשרת." : status === "conflict" ? "המסמך עודכן במקום אחר ולכן לא נשמר." : "השמירה בשרת נכשלה."}</p>
      <p className="hint">בכל מקרה הנוסח שלכם נשמר במכשיר הזה, וכשתחזרו למסמך נציע לשחזר אותו.</p>
    </Modal>
  );
}

/* ───────────── תצוגת הדפסה A4 (פריט 16) ───────────── */

export function PrintPreviewModal({ open, onClose, snap, onPrint }: { open: boolean; onClose: () => void; snap: Snap; onPrint: () => void }) {
  const est = useMemo(() => (open ? paginate(snap.blocks) : null), [open, snap.blocks]);
  const breaks = est ? est.blocks.map((b, i) => ({ ...b, i })).filter((b) => b.newPage) : [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="תצוגת הדפסה A4"
      wide
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={onPrint}>
            הדפסה או שמירה כ-PDF
          </button>
          <button type="button" className="btn" onClick={onClose}>
            סגירה
          </button>
        </>
      }
    >
      {est && (
        <>
          <p className="hint" role="status">
            דף A4 עם שוליים של 14 מ״מ, גופן 11. הערכה: כ-{est.pages} {est.pages === 1 ? "עמוד" : "עמודים"}. הקו האדום המקווקו בתצוגה מסמן בערך סוף עמוד. ההערות האישיות לא נכנסות להדפסה.
          </p>
          <p className="hint">עימוד חכם: שלב קצר לא נחתך באמצע עמוד אלא עובר שלם לעמוד הבא, כותרת לא נשארת לבדה בסוף עמוד, ושורה אחת לא נתקעת לבדה בראש עמוד או בסופו. שלב ארוך נמשך על פני עמודים כרגיל.</p>
          {breaks.length > 0 && (
            <ul className="plain-list" aria-label="שלבים שצפויים לעבור לעמוד חדש">
              {breaks.map((b) => (
                <li key={b.i}>
                  <span>
                    שלב {b.i + 1} ({snap.blocks[b.i]?.title || "ללא כותרת"}): {b.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="a4-wrap" tabIndex={0} role="region" aria-label="תצוגה מקדימה של ההדפסה">
            <PrintSheet snap={snap} preview />
          </div>
        </>
      )}
    </Modal>
  );
}

/* ───────────── הודעות בראש העורך ───────────── */

export function ConflictBox({ onUseServer, onKeepMine }: { onUseServer: () => void; onKeepMine: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p>המסמך הזה עודכן בלשונית או במכשיר אחר, ולכן לא שמרנו כדי לא לדרוס. מה לעשות?</p>
      <div className="actions">
        <button type="button" className="btn btn-small" onClick={onUseServer}>
          לטעון את הנוסח העדכני (השינויים שלי כאן יימחקו)
        </button>
        <button type="button" className="btn btn-small" onClick={onKeepMine}>
          לשמור את הנוסח שלי מעל
        </button>
      </div>
    </div>
  );
}

export function RecoverBox({ recover, onApply, onDrop, onCompare }: { recover: NonNullable<Recover>; onApply: () => void; onDrop: () => void; onCompare: () => void }) {
  if (recover.kind === "restore")
    return (
      <div className="warn-box" role="status">
        <p>נמצא נוסח שהקלדתם ולא הגיע לשרת (סגירה פתאומית או נפילת חיבור). לשחזר אותו?</p>
        <div className="actions">
          <button type="button" className="btn btn-small" onClick={onApply}>
            שחזור הנוסח
          </button>
          <button type="button" className="btn btn-small" onClick={onDrop}>
            להתעלם
          </button>
        </div>
      </div>
    );
  if (recover.kind === "merge")
    return (
      <div className="warn-box" role="status">
        <p>
          נמצא נוסח מהמכשיר שלא הגיע לשרת, והמסמך השתנה בינתיים בעריכה אחרת. מיזגנו אותם ברמת שלב: {recover.mineChanged} שלבים ששיניתם נכנסו למיזוג
          {recover.conflicts.length ? `, ובשלבים שערכו שני הצדדים נשמר הנוסח שלכם (הנוסח של השרת נשמר בגרסאות אחרי השמירה)` : ""}. להחיל את המיזוג?
        </p>
        <div className="actions">
          <button type="button" className="btn btn-small" onClick={onApply}>
            החלת המיזוג
          </button>
          <button type="button" className="btn btn-small" onClick={onCompare}>
            השוואה זה לצד זה
          </button>
          <button type="button" className="btn btn-small" onClick={onDrop}>
            להתעלם (הנוסח שבמכשיר יימחק)
          </button>
        </div>
      </div>
    );
  return (
    <div className="error-box" role="alert">
      <p>נמצא במכשיר נוסח שלא הגיע לשרת, והמסמך בשרת השתנה בינתיים. אי אפשר למזג אותם אוטומטית, ולכן שום דבר לא נמחק עד שתבחרו.</p>
      <div className="actions">
        <button type="button" className="btn btn-small" onClick={onCompare}>
          השוואה זה לצד זה
        </button>
        <button type="button" className="btn btn-small" onClick={onApply}>
          להשתמש בנוסח מהמכשיר (הנוסח שבשרת יישמר כנקודת שמירה)
        </button>
        <button type="button" className="btn btn-small" onClick={onDrop}>
          להשתמש בנוסח מהשרת (הנוסח שבמכשיר יימחק)
        </button>
      </div>
    </div>
  );
}

export function LimitBanner({ problems, onJump }: { problems: LimitProblem[]; onJump: (p: LimitProblem) => void }) {
  if (!problems.length) return null;
  return (
    <div className="error-box" role="alert">
      <p>המסמך עדיין לא נשמר בשרת כי הוא חורג ממגבלות. הנוסח שמור במכשיר ולא יאבד, ויישמר מיד אחרי התיקון:</p>
      <ul className="plain-list">
        {problems.slice(0, 6).map((p, i) => (
          <li key={`${p.code}-${p.block}-${i}`}>
            <span>{p.message}</span>
            {p.block !== null && (
              <button type="button" className="btn btn-small" onClick={() => onJump(p)}>
                מעבר לשלב {p.block}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

