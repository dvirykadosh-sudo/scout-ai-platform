"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { flushSync } from "react-dom";
import { api, errorMessage, storageGet, storageSet } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import { useAuth, useToast } from "./Providers";
import { AssistantTools, type Profile, type ToolId, type ToolRequest } from "./AssistantTools";
import { Field, Modal } from "./ui";

interface Analysis {
  title: string;
  mode: "explicit" | "guessed" | "empty";
  words: number;
  stages: { name: string; content: string; words: number; minutes: number | null; filled: boolean }[];
  methods: { name: string; evidence: string }[];
  other: string;
  value: { text: string; linked: boolean; suggestion: string; sentence: string } | null;
  age: { grade: string; issues: { word: string; why: string; alt: string | null }[] } | null;
  planB: string[];
  placeholders: string[];
  balance: { doing: number; talking: number; receiving: number; total: number; verdict: string; tip: string };
  profile: { name: string; tips: { trait: string; label: string; tip: string }[]; checked: number } | null;
  notes: { start: number; end: number; phrase: string; why: string; fix: string | null; hint?: string; kind: string }[];
  totalMinutes: number | null;
  checklist: { id: string; label: string; done: boolean; hint: string }[];
  progress: number;
  missingStages: string[];
  nudges: string[];
  readiness?: { score: number; level: string; parts: { id: string; label: string; max: number; points: number; ok: boolean }[]; next: { label: string; gain: number; fix: string }[] };
}

interface Help {
  where: string;
  message: string;
  suggestions: { label: string; text: string }[];
  methodTips: { name: string; why: string; example: string }[];
  source: "ai" | "builtin";
}

interface DryRun {
  totalMinutes: number;
  steps: { stage: string; minutes: number; startAt: number; whatIf: { id: string; q: string; plan: string }[] }[];
}
interface Cont {
  where: string;
  options: { label: string; text: string }[];
  source: "ai" | "builtin";
}

const KEY = "scout.assist.draft";
const AGE_KEY = "scout.assist.age";
const TARGET_KEY = "scout.assist.target";
const PROFILE_KEY = "scout.assist.profile";

