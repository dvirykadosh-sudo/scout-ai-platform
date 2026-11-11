"use client";

// שלב 62: "שאלו את מעוז". חלון השיחה של הנשר. התשובות מגיעות משרת האתר: קודם מתוך מה שבאמת קיים (דפי האתר, המתודות,
// הערכים, המאגר והיומן של המדריך), ורק אם הוגדר מפתח גם בניסוח של מודל. כל תשובה מגיעה עם כפתורי "פתח".
// השיחה נשמרת בזיכרון הדפדפן בלבד (נעלמת ברענון) ולא נשלחת לשמירה בשרת.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { calmMotion } from "@/lib/lux/motion";

export interface EagleLink {
  label: string;
  href: string;
}
export interface EagleCard {
  title: string;
  meta: string;
  href: string;
}
export interface EagleDraft {
  title: string;
  ageGroup: string;
  minutes: number | null;
  value: string;
}
/** כפתור פעולה בתשובה: קישור (למשל למחולל עם פרטים מולאו) או יצירת טיוטה בעורך */
export interface EagleAction {
  label: string;
  href?: string;
  draft?: EagleDraft;
}
interface Reply {
  answer: string;
  items?: string[];
  actions?: EagleAction[];
  note?: string;
  links?: EagleLink[];
  cards?: EagleCard[];
  suggestions?: string[];
  source?: "local" | "ai";
  capped?: boolean;
  topic?: string;
}
export interface Msg {
  id: number;
  role: "me" | "eagle";
  text: string;
  items?: string[];
  actions?: EagleAction[];
  note?: string;
  links?: EagleLink[];
  cards?: EagleCard[];
  suggestions?: string[];
  ai?: boolean;
  capped?: boolean;
  error?: boolean;
}
interface Info {
  starters: string[];
  ai: boolean;
}

const FALLBACK_STARTERS = ["תכתוב לי פעולה על אחריות לכיתה ו' 45 דקות", "שאלות לדיון על כבוד הדדי", "משחק היכרות קצר בלי ציוד", "איך מפעילים מצב במה?", "יש לך פעולה על אחריות?"];
const MAX = 400;

