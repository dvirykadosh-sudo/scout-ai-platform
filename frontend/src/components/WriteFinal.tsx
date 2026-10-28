"use client";

// רעיונות 188–200: תחנות, תוכנית גיבוי, ציון מוכנות, מתודות השבט, מדדי אדמין, השרת מתעורר, סיור מודרך ומשוב.
import { Gauge } from "./Depth3D";
import { useCallback, useEffect, useState } from "react";
import { API_URL, api, errorMessage, fmtDate, storageGet, storageSet } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";
import type { Snap } from "./WriteParts";

const close = (onClose: () => void) => (
  <button type="button" className="btn" onClick={onClose}>
    סגירה
  </button>
);

/** 188: חישוב זמן לתחנות. */
export function StationsModal({ open, onClose, token, total, onInsert }: { open: boolean; onClose: () => void; token: string | null; total: number; onInsert: (t: string) => void }) {
  const toast = useToast();
  const [t, setT] = useState(total || 30);
  const [n, setN] = useState(4);
  const [tr, setTr] = useState(1);
  const [res, setRes] = useState<{ ok: boolean; reason?: string; text?: string; perStation?: number } | null>(null);
  useEffect(() => {
    if (open) {
      setT(total || 30);
      setRes(null);
    }
  }, [open, total]);
  const run = async () => {
    try {
      setRes(await api("/api/write/stations", { method: "POST", token, body: { total: t, stations: n, transition: tr } }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="חישוב זמן לתחנות" footer={close(onClose)}>
      <p className="hint">כמה דקות מגיעות לכל תחנה כשהקבוצות מתחלפות בסבבים.</p>
      <Field label="זמן כולל לפעילות (דקות)" htmlFor="st-t">
        <input id="st-t" type="number" min={5} max={480} value={t} onChange={(e) => setT(Number(e.target.value))} />
      </Field>
      <Field label="מספר תחנות" htmlFor="st-n">
        <input id="st-n" type="number" min={1} max={12} value={n} onChange={(e) => setN(Number(e.target.value))} />
      </Field>
      <Field label="דקות מעבר בין תחנות" htmlFor="st-tr">
        <input id="st-tr" type="number" min={0} max={10} value={tr} onChange={(e) => setTr(Number(e.target.value))} />
      </Field>
      <button type="button" className="btn btn-primary" onClick={run}>
        חישוב
      </button>
      {res && (
        <div role="status" aria-live="polite">
          {res.ok ? (
            <>
              <pre className="plain-pre">{res.text}</pre>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onInsert(res.text ?? "");
                  onClose();
                }}
              >
                הכנסה לשלב הנוכחי
              </button>
            </>
          ) : (
            <p className="field-error">{res.reason}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

const CONDS = [
  { id: "rain", label: "גשם" },
  { id: "heat", label: "חום" },
  { id: "room", label: "חדר קטן" },
  { id: "large", label: "קבוצה גדולה" },
];
/** 189: תוכנית גיבוי. */
export function BackupPlanModal({ open, onClose, token, snap, onAddStage }: { open: boolean; onClose: () => void; token: string | null; snap: Snap; onAddStage: (title: string, text: string) => void }) {
  const toast = useToast();
  const [cond, setCond] = useState("rain");
  const [plan, setPlan] = useState<{ text: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    setPlan(null);
    api<{ text: string }>("/api/write/backup-plan", { method: "POST", token, body: { ...snap, condition: cond } })
      .then(setPlan)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [open, cond, token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title="תוכנית גיבוי" wide footer={close(onClose)}>
      <fieldset className="chips">
        <legend>מה יכול להשתבש?</legend>
        {CONDS.map((c) => (
          <label key={c.id} className="check">
            <input type="radio" name="bk-cond" checked={cond === c.id} onChange={() => setCond(c.id)} />
            <span>{c.label}</span>
          </label>
        ))}
      </fieldset>
      {plan && (
        <>
          <pre className="plain-pre">{plan.text}</pre>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onAddStage(`גיבוי: ${CONDS.find((c) => c.id === cond)?.label}`, plan.text);
              onClose();
            }}
          >
            הוספה כשלב חדש בסוף
          </button>
        </>
      )}
    </Modal>
  );
}

interface Readiness {
  score: number;
  label: string;
  items: { label: string; points: number; max: number; ok: boolean; hint: string }[];
}
/** 190: ציון מוכנות להעברה. */
export function ReadinessModal({ open, onClose, token, snap }: { open: boolean; onClose: () => void; token: string | null; snap: Snap }) {
  const [r, setR] = useState<Readiness | null>(null);
  useEffect(() => {
    if (!open) return;
    setR(null);
    api<Readiness>("/api/write/readiness", { method: "POST", token, body: snap })
      .then(setR)
      .catch(() => setR(null));
  }, [open, token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title="מוכנות להעברה" footer={close(onClose)}>
      {!r ? (
        <p>בודק…</p>
      ) : (
        <>
          <p>
            <strong className="big-score">{r.score}</strong> מתוך 100 · {r.label}
          </p>
          <Gauge score={r.score} />
          <ul className="plain-list">
            {r.items.map((i) => (
              <li key={i.label}>
                <span>
                  {i.ok ? "✓" : "○"} {i.label} <span className="hint">({i.points}/{i.max})</span>
                  {i.hint && <span className="hint"> · {i.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

interface TM {
  id: number;
  name: string;
  category: string;
  line: string;
  steps: string[];
  createdBy: string;
}
/** 192: מתודות שהאדמין הוסיף לשבט. */
export function TribeMethodsModal({ open, onClose, token, onInsert }: { open: boolean; onClose: () => void; token: string | null; onInsert: (t: string) => void }) {
  const [list, setList] = useState<TM[]>([]);
  useEffect(() => {
    if (open) api<TM[]>("/api/write/tribe-methods", { token }).then(setList).catch(() => setList([]));
  }, [open, token]);
  return (
    <Modal open={open} onClose={onClose} title="מתודות השבט" wide footer={close(onClose)}>
      {list.length === 0 ? (
        <p className="hint">עדיין לא נוספו מתודות שבטיות. אדמין יכול להוסיף אותן בלוח הניהול.</p>
      ) : (
        <ul className="plain-list">
          {list.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{m.name}</strong> <span className="hint">· {m.createdBy}</span>
                <br />
                {m.line}
              </span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  onInsert([m.name + ": " + m.line, ...m.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n"));
                  onClose();
                }}
              >
                הכנסה לשלב<span className="sr-only">: {m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** 191, 192, 193: כרטיס אדמין, מדדי העורך, מתודות השבט ומשוב. */
export function AdminWriteMetrics() {
  const { token } = useAuth();
  const toast = useToast();
  const [u, setU] = useState<Record<string, unknown> | null>(null);
  const [fb, setFb] = useState<{ feature: string; vote: number; comment: string; createdAt: string }[]>([]);
  const [ms, setMs] = useState<TM[]>([]);
  const [f, setF] = useState({ name: "", category: "game", line: "", steps: "" });
  const load = useCallback(() => {
    api<Record<string, unknown>>("/api/admin/write-usage", { token }).then(setU).catch(() => {});
    api<typeof fb>("/api/admin/feature-feedback", { token }).then(setFb).catch(() => {});
    api<TM[]>("/api/write/tribe-methods", { token }).then(setMs).catch(() => {});
  }, [token]);
  useEffect(load, [load]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/admin/write-methods", { method: "POST", token, body: { name: f.name, category: f.category, line: f.line, steps: f.steps.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6) } });
      setF({ name: "", category: "game", line: "", steps: "" });
      toast("המתודה נוספה");
      load();
    } catch (er) {
      toast(errorMessage(er), { kind: "error" });
    }
  };
  const stats: [string, string][] = [
    ["מסמכים", "docs"],
    ["כותבים", "writers"],
    ["פעילים ב-30 יום", "active30"],
    ["מסמכים ב-7 ימים", "created7"],
    ["ממוצע שלבים", "avgStages"],
    ["ממוצע מילים", "avgWords"],
    ["קישורי שיתוף", "shares"],
    ["הערות", "comments"],
  ];
  const top = (u?.topMethods as { name: string; count: number }[] | undefined) ?? [];
  return (
    <section className="card" aria-labelledby="awm-title">
      <h2 id="awm-title" className="section-title">
        מדדי עורך הכתיבה
      </h2>
      {u && (
        <dl className="stat-grid">
          {stats.map(([l, k]) => (
            <div key={k}>
              <dt>{l}</dt>
              <dd>{String(u[k] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      )}
      {top.length > 0 && (
        <p>
          מתודות נפוצות: {top.map((m) => `${m.name} (${m.count})`).join(", ")}
        </p>
      )}
      <h3 className="subtitle">משוב על תכונות</h3>
      {fb.length === 0 ? (
        <p className="hint">עדיין אין הערות.</p>
      ) : (
        <ul className="plain-list">
          {fb.slice(0, 10).map((x, i) => (
            <li key={i}>
              <span>
                {x.vote > 0 ? "👍" : "👎"} <strong>{x.feature}</strong>: {x.comment} <span className="hint">{fmtDate(x.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="subtitle">מתודות השבט</h3>
      <ul className="plain-list">
        {ms.map((m) => (
          <li key={m.id}>
            <span>
              <strong>{m.name}</strong> · {m.line}
            </span>
            <button
              type="button"
              className="btn btn-small"
              onClick={async () => {
                if (!window.confirm(`למחוק את "${m.name}"?`)) return;
                await api(`/api/admin/write-methods/${m.id}`, { method: "DELETE", token }).catch(() => {});
                load();
              }}
            >
              מחיקה<span className="sr-only">: {m.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        <Field label="שם המתודה" htmlFor="tm-name">
          <input id="tm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={40} />
        </Field>
        <Field label="סוג" htmlFor="tm-cat">
          <select id="tm-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="game">משחק</option>
            <option value="talk">שיחה</option>
            <option value="take">פעולה אישית</option>
          </select>
        </Field>
        <Field label="תיאור בשורה אחת" htmlFor="tm-line">
          <input id="tm-line" value={f.line} onChange={(e) => setF({ ...f, line: e.target.value })} required minLength={5} maxLength={400} />
        </Field>
        <Field label="שלבים (שורה לכל שלב, לא חובה)" htmlFor="tm-steps">
          <textarea id="tm-steps" rows={3} value={f.steps} onChange={(e) => setF({ ...f, steps: e.target.value })} />
        </Field>
        <button className="btn btn-primary" type="submit">
          הוספת מתודה לשבט
        </button>
      </form>
    </section>
  );
}

/** 197: כשהשרת החינמי ישן, מציגים הסבר ידידותי במקום מסך תקוע. */
export function ServerWake() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let done = false;
    const timer = window.setTimeout(() => !done && setSlow(true), 2500);
    fetch(`${API_URL}/api/health`)
      .catch(() => {})
      .finally(() => {
        done = true;
        window.clearTimeout(timer);
        setSlow(false);
      });
    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, []);
  if (!slow) return null;
  return (
    <div className="wake-banner" role="status" aria-live="polite">
      השרת מתעורר אחרי זמן ללא שימוש. זה לוקח עד דקה, ואין צורך לרענן. הכל יופיע מיד כשהוא מוכן.
    </div>
  );
}

const SEEN = "scout.whatsnew.seen";
export const LATEST_VERSION = 28;
export function NewBadge() {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(Number(storageGet(SEEN) ?? 0) < LATEST_VERSION), []);
  return show ? <span className="new-badge"> חדש</span> : null;
}

/** 199: משוב קצר על תכונה. */
export function FeatureFeedback({ feature, label }: { feature: string; label: string }) {
  const { token } = useAuth();
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [comment, setComment] = useState("");
  const send = async (vote: 1 | -1) => {
    try {
      await api("/api/feedback/feature", { method: "POST", token, body: { feature, vote, comment } });
      setDone(true);
      toast("תודה על המשוב");
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  if (done) return <p className="hint">תודה, המשוב על "{label}" נשלח.</p>;
  return (
    <div className="feature-fb">
      <span>עזר לך? {label}</span>
      <input aria-label={`הערה קצרה על ${label} (לא חובה)`} value={comment} maxLength={300} onChange={(e) => setComment(e.target.value)} placeholder="הערה קצרה, לא חובה" />
      <button type="button" className="btn btn-small" onClick={() => send(1)}>
        👍<span className="sr-only"> עזר</span>
      </button>
      <button type="button" className="btn btn-small" onClick={() => send(-1)}>
        👎<span className="sr-only"> לא עזר</span>
      </button>
    </div>
  );
}

const STEPS: Record<string, { t: string; d: string }[]> = {
  home: [
    { t: "שלוש פעולות עיקריות", d: "למעלה: יצירת פעולה חכמה, כתיבת פעולה משלך, או חיפוש במאגר. כל שאר הכלים מקופלים תחת 'כל הכלים'." },
    { t: "לשוניות", d: "מתחת: 'יצירת פעולה' למילוי הפרטים, 'השראה והצעות' לרעיונות, ו'השבוע שלי והודעות' לתזכורות והודעות מהשבט." },
    { t: "מה חדש", d: "בקישור 'מה חדש באתר' בתחתית אפשר לראות שדרוגים ולהגיב עליהם בלייק או דיסלייק." },
  ],
  write: [
    { t: "שלבים", d: "הפעולה בנויה משלבים: פתיחה, גוף, שיא וסיכום. מוסיפים ומסדרים אותם בכפתורים שמעל." },
    { t: "הצעות", d: "הכפתורים 'הצעות מתודה' ו'מה חסר' מציעים רעיונות לפי הכתוב. אין כאן בינה מלאכותית אלא כללים קבועים." },
    { t: "שמירה", d: "המסמך נשמר אוטומטית. מחיקה עוברת לסל המחזור ל-30 יום." },
    { t: "מוכנות", d: "'מוכנות להעברה' נותן ציון ואומר מה עוד חסר לפני הפעולה." },
  ],
};
/** 200: סיור מודרך (טקסט בלבד, בלי סרטון). */
export function TourButton({ kind }: { kind: "home" | "write" }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const steps = STEPS[kind];
  const s = steps[i];
  return (
    <>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => {
          setI(0);
          setOpen(true);
        }}
      >
        סיור קצר באתר
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`סיור קצר (${i + 1} מתוך ${steps.length})`}
        footer={
          <>
            <button type="button" className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
              הקודם
            </button>
            {i < steps.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)}>
                הבא
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                סיום
              </button>
            )}
          </>
        }
      >
        <h3>{s.t}</h3>
        <p>{s.d}</p>
      </Modal>
    </>
  );
}

export const WHATS_NEW: { v: number; title: string; items: { id: string; text: string }[] }[] = [
  {
    v: 28,
    title: "גרסה 28: סדר בדף הבית וכלים לעורך",
    items: [
      { id: "home-tabs", text: "דף בית מסודר: שלוש פעולות עיקריות ולשוניות במקום עמוד ארוך" },
      { id: "stations", text: "חישוב זמן לתחנות בעורך" },
      { id: "backup-plan", text: "תוכנית גיבוי לגשם, חום, חדר קטן וקבוצה גדולה" },
      { id: "readiness", text: "ציון מוכנות להעברה" },
      { id: "tribe-methods", text: "מתודות השבט שמנוהלות על ידי האדמין" },
      { id: "word-import", text: "ייבוא קובץ Word ישן לעורך" },
    ],
  },
  {
    v: 27,
    title: "גרסה 27: עורך הכתיבה",
    items: [
      { id: "trash", text: "סל מחזור ל-30 יום" },
      { id: "backup", text: "גיבוי ידני של הטיוטות" },
      { id: "shares", text: "קישורי שיתוף והערות" },
    ],
  },
];

/** 198 + 199. */
export function WhatsNewPage() {
  useEffect(() => storageSet(SEEN, String(LATEST_VERSION)), []);
  return (
    <div>
      {WHATS_NEW.map((r) => (
        <section key={r.v} className="card" aria-labelledby={`wn-${r.v}`}>
          <h2 id={`wn-${r.v}`} className="section-title">
            {r.title}
          </h2>
          <ul className="plain-list">
            {r.items.map((it) => (
              <li key={it.id}>
                <div>
                  <p>{it.text}</p>
                  <FeatureFeedback feature={it.id} label={it.text.slice(0, 30)} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
