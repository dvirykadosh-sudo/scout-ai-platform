"use client";

// כלים נוספים לעורך (רעיונות 139–150): קטעים שמורים, קישור צפייה בלבד, בדיקת קריאוּת, הצעות לשם,
// מצב הרצה עם טיימר, גיבוי ושחזור, ותצוגת קישור ציבורי.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, api, errorMessage, fmtDate } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal, Skeleton } from "./ui";
import { VisitorComments, cleanText } from "./WriteMore3";
import { KIND_LABEL, Md, type Block, type Kind, type Snap } from "./WriteParts";

const snap0Title = (id: number) => `פעולה לצפייה (${id}):`;
const payload = (s: Snap) => ({ title: s.title, meta: s.meta, blocks: s.blocks });

/** 146: מחלק את הזמן המתוכנן בין השלבים לפי משקל לכל סוג שלב. הסכום שווה בדיוק ליעד. */
export function distributeMinutes(blocks: Block[], total: number): number[] {
  const W: Record<Kind, number> = { open: 1, body: 3, peak: 2.5, close: 1, free: 2 };
  if (!blocks.length || total <= 0) return blocks.map(() => 0);
  const sum = blocks.reduce((s, b) => s + W[b.kind], 0);
  const raw = blocks.map((b) => (total * W[b.kind]) / sum);
  const out = raw.map((x) => Math.floor(x));
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** 142: שעת התחלה לכל שלב לפי שעת הפעולה. */
export function clockTimes(blocks: Block[], start: string): string[] {
  const m = /^(\d{2}):(\d{2})$/.exec(start);
  if (!m) return blocks.map(() => "");
  let t = Number(m[1]) * 60 + Number(m[2]);
  return blocks.map((b) => {
    const label = `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    t += b.minutes ?? 0;
    return label;
  });
}

interface Snippet {
  id: number;
  name: string;
  text: string;
}

/** 139: הקטעים השמורים שלי. */
export function SnippetsModal({ open, onClose, token, current, onInsert }: { open: boolean; onClose: () => void; token: string | null; current: string; onInsert: (text: string) => void }) {
  const toast = useToast();
  const [list, setList] = useState<Snippet[] | null>(null);
  const [name, setName] = useState("");
  const load = useCallback(() => {
    api<Snippet[]>("/api/write/snippets", { token })
      .then(setList)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [token, toast]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  const save = async () => {
    try {
      await api("/api/write/snippets", { method: "POST", token, body: { name, text: current } });
      setName("");
      toast("הקטע נשמר", { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const del = async (s: Snippet) => {
    try {
      await api(`/api/write/snippets/${s.id}`, { method: "DELETE", token });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="הקטעים השמורים שלי" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">שומרים משפט פתיחה, חוקי משחק או סיום שאתם אוהבים, ומכניסים אותם לכל מסמך.</p>
      <div className="inline-form">
        <Field label="שם לקטע החדש" htmlFor="sn-name" hint={current.trim() ? "יישמר הטקסט של השלב הנוכחי" : "אין טקסט בשלב הנוכחי"}>
          <input id="sn-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button type="button" className="btn" disabled={!name.trim() || !current.trim()} onClick={save}>
          שמירת טקסט השלב כקטע
        </button>
      </div>
      {list === null ? (
        <Skeleton lines={2} />
      ) : list.length === 0 ? (
        <p>עוד אין קטעים שמורים.</p>
      ) : (
        <ul className="plain-list">
          {list.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{s.name}</strong>
                <br />
                <span className="hint">{s.text.slice(0, 90)}</span>
              </span>
              <span className="actions">
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={() => {
                    onInsert(s.text);
                    onClose();
                  }}
                >
                  הכנסה לשלב<span className="sr-only">: {s.name}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => del(s)}>
                  מחיקה<span className="sr-only">: {s.name}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** 140: קישור צפייה בלבד. */
export function ShareModal({ open, onClose, docId, token }: { open: boolean; onClose: () => void; docId: number; token: string | null }) {
  const toast = useToast();
  const [cur, setCur] = useState<{ token: string | null; expiresAt?: string } | null>(null);
  const [days, setDays] = useState(14);
  const url = cur?.token && typeof window !== "undefined" ? `${window.location.origin}/write/view/${cur.token}` : "";
  useEffect(() => {
    if (!open) return;
    api<{ token: string | null; expiresAt?: string }>(`/api/write/docs/${docId}/share`, { token })
      .then(setCur)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [open, docId, token, toast]);
  const make = async () => {
    try {
      const r = await api<{ token: string; days: number }>(`/api/write/docs/${docId}/share`, { method: "POST", token, body: { days } });
      setCur({ token: r.token, expiresAt: new Date(Date.now() + r.days * 86400_000).toISOString() });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const stop = async () => {
    try {
      await api(`/api/write/docs/${docId}/share`, { method: "DELETE", token });
      setCur({ token: null });
      toast("הקישור בוטל", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="שיתוף בקישור לצפייה" footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">כל מי שיש לו את הקישור יכול לקרוא את המסמך, בלי להתחבר ובלי לערוך. ההערות האישיות שלכם לא נחשפות. הקישור שומר את מצב המסמך הנוכחי בכל פתיחה, ופג תוקף אחרי הזמן שבחרתם.</p>
      <Field label="תוקף הקישור (ימים)" htmlFor="sh-days">
        <input id="sh-days" type="number" min={1} max={90} dir="ltr" value={days} onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))} />
      </Field>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={make}>
          {cur?.token ? "יצירת קישור חדש (הישן יבוטל)" : "יצירת קישור"}
        </button>
        {cur?.token && (
          <button type="button" className="btn" onClick={stop}>
            ביטול הקישור
          </button>
        )}
      </div>
      {url && (
        <>
          <Field label="הקישור" htmlFor="sh-url">
            <input id="sh-url" readOnly dir="ltr" value={url} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <a className="btn btn-small" href={`https://wa.me/?text=${encodeURIComponent(`${snap0Title(docId)} ${url}`)}`} target="_blank" rel="noopener noreferrer">
            שליחה בוואטסאפ (נפתח בחלון חדש)
          </a>{" "}
          <button
            type="button"
            className="btn btn-small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast("הקישור הועתק", { kind: "success" });
              } catch {
                toast("ההעתקה נכשלה. סמנו ידנית", { kind: "error" });
              }
            }}
          >
            העתקת הקישור
          </button>
        </>
      )}
    </Modal>
  );
}

