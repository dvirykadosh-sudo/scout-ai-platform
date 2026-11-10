"use client";

// "הגדרות מראה": חלון עם טיוטה. שינויים לא מוחלים מיד; פס "שינויים ממתינים" מציג כמה יש,
// כפתור "סקירת שינויים" מראה מה ישתנה (מ-ל), ורק "שמירה והחלה" מחיל. אפשר גם לבטל הכל.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { replayIntro } from "@/lib/lux/intro";
import { useA11y, useToast } from "../Providers";
import { PALETTE_CHOICES, PANEL_CHOICES, THEME_CHOICES, applyAppearance, diffAppearance, readAppearance, type Appearance } from "./appearance";
import { getPrefs } from "./shell-prefs";

function Choice<T extends string>({ name, value, options, onChange, changed }: { name: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; changed: boolean }) {
  return (
    <div className="sh-choices" role="radiogroup" aria-label={name} data-changed={changed}>
      {options.map(([v, label]) => (
        <label key={v} className="sh-choice">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

const ON_OFF = [["on", "פעיל"], ["off", "כבוי"]] as const;

function Group({ title, hint, changed, children }: { title: string; hint?: string; changed: boolean; children: ReactNode }) {
  return (
    <fieldset className="sh-set">
      <legend>
        {title}
        {changed && <span className="sh-changed">שונה</span>}
      </legend>
      {hint && <p>{hint}</p>}
      {children}
    </fieldset>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a11y = useA11y();
  const toast = useToast();
  const [saved, setSaved] = useState<Appearance | null>(null);
  const [draft, setDraft] = useState<Appearance | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // בפתיחה: צילום המצב הנוכחי כטיוטה
  useEffect(() => {
    if (!open) return;
    const cur = readAppearance(a11y, getPrefs());
    setSaved(cur);
    setDraft(cur);
    setReviewing(false);
    opener.current = document.activeElement as HTMLElement | null;
    window.setTimeout(() => panel.current?.focus(), 0);
    return () => opener.current?.focus?.();
    // הצילום נלקח פעם אחת בפתיחה
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = useCallback(() => onClose(), [onClose]);

  // Esc סוגר, ו-Tab נשאר בתוך החלון
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key !== "Tab" || !panel.current) return;
    const f = [...panel.current.querySelectorAll<HTMLElement>("button, input, [href], [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled"));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  if (!open || !saved || !draft) return null;
  const changes = diffAppearance(saved, draft);
  const was = (k: keyof Appearance) => saved[k] !== draft[k];
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => setDraft({ ...draft, [k]: v });
  const flag = (k: "contrast" | "large" | "compact" | "comfy" | "saver" | "dock") => (v: "on" | "off") => set(k, v === "on");
  const val = (b: boolean) => (b ? "on" : "off");

  const save = () => {
    applyAppearance(draft, saved, a11y);
    setSaved(draft);
    setReviewing(false);
    toast("ההגדרות נשמרו והוחלו.", { kind: "success" });
  };

  return (
    <div className="sh-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={panel} className="sh-sheet" role="dialog" aria-modal="true" aria-labelledby="sh-sheet-title" tabIndex={-1} onKeyDown={onKey}>
        <div className="sh-sheet-head">
          <h2 id="sh-sheet-title">הגדרות מראה</h2>
          <button type="button" className="icon-btn" aria-label="סגירה" onClick={close}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="sh-sheet-body">
          {reviewing ? (
            <section aria-label="סקירת שינויים">
              <p>אלה השינויים שיוחלו. בדקו ואשרו, או חזרו לעריכה.</p>
              <ul className="sh-review">
                {changes.map((c) => (
                  <li key={c.key}>
                    <strong>{c.label}:</strong>
                    <span className="from">{c.from}</span>
                    <span aria-hidden="true">←</span>
                    <span className="sr-only">שונה ל</span>
                    <span className="to">{c.to}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <>
              <p className="sh-wizard-link">
                רוצים שנעזור לכם לבחור? <Link href="/comfort" onClick={close}>פתחו את אשף הנוחות</Link>
                {" · "}
                <button type="button" className="link-btn" onClick={() => { close(); window.setTimeout(replayIntro, 250); }}>
                  הצגת סיור הנשר שוב
                </button>
              </p>
              <Group title="ערכת נושא" hint="כהה, בהירה, או לפי הגדרת המכשיר." changed={was("theme")}>
                <Choice name="ערכת נושא" value={draft.theme} options={THEME_CHOICES} onChange={(v) => set("theme", v)} changed={was("theme")} />
              </Group>
              <Group title="צבעי האתר" changed={was("palette")}>
                <Choice name="צבעי האתר" value={draft.palette} options={PALETTE_CHOICES} onChange={(v) => set("palette", v)} changed={was("palette")} />
              </Group>
              <Group title="משטח התוכן" hint="כהה בסגנון זכוכית (ברירת מחדל) או בהיר. בתצוגה בהירה ובניגודיות גבוהה ההגדרה הזו לא משפיעה." changed={was("panel")}>
                <Choice name="משטח התוכן" value={draft.panel} options={PANEL_CHOICES} onChange={(v) => set("panel", v)} changed={was("panel")} />
              </Group>
              <Group title="ניגודיות גבוהה" hint="שחור וצהוב, בלי זכוכית ובלי גרדיאנטים." changed={was("contrast")}>
                <Choice name="ניגודיות גבוהה" value={val(draft.contrast)} options={ON_OFF} onChange={flag("contrast")} changed={was("contrast")} />
              </Group>
              <Group title="הגדלת טקסט" changed={was("large")}>
                <Choice name="הגדלת טקסט" value={val(draft.large)} options={ON_OFF} onChange={flag("large")} changed={was("large")} />
              </Group>
              <Group title="תצוגה קומפקטית" hint="פחות ריווח, יותר תוכן במסך." changed={was("compact")}>
                <Choice name="תצוגה קומפקטית" value={val(draft.compact)} options={ON_OFF} onChange={flag("compact")} changed={was("compact")} />
              </Group>
              <Group title="קריאה נוחה" changed={was("comfy")}>
                <Choice name="קריאה נוחה" value={val(draft.comfy)} options={ON_OFF} onChange={flag("comfy")} changed={was("comfy")} />
              </Group>
              <Group title="חיסכון בנתונים ובאנימציות" changed={was("saver")}>
                <Choice name="חיסכון בנתונים ובאנימציות" value={val(draft.saver)} options={ON_OFF} onChange={flag("saver")} changed={was("saver")} />
              </Group>
              <Group title="דוק צף" hint="שורת הקיצורים בתחתית המסך." changed={was("dock")}>
                <Choice name="דוק צף" value={val(draft.dock)} options={ON_OFF} onChange={flag("dock")} changed={was("dock")} />
              </Group>
            </>
          )}
        </div>

        {changes.length > 0 && (
          <div className="sh-pending" role="region" aria-label="שינויים ממתינים">
            <strong aria-live="polite">{changes.length === 1 ? "שינוי אחד ממתין" : `${changes.length} שינויים ממתינים`}</strong>
            {reviewing ? (
              <button type="button" className="btn btn-small" onClick={() => setReviewing(false)}>חזרה לעריכה</button>
            ) : (
              <button type="button" className="btn btn-small" onClick={() => setReviewing(true)}>סקירת שינויים</button>
            )}
            <button type="button" className="btn btn-small" onClick={() => { setDraft(saved); setReviewing(false); }}>ביטול שינויים</button>
            <button type="button" className="btn btn-small btn-primary" onClick={save}>שמירה והחלה</button>
          </div>
        )}
      </div>
    </div>
  );
}
