"use client";

// שלב 54: גילוי ומעורבות. נצפו לאחרונה (442), תגובות (447), חותמת צוות (449), חיפוש חכם (444) וחיפוש קולי (445),
// אומדן עלות (450), סקר שביעות רצון (448), דגלי תכונות (434) ונקודת "חדש" (452).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, storageGet, storageSet } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Field } from "./ui";

/* 434: דגלי תכונות */
let flagsPromise: Promise<Record<string, boolean>> | null = null;
export function useFlag(key: string, fallback = true): boolean {
  const [on, setOn] = useState(fallback);
  useEffect(() => {
    flagsPromise ??= api<{ flags: Record<string, boolean> }>("/api/flags").then((r) => r.flags).catch(() => ({}));
    void flagsPromise.then((f) => { if (key in f) setOn(f[key]); });
  }, [key]);
  return on;
}

/* 442: נצפו לאחרונה */
const RECENT = "scout.recent";
interface Seen { id: number; title: string }
const readRecent = (): Seen[] => { try { const v = JSON.parse(storageGet(RECENT) || "[]") as Seen[]; return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "number" && typeof x.title === "string").slice(0, 8) : []; } catch { return []; } };
export function pushRecent(s: Seen) { storageSet(RECENT, JSON.stringify([s, ...readRecent().filter((x) => x.id !== s.id)].slice(0, 8))); }
export function RecentlyViewed() {
  const [rows, setRows] = useState<Seen[]>([]);
  useEffect(() => setRows(readRecent()), []);
  if (!rows.length) return null;
  return (
    <section className="card glass recent" aria-labelledby="recent-h">
      <h2 id="recent-h" className="h3">המשיכו מאיפה שעצרתם</h2>
      <ul className="chip-list">
        {rows.map((r) => (<li key={r.id}><Link className="chip" href={`/library/${r.id}`}>{r.title}</Link></li>))}
      </ul>
      <button type="button" className="btn btn-small" onClick={() => { storageSet(RECENT, "[]"); setRows([]); }}>ניקוי הרשימה</button>
    </section>
  );
}