type SpeechRec = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const getSpeech = (): (new () => SpeechRec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const EXAMPLE = `פעולה על אחריות
המטרה: שהחניכים יבינו שאחריות היא בחירה
ציוד: דפים וטושים

פתיחה: מתכנסים במעגל, וכל אחד אומר מילה אחת על אחריות. 5 דקות

משחק: מחלקים לקבוצות ועושים מירוץ תחנות. 20 דקות`;

export function AssistantPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [a, setA] = useState<Analysis | null>(null);
  const [help, setHelp] = useState<Help | null>(null);
  const [helpBusy, setHelpBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [age, setAge] = useState("כיתה ז' - מעורב");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const [ageGroup, setAgeGroup] = useState("");
  const [target, setTarget] = useState(60);
  const [cont, setCont] = useState<Cont | null>(null);
  const [variant, setVariant] = useState<"normal" | "shorter" | "humor">("normal");
  const [contBusy, setContBusy] = useState(false);
  const [questions, setQuestions] = useState<{ level: string; text: string }[] | null>(null);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [rw, setRw] = useState<{ before: string; after: string; start: number; end: number; source: string; mode: "alive" | "shorter" | "humor" } | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [focus, setFocus] = useState(false);
  const [goal, setGoal] = useState(300);
  const rec = useRef<SpeechRec | null>(null);
  const [speechOk, setSpeechOk] = useState(false);
  useEffect(() => setSpeechOk(!!getSpeech()), []);
  const [tool, setTool] = useState<ToolRequest | null>(null);
  const [designed, setDesigned] = useState<{ qr: string; date: string; path: string } | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [cloudId, setCloudId] = useState<number | null>(null);
  const openTool = (id: ToolId, method?: string) => setTool({ id, method });
  const setProfile = (p: Profile | null) => {
    setProfileState(p);
    storageSet(PROFILE_KEY, p ? JSON.stringify(p) : "");
  };
  const edit = (fn: (cur: string) => string) => {
    setUndo(text);
    setText(fn(text));
    setSaved(null);
  };

  useEffect(() => {
    const d = storageGet(KEY);
    if (d) setText(d);
    const ag = storageGet(AGE_KEY);
    if (ag && AGE_GROUPS.includes(ag)) setAgeGroup(ag);
    const tg = Number(storageGet(TARGET_KEY));
    if (tg >= 10 && tg <= 240) setTarget(tg);
    try {
      const pr = JSON.parse(storageGet(PROFILE_KEY) || "null");
      if (pr && typeof pr.name === "string" && Array.isArray(pr.traits)) setProfileState({ name: pr.name.slice(0, 60), size: Number(pr.size) > 0 ? Number(pr.size) : null, traits: pr.traits.filter((x: unknown) => typeof x === "string").slice(0, 9) });
    } catch {
      /* פרופיל פגום: מתעלמים */
    }
  }, []);

  // פתיחה של טיוטה מהענן מקישור (למשל מהתראה על תגובה)
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("draft"));
    if (!id || !token) return;
    api<{ id: number; text: string }>(`/api/assist/drafts/${id}`, { token })
      .then((d) => {
        setText(d.text);
        setCloudId(d.id);
      })
      .catch(() => toast("לא הצלחתי לפתוח את הטיוטה מהענן", { kind: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ניתוח חי, בדיחוי קצר ועם ביטול בקשה קודמת
  useEffect(() => {
    storageSet(KEY, text);
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      api<Analysis>("/api/assist/analyze", { method: "POST", body: { text, targetMinutes: target, ...(ageGroup ? { ageGroup } : {}), ...(profile ? { profile } : {}) }, signal: ctl.signal })
        .then(setA)
        .catch(() => {});
    }, 450);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [text, ageGroup, profile, target]);

  const append = useCallback(
    (s: string) => {
      setText((cur) => (cur.trim() ? `${cur.replace(/\s+$/, "")}\n\n${s}` : s));
      window.setTimeout(() => ta.current?.focus(), 0);
    },
    [setText],
  );

  const askHelp = async () => {
    setHelpBusy(true);
    try {
      setHelp(await api<Help>("/api/assist/help", { method: "POST", body: { text } }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setHelpBusy(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ id: number; incomplete: boolean }>("/api/assist/save", { method: "POST", token, body: { text, ageGroup: age } });
      setSaved(r.id);
      setSaveOpen(false);
      toast(r.incomplete ? "נשמרה כטיוטה במאגר. חסרים שלבים" : "הפעולה נשמרה במאגר", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setSaving(false);
  };

  const askContinue = async (v = variant) => {
    setContBusy(true);
    try {
      setCont(await api<Cont>("/api/assist/continue", { method: "POST", body: { text, variant: v } }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setContBusy(false);
  };

  const askQuestions = async () => {
    try {
      setQuestions((await api<{ questions: { level: string; text: string }[] }>("/api/assist/questions", { method: "POST", body: { text } })).questions);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  const askDry = async () => {
    try {
      setDry(await api<DryRun>("/api/assist/dryrun", { method: "POST", body: { text } }));
      setPicked({});
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  const addPlanB = () => {
    if (!dry) return;
    const lines = dry.steps.flatMap((s) => s.whatIf.filter((w) => picked[`${s.stage}|${w.id}`]).map((w) => `תוכנית ב' (${w.q.replace(/\?$/, "")}): ${w.plan}`));
    if (lines.length === 0) return toast("סמנו לפחות מצב אחד", { kind: "error" });
    append(lines.join("\n"));
    setDry(null);
    toast("תוכניות ב' נוספו לטיוטה", { kind: "success" });
  };

  const selectRange = (start: number, end: number) => {
    const el = ta.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
  };

  // מחליפים לפי הטקסט עצמו, כי המיקום בניתוח יכול להיות ישן אם המשיכו לכתוב
  const fixNote = (n: Analysis["notes"][number]) => {
    if (!n.fix) return;
    const at = text.indexOf(n.phrase, Math.max(0, n.start - 20));
    if (at < 0) return toast("הטקסט השתנה. המשיכו בעריכה ידנית", { kind: "info" });
    setUndo(text);
    setText(text.slice(0, at) + n.fix + text.slice(at + n.phrase.length));
  };

  const startRewrite = async (mode: "alive" | "shorter" | "humor" = "alive") => {
    const el = ta.current;
    let start = el?.selectionStart ?? 0;
    let end = el?.selectionEnd ?? 0;
    if (end - start < 5) {
      // בלי בחירה: הפסקה שבה נמצא הסמן
      const before = text.lastIndexOf("\n\n", Math.max(0, start - 1));
      const after = text.indexOf("\n\n", start);
      start = before < 0 ? 0 : before + 2;
      end = after < 0 ? text.length : after;
    }
    const before = text.slice(start, end);
    if (before.trim().length < 5) return toast("עוד אין מה לנסח מחדש. כתבו פסקה או סמנו קטע", { kind: "info" });
    try {
      const r = await api<{ text: string; source: string }>("/api/assist/rewrite", { method: "POST", body: { text: before, mode } });
      setRw({ before, after: r.text, start, end, source: r.source, mode });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  const applyRewrite = () => {
    if (!rw) return;
    const at = text.indexOf(rw.before);
    if (at < 0) {
      toast("הטקסט השתנה בינתיים", { kind: "info" });
      return setRw(null);
    }
    setUndo(text);
    setText(text.slice(0, at) + rw.after + text.slice(at + rw.before.length));
    setRw(null);
  };

  const toggleDictation = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = getSpeech();
    if (!Ctor) return toast("הדפדפן הזה לא תומך בהכתבה. אפשר להשתמש בהכתבה של המקלדת בטלפון", { kind: "info" });
    const r = new Ctor();
    r.lang = "he-IL";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add.trim()) setText((cur) => (cur ? cur.replace(/\s+$/, "") + " " : "") + add.trim());
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
  useEffect(() => () => rec.current?.stop(), []);
  useEffect(() => {
    if (!focus) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setFocus(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [focus]);

  const exportPdf = async () => {
    // מנתחים מחדש את הטקסט הנוכחי, כדי שה-PDF לא יתבסס על ניתוח ישן
    let fresh = a;
    try {
      fresh = await api<Analysis>("/api/assist/analyze", { method: "POST", body: { text, targetMinutes: target, ...(ageGroup ? { ageGroup } : {}), ...(profile ? { profile } : {}) } });
    } catch {
      /* נשארים עם הניתוח האחרון */
    }
    flushSync(() => setA(fresh));
    const prev = document.title;
    document.title = fresh?.title || "פעולה";
    window.print();
    window.setTimeout(() => (document.title = prev), 500);
  };

  // 77: PDF מעוצב עם שער, טבלת סיכום, QR ומספרי עמודים
  const exportDesigned = async () => {
    let fresh = a;
    try {
      fresh = await api<Analysis>("/api/assist/analyze", { method: "POST", body: { text, targetMinutes: target, ...(ageGroup ? { ageGroup } : {}), ...(profile ? { profile } : {}) } });
    } catch {
      /* נשארים עם הניתוח האחרון */
    }
    let path = "/assistant";
    if (saved) path = `/library/${saved}`;
    if (cloudId && token) {
      try {
        const d = await api<{ shareToken: string | null }>(`/api/assist/drafts/${cloudId}`, { token });
        if (d.shareToken) path = `/assistant/shared?t=${d.shareToken}`;
      } catch {
        /* נשארים עם הקישור הכללי */
      }
    }
    let qr = "";
    try {
      qr = await QRCode.toDataURL(`${window.location.origin}${path}`, { margin: 1, width: 220 });
    } catch {
      /* בלי QR */
    }
    flushSync(() => {
      setA(fresh);
      setDesigned({ qr, date: new Date().toLocaleDateString("he-IL"), path });
    });
    document.body.classList.add("printing-designed");
    const prev = document.title;
    document.title = fresh?.title || "פעולה";
    window.print();
    window.setTimeout(() => {
      document.body.classList.remove("printing-designed");
      document.title = prev;
    }, 500);
  };
  useEffect(() => () => document.body.classList.remove("printing-designed"), []);

  return (
    <>
      <div className="assist-grid no-print">
        <section className="card glass assist-write" aria-labelledby="assist-write-title">
          <h2 id="assist-write-title" className="section-title">
            כתבו חופשי
          </h2>
          <p className="hint">שורה ראשונה היא הכותרת. אפשר לכתוב כותרות כמו "פתיחה:" ו"דיון:", ואפשר גם בלעדיהן, ואני אסדר.</p>
          <div className="assist-settings">
            <Field label="שכבת גיל (לבדיקת התאמה)" htmlFor="assist-age-select">
              <select
                id="assist-age-select"
                value={ageGroup}
                onChange={(e) => {
                  setAgeGroup(e.target.value);
                  storageSet(AGE_KEY, e.target.value);
                }}
              >
                <option value="">לא נבחרה</option>
                {AGE_GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="משך הפעולה (דקות)" htmlFor="assist-target">
              <input
                id="assist-target"
                type="number"
                min={10}
                max={240}
                value={target}
                onChange={(e) => {
                  const v = Math.max(10, Math.min(240, Number(e.target.value) || 60));
                  setTarget(v);
                  storageSet(TARGET_KEY, String(v));
                }}
              />
            </Field>
          </div>
          <label htmlFor="assist-text" className="sr-only">
            טיוטת הפעולה
          </label>
          <textarea
            id="assist-text"
            ref={ta}
            className="assist-textarea"
            rows={18}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(null);
            }}
            placeholder="למשל: פעולה על אחריות. רוצים שהחניכים יבינו ש..."
          />
          {a && a.words > 0 && <Timeline a={a} target={target} />}
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={askHelp} disabled={helpBusy}>
              {helpBusy ? "חושב..." : "אני תקוע/ה, עזרה"}
            </button>
            <span className="assist-continue">
              <label htmlFor="assist-variant" className="sr-only">
                סגנון ההמשך
              </label>
              <select id="assist-variant" value={variant} onChange={(e) => setVariant(e.target.value as typeof variant)}>
                <option value="normal">רגיל</option>
                <option value="shorter">קצר</option>
                <option value="humor">עם הומור</option>
              </select>
              <button type="button" className="btn" onClick={() => askContinue()} disabled={contBusy}>
                {contBusy ? "כותב..." : "המשך בקול שלי"}
              </button>
            </span>
            <button type="button" className="btn" onClick={() => startRewrite("alive")} disabled={text.trim().length < 5}>
              ניסוח מחדש לפסקה
            </button>
            <button type="button" className="btn" onClick={askQuestions} disabled={text.trim().length < 10}>
              שאלות לדיון
            </button>
            <button type="button" className="btn" onClick={askDry} disabled={text.trim().length < 20}>
              הרצה יבשה
            </button>
            <button type="button" className="btn" onClick={toggleDictation} aria-pressed={listening} disabled={!speechOk} title={speechOk ? undefined : "הדפדפן לא תומך בהכתבה"}>
              {listening ? "עצירת הכתבה" : "הכתבה בקול"}
            </button>
            <button type="button" className="btn" onClick={() => setFocus(true)}>
              מצב ריכוז
            </button>
            {undo !== null && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setText(undo);
                  setUndo(null);
                }}
              >
                ביטול השינוי האחרון
              </button>
            )}
            <button type="button" className="btn" onClick={exportPdf} disabled={!text.trim()}>
              ייצוא ל-PDF
            </button>
            <button type="button" className="btn" onClick={exportDesigned} disabled={!text.trim()}>
              PDF מעוצב (שער, QR, עמודים)
            </button>
            <button type="button" className="btn" onClick={() => setSaveOpen(true)} disabled={text.trim().length < 20}>
              שמירה במאגר
            </button>
            {!text.trim() && (
              <button type="button" className="btn" onClick={() => setText(EXAMPLE)}>
                הכנסת דוגמה
              </button>
            )}
            {text.trim() && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (window.confirm("למחוק את הטיוטה?")) {
                    setText("");
                    setHelp(null);
                    setSaved(null);
                  }
                }}
              >
                ניקוי
              </button>
            )}
          </div>
          <div className="actions assist-tools" role="group" aria-label="כלים נוספים">
            <button type="button" className="btn" onClick={() => openTool("templates")}>
              תבניות
            </button>
            <button type="button" className="btn" onClick={() => openTool("inspire")}>
              השראה מהמאגר
            </button>
            <button type="button" className="btn" onClick={() => openTool("gear")} disabled={text.trim().length < 10}>
              ציוד מול הארון
            </button>
            <button type="button" className="btn" onClick={() => openTool("script")} disabled={text.trim().length < 20}>
              תסריט למדריך
            </button>
            <button type="button" className="btn" onClick={() => openTool("schedule")} disabled={text.trim().length < 20}>
              הוספה ליומן
            </button>
            <button type="button" className="btn" onClick={() => openTool("share")}>
              שיתוף לתגובות{cloudId ? " (שמור בענן)" : ""}
            </button>
            <button type="button" className="btn" onClick={() => openTool("reflect")}>
              אחרי הפעולה
            </button>
            <button type="button" className="btn" onClick={() => openTool("group")}>
              הקבוצה שלי{profile?.name ? `: ${profile.name}` : ""}
            </button>
            <button type="button" className="btn" onClick={() => openTool("style")} disabled={text.trim().length < 80}>
              למידת הסגנון שלי
            </button>
            <button type="button" className="btn" onClick={() => openTool("inclusion")} disabled={text.trim().length < 20}>
              בדיקת הכלה
            </button>
            <button type="button" className="btn" onClick={() => openTool("parents")} disabled={text.trim().length < 20}>
              הודעות להורים וצוות
            </button>
            <button type="button" className="btn" onClick={() => openTool("stations")} disabled={text.trim().length < 10}>
              כרטיסי תחנות
            </button>
            <button type="button" className="btn" onClick={() => openTool("history")}>
              היסטוריית גרסאות
            </button>
            <button type="button" className="btn" onClick={() => openTool("board")} disabled={text.trim().length < 10}>
              הוספה ללוח תכנון
            </button>
            <Link className="btn" href="/assistant/board">
              לוח התכנון השנתי
            </Link>
            <button type="button" className="btn" onClick={() => openTool("booklet")}>
              חוברת פעולות (Word)
            </button>
            <button type="button" className="btn" onClick={() => openTool("growth")}>
              המסלול שלי כמדריך
            </button>
          </div>
          {saved && (
            <p className="ok-box" role="status">
              נשמר. <Link href={`/library/${saved}`}>לפתיחת הפעולה</Link>
            </p>
          )}
          <p className="hint">הטיוטה נשמרת אוטומטית במכשיר הזה.</p>

          {cont && (
            <section className="assist-help" aria-labelledby="assist-cont-title" aria-live="polite">
              <h3 id="assist-cont-title">המשך מוצע</h3>
              <ul className="plain-list">
                {cont.options.map((o) => (
                  <li key={o.label + o.text}>
                    <span>
                      <strong>{o.label}</strong>
                      <br />
                      {o.text}
                    </span>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        append(o.text);
                        setCont(null);
                      }}
                    >
                      הוספה לטקסט<span className="sr-only">: {o.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hint">{cont.source === "ai" ? "נוצר במודל שפה בסגנון הכתיבה השמור שלכם." : "הצעות מובנות במערכת. עם מפתח מודל הן נכתבות בקול שלכם."}</p>
            </section>
          )}
          {questions && (
            <section className="assist-help" aria-labelledby="assist-q-title">
              <h3 id="assist-q-title">שאלות לדיון מתוך הטיוטה</h3>
              <ul className="plain-list">
                {questions.map((q) => (
                  <li key={q.level}>
                    <span>
                      <strong>{q.level}</strong>
                      <br />
                      {q.text}
                    </span>
                    <button type="button" className="btn btn-small" onClick={() => append(`שאלה לדיון (${q.level}): ${q.text}`)}>
                      הוספה לטקסט<span className="sr-only">: שאלה {q.level}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {help && (
            <section className="assist-help" aria-labelledby="assist-help-title" aria-live="polite">
              <h3 id="assist-help-title">עזרה להמשך</h3>
              <p>{help.message}</p>
              <ul className="plain-list">
                {help.suggestions.map((s) => (
                  <li key={s.label + s.text}>
                    <span>
                      <strong>{s.label}</strong>
                      <br />
                      {s.text}
                    </span>
                    <button type="button" className="btn btn-small" onClick={() => append(s.text)}>
                      הוספה לטקסט<span className="sr-only">: {s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {help.methodTips.length > 0 && (
                <>
                  <h4>שיטות שאפשר להוסיף</h4>
                  <ul>
                    {help.methodTips.map((m) => (
                      <li key={m.name}>
                        <strong>{m.name}:</strong> {m.why} לדוגמה: {m.example}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="hint">{help.source === "ai" ? "ההצעות נוצרו במודל שפה לפי הטיוטה שלכם." : "ההצעות מובנות במערכת ולא נוצרות במודל שפה."}</p>
            </section>
          )}
        </section>

        <aside className="card glass assist-side" aria-labelledby="assist-side-title">
          <h2 id="assist-side-title" className="section-title">
            מה אני רואה
          </h2>
          {!a || a.words === 0 ? (
            <p className="hint">כשתתחילו לכתוב, כאן יופיעו הכותרת, השלבים, השיטות ומה שעוד חסר.</p>
          ) : (
            <>
              <p className="assist-title">{a.title || "(עוד אין כותרת)"}</p>
              <div className="assist-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.progress} aria-label="השלמת הפעולה">
                <span style={{ width: `${a.progress}%` }} />
              </div>
              <p className="hint">
                {a.progress}% הושלם{a.totalMinutes ? ` · ${a.totalMinutes} דקות מצוינות` : ""}
                {a.mode === "guessed" ? " · חילקתי לשלבים לפי התוכן" : ""}
              </p>
              {a.readiness && (
                <details className="assist-ready">
                  <summary>
                    מוכנות להפעלה: {a.readiness.score}/100 · {a.readiness.level}
                  </summary>
                  <ul className="plain-list">
                    {a.readiness.parts.map((p) => (
                      <li key={p.id}>
                        <span>{p.label}</span>
                        <span className={p.ok ? "pill pill-ok" : "pill pill-warn"}>
                          {p.points}/{p.max}
                          <span className="sr-only">{p.ok ? " (תקין)" : " (חסר)"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {a.readiness.next.length > 0 && (
                    <p className="hint">
                      כדי לעלות: {a.readiness.next.map((n) => `${n.label} (${n.fix})`).join(" · ")}
                    </p>
                  )}
                </details>
              )}
              <h3>שלבים</h3>
              <ol className="assist-stages">
                {a.stages.map((s) => (
                  <li key={s.name} className={s.filled ? "is-done" : ""}>
                    <span aria-hidden="true">{s.filled ? "✓" : "○"}</span> {s.name}
                    <span className="sr-only">{s.filled ? " (כתוב)" : " (חסר)"}</span>
                    {s.filled && <span className="hint"> · {s.words} מילים{s.minutes ? `, ${s.minutes} דק׳` : ""}</span>}
                  </li>
                ))}
              </ol>
              {a.methods.length > 0 && (
                <>
                  <h3>שיטות שזיהיתי</h3>
                  <ul className="tag-list" aria-label="שיטות">
                    {a.methods.map((m) => (
                      <li key={m.name} className="pill pill-ok">
                        {m.name}{" "}
                        <button type="button" className="btn btn-small" onClick={() => openTool("swap", m.name)}>
                          החלפה<span className="sr-only">: {m.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {a.balance.total > 0 && (
                    <p className={a.balance.verdict === "balanced" ? "ok-box" : "warn-box"} role="status">
                      <strong>איזון:</strong> {a.balance.doing} של עשייה, {a.balance.talking} של שיחה, {a.balance.receiving} של הקשבה. {a.balance.tip}
                    </p>
                  )}
                </>
              )}
              {a.placeholders.length > 0 && (
                <p className="warn-box">
                  נשארו למלא: {a.placeholders.join(" ")}
                </p>
              )}
              {profile && a.profile && (
                <>
                  <h3>בדיקה מול הקבוצה: {profile.name || "הקבוצה שלי"}</h3>
                  {a.profile.tips.length === 0 ? (
                    <p className="ok-box">הטיוטה מתאימה למה שסימנתם על הקבוצה.</p>
                  ) : (
                    <ul className="assist-nudges">
                      {a.profile.tips.map((t) => (
                        <li key={t.trait + t.tip}>{t.tip}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {a.nudges.length > 0 && (
                <>
                  <h3>שווה לשים לב</h3>
                  <ul className="assist-nudges">
                    {a.nudges.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </>
              )}
              {a.value && (
                <>
                  <h3>חיבור לערך</h3>
                  <p className={a.value.linked ? "ok-box" : "warn-box"}>
                    {a.value.linked ? `הערך "${a.value.text}" מופיע בדיון או בסיכום.` : a.value.suggestion}
                  </p>
                  {!a.value.linked && (
                    <button type="button" className="btn btn-small" onClick={() => append(`סיכום: ${a.value!.sentence}`)}>
                      הוספת משפט חיבור
                    </button>
                  )}
                </>
              )}
              {a.age && a.age.issues.length > 0 && (
                <>
                  <h3>התאמה לכיתה {a.age.grade}</h3>
                  <ul className="assist-nudges">
                    {a.age.issues.map((i) => (
                      <li key={i.word}>{i.why}</li>
                    ))}
                  </ul>
                </>
              )}
              {a.notes.length > 0 && (
                <>
                  <h3>הערות בשוליים</h3>
                  <ul className="plain-list">
                    {a.notes.map((n) => (
                      <li key={n.start + n.phrase}>
                        <span>
                          <strong>&quot;{n.phrase}&quot;</strong>
                          <br />
                          <span className="hint">
                            {n.why}
                            {n.fix ? ` · הצעה: ${n.fix.trim()}` : n.hint ? ` · ${n.hint}` : ""}
                          </span>
                        </span>
                        <span className="actions">
                          <button type="button" className="btn btn-small" onClick={() => selectRange(n.start, n.end)}>
                            סימון בטקסט<span className="sr-only">: {n.phrase}</span>
                          </button>
                          {n.fix && (
                            <button type="button" className="btn btn-small" onClick={() => fixNote(n)}>
                              תיקון<span className="sr-only">: {n.phrase}</span>
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <details>
                <summary>רשימת בדיקה</summary>
                <ul className="plain-list">
                  {a.checklist.map((c) => (
                    <li key={c.id}>
                      <span>{c.label}</span>
                      <span className={c.done ? "pill pill-ok" : "pill pill-warn"}>{c.done ? "יש" : "חסר"}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </aside>
      </div>

      {/* מה שמודפס ל-PDF: הלוגו הקבוע מגיע מהכותרת הגלובלית */}
      <article className="assist-print assist-doc-print print-only" aria-hidden="true">
        <h1>{a?.title || "פעולה"}</h1>
        {a?.totalMinutes ? <p>משך: {a.totalMinutes} דקות</p> : null}
        {a && a.methods.length > 0 && <p>שיטות: {a.methods.map((m) => m.name).join(", ")}</p>}
        {a?.stages.map((s) =>
          s.filled ? (
            <section key={s.name}>
              <h2>
                {s.name}
                {s.minutes ? ` (${s.minutes} דקות)` : ""}
              </h2>
              <p>{s.content}</p>
            </section>
          ) : null,
        )}
        {a && a.planB.length > 0 && (
          <section>
            <h2>תוכניות ב&apos;</h2>
            <p>{a.planB.join("\n")}</p>
          </section>
        )}
        {a?.other ? (
          <section>
              <h2>פרטים נוספים</h2>
              <p>{a.other}</p>
          </section>
        ) : null}
      </article>

      {designed && a && (
        <article className="assist-designed print-only" aria-hidden="true">
          <section className="assist-cover">
            <p className="assist-cover-tribe">שבט מעוז · ראשון לציון</p>
            <h1>{a.title || "פעולה"}</h1>
            <p>
              {ageGroup ? `${ageGroup} · ` : ""}
              {a.totalMinutes ? `${a.totalMinutes} דקות · ` : ""}
              {designed.date}
            </p>
            {designed.qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={designed.qr} alt="" width={160} height={160} />
            )}
            <p className="assist-cover-note">סרקו לפתיחת הפעולה באתר</p>
          </section>
          <section className="assist-designed-body">
            <h2>סיכום במבט אחד</h2>
            <table>
              <tbody>
                <tr><th>ערך מוביל</th><td>{a.value?.text || "לא צוין"}</td></tr>
                <tr><th>שיטות</th><td>{a.methods.map((m) => m.name).join(", ") || "לא זוהו"}</td></tr>
                <tr><th>מוכנות</th><td>{a.readiness ? `${a.readiness.score}/100 · ${a.readiness.level}` : "-"}</td></tr>
                <tr><th>ציוד</th><td>{a.stages.some((s) => /ציוד/.test(s.name)) ? a.stages.filter((s) => /ציוד/.test(s.name)).map((s) => s.content).join(" ") : "ראו בשלבים"}</td></tr>
              </tbody>
            </table>
            {a.stages.map((s) =>
              s.filled ? (
                <section key={s.name} className="assist-designed-stage">
                  <h2>
                    {s.name}
                    {s.minutes ? ` (${s.minutes} דקות)` : ""}
                  </h2>
                  <p>{s.content}</p>
                </section>
              ) : null,
            )}
            {a.planB.length > 0 && (
              <section className="assist-designed-stage">
                <h2>תוכניות ב&apos;</h2>
                <p>{a.planB.join("\n")}</p>
              </section>
            )}
          </section>
        </article>
      )}

      <AssistantTools
        tool={tool}
        onClose={() => setTool(null)}
        text={text}
        setText={(s) => {
          setText(s);
          setSaved(null);
        }}
        append={append}
        edit={edit}
        title={a?.title ?? ""}
        ageGroup={ageGroup}
        cloudId={cloudId}
        setCloudId={setCloudId}
        activityId={saved}
        profile={profile}
        setProfile={setProfile}
        valueText={a?.value?.text ?? ""}
        score={a?.readiness?.score ?? null}
      />

      <Modal
        open={!!rw}
        onClose={() => setRw(null)}
        title="ניסוח מחדש"
        wide
        footer={
          <>
            <button type="button" className="btn" onClick={() => setRw(null)}>
              ביטול
            </button>
            <button type="button" className="btn btn-primary" onClick={applyRewrite}>
              החלפה בטיוטה
            </button>
          </>
        }
      >
        {rw && (
          <>
            <div className="actions" role="group" aria-label="סגנון הניסוח">
              {(["alive", "shorter", "humor"] as const).map((m) => (
                <button key={m} type="button" className="btn btn-small" aria-pressed={rw.mode === m} onClick={() => startRewrite(m)}>
                  {m === "alive" ? "חי יותר" : m === "shorter" ? "קצר יותר" : "עם הומור"}
                </button>
              ))}
            </div>
            <h3>לפני</h3>
            <p className="assist-diff">{rw.before}</p>
            <h3>אחרי</h3>
            <p className="assist-diff">{rw.after}</p>
            <p className="hint">{rw.source === "ai" ? "נוסח במודל שפה." : "ניסוח מובנה: תיקון ניסוחים משרדיים וקיצור משפטים ארוכים."}</p>
          </>
        )}
      </Modal>

      <Modal
        open={!!dry}
        onClose={() => setDry(null)}
        title="הרצה יבשה"
        wide
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDry(null)}>
              סגירה
            </button>
            <button type="button" className="btn btn-primary" onClick={addPlanB}>
              הוספת הנבחרים כתוכנית ב&apos;
            </button>
          </>
        }
      >
        {dry && (
          <>
            <p>עוברים על הפעולה לפי הזמנים ({dry.totalMinutes} דקות). סמנו מה שמטריד אתכם, והעוזר יוסיף תוכנית ב&apos;.</p>
            {dry.steps.map((st) => (
              <fieldset key={st.stage} className="assist-dry">
                <legend>
                  דקה {st.startAt}: {st.stage} ({st.minutes} דק׳)
                </legend>
                {st.whatIf.map((w) => (
                  <label key={w.id} className="assist-check">
                    <input type="checkbox" checked={!!picked[`${st.stage}|${w.id}`]} onChange={(e) => setPicked({ ...picked, [`${st.stage}|${w.id}`]: e.target.checked })} />
                    <span>
                      <strong>{w.q}</strong>
                      <br />
                      <span className="hint">{w.plan}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </>
        )}
      </Modal>

      {focus && (
        <div className="assist-focus no-print" role="dialog" aria-modal="true" aria-label="מצב ריכוז">
          <div className="assist-focus-bar">
            <label htmlFor="assist-goal">יעד מילים</label>
            <input id="assist-goal" type="number" min={50} max={3000} value={goal} onChange={(e) => setGoal(Math.max(50, Math.min(3000, Number(e.target.value) || 300)))} />
            <span role="status">
              {a?.words ?? 0} מתוך {goal} מילים
            </span>
            <button type="button" className="btn btn-small" onClick={toggleDictation} aria-pressed={listening} disabled={!speechOk}>
              {listening ? "עצירת הכתבה" : "הכתבה"}
            </button>
            <button type="button" className="btn btn-small btn-primary" onClick={() => setFocus(false)} autoFocus>
              יציאה (Esc)
            </button>
          </div>
          <label htmlFor="assist-focus-text" className="sr-only">
            טיוטת הפעולה במצב ריכוז
          </label>
          <textarea id="assist-focus-text" className="assist-focus-text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="שמירה במאגר"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setSaveOpen(false)}>
              ביטול
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "שומר..." : "שמירה"}
            </button>
          </>
        }
      >
        <p>{a?.missingStages.length ? `חסרים שלבים (${a.missingStages.join(", ")}). הפעולה תישמר כטיוטה.` : "כל השלבים כתובים."}</p>
        <Field label="שכבת גיל" htmlFor="assist-age">
          <select id="assist-age" value={age} onChange={(e) => setAge(e.target.value)}>
            {AGE_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        {!token && !user && <p className="hint">אפשר לשמור גם בלי חשבון, אבל רק מחוברים יכולים לערוך אחר כך.</p>}
      </Modal>
    </>
  );
}

const STAGE_COLORS = ["#7c4dff", "#1c7a3f", "#a85a00", "#0a6c9e", "#8a2a6a"];

/** 55. ציר זמן חי: רוחב כל שלב לפי הדקות, מול המשך שתכננתם. */
function Timeline({ a, target }: { a: Analysis; target: number }) {
  const defaults = [8, 18, 14, 12, 8];
  const segs = a.stages.map((s, i) => ({ name: s.name, mins: s.filled ? s.minutes ?? defaults[i] : 0, explicit: !!s.minutes }));
  const sum = segs.reduce((t, x) => t + x.mins, 0);
  const base = Math.max(sum, target, 1);
  const msg = sum === 0 ? "" : sum > target ? `הפעולה ארוכה ב-${sum - target} דקות מהמתוכנן.` : sum < target * 0.7 ? `חסרות ${target - sum} דקות כדי למלא את ${target}.` : "הזמנים מתאימים למשך המתוכנן.";
  return (
    <div className="assist-timeline" aria-label="ציר זמן של הפעולה">
      <div className="assist-timeline-bar" role="img" aria-label={`סך הכול ${sum} דקות מתוך ${target}`}>
        {segs.map((x, i) =>
          x.mins ? (
            <span key={x.name} style={{ width: `${(x.mins / base) * 100}%`, background: STAGE_COLORS[i] }} title={`${x.name}: ${x.mins} דקות`} />
          ) : null,
        )}
      </div>
      <p className="hint" role="status">
        {sum} דקות מתוך {target}. {msg}
        {segs.some((x) => x.mins && !x.explicit) ? " (שלבים בלי זמן מצוין חושבו לפי ברירת מחדל)" : ""}
      </p>
    </div>
  );
}
