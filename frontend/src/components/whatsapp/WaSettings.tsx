"use client";

// הגדרות הגנה: קצב, מכסות, שעות שקט, שבת, עצירה אוטומטית והבוט. כולן מצמצמות סיכון לחסימה, ואינן מבטיחות שלא תהיה חסימה.
import { useState } from "react";
import { Save } from "lucide-react";
import { waApi, type WaSettings as Settings } from "@/lib/wa-api";
import { Alert, Check, Field, useAct } from "./wa-ui";

type NumKey = "minGapSec" | "maxGapSec" | "perCharMs" | "maxPerMinute" | "maxPerHour" | "maxPerDay" | "perContactCooldownSec" | "breakerFails" | "breakerPauseMin" | "maxQueue";

const NUMS: { key: NumKey; label: string; min: number; max: number }[] = [
  { key: "minGapSec", label: "הפרש מינימלי בין הודעות (שניות)", min: 1, max: 600 },
  { key: "maxGapSec", label: "הפרש מקסימלי בין הודעות (שניות)", min: 1, max: 1800 },
  { key: "perCharMs", label: "זמן הקלדה לכל תו (אלפיות שנייה)", min: 0, max: 500 },
  { key: "maxPerMinute", label: "מקסימום הודעות בדקה (עד 10)", min: 1, max: 10 },
  { key: "maxPerHour", label: "מקסימום הודעות בשעה", min: 1, max: 500 },
  { key: "maxPerDay", label: "מקסימום הודעות ביום", min: 1, max: 2000 },
  { key: "perContactCooldownSec", label: "השהיה בין הודעות לאותו איש קשר (שניות)", min: 0, max: 86400 },
  { key: "breakerFails", label: "כשלונות רצופים עד עצירה אוטומטית", min: 1, max: 50 },
  { key: "breakerPauseMin", label: "משך העצירה האוטומטית (דקות)", min: 1, max: 1440 },
  { key: "maxQueue", label: "גודל תור מקסימלי", min: 10, max: 5000 },
];

export function WaSettings({ token, settings, onSaved }: { token: string; settings: Settings; onSaved: () => void }) {
  const api = waApi(token);
  const { act, busy } = useAct();
  const [d, setD] = useState<Settings>(settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setD((x) => ({ ...x, [k]: v }));
  const quietOff = d.quietFrom === d.quietTo;
  const gapBad = d.minGapSec > d.maxGapSec;

  const save = async () => {
    if (await act(() => api.saveSettings(d), "ההגדרות נשמרו.")) onSaved();
  };

  return (
    <section className="wa-card" aria-label="הגדרות הגנה">
      <h2>הגדרות הגנה וקצב</h2>
      <Alert info>
        ההגדרות האלה מקטינות את הסיכון שוואטסאפ יחסום את המספר, אבל לא מבטלות אותו. שליחה אוטומטית בניגוד לתנאי השימוש של וואטסאפ עלולה לגרום לחסימה. השתמשו במספר ייעודי, ורק באנשים שהסכימו לקבל הודעות.
      </Alert>

      <div className="wa-row" style={{ margin: "10px 0" }}>
        <Check checked={d.enabled} onChange={(v) => set("enabled", v)}><b>השליחה פעילה</b> (כיבוי מעכב את כל התור)</Check>
        <Check checked={d.warmup} onChange={(v) => set("warmup", v)}>הגבלה הדרגתית בתחילת השימוש</Check>
        <Check checked={d.pauseShabbat} onChange={(v) => set("pauseShabbat", v)}>הפסקת שבת (מכניסת שבת ועד צאתה)</Check>
      </div>

      <div className="wa-row" style={{ alignItems: "flex-end" }}>
        <Field label="תחילת שעות שקט">{(id) => <input id={id} type="time" value={d.quietFrom} onChange={(e) => set("quietFrom", e.target.value)} />}</Field>
        <Field label="סוף שעות שקט">{(id) => <input id={id} type="time" value={d.quietTo} onChange={(e) => set("quietTo", e.target.value)} />}</Field>
        <span className="wa-muted" role="status">{quietOff ? "שעות השקט כבויות (שתי השעות זהות)." : "בשעות האלה לא נשלחות הודעות, מלבד תשובה למי שפנה."}</span>
      </div>

      <div className="wa-row" style={{ alignItems: "flex-end", marginTop: 8 }}>
        {NUMS.map((n) => (
          <Field key={n.key} label={n.label}>
            {(id) => (
              <input id={id} type="number" min={n.min} max={n.max} value={d[n.key]} onChange={(e) => set(n.key, Math.min(n.max, Math.max(n.min, Math.round(Number(e.target.value) || n.min))))} />
            )}
          </Field>
        ))}
      </div>
      {gapBad && <Alert>ההפרש המינימלי גדול מהמקסימלי. תקנו לפני שמירה.</Alert>}

      <h3>בוט תשובות</h3>
      <p className="wa-muted">הבוט עונה רק לאנשי קשר שסימנתם "בוט מורשה", ואף פעם לא לחניכים ולא עם מידע על חניכים.</p>
      <div className="wa-row">
        <Check checked={d.botEnabled} onChange={(v) => set("botEnabled", v)}>הבוט פעיל</Check>
        <Check checked={d.botGroups} onChange={(v) => set("botGroups", v)} disabled={!d.botEnabled}>לאפשר לבוט לענות גם בקבוצות</Check>
      </div>

      <div className="wa-row" style={{ marginTop: 14 }}>
        <button type="button" className="wa-btn" disabled={busy || gapBad} onClick={save}><Save size={18} aria-hidden="true" />שמירת ההגדרות</button>
        <button type="button" className="wa-btn soft" disabled={busy} onClick={() => setD(settings)}>ביטול שינויים</button>
      </div>
    </section>
  );
}
