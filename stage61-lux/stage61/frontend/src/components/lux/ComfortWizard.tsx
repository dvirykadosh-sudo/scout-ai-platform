"use client";

// שלב 61 (רעיון 20): אשף נוחות. שאלה אחת בכל פעם, עם תצוגה חיה. כל בחירה חלה מיד ונשמרת בדפדפן; "שמירה בחשבון" מעבירה אותה למכשירים אחרים.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage, storageGet, storageSet } from "@/lib/api";
import { COMFORT_AT, COMFORT_DEFAULT, applyComfort, readComfort, type Comfort } from "@/lib/lux/comfort";
import { useAuth, useToast } from "../Providers";
import { Eagle } from "./illus";
import { PageTitle } from "../ui";

interface Opt<T> {
  v: T;
  label: string;
  hint?: string;
}
const FS: Opt<Comfort["fs"]>[] = [
  { v: "100", label: "רגיל" },
  { v: "115", label: "גדול" },
  { v: "130", label: "גדול מאוד" },
  { v: "150", label: "ענק" },
];
const MOTION: Opt<Comfort["motion"]>[] = [
  { v: "full", label: "מלאה", hint: "כל האנימציות והמעברים." },
  { v: "calm", label: "רגועה", hint: "בלי תנועה גדולה: רק הופעה והיעלמות עדינות." },
  { v: "off", label: "בלי תנועה", hint: "הכול עומד במקום." },
];
const STEPS = ["טקסט", "תנועה", "צבעים וניגודיות", "הקראה", "צלילים ונשר", "סיום"] as const;