/** קישורים פנימיים בלבד: מגינים גם אם תשובה כלשהי תכיל כתובת חיצונית */
const safeHref = (h: string) => (/^\/(?!\/)[\w\-./?=&#%+]*$/.test(h) ? h : null);

/** מצב השיחה. נשמר ב-Mascot כדי שלא יאבד כשסוגרים ופותחים את החלון או עוברים עמוד. */
export function useEagleChat(token: string | null) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const id = useRef(0);
  const asked = useRef(false);
  const abort = useRef<AbortController | null>(null);

  // שאלות הפתיחה מהשרת (ונופלים לברירת מחדל אם אין חיבור)
  const loadInfo = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    api<Info>("/api/lux/eagle/info", { token: token ?? undefined })
      .then(setInfo)
      .catch(() => setInfo({ starters: FALLBACK_STARTERS, ai: false }));
  }, [token]);

  const ask = useCallback(
    async (raw: string) => {
      const q = raw.replace(/\s+/g, " ").trim().slice(0, MAX);
      if (q.length < 2 || busy) return;
      setMsgs((m) => [...m, { id: ++id.current, role: "me", text: q }]);
      setBusy(true);
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      try {
        const r = await api<Reply>("/api/lux/eagle/ask", { method: "POST", body: { q }, token: token ?? undefined, signal: ac.signal });
        setMsgs((m) => [
          ...m,
          { id: ++id.current, role: "eagle", text: r.answer, items: r.items, actions: r.actions, note: r.note, links: r.links, cards: r.cards, suggestions: r.suggestions?.slice(0, 3), ai: r.source === "ai", capped: r.capped },
        ]);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const text = e instanceof ApiError && e.status === 429 ? "שאלתם הרבה בזמן קצר. נסו שוב בעוד דקה." : e instanceof ApiError && e.status === 0 ? e.message : "לא הצלחתי לענות כרגע. נסו שוב בעוד רגע.";
        setMsgs((m) => [...m, { id: ++id.current, role: "eagle", text, error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, token],
  );

  /** יצירת טיוטה בעורך מתוך תשובה. מחזיר את הכתובת של המסמך החדש, או null (וההודעה מוצגת בשיחה). */
  const createDraft = useCallback(
    async (d: EagleDraft): Promise<string | null> => {
      try {
        const r = await api<{ href: string }>("/api/lux/eagle/draft", { method: "POST", body: d, token: token ?? undefined });
        return r.href;
      } catch (e) {
        const text = e instanceof ApiError && e.status === 409 ? e.message : e instanceof ApiError && e.status === 401 ? "כדי ליצור טיוטה צריך להתחבר." : "לא הצלחתי ליצור את הטיוטה. אפשר לנסות שוב.";
        setMsgs((m) => [...m, { id: ++id.current, role: "eagle", text, error: true }]);
        return null;
      }
    },
    [token],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    setMsgs([]);
    setBusy(false);
  }, []);

  // התנתקות או החלפת משתמש: לא משאירים שיחה (למשל תכנון אישי) על המסך
  useEffect(() => {
    return () => abort.current?.abort();
  }, []);
  const lastToken = useRef(token);
  useEffect(() => {
    if (lastToken.current !== token) {
      lastToken.current = token;
      reset();
      asked.current = false;
      setInfo(null);
    }
  }, [token, reset]);

  return { msgs, busy, info, ask, reset, loadInfo, createDraft };
}

export type EagleChatState = ReturnType<typeof useEagleChat>;

export function EagleChat({ chat, loggedIn, onBack, onClose }: { chat: EagleChatState; loggedIn: boolean; onBack: () => void; onClose: () => void }) {
  const { msgs, busy, info, ask, reset, loadInfo, createDraft } = chat;
  const router = useRouter();
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadInfo();
    input.current?.focus();
  }, [loadInfo]);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: calmMotion() ? "auto" : "smooth" });
  }, [msgs.length, busy]);

  const starters = (info?.starters ?? FALLBACK_STARTERS).filter((s) => loggedIn || !/מתוכנן לי/.test(s)).slice(0, 5);
  const copy = async (m: Msg) => {
    const txt = (m.items ?? []).join("\n");
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // דפדפן בלי הרשאת לוח: בוחרים ומעתיקים דרך שדה זמני
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    setCopied(m.id);
    window.setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 2000);
  };
  const makeDraft = async (d: EagleDraft) => {
    if (drafting) return;
    setDrafting(true);
    const href = await createDraft(d);
    setDrafting(false);
    if (href && safeHref(href)) router.push(href);
  };
  const send = (q: string) => {
    if (!q.trim() || busy) return;
    setText("");
    void ask(q);
    input.current?.focus();
  };

  return (
    <div className="eg">
      <div className="eg-head">
        <button type="button" className="eg-link" onClick={onBack}>
          <span aria-hidden="true">→</span> חזרה
        </button>
        <strong id="eg-title">שאלו את מעוז</strong>
        {msgs.length > 0 && (
          <button type="button" className="eg-link" onClick={reset}>
            שיחה חדשה
          </button>
        )}
        <button type="button" className="eg-x" onClick={onClose} aria-label="סגירת החלון">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div ref={list} className="eg-list" role="log" aria-live="polite" aria-relevant="additions" aria-labelledby="eg-title" tabIndex={0}>
        {msgs.length === 0 && (
          <div className="eg-hello">
            <p>אני עונה על שאלות על האתר, על מתודות וערכים, מחפש פעולות במאגר{loggedIn ? ", אומר מה מתוכנן לכם" : ""} ועוזר לכתוב פעולה: פרטים למחולל, שאלות לדיון, משחקי פתיחה וסיפורים. נסו:</p>
            <div className="eg-chips">
              {starters.map((s) => (
                <button key={s} type="button" className="eg-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`eg-msg ${m.role === "me" ? "is-me" : "is-eagle"} ${m.error ? "is-error" : ""}`}>
            <span className="sr-only">{m.role === "me" ? "אתם: " : "מעוז: "}</span>
            <p className="eg-text">{m.text}</p>
            {m.items && m.items.length > 0 && (
              <>
                <ol className="eg-items">
                  {m.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ol>
                <button type="button" className="eg-chip eg-copy" onClick={() => void copy(m)}>
                  {copied === m.id ? "הועתק" : "העתקת הכול"}
                </button>
                <span className="sr-only" role="status">
                  {copied === m.id ? "הטקסט הועתק" : ""}
                </span>
              </>
            )}
            {m.note && <p className="eg-note">{m.note}</p>}
            {m.ai && <p className="eg-note">נוסח בעזרת בינה מלאכותית. כדאי לבדוק מול הנהלים שלכם.</p>}
            {m.capped && <p className="eg-note">הגעתם למכסה היומית של ניסוח חופשי, אז אני עונה מתוך מה שיש באתר.</p>}
            {m.cards && m.cards.length > 0 && (
              <ul className="eg-cards">
                {m.cards.map((c) => {
                  const h = safeHref(c.href);
                  return h ? (
                    <li key={c.href + c.title}>
                      <Link href={h} className="eg-card">
                        <strong>{c.title}</strong>
                        {c.meta && <span>{c.meta}</span>}
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
            {m.actions && m.actions.length > 0 && (
              <div className="eg-links eg-actions">
                {m.actions.map((a) => {
                  if (a.draft) {
                    const d = a.draft;
                    return (
                      <button key={a.label} type="button" className="eg-open is-primary" disabled={drafting} onClick={() => void makeDraft(d)}>
                        {drafting ? "יוצר טיוטה..." : a.label}
                      </button>
                    );
                  }
                  const h = a.href ? safeHref(a.href) : null;
                  return h ? (
                    <Link key={a.label} href={h} className="eg-open is-primary">
                      {a.label} <span aria-hidden="true">←</span>
                    </Link>
                  ) : null;
                })}
              </div>
            )}
            {m.links && m.links.length > 0 && (
              <div className="eg-links">
                {m.links.map((l) => {
                  const h = safeHref(l.href);
                  return h ? (
                    <Link key={l.href + l.label} href={h} className="eg-open">
                      {l.label} <span aria-hidden="true">←</span>
                    </Link>
                  ) : null;
                })}
              </div>
            )}
            {m.suggestions && m.suggestions.length > 0 && m.id === msgs[msgs.length - 1]?.id && (
              <div className="eg-chips">
                {m.suggestions.map((s) => (
                  <button key={s} type="button" className="eg-chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p className="eg-msg is-eagle eg-typing" role="status">
            מעוז בודק<span className="eg-dots" aria-hidden="true"><i /><i /><i /></span>
          </p>
        )}
      </div>

      <form
        className="eg-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          ref={input}
          className="eg-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX}
          placeholder="מה תרצו לדעת?"
          aria-label="שאלה למעוז"
          autoComplete="off"
          enterKeyHint="send"
          dir="auto"
        />
        <button type="submit" className="btn btn-small btn-primary" disabled={busy || text.trim().length < 2}>
          שליחה
        </button>
      </form>
      <p className="eg-privacy">אל תכתבו שמות או פרטים מזהים של חניכים. השיחה לא נשמרת בשרת ונעלמת ברענון.</p>
    </div>
  );
}
