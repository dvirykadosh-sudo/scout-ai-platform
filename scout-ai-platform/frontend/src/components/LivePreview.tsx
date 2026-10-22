"use client";

import { STYLE_OPTIONS, type StyleSettings } from "@/lib/constants";

interface PreviewForm {
  topic: string;
  value: string;
  instructor: string;
  ageGroup: string;
  participants: string;
  activeScouting: boolean;
  energeticMode: boolean;
}

/** Shows the activity taking shape while the form is being filled in. */
export function LivePreview({ form, sel, style }: { form: PreviewForm; sel: Record<string, string>; style: StyleSettings }) {
  const methods = Object.entries(sel).map(([name, m]) => ({ name, minutes: Number(m) || 0 }));
  const total = methods.reduce((s, m) => s + m.minutes, 0);
  const missing = [!form.topic.trim() && "נושא", !form.instructor.trim() && "שם מדריך/ה", methods.length === 0 && "שיטה אחת לפחות"].filter(Boolean) as string[];
  const tone = (STYLE_OPTIONS.tone.options as Record<string, string>)[style.tone];

  return (
    <aside className="live-preview card glass" aria-labelledby="preview-title">
      <h2 id="preview-title" className="section-title">
        תצוגה מקדימה
      </h2>
      <p className="preview-title">{form.topic.trim() || "עדיין בלי נושא"}</p>
      <ul className="chips" aria-label="פרטי הפעולה עד עכשיו">
        <li className="chip">{form.ageGroup}</li>
        {form.participants && <li className="chip">{form.participants} משתתפים</li>}
        {form.value.trim() && <li className="chip">ערך: {form.value.trim()}</li>}
        {tone && <li className="chip">סגנון: {tone}</li>}
        {form.energeticMode && <li className="chip chip-accent">מצב תנועתי</li>}
        {form.activeScouting && <li className="chip chip-accent">צופיות מעשית</li>}
      </ul>
      {methods.length > 0 ? (
        <>
          <p className="preview-sub">
            שיטות ({total} דקות בסך הכול)
          </p>
          <ul className="plain-list preview-methods">
            {methods.map((m) => (
              <li key={m.name}>
                <span>{m.name}</span>
                <span>{m.minutes} דק'</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">עוד לא נבחרו שיטות.</p>
      )}
      {missing.length > 0 && <p className="hint">עוד חסר: {missing.join(", ")}.</p>}
    </aside>
  );
}