interface Issue {
  blockId: string | null;
  kind: string;
  label: string;
  sample: string;
}

/** 143 + 150: קריאוּת והצעות לשם. */
export function ReadabilityModal({ open, onClose, snap, token, onTitle, onClean }: { open: boolean; onClose: () => void; snap: Snap; token: string | null; onTitle: (t: string) => void; onClean?: () => void }) {
  const [res, setRes] = useState<{ issues: Issue[]; ok: boolean } | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setRes(null);
    setErr("");
    api<{ issues: Issue[]; ok: boolean }>("/api/write/readability", { method: "POST", token, body: payload(snap) })
      .then(setRes)
      .catch((e) => setErr(errorMessage(e)));
    api<{ titles: string[] }>("/api/write/title-ideas", { method: "POST", token, body: payload(snap) })
      .then((r) => setTitles(r.titles))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="קריאוּת והצעות לשם" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {err && <p className="error-box" role="alert">{err}</p>}
      {!res && !err && <p role="status">בודק…</p>}
      {res && (res.ok ? <p className="ok-box">לא נמצאו בעיות קריאוּת. הטקסט קצר וברור.</p> : (
        <ul aria-label="נקודות לשיפור">
          {res.issues.map((i, n) => (
            <li key={n}>
              {i.label}
              {i.sample && <span className="hint"> · "{i.sample}…"</span>}
            </li>
          ))}
        </ul>
      ))}
      {res && onClean && res.issues.some((i) => i.kind === "double-space" || i.kind === "space-before-punct") && (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            onClean();
            onClose();
          }}
        >
          ניקוי אוטומטי של רווחים כפולים ורווח לפני פיסוק
        </button>
      )}
      <h3 className="subtitle">הצעות לשם</h3>
      <ul className="plain-list">
        {titles.map((t) => (
          <li key={t}>
            <span>{t}</span>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                onTitle(t);
                onClose();
              }}
            >
              שימוש בשם<span className="sr-only">: {t}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

const fmt = (s: number) => `${String(Math.floor(Math.abs(s) / 60)).padStart(2, "0")}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

/** 147: מצב הרצה. עוברים שלב אחרי שלב עם טיימר, בלי עורך ובלי הסחות. */
export function RunMode({ snap, onClose }: { snap: Snap; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [left, setLeft] = useState((snap.blocks[0]?.minutes ?? 0) * 60);
  const [running, setRunning] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [big, setBig] = useState(1);
  const beeped = useRef(false);
  const b = snap.blocks[i];
  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setLeft((x) => x - 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => {
    if (left === 0 && running && !beeped.current && (b?.minutes ?? 0) > 0) {
      beeped.current = true;
      try {
        navigator.vibrate?.([300, 150, 300]);
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const o = ctx.createOscillator();
          o.frequency.value = 880;
          o.connect(ctx.destination);
          o.start();
          o.stop(ctx.currentTime + 0.6);
        }
      } catch {
        /* sound is optional */
      }
    }
  }, [left, running, b]);
  const go = (n: number) => {
    beeped.current = false;
    if (n < 0 || n >= snap.blocks.length) return;
    setI(n);
    setLeft((snap.blocks[n].minutes ?? 0) * 60);
    setRunning(false);
  };
  if (!b) return null;
  return (
    <div className="write-run" role="dialog" aria-modal="true" aria-label="מצב הרצה">
      <div className="write-run-head">
        <p className="hint">
          שלב {i + 1} מתוך {snap.blocks.length} · {KIND_LABEL[b.kind]}
        </p>
        <button type="button" className="btn btn-small" ref={closeRef} onClick={onClose}>
          יציאה (Esc)
        </button>
      </div>
      <h2 className="write-run-title">{b.title || KIND_LABEL[b.kind]}</h2>
      <p className={`write-run-clock ${left < 0 ? "is-over" : ""}`} role="timer" aria-label={left < 0 ? "חריגה מהזמן" : "זמן שנותר"}>
        {left < 0 ? "-" : ""}
        {fmt(left)}
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => setRunning(!running)}>
          {running ? "עצירה" : "התחלה"}
        </button>
        <button type="button" className="btn" onClick={() => go(i - 1)} disabled={i === 0}>
          לשלב הקודם
        </button>
        <button type="button" className="btn" onClick={() => go(i + 1)} disabled={i === snap.blocks.length - 1}>
          לשלב הבא
        </button>
        <button type="button" className="btn btn-small" onClick={() => setBig((x) => Math.min(2, +(x + 0.2).toFixed(1)))}>
          הגדלת טקסט
        </button>
        <button type="button" className="btn btn-small" onClick={() => setBig((x) => Math.max(0.8, +(x - 0.2).toFixed(1)))}>
          הקטנת טקסט
        </button>
      </div>
      {snap.blocks[i + 1] && (
        <p className="hint">
          השלב הבא: {snap.blocks[i + 1].title || KIND_LABEL[snap.blocks[i + 1].kind]}
          {snap.blocks[i + 1].minutes ? ` (${snap.blocks[i + 1].minutes} דקות)` : ""}
        </p>
      )}
      <div className="write-run-text" style={{ fontSize: `${1.25 * big}rem` }}>
        <Md text={b.text} />
      </div>
    </div>
  );
}

interface Backup {
  docs: unknown[];
  snippets: unknown[];
}

/** 148: גיבוי ושחזור של כל המסמכים (חשוב במיוחד כשהמסד זמני). */
export function BackupPanel({ token, onDone }: { token: string | null; onDone: () => void }) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const download = async () => {
    try {
      const r = await fetch(`${API_URL}/api/write/backup`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const b = await r.blob();
      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = `גיבוי-מסמכים-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      toast("הורדת הגיבוי נכשלה", { kind: "error" });
    }
  };
  const restore = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as Backup;
      const r = await api<{ docs: number; snippets: number; skipped: number }>("/api/write/restore", { method: "POST", token, body: data });
      toast(`שוחזרו ${r.docs} מסמכים ו-${r.snippets} קטעים${r.skipped ? ` (${r.skipped} לא נכנסו)` : ""}`, { kind: "success" });
      onDone();
    } catch (e) {
      toast(e instanceof SyntaxError ? "הקובץ אינו גיבוי תקין" : errorMessage(e), { kind: "error" });
    }
  };
  return (
    <section aria-labelledby="w-backup" className="card glass">
      <h2 id="w-backup" className="section-title">
        גיבוי ושחזור
      </h2>
      <p className="hint">הורידו גיבוי של כל המסמכים והקטעים לקובץ אחד. באתר שרץ על שרת זמני זה מה שמציל את העבודה אחרי הפעלה מחדש. שחזור מוסיף עותקים ולא דורס מסמכים קיימים.</p>
      <div className="actions">
        <button type="button" className="btn" onClick={download}>
          הורדת גיבוי
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          שחזור מקובץ
        </button>
        <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="קובץ גיבוי לשחזור" tabIndex={-1} onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
      </div>
    </section>
  );
}

