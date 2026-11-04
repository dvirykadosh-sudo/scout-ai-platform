"use client";

// כלים לשיתוף ולבטיחות (רעיונות 163–174): הערות מבקרים, תבניות שבט, סל מחזור,
// הכתבה קולית, השוואת גרסה ורכיבי עזר.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, fmtDate } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal, Skeleton } from "./ui";

export interface Comment {
  id: number;
  blockId: string | null;
  author: string;
  text: string;
  resolved?: number;
  createdAt: string;
}

/** 164: ההערות שהשאירו מי שקיבלו את הקישור, אצל הבעלים. */
export function CommentsModal({ open, onClose, docId, token, titleOf, onCount }: { open: boolean; onClose: () => void; docId: number; token: string | null; titleOf: (blockId: string | null) => string; onCount?: (n: number) => void }) {
  const toast = useToast();
  const [list, setList] = useState<Comment[] | null>(null);
  const load = useCallback(() => {
    api<Comment[]>(`/api/write/docs/${docId}/comments`, { token })
      .then((r) => {
        setList(r);
        onCount?.(r.filter((c) => !c.resolved).length);
      })
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [docId, token, toast, onCount]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="הערות מבקרים" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">הערות שהשאירו מי שקיבלו את קישור הצפייה. הן מוצגות כטקסט בלבד.</p>
      {list === null ? (
        <Skeleton lines={3} />
      ) : list.length === 0 ? (
        <p>עוד אין הערות. שתפו קישור צפייה כדי לקבל משוב.</p>
      ) : (
        <ul className="plain-list">
          {list.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.author}</strong> · <span className="hint">{c.blockId ? `בשלב "${titleOf(c.blockId)}"` : "הערה כללית"} · {fmtDate(c.createdAt)}</span>
                {c.resolved ? <span className="hint"> · טופלה</span> : null}
                <br />
                {c.text}
              </span>
              <span className="actions">
                <button type="button" className="btn btn-small" onClick={() => act(() => api(`/api/write/docs/${docId}/comments/${c.id}`, { method: "PATCH", token, body: { resolved: !c.resolved } }))}>
                  {c.resolved ? "פתיחה מחדש" : "סימון כטופלה"}
                  <span className="sr-only">: הערה של {c.author}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => act(() => api(`/api/write/docs/${docId}/comments/${c.id}`, { method: "DELETE", token }))}>
                  מחיקה<span className="sr-only">: הערה של {c.author}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** 164: טופס ההערה אצל מי שצופה בקישור. */
export function VisitorComments({ token, stages }: { token: string; stages: { id: string; label: string }[] }) {
  const toast = useToast();
  const [list, setList] = useState<Comment[]>([]);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [blockId, setBlockId] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Comment[]>(`/api/write/shared/${encodeURIComponent(token)}/comments`)
      .then(setList)
      .catch(() => {});
  }, [token]);
  useEffect(load, [load]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api(`/api/write/shared/${encodeURIComponent(token)}/comments`, { method: "POST", body: { author, text, ...(blockId ? { blockId } : {}) } });
      setText("");
      toast("ההערה נשלחה", { kind: "success" });
      load();
    } catch (x) {
      setErr(errorMessage(x));
    }
    setBusy(false);
  };
  return (
    <section className="card glass" aria-labelledby="vc-title">
      <h2 id="vc-title" className="section-title">
        הערות ומשוב
      </h2>
      {list.length > 0 && (
        <ul className="plain-list" aria-label="הערות קיימות">
          {list.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.author}</strong>
                {c.blockId ? ` · ${stages.find((s) => s.id === c.blockId)?.label ?? ""}` : ""}
                <br />
                {c.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send} noValidate>
        {err && (
          <p className="error-box" role="alert">
            {err}
          </p>
        )}
        <Field label="השם שלך" htmlFor="vc-name">
          <input id="vc-name" value={author} maxLength={40} onChange={(e) => setAuthor(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="על איזה שלב?" htmlFor="vc-stage">
          <select id="vc-stage" value={blockId} onChange={(e) => setBlockId(e.target.value)}>
            <option value="">הערה כללית</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ההערה" htmlFor="vc-text">
          <textarea id="vc-text" rows={3} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={busy || !author.trim() || !text.trim()}>
          {busy ? "שולח…" : "שליחת ההערה"}
        </button>
      </form>
    </section>
  );
}

interface TribeTpl {
  id: number;
  title: string;
  stages: number;
  createdBy: string;
}

/** 165: תבניות השבט ברשימה. אדמין יכול גם למחוק. */
export function TribeTemplates({ token, isAdmin, onCreate, busy }: { token: string | null; isAdmin: boolean; onCreate: (id: number) => void; busy: boolean }) {
  const toast = useToast();
  const [list, setList] = useState<TribeTpl[]>([]);
  const [usage, setUsage] = useState<{ docs: number; writers: number; shares: number; comments: number } | null>(null);
  const load = useCallback(() => {
    api<TribeTpl[]>("/api/write/tribe-templates", { token })
      .then(setList)
      .catch(() => {});
    if (isAdmin)
      api<{ docs: number; writers: number; shares: number; comments: number }>("/api/admin/write-usage", { token })
        .then(setUsage)
        .catch(() => {});
  }, [token, isAdmin]);
  useEffect(load, [load]);
  if (!list.length && !isAdmin) return null;
  return (
    <>
      <h3 className="subtitle">תבניות השבט</h3>
      {list.length === 0 ? (
        <p className="hint">אדמין יכול לפרסם מסמך כתבנית לכל המדריכים מתוך העורך.</p>
      ) : (
        <ul className="plain-list">
          {list.map((t) => (
            <li key={t.id}>
              <span>
                <strong>{t.title}</strong> <span className="hint">· {t.stages} שלבים · פורסמה על ידי {t.createdBy}</span>
              </span>
              <span className="actions">
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => onCreate(t.id)}>
                  התחלה מתבנית השבט<span className="sr-only">: {t.title}</span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={async () => {
                      if (!window.confirm(`להסיר את "${t.title}" מתבניות השבט?`)) return;
                      try {
                        await api(`/api/admin/write-templates/${t.id}`, { method: "DELETE", token });
                        load();
                      } catch (e) {
                        toast(errorMessage(e), { kind: "error" });
                      }
                    }}
                  >
                    הסרה<span className="sr-only">: {t.title}</span>
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && usage && (
        <p className="hint">
          שימוש בעורך באתר: {usage.docs} מסמכים אצל {usage.writers} כותבים, {usage.shares} קישורי צפייה פעילים, {usage.comments} הערות מבקרים.
        </p>
      )}
    </>
  );
}

interface TrashRow {
  id: number;
  title: string;
  words: number;
  deletedAt: string;
  daysLeft: number;
}

/** 166: סל מחזור. */
export function TrashPanel({ token, refreshKey, onRestored }: { token: string | null; refreshKey: number; onRestored: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<TrashRow[]>([]);
  const load = useCallback(() => {
    api<TrashRow[]>("/api/write/trash", { token })
      .then(setList)
      .catch(() => {});
  }, [token]);
  useEffect(load, [load, refreshKey]);
  if (!list.length) return null;
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg, { kind: "success" });
      load();
      onRestored();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <section aria-labelledby="w-trash" className="card glass">
      <details>
        <summary id="w-trash">סל מחזור ({list.length})</summary>
        <p className="hint">מסמכים שנמחקו נשמרים 30 יום, ואפשר להחזיר אותם.</p>
        <ul className="plain-list">
          {list.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.title}</strong> <span className="hint">· {r.words} מילים · יימחק לצמיתות בעוד {r.daysLeft} ימים</span>
              </span>
              <span className="actions">
                <button type="button" className="btn btn-small" onClick={() => act(() => api(`/api/write/trash/${r.id}/restore`, { method: "POST", token, body: {} }), "המסמך הוחזר")}>
                  שחזור<span className="sr-only">: {r.title}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    if (window.confirm(`למחוק את "${r.title}" לצמיתות?`)) act(() => api(`/api/write/trash/${r.id}`, { method: "DELETE", token }), "נמחק לצמיתות");
                  }}
                >
                  מחיקה לצמיתות<span className="sr-only">: {r.title}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** 169: הכתבה קולית בעברית, אם הדפדפן תומך. מוסיף טקסט בסוף השלב. */
interface Rec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
export function useDictation(onText: (t: string) => void) {
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const [on, setOn] = useState(false);
  const supported = typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  const stop = useCallback(() => {
    rec.current?.stop();
    rec.current = null;
    setOn(false);
  }, []);
  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) return;
    const r = new C();
    r.lang = "he-IL";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) cb.current(e.results[i][0].transcript.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  }, []);
  useEffect(() => () => rec.current?.stop(), []);
  return { supported, on, start, stop };
}

/** 163: השוואת מילים בין שתי גרסאות. מחזיר קטעים עם סימון הוספה והסרה. */
export function wordDiff(a: string, b: string): { t: string; k: "same" | "add" | "del" }[] {
  const x = a.split(/(\s+)/).filter(Boolean);
  const y = b.split(/(\s+)/).filter(Boolean);
  const n = x.length;
  const m = y.length;
  if (n * m > 400_000) return [{ t: a, k: "del" }, { t: b, k: "add" }];
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: string; k: "same" | "add" | "del" }[] = [];
  let i = 0;
  let j = 0;
  const push = (t: string, k: "same" | "add" | "del") => {
    const last = out[out.length - 1];
    if (last && last.k === k) last.t += t;
    else out.push({ t, k });
  };
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push(x[i], "same");
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push(x[i++], "del");
    else push(y[j++], "add");
  }
  while (i < n) push(x[i++], "del");
  while (j < m) push(y[j++], "add");
  return out;
}

/** מנקה רווחים כפולים ורווח לפני פיסוק (167). זהה לכלל בשרת. */
export const cleanText = (t: string) => t.replace(/([^\n\s])[^\S\n]{2,}(?=\S)/g, "$1 ").replace(/[^\S\n]+([,.!?:;])(?=\s|$)/g, "$1");

/** 168: מרקדאון להורדה. */
export function toMarkdown(title: string, meta: { ageGroup: string; minutes: number | null; value?: string }, blocks: { title: string; minutes: number | null; text: string }[]) {
  const head = [meta.ageGroup, meta.minutes ? `${meta.minutes} דקות` : "", meta.value ? `ערך: ${meta.value}` : ""].filter(Boolean).join(" | ");
  return [`# ${title || "פעולה"}`, head, ...blocks.map((b) => `\n## ${b.title || "שלב"}${b.minutes ? ` (${b.minutes} דקות)` : ""}\n\n${b.text}`)].filter((s) => s !== "").join("\n");
}
