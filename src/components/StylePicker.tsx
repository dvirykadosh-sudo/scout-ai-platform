"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorMessage, extractStyleFile, storageGet, storageSet } from "@/lib/api";
import { DEFAULT_STYLE, STYLE_OPTIONS, type StyleAnalysis, type StyleKey, type StyleSettings } from "@/lib/constants";
import { useToast } from "./Providers";

const SAVED_KEY = "scout.styles";
const KEYS: StyleKey[] = ["tone", "address", "length", "detail", "slang"];

interface Saved {
  name: string;
  style: StyleSettings;
}

function loadSaved(): Saved[] {
  try {
    const v = JSON.parse(storageGet(SAVED_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function StylePicker({ value, onChange, aiEnabled, onSaveAccount }: { value: StyleSettings; onChange: (s: StyleSettings) => void; aiEnabled: boolean | null; onSaveAccount?: () => void }) {
  const toast = useToast();
  const [analysis, setAnalysis] = useState<StyleAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => setSaved(loadSaved()), []);

  const patch = (p: Partial<StyleSettings>) => onChange({ ...value, ...p });

  const analyze = async (sample = value.sample) => {
    setBusy(true);
    try {
      const a = await api<StyleAnalysis>("/api/style/analyze", { method: "POST", body: { sample } });
      setAnalysis(a);
      if (a.ok && a.suggested) {
        onChange({ ...value, sample, ...a.suggested });
        toast("זיהיתי את הסגנון והחלתי אותו על ההעדפות. אפשר לשנות אותן למטה", { kind: "success" });
      } else if (a.reason) {
        toast(a.reason, { kind: "error" });
      }
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await extractStyleFile<{ text: string; analysis: StyleAnalysis }>(f);
      setAnalysis(r.analysis);
      onChange({ ...value, sample: r.text, ...(r.analysis.ok && r.analysis.suggested ? r.analysis.suggested : {}) });
      toast(r.analysis.ok ? "הקובץ נקרא והסגנון זוהה" : "הקובץ נקרא", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    if (file.current) file.current.value = "";
    setBusy(false);
  };

  const persist = (list: Saved[]) => {
    setSaved(list);
    storageSet(SAVED_KEY, JSON.stringify(list));
  };
  const save = () => {
    const n = name.trim();
    if (!n) return toast("תנו שם לסגנון כדי לשמור אותו", { kind: "error" });
    persist([{ name: n, style: value }, ...saved.filter((s) => s.name !== n)].slice(0, 10));
    setName("");
    toast(`הסגנון "${n}" נשמר במחשב הזה`, { kind: "success" });
  };

  return (
    <div className="style-picker">
      <div className={`ai-note ${aiEnabled ? "on" : ""}`} role="note">
        {aiEnabled ? (
          <p>
            <strong>מפתח AI מחובר.</strong> הדוגמה שלכם תישלח ל-AI, והוא ילמד ממנה את אופן הדיבור.
          </p>
        ) : (
          <p>
            <strong>אין מפתח AI בשרת.</strong> המחולל המובנה משתמש בהעדפות הסגנון (טון, פנייה, אורך), אבל לא מחקה דוגמה מילה במילה. כדי שהטקסט באמת ישמע כמוכם, בשלב הבא יש כפתור שמכין הנחיה מוכנה ל-Claude או ל-ChatGPT, וחוזרים עם התשובה.
          </p>
        )}
      </div>

      {saved.length > 0 && (
        <div className="saved-styles">
          <p className="hint">סגנונות שמורים:</p>
          <ul className="chips">
            {saved.map((s) => (
              <li key={s.name}>
                <button type="button" className="chip chip-btn" onClick={() => onChange(s.style)}>
                  {s.name}
                </button>
                <button type="button" className="chip-x" aria-label={`מחיקה: ${s.name}`} onClick={() => persist(saved.filter((x) => x.name !== s.name))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field">
        <label htmlFor="style-sample">פעולה שכתבתם בעבר (להדבקה)</label>
        <textarea id="style-sample" rows={7} maxLength={12000} value={value.sample} onChange={(e) => patch({ sample: e.target.value })} placeholder="הדביקו כאן פעולה שכתבתם, או כמה פסקאות מהסגנון שלכם..." aria-describedby="style-sample-hint" />
        <p className="hint" id="style-sample-hint">
          לא חובה. כמה שיותר דוגמה אמיתית שכתבתם, כך הניתוח מדויק יותר. עד 12,000 תווים.
        </p>
      </div>

      <div className="actions">
        <input ref={file} type="file" accept=".docx,.txt,.md" className="sr-only" id="style-file" onChange={(e) => onFile(e.target.files?.[0])} />
        <label htmlFor="style-file" className={`btn ${busy ? "disabled" : ""}`} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), file.current?.click())}>
          העלאת קובץ Word או טקסט
        </label>
        <button type="button" className="btn btn-primary" disabled={busy || value.sample.trim().length < 40} onClick={() => analyze()}>
          {busy ? "קורא..." : "נתח את הסגנון שלי"}
        </button>
        {value.sample && (
          <button type="button" className="btn" onClick={() => (patch({ sample: "" }), setAnalysis(null))}>
            ניקוי הדוגמה
          </button>
        )}
      </div>

      {analysis?.ok && analysis.traits && (
        <div className="analysis" role="status">
          <p>
            <strong>מה זיהיתי בסגנון שלכם:</strong>
          </p>
          <ul className="chips">
            {analysis.traits.map((t) => (
              <li key={t} className="chip chip-accent">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="sub-title">איך אתם רוצים שהפעולה תיכתב</h3>
      <div className="opt-groups">
        {KEYS.map((k) => (
          <fieldset key={k} className="opt-group">
            <legend>{STYLE_OPTIONS[k].label}</legend>
            <div className="opt-row">
              {Object.entries(STYLE_OPTIONS[k].options).map(([val, label]) => (
                <label key={val} className={`opt ${value[k] === val ? "on" : ""}`}>
                  <input type="radio" name={`style-${k}`} value={val} checked={value[k] === val} onChange={() => patch({ [k]: val })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="field">
        <label htmlFor="style-extra">בקשות נוספות (לא חובה)</label>
        <textarea id="style-extra" rows={2} maxLength={500} value={value.extra} onChange={(e) => patch({ extra: e.target.value })} placeholder='למשל: "תמיד תתחיל בשאלה", "בלי סיפורים ארוכים", "תוסיף הומור של שבט"' />
      </div>

      <div className="save-style">
        <div className="field">
          <label htmlFor="style-name">שמירת הסגנון הזה לפעם הבאה</label>
          <input id="style-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="למשל: הסגנון של דביר" />
        </div>
        <button type="button" className="btn" onClick={save}>
          שמירה
        </button>
        {onSaveAccount ? (
          <button type="button" className="btn" onClick={onSaveAccount}>
            שמירה בחשבון שלי
          </button>
        ) : (
          <p className="hint">התחברו באזור האישי כדי שהסגנון יישמר בחשבון ויופיע בכל מכשיר.</p>
        )}
        <button type="button" className="btn" onClick={() => onChange({ ...DEFAULT_STYLE })}>
          איפוס
        </button>
      </div>
    </div>
  );
}