interface Shared {
  title: string;
  meta: { ageGroup: string; minutes: number | null; groupSize?: number | null; value?: string; leader?: string; date?: string };
  blocks: Block[];
  updatedAt: string;
  expiresAt: string;
}

/** 140: דף הצפייה הציבורי. */
export function SharedView({ token }: { token: string }) {
  const [d, setD] = useState<Shared | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Shared>(`/api/write/shared/${encodeURIComponent(token)}`)
      .then(setD)
      .catch((e) => setErr(errorMessage(e)));
  }, [token]);
  if (err)
    return (
      <p className="error-box" role="alert">
        {err} <Link href="/">לדף הראשי</Link>
      </p>
    );
  if (!d) return <Skeleton lines={5} />;
  const m = d.meta;
  return (
    <article className="write-shared">
      <h1>{d.title || "פעולה ללא שם"}</h1>
      <p className="hint">
        {[m.leader && `מדריך/ה: ${m.leader}`, m.date && `תאריך: ${m.date}`, m.ageGroup, m.minutes ? `${m.minutes} דקות` : "", m.groupSize ? `${m.groupSize} חניכים` : "", m.value && `ערך: ${m.value}`].filter(Boolean).join(" · ")}
      </p>
      <p className="hint">צפייה בלבד · עודכן {fmtDate(d.updatedAt)} · הקישור תקף עד {fmtDate(d.expiresAt)}</p>
      {d.blocks.map((b) => (
        <section key={b.id} className={`card glass kind-${b.kind}`}>
          <h2 className="section-title">
            {b.title || KIND_LABEL[b.kind]}
            {b.minutes ? ` (${b.minutes} דקות)` : ""}
          </h2>
          <Md text={b.text} />
        </section>
      ))}
      <VisitorComments token={token} stages={d.blocks.map((b) => ({ id: b.id, label: b.title || KIND_LABEL[b.kind] }))} />
    </article>
  );
}