function Choice<T extends string>({ name, opts, value, onPick }: { name: string; opts: Opt<T>[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="cw-choices" role="radiogroup" aria-label={name}>
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={`cw-choice ${value === o.v ? "on" : ""}`} onClick={() => onPick(o.v)}>
          <b>{o.label}</b>
          {o.hint && <span>{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}
function Switch({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="cw-switch" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function ComfortWizard() {
  const { token } = useAuth();
  const toast = useToast();
  const [c, setC] = useState<Comfort>(COMFORT_DEFAULT);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [voice, setVoice] = useState<"yes" | "no" | "unknown">("unknown");

  useEffect(() => {
    setC(readComfort());
    setSaved(storageGet(COMFORT_AT));
    try {
      const probe = () => {
        const vs = window.speechSynthesis?.getVoices() ?? [];
        if (!("speechSynthesis" in window)) setVoice("no");
        else if (vs.length) setVoice(vs.some((v) => v.lang.toLowerCase().startsWith("he")) ? "yes" : "no");
      };
      probe();
      window.speechSynthesis?.addEventListener?.("voiceschanged", probe);
      return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", probe);
    } catch {
      setVoice("no");
    }
  }, []);

  const set = useCallback((p: Partial<Comfort>) => {
    setC((cur) => {
      const n = { ...cur, ...p };
      applyComfort(n);
      return n;
    });
  }, []);

  const saveAccount = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await api<{ updatedAt: string }>("/api/lux/comfort", { method: "PUT", token, body: c });
      storageSet(COMFORT_AT, r.updatedAt);
      setSaved(r.updatedAt);
      toast("ההעדפות נשמרו בחשבון", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };
  const reset = async () => {
    const d = { ...COMFORT_DEFAULT };
    setC(d);
    applyComfort(d);
    if (token) {
      try {
        await api("/api/lux/comfort", { method: "DELETE", token });
        try {
          localStorage.removeItem(COMFORT_AT);
        } catch {
          /* ignore */
        }
        setSaved(null);
      } catch {
        /* נשאר מקומי */
      }
    }
    toast("הכול חזר לברירת המחדל", { kind: "success" });
  };

  const last = step === STEPS.length - 1;
  const body = useMemo(() => {
    switch (step) {
      case 0:
        return (
          <>
            <p>בחרו גודל טקסט נוח. השינוי חל על כל האתר, וכאן אפשר לראות אותו מיד.</p>
            <Choice name="גודל טקסט" opts={FS} value={c.fs} onPick={(v) => set({ fs: v })} />
            <div className="cw-preview card glass">
              <h3>כך ייראה הטקסט</h3>
              <p>פעולה בנושא ״רע לכל אדם״ לשכבת ו׳. זמן: 45 דקות. ציוד: דפים, עטים, חבל.</p>
            </div>
          </>
        );
      case 1:
        return (
          <>
            <p>כמה תנועה נוח לכם? האתר בכל מקרה מכבד את הגדרת המכשיר, וזו בחירה נוספת שלכם.</p>
            <Choice name="רמת תנועה" opts={MOTION} value={c.motion} onPick={(v) => set({ motion: v })} />
            <div className="cw-preview card glass cw-motion">
              <Eagle mood="wave" size={72} />
              <span>{c.motion === "full" ? "הנשר מנופף" : c.motion === "calm" ? "תנועה עדינה בלבד" : "הנשר עומד במקום"}</span>
            </div>
          </>
        );
      case 2:
        return (
          <>
            <Switch id="cw-hc" label="ניגודיות גבוהה" hint="שחור וצהוב, בלי זכוכית וגרדיאנטים." checked={c.contrast} onChange={(v) => set({ contrast: v })} />
            <Switch id="cw-cvd" label="צבעים בטוחים לעיוורון צבעים" hint="כחול וכתום שמובחנים בכל סוגי עיוורון הצבעים, וסימנים (✓ ! ✗) לצד צבעי הסטטוס." checked={c.cvd} onChange={(v) => set({ cvd: v })} />
            <div className="cw-preview card glass cw-swatch">
              <span className="pill pill-ok">הושלם</span>
              <span className="pill pill-warn">דורש תשומת לב</span>
              <span className="pill pill-err">שגיאה</span>
              <button type="button" className="btn btn-primary" tabIndex={-1}>
                כפתור ראשי
              </button>
            </div>
          </>
        );
      case 3:
        return (
          <>
            <Switch id="cw-ra" label="כפתור הקראה בכל עמוד" hint="הדפדפן מקריא את תוכן העמוד בקול, פסקה אחרי פסקה." checked={c.readAloud} onChange={(v) => set({ readAloud: v })} />
            {voice === "no" && <p className="hint" role="status">לא נמצא במכשיר הזה קול בעברית, ולכן ההקראה עשויה לא לעבוד כאן. אפשר להתקין קול עברי בהגדרות המערכת.</p>}
            <div className="field">
              <label htmlFor="cw-rate">מהירות הקראה: {c.rate.toFixed(1)}</label>
              <input id="cw-rate" type="range" min={0.6} max={1.6} step={0.1} value={c.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
            </div>
          </>
        );
      case 4:
        return (
          <>
            <Switch id="cw-snd" label="צלילי אווירה" hint="שריקה בסיום טיימר ומדורה בשקט. כבוי כברירת מחדל." checked={c.sound} onChange={(v) => set({ sound: v })} />
            <Switch id="cw-hap" label="רטט במכשיר נייד" checked={c.haptics} onChange={(v) => set({ haptics: v })} />
            <Switch id="cw-mas" label="הנשר ״מעוז״ בפינה" hint="טיפים לפי העמוד וסיור קצר." checked={c.mascot} onChange={(v) => set({ mascot: v })} />
          </>
        );
      default:
        return (
          <>
            <p>זה מה שבחרתם:</p>
            <ul className="cw-sum">
              <li>טקסט: {FS.find((o) => o.v === c.fs)?.label}</li>
              <li>תנועה: {MOTION.find((o) => o.v === c.motion)?.label}</li>
              <li>ניגודיות גבוהה: {c.contrast ? "כן" : "לא"}</li>
              <li>צבעים בטוחים לעיוורון צבעים: {c.cvd ? "כן" : "לא"}</li>
              <li>הקראה: {c.readAloud ? `כן, מהירות ${c.rate.toFixed(1)}` : "לא"}</li>
              <li>צלילים: {c.sound ? "כן" : "לא"} · רטט: {c.haptics ? "כן" : "לא"} · נשר: {c.mascot ? "כן" : "לא"}</li>
            </ul>
            <p className="hint">ההעדפות כבר חלות במכשיר הזה. כדי שיחולו גם במכשירים אחרים, שמרו אותן בחשבון.</p>
            <div className="actions">
              {token ? (
                <button type="button" className="btn btn-primary" onClick={saveAccount} disabled={busy}>
                  {busy ? "שומר..." : "שמירה בחשבון"}
                </button>
              ) : (
                <span className="hint">התחברו כדי לשמור בחשבון.</span>
              )}
              <button type="button" className="btn" onClick={reset}>
                איפוס לברירת מחדל
              </button>
            </div>
            {saved && <p className="hint">נשמר בחשבון ב-{new Date(saved).toLocaleString("he-IL")}.</p>}
          </>
        );
    }
  }, [step, c, set, voice, token, busy, saved]);

  return (
    <div className="lux-comfort">
      <PageTitle lead="כמה שאלות קצרות, ובסוף האתר מותאם אליכם. אפשר לשנות בכל רגע.">אשף נוחות</PageTitle>
      <div className="card glass cw-card">
        <ol className="cw-steps" aria-label="שלבי האשף">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
              <button type="button" onClick={() => setStep(i)}>
                <span className="n">{i + 1}</span>
                <span className="t">{s}</span>
              </button>
            </li>
          ))}
        </ol>
        <h2 className="section-title" tabIndex={-1} id="cw-h">
          {STEPS[step]}
        </h2>
        <div className="cw-body" aria-live="polite">
          {body}
        </div>
        <div className="actions cw-nav">
          <button type="button" className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            הקודם
          </button>
          {!last && (
            <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
              הבא
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
