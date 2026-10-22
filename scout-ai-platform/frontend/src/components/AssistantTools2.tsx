"use client";

// עוזר הכתיבה, כלים 71–80: למידת סגנון, הכלה, חבילת הורים, היסטוריה, לוח תכנון,
// כרטיסי תחנות, חוברת ומסלול צמיחה.
import Link from "next/link";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { API_URL, api, errorMessage } from "@/lib/api";
import { GRADES, STYLE_OPTIONS } from "@/lib/constants";
import { CloseBtn, todayPlus, useJson, type ToolsProps } from "./AssistantShared";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

const NeedLogin = ({ what }: { what: string }) => (
  <p className="warn-box">
    צריך להתחבר כדי {what}. <Link href="/account">להתחברות</Link>
  </p>
);

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
};

// ───────────── 71. למידת הסגנון שלי ─────────────

interface StyleRes {
  ok: boolean;
  reason?: string;
  traits?: string[];
  suggested?: Record<string, string>;
  current?: Record<string, string>;
  changes?: string[];
  signedIn?: boolean;
}
type OptKey = keyof typeof STYLE_OPTIONS;

export function StyleTool({ text, onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const { data, error } = useJson(() => api<StyleRes>("/api/assist/learn-style", { method: "POST", token, body: { text } }), []);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const label = (k: string, v: string) => (STYLE_OPTIONS[k as OptKey].options as Record<string, string>)[v] ?? v;
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/assist/learn-style", { method: "PUT", token, body: { text } });
      setSaved(true);
      toast("הסגנון נשמר בחשבון", { kind: "success" });
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy(false);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="הסגנון שלי"
      wide
      footer={
        <>
          <CloseBtn onClose={onClose} />
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !user || !data?.ok || saved}>
            {saved ? "נשמר" : "שמירה כסגנון שלי"}
          </button>
        </>
      }
    >
      {(error || err) && <p className="error-text" role="alert">{error || err}</p>}
      {data && !data.ok && <p className="warn-box">{data.reason}</p>}
      {data?.ok && (
        <>
          <p>כך נשמע הסגנון שלכם בטיוטה:</p>
          <ul className="tag-list" aria-label="מאפייני הסגנון">
            {data.traits?.map((t) => (
              <li key={t} className="pill pill-ok">
                {t}
              </li>
            ))}
          </ul>
          <h3>מה יישמר</h3>
          <ul className="plain-list">
            {(Object.keys(STYLE_OPTIONS) as OptKey[]).map((k) => (
              <li key={k}>
                <span>
                  <strong>{STYLE_OPTIONS[k].label}:</strong> {label(k, data.suggested?.[k] ?? "")}
                </span>
                {data.changes?.includes(k) ? <span className="pill pill-warn">ישתנה מהשמור</span> : <span className="pill pill-ok">זהה לשמור</span>}
              </li>
            ))}
          </ul>
          <p className="hint">הטיוטה עצמה נשמרת כדוגמת סגנון. מעתה &quot;המשך בקול שלי&quot; וניסוח מחדש (כשמוגדר מפתח מודל) ינסו להישמע כמוכם. ההערות החופשיות שכבר כתבתם בהגדרות הסגנון לא נמחקות.</p>
          {!user && <NeedLogin what="לשמור את הסגנון" />}
        </>
      )}
      {!data && !error && <p className="hint">קורא את הטיוטה...</p>}
    </Modal>
  );
}

// ───────────── 73. בדיקת הכלה ─────────────

interface InclRes {
  ok: boolean;
  checked: number;
  flags: { id: string; phrase: string; why: string; fix: string; line: string }[];
}

