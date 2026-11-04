"use client";

// עוזר הכתיבה, כלים 61–70: החלפת שיטה, השראה מהמאגר, תבניות, ציוד מול הארון,
// תסריט למדריך, הוספה ליומן, שיתוף לתגובות, הערות אחרי פעולה ופרופיל קבוצה.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, errorMessage, storageGet } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { CloseBtn, todayPlus, useJson, type Profile, type ToolId, type ToolRequest, type ToolsProps } from "./AssistantShared";
import { BoardAddTool, BookletTool, GrowthTool, HistoryTool, InclusionTool, ParentsTool, StationsTool, StyleTool } from "./AssistantTools2";
import { Field, Modal } from "./ui";

export type { Profile, ToolId, ToolRequest, ToolsProps };

interface Group extends Profile {
  id: number;
}
interface Trait {
  id: string;
  label: string;
}

const STAGES = ["פתיחה", "ציר זמן/משחק", "זמן צופיות מעשי", "דיון", "סיכום"];
type SpeechRec = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const getSpeech = (): (new () => SpeechRec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function AssistantTools(p: ToolsProps) {
  if (!p.tool) return null;
  switch (p.tool.id) {
    case "swap":
      return <SwapTool {...p} method={p.tool.method ?? ""} />;
    case "inspire":
      return <InspireTool {...p} />;
    case "templates":
      return <TemplatesTool {...p} />;
    case "gear":
      return <GearTool {...p} />;
    case "script":
      return <ScriptTool {...p} />;
    case "schedule":
      return <ScheduleTool {...p} />;
    case "share":
      return <ShareTool {...p} />;
    case "reflect":
      return <ReflectTool {...p} />;
    case "group":
      return <GroupTool {...p} />;
    case "style":
      return <StyleTool {...p} />;
    case "inclusion":
      return <InclusionTool {...p} />;
    case "parents":
      return <ParentsTool {...p} />;
    case "history":
      return <HistoryTool {...p} />;
    case "board":
      return <BoardAddTool {...p} />;
    case "stations":
      return <StationsTool {...p} />;
    case "booklet":
      return <BookletTool {...p} />;
    case "growth":
      return <GrowthTool {...p} />;
  }
}

// ───────────── 61. החלפת שיטה ─────────────

interface SwapRes {
  method: string;
  found: boolean;
  stage: string | null;
  current: string;
  alternatives: { name: string; why: string; already: boolean; example: string; text: string; sentence: string }[];
}

function SwapTool({ text, edit, append, onClose, method }: ToolsProps & { method: string }) {
  const toast = useToast();
  const { data, error } = useJson(() => api<SwapRes>("/api/assist/swap", { method: "POST", body: { text, method } }), [method]);
  const canReplace = !!data?.current && text.includes(data.current);
  return (
    <Modal open onClose={onClose} title={`החלפת השיטה "${method}"`} wide footer={<CloseBtn onClose={onClose} />}>
      {error && <p className="error-text" role="alert">{error}</p>}
      {!data && !error && <p className="hint">בודק...</p>}
      {data && (
        <>
          {data.found ? (
            <p>
              השיטה מופיעה בשלב &quot;{data.stage}&quot;: <q>{data.current}</q>
            </p>
          ) : (
            <p className="hint">לא מצאתי את המשפט המדויק, אז אפשר רק להוסיף שורה חדשה.</p>
          )}
          <ul className="plain-list">
            {data.alternatives.map((alt) => (
              <li key={alt.name}>
                <span>
                  <strong>{alt.name}</strong>
                  {alt.already ? <span className="hint"> (כבר מופיעה בטיוטה)</span> : null}
                  <br />
                  {alt.why}
                  <br />
                  <span className="hint">{alt.sentence}</span>
                </span>
                <span className="actions">
                  {canReplace && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        edit((cur) => cur.replace(data.current, alt.sentence));
                        toast("המשפט הוחלף. אפשר לבטל בכפתור ביטול השינוי האחרון", { kind: "success" });
                        onClose();
                      }}
                    >
                      החלפת המשפט<span className="sr-only">: {alt.name}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      append(alt.text);
                      onClose();
                    }}
                  >
                    הוספה כשורה<span className="sr-only">: {alt.name}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

// ───────────── 63. השראה מהמאגר ─────────────

interface InspireRes {
  stage: string;
  stageIndex: number;
  header: string;
  items: { id: number; title: string; ageGroup: string; durationMin: number; minutes: number; excerpt: string; why: string }[];
}
const HEADERS = ["פתיחה", "משחק", "זמן צופיות מעשי", "דיון", "סיכום"];

function InspireTool({ text, append, onClose }: ToolsProps) {
  const [stage, setStage] = useState<number | undefined>(undefined);
  const { data, error } = useJson(() => api<InspireRes>("/api/assist/inspire", { method: "POST", body: { text, ...(stage !== undefined ? { stage } : {}) } }), [stage]);
  return (
    <Modal open onClose={onClose} title="השראה מהמאגר" wide footer={<CloseBtn onClose={onClose} />}>
      <Field label="לאיזה שלב מחפשים רעיון" htmlFor="insp-stage">
        <select id="insp-stage" value={stage ?? data?.stageIndex ?? 1} onChange={(e) => setStage(Number(e.target.value))}>
          {STAGES.map((s, i) => (
            <option key={s} value={i}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="error-text" role="alert">{error}</p>}
      {data && data.items.length === 0 && <p className="hint">לא מצאתי במאגר פעולות דומות לשלב הזה. נסו שלב אחר, או הוסיפו כותרת וערך לטיוטה.</p>}
      {data && data.items.length > 0 && (
        <ul className="plain-list" aria-live="polite">
          {data.items.map((it) => (
            <li key={it.id}>
              <span>
                <strong>{it.title}</strong> <span className="pill">{it.why}</span>
                <br />
                {it.excerpt}
                <br />
                <Link href={`/library/${it.id}`} className="hint">
                  לפתיחת הפעולה המלאה<span className="sr-only">: {it.title}</span>
                </Link>
              </span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  append(`${HEADERS[data.stageIndex]}: ${it.excerpt}`);
                  onClose();
                }}
              >
                הוספה לטיוטה<span className="sr-only">: {it.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">מה שמוסיפים הוא נקודת מוצא. כדאי לשנות אותו לקבוצה ולקול שלכם, ולציין את הפעולה המקורית אם משתמשים בו כמעט כמו שהוא.</p>
    </Modal>
  );
}

// ───────────── 65. תבניות ─────────────

interface Template {
  id: string;
  title: string;
  description: string;
  minutes: number;
  text: string;
}

function TemplatesTool({ text, setText, onClose }: ToolsProps) {
  const toast = useToast();
  const { data, error } = useJson(() => api<Template[]>("/api/assist/templates"), []);
  const [pick, setPick] = useState("classic");
  const [topic, setTopic] = useState("");
  const [value, setValue] = useState("");
  const use = () => {
    const t = data?.find((x) => x.id === pick);
    if (!t) return;
    if (text.trim() && !window.confirm("הטיוטה הנוכחית תוחלף בתבנית. להמשיך?")) return;
    let out = t.text;
    if (topic.trim()) out = out.replace(/\[נושא\]/g, topic.trim());
    if (value.trim()) out = out.replace(/\[ערך\]/g, value.trim());
    setText(out);
    toast("התבנית נטענה. מלאו את מה שנשאר בסוגריים מרובעים", { kind: "success" });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="תבניות להתחלה"
      wide
      footer={
        <>
          <CloseBtn onClose={onClose} label="ביטול" />
          <button type="button" className="btn btn-primary" onClick={use} disabled={!data}>
            שימוש בתבנית
          </button>
        </>
      }
    >
      {error && <p className="error-text" role="alert">{error}</p>}
      {data && (
        <fieldset className="assist-dry">
          <legend>בחרו תבנית</legend>
          {data.map((t) => (
            <label key={t.id} className="assist-check">
              <input type="radio" name="tpl" checked={pick === t.id} onChange={() => setPick(t.id)} />
              <span>
                <strong>{t.title}</strong> <span className="pill">{t.minutes} דקות</span>
                <br />
                <span className="hint">{t.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="assist-settings">
        <Field label="נושא הפעולה (לא חובה)" htmlFor="tpl-topic">
          <input id="tpl-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="למשל: אחריות" />
        </Field>
        <Field label="הערך כמשפט (לא חובה)" htmlFor="tpl-value" hint="למשל: אחריות היא בחירה">
          <input id="tpl-value" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ───────────── 66. ציוד מול הארון ─────────────

interface GearRes {
  listedLine: string;
  listed: { text: string; optional: boolean; covered: boolean }[];
  inferred: { id: string; label: string; evidence: string; covered: boolean }[];
  missing: string[];
  cupboardKnown: boolean;
  suggestedLine: string;
}

function GearTool({ text, edit, onClose }: ToolsProps) {
  const toast = useToast();
  const cup = useRef<{ have: string[]; extra: string }>({ have: [], extra: "" });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(storageGet("scout.cupboard") ?? "null");
      if (s && Array.isArray(s.have)) cup.current = { have: s.have.filter((x: unknown) => typeof x === "string"), extra: typeof s.extra === "string" ? s.extra.slice(0, 200) : "" };
    } catch {
      /* ארון ריק */
    }
    setReady(true);
  }, []);
  const { data, error } = useJson(() => (ready ? api<GearRes>("/api/assist/gear", { method: "POST", body: { text, ...cup.current } }) : new Promise<GearRes>(() => {})), [ready]);
  const apply = () => {
    if (!data?.suggestedLine) return;
    edit((cur) => {
      if (/^ה?ציוד\s*[:\-–].*$/m.test(cur)) return cur.replace(/^ה?ציוד\s*[:\-–].*$/m, data.suggestedLine);
      const i = cur.indexOf("\n");
      return i < 0 ? `${cur}\n${data.suggestedLine}` : `${cur.slice(0, i)}\n${data.suggestedLine}${cur.slice(i)}`;
    });
    toast("שורת הציוד עודכנה", { kind: "success" });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="ציוד מול הארון"
      wide
      footer={
        <>
          <CloseBtn onClose={onClose} />
          <button type="button" className="btn btn-primary" onClick={apply} disabled={!data?.suggestedLine}>
            עדכון שורת הציוד בטיוטה
          </button>
        </>
      }
    >
      {error && <p className="error-text" role="alert">{error}</p>}
      {data && (
        <>
          {!data.cupboardKnown && (
            <p className="warn-box">
              עוד לא סימנתם מה יש בארון. <Link href="/cupboard">לסימון הארון</Link> ואז אפשר לראות מה חסר.
            </p>
          )}
          <h3>מה כתבתם</h3>
          {data.listed.length === 0 ? (
            <p className="hint">אין שורת &quot;ציוד:&quot; בטיוטה.</p>
          ) : (
            <ul className="plain-list">
              {data.listed.map((i) => (
                <li key={i.text}>
                  <span>{i.text}{i.optional ? " (לא חובה)" : ""}</span>
                  {data.cupboardKnown && <span className={i.covered ? "pill pill-ok" : "pill pill-warn"}>{i.covered ? "יש בארון" : "חסר"}</span>}
                </li>
              ))}
            </ul>
          )}
          <h3>מה נזכר בפעולה ולא נכתב</h3>
          {data.inferred.length === 0 ? (
            <p className="hint">לא מצאתי ציוד נוסף בגוף הפעולה.</p>
          ) : (
            <ul className="plain-list">
              {data.inferred.map((i) => (
                <li key={i.id}>
                  <span>
                    {i.label} <span className="hint">(בגלל המילה &quot;{i.evidence}&quot;)</span>
                  </span>
                  {data.cupboardKnown && <span className={i.covered ? "pill pill-ok" : "pill pill-warn"}>{i.covered ? "יש בארון" : "חסר"}</span>}
                </li>
              ))}
            </ul>
          )}
          {data.cupboardKnown && data.missing.length > 0 && (
            <p className="warn-box" role="status">
              צריך להשיג: {data.missing.join(", ")}
            </p>
          )}
          {data.cupboardKnown && data.missing.length === 0 && <p className="ok-box">כל מה שצריך קיים בארון.</p>}
          {data.suggestedLine && <p className="hint">השורה שתיכנס: {data.suggestedLine}</p>}
          <p className="hint">הזיהוי לפי מילים, אז כדאי לעבור על הרשימה לפני שמעדכנים.</p>
        </>
      )}
    </Modal>
  );
}

// ───────────── 68. תסריט למדריך ─────────────

interface ScriptRes {
  title: string;
  totalMinutes: number;
  equipment: string;
  safety: string;
  planB: string[];
  steps: { stage: string; from: number; to: number; say: string[]; do: string[]; ask: string[]; watch: string[]; transition: string }[];
}

function ScriptTool({ text, onClose }: ToolsProps) {
  const { data, error } = useJson(() => api<ScriptRes>("/api/assist/script", { method: "POST", body: { text } }), []);
  const printIt = () => {
    flushSync(() => document.body.classList.add("printing-script"));
    const prev = document.title;
    document.title = `תסריט: ${data?.title || "פעולה"}`;
    window.print();
    window.setTimeout(() => {
      document.body.classList.remove("printing-script");
      document.title = prev;
    }, 500);
  };
  useEffect(() => () => document.body.classList.remove("printing-script"), []);
  const body = (d: ScriptRes) => (
    <>
      {d.steps.map((s) => (
        <section key={s.stage} className="assist-script-step">
          <h3>
            דקה {s.from} עד {s.to}: {s.stage}
          </h3>
          <p>
            <strong>אומרים:</strong> {s.say.join(" ")}
          </p>
          {s.do.length > 0 && (
            <>
              <strong>עושים:</strong>
              <ul>{s.do.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
          {s.ask.length > 0 && (
            <>
              <strong>שואלים:</strong>
              <ul>{s.ask.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
          <p>
            <strong>שימו לב:</strong> {s.watch.join(" ")}
          </p>
          <p>
            <strong>מעבר:</strong> {s.transition}
          </p>
        </section>
      ))}
      {d.planB.length > 0 && (
        <section>
          <h3>תוכניות ב&apos;</h3>
          <ul>{d.planB.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}
    </>
  );
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="תסריט למדריך"
        wide
        footer={
          <>
            <CloseBtn onClose={onClose} />
            <button type="button" className="btn btn-primary" onClick={printIt} disabled={!data || data.steps.length === 0}>
              הדפסה או PDF
            </button>
          </>
        }
      >
        {error && <p className="error-text" role="alert">{error}</p>}
        {data && data.steps.length === 0 && <p className="hint">עוד אין שלבים כתובים להפוך לתסריט.</p>}
        {data && data.steps.length > 0 && (
          <>
            <div tabIndex={0} role="region" aria-label="התסריט המלא">
              <p className="hint">
                {data.totalMinutes} דקות{data.equipment ? ` · ציוד: ${data.equipment}` : ""}
              </p>
              {body(data)}
            </div>
          </>
        )}
      </Modal>
      {data && data.steps.length > 0 && (
        <article className="assist-script-print print-only" aria-hidden="true">
          <h1>תסריט: {data.title || "פעולה"}</h1>
          <p>
            {data.totalMinutes} דקות{data.equipment ? ` · ציוד: ${data.equipment}` : ""}
            {data.safety ? ` · בטיחות: ${data.safety}` : ""}
          </p>
          {body(data)}
        </article>
      )}
    </>
  );
}

// ───────────── 67. הוספה ליומן ─────────────

function ScheduleTool({ text, profile, onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(todayPlus(7));
  const [time, setTime] = useState("18:00");
  const [group, setGroup] = useState(profile?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ prep: string[]; note: string } | null>(null);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ prep: string[]; note: string }>("/api/assist/schedule", { method: "POST", token, body: { text, date, time, groupLabel: group } });
      setDone(r);
      toast("הפעולה נוספה ליומן", { kind: "success" });
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="הוספה ליומן"
      footer={
        done ? (
          <CloseBtn onClose={onClose} />
        ) : (
          <>
            <CloseBtn onClose={onClose} label="ביטול" />
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !user}>
              {busy ? "שומר..." : "הוספה ליומן"}
            </button>
          </>
        )
      }
    >
      {!user && (
        <p className="warn-box">
          צריך להתחבר כדי להשתמש ביומן. <Link href="/account">להתחברות</Link>
        </p>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
      {done ? (
        <>
          <p className="ok-box" role="status">
            נוספה ליומן, עם תזכורת יומיים לפני. <Link href="/calendar">לפתיחת היומן</Link>
          </p>
          {done.prep.length > 0 && (
            <>
              <h3>מה עוד כדאי להשלים לפני הפעולה</h3>
              <ul>{done.prep.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
        </>
      ) : (
        <div className="assist-settings">
          <Field label="תאריך" htmlFor="sch-date">
            <input id="sch-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="שעה" htmlFor="sch-time">
            <input id="sch-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="קבוצה (לא חובה)" htmlFor="sch-group">
            <input id="sch-group" value={group} maxLength={60} onChange={(e) => setGroup(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ───────────── 64. שיתוף לתגובות ─────────────

interface DraftFull {
  id: number;
  title: string;
  shareToken: string | null;
  comments: { id: number; authorName: string; quote: string; body: string; resolved: boolean; createdAt: string }[];
}
interface DraftBrief {
  id: number;
  title: string;
  updatedAt: string;
  shared: boolean;
  openComments: number;
}

function ShareTool({ text, setText, ageGroup, cloudId, setCloudId, onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [full, setFull] = useState<DraftFull | null>(null);
  const [list, setList] = useState<DraftBrief[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const link = full?.shareToken && typeof window !== "undefined" ? `${window.location.origin}/assistant/shared?t=${full.shareToken}` : "";

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setList(await api<DraftBrief[]>("/api/assist/drafts", { token }));
      if (cloudId) setFull(await api<DraftFull>(`/api/assist/drafts/${cloudId}`, { token }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [token, cloudId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };
  const saveCloud = () =>
    run(async () => {
      const d = await api<{ id: number }>("/api/assist/drafts", { method: "POST", token, body: { ...(cloudId ? { id: cloudId } : {}), text, ...(ageGroup ? { ageGroup } : {}) } });
      setCloudId(d.id);
      toast("הטיוטה נשמרה בענן", { kind: "success" });
      setFull(await api<DraftFull>(`/api/assist/drafts/${d.id}`, { token }));
      setList(await api<DraftBrief[]>("/api/assist/drafts", { token }));
    });
  const toggleShare = (enable: boolean) =>
    run(async () => {
      if (!cloudId) return;
      await api(`/api/assist/drafts/${cloudId}/share`, { method: "POST", token, body: { enable } });
      setFull(await api<DraftFull>(`/api/assist/drafts/${cloudId}`, { token }));
    });
  const resolve = (id: number, resolved: boolean) =>
    run(async () => {
      await api(`/api/assist/comments/${id}`, { method: "PATCH", token, body: { resolved } });
      if (cloudId) setFull(await api<DraftFull>(`/api/assist/drafts/${cloudId}`, { token }));
    });
  const open = (id: number) =>
    run(async () => {
      const d = await api<{ id: number; text: string }>(`/api/assist/drafts/${id}`, { token });
      if (text.trim() && !window.confirm("הטיוטה הנוכחית תוחלף. להמשיך?")) return;
      setText(d.text);
      setCloudId(d.id);
      onClose();
    });
  const remove = (id: number) =>
    run(async () => {
      if (!window.confirm("למחוק את הטיוטה מהענן, כולל התגובות?")) return;
      await api(`/api/assist/drafts/${id}`, { method: "DELETE", token });
      if (cloudId === id) {
        setCloudId(null);
        setFull(null);
      }
      setList(await api<DraftBrief[]>("/api/assist/drafts", { token }));
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("הקישור הועתק", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק. סמנו את הקישור ידנית", { kind: "info" });
    }
  };

  return (
    <Modal open onClose={onClose} title="שיתוף לתגובות" wide footer={<CloseBtn onClose={onClose} />}>
      {!user ? (
        <p className="warn-box">
          צריך להתחבר כדי לשמור טיוטה בענן ולשתף אותה. <Link href="/account">להתחברות</Link>
        </p>
      ) : (
        <>
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={saveCloud} disabled={busy || text.trim().length < 1}>
              {cloudId ? "עדכון הטיוטה בענן" : "שמירת הטיוטה בענן"}
            </button>
            {cloudId && !full?.shareToken && (
              <button type="button" className="btn" onClick={() => toggleShare(true)} disabled={busy}>
                יצירת קישור לשיתוף
              </button>
            )}
            {full?.shareToken && (
              <button type="button" className="btn" onClick={() => toggleShare(false)} disabled={busy}>
                ביטול השיתוף
              </button>
            )}
          </div>
          {full?.shareToken && (
            <div>
              <label htmlFor="share-link">קישור לשיתוף (כל מי שיש לו אותו יכול לקרוא ולהגיב, לא לערוך)</label>
              <div className="actions">
                <input id="share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: "14rem" }} />
                <button type="button" className="btn btn-small" onClick={copy}>
                  העתקה
                </button>
              </div>
              <p className="hint">הטיוטה בענן היא עותק שנשמר ברגע השמירה. אחרי שינויים לחצו &quot;עדכון הטיוטה בענן&quot;.</p>
            </div>
          )}
          {full && (
            <>
              <h3>תגובות ({full.comments.filter((c) => !c.resolved).length} פתוחות)</h3>
              {full.comments.length === 0 ? (
                <p className="hint">עוד אין תגובות.</p>
              ) : (
                <ul className="plain-list">
                  {full.comments.map((c) => (
                    <li key={c.id}>
                      <span>
                        <strong>{c.authorName}</strong>
                        {c.quote && (
                          <>
                            {" "}
                            על <q>{c.quote}</q>
                          </>
                        )}
                        <br />
                        {c.body}
                        {c.resolved && <span className="pill pill-ok"> טופל</span>}
                      </span>
                      <button type="button" className="btn btn-small" onClick={() => resolve(c.id, !c.resolved)} disabled={busy}>
                        {c.resolved ? "פתיחה מחדש" : "סימון כטופל"}
                        <span className="sr-only">: {c.authorName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="btn btn-small" onClick={refresh}>
                רענון תגובות
              </button>
            </>
          )}
          <h3>הטיוטות שלי בענן</h3>
          {list.length === 0 ? (
            <p className="hint">עוד לא שמרתם טיוטה בענן.</p>
          ) : (
            <ul className="plain-list">
              {list.map((d) => (
                <li key={d.id}>
                  <span>
                    <strong>{d.title}</strong>
                    {d.shared ? <span className="pill"> משותפת</span> : null}
                    {d.openComments > 0 ? <span className="pill pill-warn"> {d.openComments} תגובות פתוחות</span> : null}
                  </span>
                  <span className="actions">
                    <button type="button" className="btn btn-small" onClick={() => open(d.id)} disabled={busy}>
                      פתיחה<span className="sr-only">: {d.title}</span>
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => remove(d.id)} disabled={busy}>
                      מחיקה<span className="sr-only">: {d.title}</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

// ───────────── 69. אחרי הפעולה ─────────────

interface Reflect {
  worked: string[];
  change: string[];
  timing: string[];
  group: string[];
  ideas: string[];
  other: string[];
  draftTips: string[];
}
const BUCKETS: [keyof Omit<Reflect, "draftTips">, string][] = [
  ["worked", "מה עבד"],
  ["change", "מה לשנות"],
  ["timing", "זמנים"],
  ["group", "הקבוצה"],
  ["ideas", "רעיונות"],
  ["other", "אחר"],
];

function ReflectTool({ cloudId, activityId, profile, onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [res, setRes] = useState<Reflect | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  useEffect(() => setSpeechOk(!!getSpeech()), []);
  useEffect(() => () => rec.current?.stop(), []);

  const dictate = () => {
    if (listening) return rec.current?.stop();
    const Ctor = getSpeech();
    if (!Ctor) return toast("הדפדפן הזה לא תומך בהכתבה", { kind: "info" });
    const r = new Ctor();
    r.lang = "he-IL";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add.trim()) setNote((cur) => (cur ? cur.replace(/\s+$/, "") + " " : "") + add.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      toast("ההכתבה נעצרה. בדקו הרשאת מיקרופון", { kind: "error" });
    };
    rec.current = r;
    r.start();
    setListening(true);
  };

  const parse = async () => {
    setBusy(true);
    try {
      setRes(await api<Reflect>("/api/assist/reflect", { method: "POST", body: { text: note } }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ linkedToActivity: boolean }>("/api/assist/reflections", {
        method: "POST",
        token,
        body: { text: note, ...(cloudId ? { draftId: cloudId } : {}), ...(activityId ? { activityId } : {}), ...(profile?.name ? { groupLabel: profile.name } : {}) },
      });
      setSaved(r.linkedToActivity);
      toast("ההערות נשמרו", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="אחרי הפעולה"
      wide
      footer={
        <>
          <CloseBtn onClose={onClose} />
          <button type="button" className="btn" onClick={parse} disabled={busy || note.trim().length < 5}>
            סידור ההערות
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !user || note.trim().length < 5}>
            שמירה
          </button>
        </>
      }
    >
      <p>ספרו במילים שלכם איך הלך: מה עבד, מה לא, כמה זמן לקח. אפשר גם להכתיב.</p>
      <label htmlFor="reflect-note" className="sr-only">
        הערות אחרי הפעולה
      </label>
      <textarea id="reflect-note" className="assist-textarea" rows={7} value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: המשחק לקח יותר זמן ממה שתכננתי. החניכים אהבו את התחנות. בפעם הבאה אקצר את הפתיחה." />
      <div className="actions">
        <button type="button" className="btn" onClick={dictate} aria-pressed={listening} disabled={!speechOk} title={speechOk ? undefined : "הדפדפן לא תומך בהכתבה"}>
          {listening ? "עצירת הכתבה" : "הכתבה בקול"}
        </button>
      </div>
      {!user && (
        <p className="hint">
          לשמירה צריך <Link href="/account">להתחבר</Link>. אפשר לסדר את ההערות גם בלי חשבון.
        </p>
      )}
      {saved !== null && (
        <p className="ok-box" role="status">
          נשמר{saved ? ", והוא מופיע גם בסבבי ההפעלה של הפעולה במאגר" : activityId ? "" : ". כדי לצרף את ההערות לפעולה במאגר, שמרו קודם את הטיוטה במאגר"}.
        </p>
      )}
      {res && (
        <div aria-live="polite">
          {BUCKETS.map(([k, label]) =>
            res[k].length > 0 ? (
              <section key={k}>
                <h3>{label}</h3>
                <ul>{res[k].map((x) => <li key={x}>{x}</li>)}</ul>
              </section>
            ) : null,
          )}
          {res.draftTips.length > 0 && (
            <section>
              <h3>מה כדאי לשנות בטיוטה</h3>
              <ul className="assist-nudges">{res.draftTips.map((x) => <li key={x}>{x}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

// ───────────── 70. הקבוצה שלי ─────────────

function GroupTool({ profile, setProfile, onClose }: ToolsProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const traits = useJson(() => api<Trait[]>("/api/assist/traits"), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState(profile?.name ?? "");
  const [size, setSize] = useState(profile?.size ? String(profile.size) : "");
  const [chosen, setChosen] = useState<string[]>(profile?.traits ?? []);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setGroups(await api<Group[]>("/api/me/assist-groups", { token }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  const current = (): Profile => ({ name: name.trim(), size: size ? Math.max(1, Math.min(200, Number(size) || 0)) || null : null, traits: chosen });
  const use = (p: Profile) => {
    setProfile(p);
    toast(`הטיוטה נבדקת מול "${p.name || "הקבוצה"}"`, { kind: "success" });
    onClose();
  };
  const saveGroup = async () => {
    const p = current();
    if (p.name.length < 2) return setError("כתבו שם לקבוצה");
    setError("");
    try {
      if (user && token) {
        const body = { name: p.name, size: p.size, traits: p.traits };
        if (editId) await api(`/api/me/assist-groups/${editId}`, { method: "PUT", token, body });
        else await api("/api/me/assist-groups", { method: "POST", token, body });
        await load();
        setEditId(null);
        toast("הקבוצה נשמרה בחשבון", { kind: "success" });
      }
      setProfile(p);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const removeGroup = async (id: number) => {
    if (!window.confirm("למחוק את הקבוצה?")) return;
    try {
      await api(`/api/me/assist-groups/${id}`, { method: "DELETE", token });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <Modal
      open
      onClose={onClose}
      title="הקבוצה שלי"
      wide
      footer={
        <>
          <CloseBtn onClose={onClose} label="ביטול" />
          {profile && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setProfile(null);
                onClose();
              }}
            >
              בלי פרופיל
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => use(current())}>
            בדיקה מול הפרופיל
          </button>
        </>
      }
    >
      {error && <p className="error-text" role="alert">{error}</p>}
      {user && groups.length > 0 && (
        <>
          <h3>הקבוצות שלי</h3>
          <ul className="plain-list">
            {groups.map((g) => (
              <li key={g.id}>
                <span>
                  <strong>{g.name}</strong>
                  <span className="hint"> {g.size ? `· ${g.size} חניכים ` : ""}· {g.traits.length} מאפיינים</span>
                </span>
                <span className="actions">
                  <button type="button" className="btn btn-small" onClick={() => use(g)}>
                    בחירה<span className="sr-only">: {g.name}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      setEditId(g.id);
                      setName(g.name);
                      setSize(g.size ? String(g.size) : "");
                      setChosen(g.traits);
                    }}
                  >
                    עריכה<span className="sr-only">: {g.name}</span>
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => removeGroup(g.id)}>
                    מחיקה<span className="sr-only">: {g.name}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>{editId ? "עריכת קבוצה" : "פרופיל קבוצה"}</h3>
      <div className="assist-settings">
        <Field label="שם הקבוצה" htmlFor="grp-name">
          <input id="grp-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="למשל: שכבה ז׳" />
        </Field>
        <Field label="כמה חניכים מגיעים בדרך כלל" htmlFor="grp-size">
          <input id="grp-size" type="number" min={1} max={200} value={size} onChange={(e) => setSize(e.target.value)} />
        </Field>
      </div>
      <fieldset className="assist-dry">
        <legend>איך הקבוצה בדרך כלל</legend>
        {(traits.data ?? []).map((t) => (
          <label key={t.id} className="assist-check">
            <input type="checkbox" checked={chosen.includes(t.id)} onChange={() => toggle(t.id)} />
            <span>{t.label}</span>
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button type="button" className="btn" onClick={saveGroup}>
          {user ? (editId ? "שמירת השינויים" : "שמירה בחשבון") : "החלה בלי שמירה"}
        </button>
      </div>
      {!user && <p className="hint">בלי חשבון הפרופיל נשמר רק במכשיר הזה.</p>}
      <p className="hint">הפרופיל לא נשלח לאף אחד. הוא רק משנה את ההערות שהעוזר נותן לטיוטה.</p>
    </Modal>
  );
}