/* 447: תגובות אימוג'י */
interface Reacts { emojis: string[]; counts: Record<string, number>; mine: string[]; total: number }
const LABEL: Record<string, string> = { "👍": "אהבתי", "❤️": "אוהב", "💡": "רעיון מעולה", "🔥": "אש", "👏": "כל הכבוד" };
export function Reactions({ activityId }: { activityId: number }) {
  const { token } = useAuth();
  const toast = useToast();
  const [r, setR] = useState<Reacts | null>(null);
  const [say, setSay] = useState("");
  useEffect(() => { api<Reacts>(`/api/reactions/${activityId}`, { token }).then(setR).catch(() => {}); }, [activityId, token]);
  if (!r) return null;
  const tap = async (e: string) => {
    if (!token) return toast("התחברו כדי להגיב.", { kind: "info" });
    try {
      const n = await api<Reacts>(`/api/reactions/${activityId}`, { method: "PUT", token, body: { emoji: e } });
      setR(n);
      setSay(n.mine.includes(e) ? `הוספתם תגובה: ${LABEL[e]}` : `הסרתם את התגובה: ${LABEL[e]}`);
    } catch (x) { toast(errorMessage(x), { kind: "error" }); }
  };
  return (
    <section className="card glass no-print" aria-labelledby="react-h">
      <h2 id="react-h" className="h3">מה דעתכם על הפעולה?</h2>
      <div className="actions" role="group" aria-label="תגובות לפעולה">
        {r.emojis.map((e) => (
          <button key={e} type="button" className="btn react-btn" aria-pressed={r.mine.includes(e)} aria-label={`${LABEL[e]}, ${r.counts[e]} תגובות`} onClick={() => void tap(e)}>
            <span aria-hidden="true">{e}</span> <span aria-hidden="true">{r.counts[e]}</span>
          </button>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{say}</p>
    </section>
  );
}

/* 449: חותמת איכות */
export function VerifiedBadge({ v }: { v?: { at: string; note: string } | null }) {
  if (!v) return null;
  return (
    <p className="verified-badge" role="note">
      <span aria-hidden="true">✔ </span>נבדקה על ידי צוות השבט ({new Date(v.at).toLocaleDateString("he-IL")}){v.note ? `: ${v.note}` : ""}
    </p>
  );
}

/* 444: חיפוש חכם כשאין תוצאות */
interface Smart { results: { id: number; title: string; value: string; ageGroup: string; minutes: number; via: string[] }[]; expanded: string[]; didYouMean: string | null }
export function SmartFallback({ q, onPick }: { q: string; onPick: (s: string) => void }) {
  const [d, setD] = useState<Smart | null>(null);
  useEffect(() => {
    setD(null);
    if (q.trim().length < 2) return;
    let live = true;
    api<Smart>(`/api/search/smart?q=${encodeURIComponent(q)}`).then((r) => live && setD(r)).catch(() => {});
    return () => { live = false; };
  }, [q]);
  if (!d || (!d.results.length && !d.didYouMean)) return null;
  return (
    <section className="card glass smart-fallback" aria-labelledby="smart-h">
      <h2 id="smart-h" className="h3">חיפוש חכם</h2>
      {d.didYouMean && (<p>האם התכוונתם ל<button type="button" className="link-btn" onClick={() => onPick(d.didYouMean!)}>{d.didYouMean}</button>?</p>)}
      {d.results.length > 0 && (
        <>
          <p>מצאנו {d.results.length} פעולות קרובות (כולל נרדפות וכתיב אחר):</p>
          <ul className="plain-list">
            {d.results.slice(0, 8).map((r) => (
              <li key={r.id}><Link href={`/library/${r.id}`}>{r.title}</Link><span> · {r.value} · {r.minutes} דקות</span></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* 445: חיפוש קולי */
type SR = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
export function VoiceSearchButton({ onText }: { onText: (t: string) => void }) {
  const flag = useFlag("voice-search", true);
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<SR | null>(null);
  useEffect(() => setOk(typeof window !== "undefined" && !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)), []);
  if (!ok || !flag) return null;
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const W = window as unknown as Record<string, new () => SR>;
    const r = new (W.SpeechRecognition || W.webkitSpeechRecognition)();
    r.lang = "he-IL";
    r.interimResults = false;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) onText(t.trim()); };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    setOn(true);
    r.start();
  };
  return (
    <button type="button" className="btn btn-small" aria-pressed={on} onClick={toggle}>
      {on ? "מקשיב… לחצו לעצירה" : "חיפוש בקול"}
    </button>
  );
}

/* 450: אומדן עלות */
interface Cost { groupSize: number; lines: { item: string; qty: number; basis: string; unitPrice: number | null; total: number | null; source: string }[]; total: number; perParticipant: number; unknown: string[]; note: string }
export function CostPanel({ activityId }: { activityId: number }) {
  const { token } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Cost | null>(null);
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState("");
  const load = useCallback(() => { api<Cost>("/api/cost/estimate", { method: "POST", token, body: { activityId } }).then(setD).catch((e) => toast(errorMessage(e), { kind: "error" })); }, [activityId, token, toast]);
  useEffect(() => { if (open && !d) load(); }, [open, d, load]);
  const openEdit = async () => {
    if (!token) return toast("התחברו כדי לשמור רשימת מחירים אישית.", { kind: "info" });
    try { const r = await api<{ mine: Record<string, number> }>("/api/me/prices", { token }); setTxt(Object.entries(r.mine).map(([k, v]) => `${k}=${v}`).join("\n")); setEdit(true); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const save = async () => {
    const prices: Record<string, number> = {};
    for (const line of txt.split("\n")) { const m = line.match(/^\s*(.+?)\s*[=:]\s*(\d+(?:\.\d+)?)\s*$/); if (m) prices[m[1]] = Number(m[2]); }
    try { await api("/api/me/prices", { method: "PUT", token, body: { prices } }); toast("רשימת המחירים נשמרה.", { kind: "success" }); setEdit(false); load(); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  return (
    <details className="card glass no-print cost-panel" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>אומדן עלות לפעולה</summary>
      {open && !d && <p role="status">מחשב…</p>}
      {d && (
        <>
          <p>בערך <strong>{d.total} ₪</strong> לקבוצה של {d.groupSize}, כלומר כ-{d.perParticipant} ₪ לחניך.</p>
          <div className="table-wrap" role="region" aria-label="פירוט עלות" tabIndex={0}>
            <table><caption className="sr-only">פירוט עלות לפי ציוד</caption>
              <thead><tr><th scope="col">פריט</th><th scope="col">כמות</th><th scope="col">מחיר ליחידה</th><th scope="col">סה״כ</th></tr></thead>
              <tbody>{d.lines.map((l, i) => (<tr key={i}><th scope="row">{l.item}</th><td>{l.qty}</td><td>{l.unitPrice ?? "לא ידוע"}</td><td>{l.total ?? "—"}</td></tr>))}</tbody></table>
          </div>
          {d.unknown.length > 0 && <p className="meter-tip">לא זוהה מחיר ל: {d.unknown.join(", ")}. אפשר להוסיף ברשימת המחירים שלכם.</p>}
          <p className="meter-tip">{d.note}</p>
          {!edit ? <button type="button" className="btn btn-small" onClick={() => void openEdit()}>עריכת רשימת מחירים</button> : (
            <>
              <Field label="מחיר ליחידה, שורה לכל פריט (למשל: חבל=50)" htmlFor="cost-prices"><textarea id="cost-prices" rows={5} value={txt} onChange={(e) => setTxt(e.target.value)} /></Field>
              <div className="actions"><button type="button" className="btn btn-primary btn-small" onClick={() => void save()}>שמירה</button><button type="button" className="btn btn-small" onClick={() => setEdit(false)}>ביטול</button></div>
            </>
          )}
        </>
      )}
    </details>
  );
}

/* 448: סקר שביעות רצון */
export function NpsPrompt() {
  const { token, user } = useAuth();
  const toast = useToast();
  const path = usePathname();
  const [due, setDue] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  useEffect(() => {
    if (!token || !user) { setDue(false); return; }
    if (storageGet("scout.nps.session") === "1") return;
    const id = window.setTimeout(() => { api<{ due: boolean }>("/api/nps/due", { token }).then((r) => setDue(r.due)).catch(() => {}); }, 6000);
    return () => window.clearTimeout(id);
  }, [token, user]);
  if (!due || /^\/(write|field|present|admin)/.test(path) || /\/(field|present)$/.test(path)) return null;
  const done = () => { setDue(false); storageSet("scout.nps.session", "1"); };
  const send = async () => {
    if (score == null) return;
    try { await api("/api/nps", { method: "POST", token, body: { score, comment } }); toast("תודה! התשובה עוזרת לנו להשתפר.", { kind: "success" }); done(); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const later = async () => { try { await api("/api/nps/dismiss", { method: "POST", token, body: {} }); } catch { /* ignore */ } done(); };
  return (
    <section className="nps card glass no-print" aria-labelledby="nps-h">
      <h2 id="nps-h" className="h3">שאלה קצרה</h2>
      <fieldset>
        <legend>עד כמה תמליצו על האתר למדריך אחר? (0 = בכלל לא, 10 = בהחלט)</legend>
        <div className="nps-scale">
          {Array.from({ length: 11 }, (_, i) => (
            <label key={i} className={score === i ? "nps-on" : ""}>
              <input type="radio" name="nps" value={i} checked={score === i} onChange={() => setScore(i)} />
              <span>{i}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {score != null && (<Field label="רוצים להוסיף משהו? (לא חובה)" htmlFor="nps-c"><textarea id="nps-c" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>)}
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={score == null} onClick={() => void send()}>שליחה</button>
        <button type="button" className="btn" onClick={() => void later()}>לא עכשיו</button>
      </div>
    </section>
  );
}

/* 452: נקודת "חדש" עד הכניסה הראשונה לדף */
export function NewDot({ id }: { id: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(storageGet(`scout.seen.${id}`) !== "1"), [id]);
  return show ? <span className="new-dot" role="img" aria-label="חדש" /> : null;
}
export function SeenMark({ id }: { id: string }) {
  useEffect(() => storageSet(`scout.seen.${id}`, "1"), [id]);
  return null;
}