export function InclusionTool({ text, append, onClose }: ToolsProps) {
  const { data, error } = useJson(() => api<InclRes>("/api/assist/inclusion", { method: "POST", body: { text } }), []);
  const [added, setAdded] = useState<string[]>([]);
  return (
    <Modal
      open
      onClose={onClose}
      title="בדיקת הכלה"
      wide
      footer={
        <>
          <CloseBtn onClose={onClose} />
          {data && data.flags.length > 1 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const lines = data.flags.filter((f) => !added.includes(f.id));
                append(lines.map((f) => f.line).join("\n"));
                setAdded(data.flags.map((f) => f.id));
              }}
            >
              הוספת כל ההתאמות
            </button>
          )}
        </>
      }
    >
      {error && <p className="error-text" role="alert">{error}</p>}
      {data?.ok && <p className="ok-box">לא מצאתי בטיוטה דבר שעלול להוציא חניכים. הבדיקה לפי מילים, אז כדאי גם לחשוב על הקבוצה שלכם.</p>}
      {data && data.flags.length > 0 && (
        <ul className="plain-list">
          {data.flags.map((f) => (
            <li key={f.id}>
              <span>
                <strong>&quot;{f.phrase}&quot;</strong>
                <br />
                {f.why}
                <br />
                <span className="hint">הצעה: {f.fix}</span>
              </span>
              <button
                type="button"
                className="btn btn-small"
                disabled={added.includes(f.id)}
                onClick={() => {
                  append(f.line);
                  setAdded((a) => [...a, f.id]);
                }}
              >
                {added.includes(f.id) ? "נוספה" : "הוספת התאמה"}
                <span className="sr-only">: {f.phrase}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.flags.length > 0 && <p className="hint">שורת &quot;התאמה:&quot; לא נכנסת לשלבי הפעולה. היא מופיעה ב&quot;פרטים נוספים&quot; בייצוא.</p>}
    </Modal>
  );
}

// ───────────── 74. חבילת הורים ─────────────

interface ParentsRes {
  parents: string;
  kids: string;
  staff: string;
  bring: string[];
}

export function ParentsTool({ text, ageGroup, onClose }: ToolsProps) {
  const toast = useToast();
  const [date, setDate] = useState(todayPlus(7));
  const [time, setTime] = useState("18:00");
  const [place, setPlace] = useState("");
  const [res, setRes] = useState<ParentsRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const make = async () => {
    setBusy(true);
    setErr("");
    try {
      setRes(await api<ParentsRes>("/api/assist/parents", { method: "POST", body: { text, ...(ageGroup ? { ageGroup } : {}), date, time, place } }));
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy(false);
  };
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast("ההודעה הועתקה", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק. סמנו ידנית", { kind: "info" });
    }
  };
  const block = (id: string, title: string, body: string) => (
    <section key={id} aria-labelledby={`par-${id}`}>
      <h3 id={`par-${id}`}>{title}</h3>
      <p className="assist-text">{body}</p>
      <div className="actions">
        <button type="button" className="btn btn-small" onClick={() => copy(body)}>
          העתקה<span className="sr-only">: {title}</span>
        </button>
        <a className="btn btn-small" href={`https://wa.me/?text=${encodeURIComponent(body)}`} target="_blank" rel="noopener noreferrer">
          שליחה בווטסאפ<span className="sr-only">: {title}</span>
        </a>
      </div>
    </section>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="חבילת הורים והודעות"
      wide
      footer={
        <>
          <CloseBtn onClose={onClose} />
          <button type="button" className="btn btn-primary" onClick={make} disabled={busy || text.trim().length < 20}>
            {busy ? "מכין..." : "יצירת ההודעות"}
          </button>
        </>
      }
    >
      <div className="assist-settings">
        <Field label="תאריך הפעולה" htmlFor="par-date">
          <input id="par-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="שעה" htmlFor="par-time">
          <input id="par-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="מקום (לא חובה)" htmlFor="par-place">
          <input id="par-place" value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} />
        </Field>
      </div>
      {err && <p className="error-text" role="alert">{err}</p>}
      {res && (
        <div aria-live="polite">
          {block("kids", "הודעה לחניכים", res.kids)}
          {block("parents", "הודעה להורים (אחרי הפעולה)", res.parents)}
          {block("staff", "הודעה לצוות ההדרכה", res.staff)}
          <p className="hint">ההודעה להורים נכתבת כסיכום של פעולה שהתקיימה. אם שולחים אותה מראש, שנו את הפתיח.</p>
        </div>
      )}
    </Modal>
  );
}

// ───────────── 75. היסטוריית גרסאות ─────────────

interface VersionRow {
  id: number;
  savedAt: string;
  note: string;
  diff: { added: number; removed: number; wordsBefore: number; wordsAfter: number; addedSample: string[]; removedSample: string[] };
}

export function HistoryTool({ cloudId, setText, onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [view, setView] = useState<{ id: number; text: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!cloudId || !token) return;
    api<VersionRow[]>(`/api/assist/drafts/${cloudId}/versions`, { token })
      .then(setRows)
      .catch((e) => setErr(errorMessage(e)));
  }, [cloudId, token]);
  const show = async (id: number) => {
    try {
      setView(await api<{ id: number; text: string }>(`/api/assist/drafts/${cloudId}/versions/${id}`, { token }));
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const restore = async (id: number) => {
    if (!window.confirm("הנוסח הנוכחי יישמר כגרסה, והעורך יחזור לגרסה שבחרתם. להמשיך?")) return;
    setBusy(true);
    try {
      const r = await api<{ text: string }>(`/api/assist/drafts/${cloudId}/versions/${id}/restore`, { method: "POST", token, body: {} });
      setText(r.text);
      toast("הגרסה שוחזרה", { kind: "success" });
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title="היסטוריית גרסאות" wide footer={<CloseBtn onClose={onClose} />}>
      {!user && <NeedLogin what="לראות גרסאות קודמות" />}
      {user && !cloudId && <p className="warn-box">גרסאות נשמרות לטיוטות בענן. פתחו &quot;שיתוף לתגובות&quot; ושמרו את הטיוטה בענן, ובכל עדכון הנוסח הקודם יישמר.</p>}
      {err && <p className="error-text" role="alert">{err}</p>}
      {rows && rows.length === 0 && <p className="hint">עוד אין גרסאות קודמות. הן נוצרות כשמעדכנים טיוטה בענן ומשנים אותה.</p>}
      {rows && rows.length > 0 && (
        <ul className="plain-list">
          {rows.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{fmtDate(v.savedAt)}</strong> {v.note && <span className="hint">({v.note})</span>}
                <br />
                <span className="hint">
                  לעומת הנוכחית: {v.diff.removed} שורות שונו או נמחקו, {v.diff.added} שורות נוספו. {v.diff.wordsBefore} מילים אז, {v.diff.wordsAfter} עכשיו.
                </span>
              </span>
              <span className="actions">
                <button type="button" className="btn btn-small" onClick={() => show(v.id)}>
                  הצגה<span className="sr-only">: {fmtDate(v.savedAt)}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => restore(v.id)} disabled={busy}>
                  שחזור<span className="sr-only">: {fmtDate(v.savedAt)}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {view && (
        <section aria-labelledby="hist-view">
          <h3 id="hist-view">תוכן הגרסה</h3>
          <div tabIndex={0} role="region" aria-label="תוכן הגרסה שנבחרה" className="assist-diff">
            {view.text}
          </div>
        </section>
      )}
    </Modal>
  );
}

// ───────────── 76. הוספה ללוח התכנון ─────────────

const STATUS_LABEL: Record<string, string> = { planned: "מתוכננת", writing: "בכתיבה", ready: "מוכנה", done: "הופעלה" };
export { STATUS_LABEL };

const nextSunday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function BoardAddTool({ title, valueText, ageGroup, cloudId, score, onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const gradeFromAge = /כיתה (\S+) -/.exec(ageGroup)?.[1] ?? "ז'";
  const [grade, setGrade] = useState(gradeFromAge);
  const [week, setWeek] = useState(nextSunday());
  const [name, setName] = useState(title);
  const [value, setValue] = useState(valueText.replace(/^ש?ה?חניכים\s+(?:יבינו|ילמדו|ירגישו|יחוו|יכירו|יגלו)\s+ש?/, "").slice(0, 160));
  const [status, setStatus] = useState((score ?? 0) >= 85 ? "ready" : "writing");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    try {
      await api("/api/assist/board/cell", { method: "PUT", token, body: { grade, week, title: name, value, status, ...(cloudId ? { draftId: cloudId } : {}) } });
      setDone(true);
      toast("נוסף ללוח התכנון", { kind: "success" });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="הוספה ללוח התכנון"
      footer={
        done ? (
          <CloseBtn onClose={onClose} />
        ) : (
          <>
            <CloseBtn onClose={onClose} label="ביטול" />
            <button type="button" className="btn btn-primary" onClick={save} disabled={!user || name.trim().length < 2}>
              הוספה ללוח
            </button>
          </>
        )
      }
    >
      {!user && <NeedLogin what="להשתמש בלוח התכנון" />}
      {err && <p className="error-text" role="alert">{err}</p>}
      {done ? (
        <p className="ok-box" role="status">
          הפעולה נוספה לשבוע של {week}. <Link href="/assistant/board">לפתיחת הלוח</Link>
        </p>
      ) : (
        <div className="assist-settings">
          <Field label="שכבה" htmlFor="brd-grade">
            <select id="brd-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              {GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="תאריך בשבוע של הפעולה" htmlFor="brd-week">
            <input id="brd-week" type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
          </Field>
          <Field label="שם הפעולה" htmlFor="brd-title">
            <input id="brd-title" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="ערך" htmlFor="brd-value">
            <input id="brd-value" value={value} maxLength={160} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="מצב" htmlFor="brd-status">
            <select id="brd-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ───────────── 79. כרטיסי תחנות ─────────────

interface StationsRes {
  explicit: boolean;
  topic: string;
  rotation: string;
  cards: { n: number; title: string; task: string; minutes: number; safety: string }[];
}

export function StationsTool({ text, title, onClose }: ToolsProps) {
  const [count, setCount] = useState(4);
  const { data, error } = useJson(() => api<StationsRes>("/api/assist/stations", { method: "POST", body: { text, count } }), [count]);
  useEffect(() => () => document.body.classList.remove("printing-cards"), []);
  const printIt = () => {
    flushSync(() => document.body.classList.add("printing-cards"));
    const prev = document.title;
    document.title = `כרטיסי תחנות: ${title || "פעולה"}`;
    window.print();
    window.setTimeout(() => {
      document.body.classList.remove("printing-cards");
      document.title = prev;
    }, 500);
  };
  const cards = (d: StationsRes) =>
    d.cards.map((c) => (
      <div key={c.n} className="assist-card">
        <h3>{c.title}</h3>
        <p>{c.task}</p>
        <p className="hint">זמן בתחנה: {c.minutes} דקות</p>
        {c.safety && <p className="hint">בטיחות: {c.safety}</p>}
      </div>
    ));
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="כרטיסי תחנות"
        wide
        footer={
          <>
            <CloseBtn onClose={onClose} />
            <button type="button" className="btn btn-primary" onClick={printIt} disabled={!data}>
              הדפסה או PDF
            </button>
          </>
        }
      >
        {error && <p className="error-text" role="alert">{error}</p>}
        {data && (
          <>
            {data.explicit ? (
              <p className="ok-box">מצאתי בטיוטה {data.cards.length} תחנות שכתבתם, והפכתי אותן לכרטיסים.</p>
            ) : (
              <>
                <p className="hint">לא כתבתם תחנות בטיוטה (למשל &quot;תחנה 1: ...&quot;), אז הכנתי תחנות לדוגמה על &quot;{data.topic}&quot;. אפשר לכתוב תחנות משלכם ולחזור.</p>
                <Field label="כמה תחנות" htmlFor="st-count">
                  <select id="st-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <p>{data.rotation}</p>
            <div className="assist-cards">{cards(data)}</div>
          </>
        )}
      </Modal>
      {data && (
        <article className="assist-cards-print print-only" aria-hidden="true">
          <h1>כרטיסי תחנות: {title || "פעולה"}</h1>
          <p>{data.rotation}</p>
          <div className="assist-cards">{cards(data)}</div>
        </article>
      )}
    </>
  );
}

// ───────────── 78. חוברת ─────────────

interface DraftBrief {
  id: number;
  title: string;
  updatedAt: string;
}
interface ActBrief {
  id: number;
  title: string;
  ageGroup: string;
}

export function BookletTool({ ageGroup, onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [drafts, setDrafts] = useState<DraftBrief[]>([]);
  const [acts, setActs] = useState<ActBrief[]>([]);
  const [pickD, setPickD] = useState<number[]>([]);
  const [pickA, setPickA] = useState<number[]>([]);
  const [name, setName] = useState("חוברת הפעולות שלי");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!token) return;
    api<DraftBrief[]>("/api/assist/drafts", { token }).then(setDrafts).catch((e) => setErr(errorMessage(e)));
    api<ActBrief[]>("/api/me/activities", { token }).then(setActs).catch((e) => setErr(errorMessage(e)));
  }, [token]);
  const flip = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const download = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${API_URL}/api/assist/booklet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ draftIds: pickD, activityIds: pickA, title: name, ...(ageGroup ? { ageGroup } : {}) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message || "יצירת החוברת נכשלה");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "חוברת"}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast("החוברת ירדה", { kind: "success" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת החוברת נכשלה");
    }
    setBusy(false);
  };
  const total = pickD.length + pickA.length;
  return (
    <Modal
      open
      onClose={onClose}
      title="חוברת פעולות"
      wide
      footer={
        <>
          <CloseBtn onClose={onClose} />
          <button type="button" className="btn btn-primary" onClick={download} disabled={busy || total === 0 || !user}>
            {busy ? "מכין..." : `הורדת חוברת Word (${total})`}
          </button>
        </>
      }
    >
      {!user && <NeedLogin what="להכין חוברת" />}
      {err && <p className="error-text" role="alert">{err}</p>}
      <Field label="שם החוברת" htmlFor="bk-name">
        <input id="bk-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </Field>
      <fieldset className="assist-dry">
        <legend>טיוטות בענן</legend>
        {drafts.length === 0 && <p className="hint">אין טיוטות בענן. שמרו טיוטה דרך &quot;שיתוף לתגובות&quot;.</p>}
        {drafts.map((d) => (
          <label key={d.id} className="assist-check">
            <input type="checkbox" checked={pickD.includes(d.id)} onChange={() => setPickD((l) => flip(l, d.id))} />
            <span>{d.title}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="assist-dry">
        <legend>פעולות שכתבתם במאגר</legend>
        {acts.length === 0 && <p className="hint">עוד אין פעולות שלכם במאגר.</p>}
        {acts.map((a) => (
          <label key={a.id} className="assist-check">
            <input type="checkbox" checked={pickA.includes(a.id)} onChange={() => setPickA((l) => flip(l, a.id))} />
            <span>
              {a.title} <span className="hint">({a.ageGroup})</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="hint">החוברת כוללת שער, תוכן עניינים, ועמוד לכל פעולה בפורמט ה-Word של השבט. טיוטה שעדיין חסרים בה שלבים תיכלל עם &quot;שלב להשלמה&quot;.</p>
    </Modal>
  );
}

// ───────────── 80. מסלול צמיחה ─────────────

interface Growth {
  points: number;
  max: number;
  level: string;
  nextLevel: { name: string; pointsNeeded: number } | null;
  milestones: { id: string; label: string; hint: string; points: number; done: boolean }[];
  next: { label: string; hint: string } | null;
  tryMethods: string[];
}

export function GrowthTool({ onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const { data, error } = useJson(() => (token ? api<Growth>("/api/assist/growth", { token }) : new Promise<Growth>(() => {})), [token]);
  return (
    <Modal open onClose={onClose} title="המסלול שלי כמדריך" wide footer={<CloseBtn onClose={onClose} />}>
      {!user && <NeedLogin what="לראות את המסלול" />}
      {error && <p className="error-text" role="alert">{error}</p>}
      {data && (
        <>
          <p>
            <strong>{data.level}</strong> · {data.points} מתוך {data.max} נקודות
            {data.nextLevel ? ` · עוד ${data.nextLevel.pointsNeeded} נקודות עד "${data.nextLevel.name}"` : " · הגעתם לרמה הגבוהה"}
          </p>
          <div className="assist-progress" role="progressbar" aria-valuemin={0} aria-valuemax={data.max} aria-valuenow={data.points} aria-label="נקודות במסלול">
            <span style={{ width: `${Math.round((data.points / data.max) * 100)}%` }} />
          </div>
          {data.next && (
            <p className="ok-box">
              הצעד הבא: <strong>{data.next.label}</strong>. {data.next.hint}
            </p>
          )}
          <div tabIndex={0} role="region" aria-label="אבני דרך" className="assist-scroll">
          <ul className="plain-list">
            {data.milestones.map((m) => (
              <li key={m.id}>
                <span>
                  {m.label} <span className="hint">({m.points} נקודות)</span>
                </span>
                <span className={m.done ? "pill pill-ok" : "pill"}>{m.done ? "הושלם" : "עוד לא"}</span>
              </li>
            ))}
          </ul>
          </div>
          {data.tryMethods.length > 0 && <p>שיטות שעוד לא ניסיתם: {data.tryMethods.join(", ")}.</p>}
          <p className="hint">הנקודות נספרות לפי מה שנשמר בחשבון שלכם באתר: פעולות, תיעודים, תגובות על טיוטות ושיטות. זה לא ציון על איכות.</p>
        </>
      )}
    </Modal>
  );
}
