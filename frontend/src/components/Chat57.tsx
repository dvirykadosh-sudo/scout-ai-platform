"use client";

// שלב 57 (470–502): עוזר שיחות. ניתוח שיחה עם חניך או עם שכבה, ניסוח תגובות, הודעות לשכבה, מעקבים ותוסף למחשב.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { ExtensionTab, FollowTab } from "./ChatFollow57";
import { MessagesTab, ReplyTab } from "./ChatTools57";
import { Field, Skeleton } from "./ui";

export interface Variant { id: string; label?: string; text: string; slots?: string[]; neverHits?: { word: string }[]; words?: number }
export interface Replies { suppressed?: boolean; reason?: string; safe?: string[]; intent?: string; label?: string; variants?: Variant[]; avoid?: string[]; tip?: string | null }
export interface SafetyItem { cat: string; label: string; urgent: boolean; who: string; at: string | null; text: string }
export interface Safety { level: "none" | "attention" | "urgent"; cats: string[]; items: SafetyItem[]; advice: { title: string; do: string[]; dont: string[]; who: string[] } | null; hotlines: { name: string; number: string; note: string }[] }
interface Step { level: "urgent" | "high" | "normal" | "low"; text: string; why: string }
interface Alias { name: string; alias: string; count: number; isMe: boolean }
interface Analysis {
  mode: "one" | "group";
  counts: { messages: number; text: number; media: number; deleted: number; speakers: number };
  safety: Safety;
  needMe?: boolean;
  pending: { count: number; who: string[]; since: string | null; waitedHours: number | null; text: string; intent: { primary: string; all: string[] }; tone: { top: { id: string; label: string; example: string }[]; confidence: string; note: string } } | null;
  waitingForThem: { since: string; text: string } | null;
  intents: Record<string, number>;
  tone: { top: { id: string; label: string; count: number; example: string }[]; confidence: string; note: string };
  rhythm: { myMedianMinutes: number | null; theirMedianMinutes: number | null; answeredSameDay: number | null; myNightShare: number | null; unanswered: { who: string; at: string; waitedHours: number; answered: boolean; text: string; intent: string }[] } | null;
  participation: { who: string; count: number; share: number; avgWords: number; last: string | null; isMe: boolean }[];
  fading: { who: string; kind: "silent" | "drop"; was: number; now: number }[];
  openQuestions: { who: string; at: string | null; text: string }[];
  faq?: { id: string; label: string; count: number; askers: number; sample: string; advice: string }[];
  topics?: { word: string; count: number }[];
  heat?: { level: string; count: number; events: { who: string; at: string | null; kind: string; text: string }[]; by: { who: string; score: number }[] };
  lengthTrend?: { before: number; after: number; shorter: boolean } | null;
  toneTrend?: { week: string; messages: number; pos: number; neg: number }[];
  plan: Step[];
  replies: Replies | null;
  parse: { format: string; from: string | null; to: string | null; warnings: string[]; truncated: boolean };
  aliases: Alias[];
  scrubbed: Record<string, number>;
  intentLabels: Record<string, string>;
}
interface Parsed { format: string; count: number; systemCount: number; participants: { name: string; count: number }[]; from: string | null; to: string | null; truncated: boolean; warnings: string[] }
export type Gender = "n" | "m" | "f";

const TABS = [["analyze", "ניתוח שיחה"], ["reply", "ניסוח ובדיקת תגובה"], ["messages", "הודעות לשכבה ופתיחת שיחה"], ["follow", "מעקבים וסיכומים"], ["ext", "תוסף למחשב"]] as const;
type Tab = (typeof TABS)[number][0];
const LEVEL_LABEL: Record<string, string> = { urgent: "דחוף", high: "חשוב", normal: "רגיל", low: "כשיש זמן" };
const PREF_KEY = "maoz-chat-prefs";

export async function copyText(text: string, toast: ReturnType<typeof useToast>, extra = "") {
  try { await navigator.clipboard.writeText(text); toast(`הטקסט הועתק.${extra}`, { kind: "success" }); } catch { toast("ההעתקה נחסמה בדפדפן. סמנו את הטקסט והעתיקו ידנית.", { kind: "error" }); }
}

export function ChatHelper() {
  const { token, ready } = useAuth();
  const [tab, setTab] = useState<Tab>("analyze");
  const [gender, setGender] = useState<{ kid: Gender; guide: Gender }>({ kid: "n", guide: "n" });
  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); setGender({ kid: ["m", "f"].includes(p.kid) ? p.kid : "n", guide: ["m", "f"].includes(p.guide) ? p.guide : "n" }); } catch { /* ignore */ }
  }, []);
  const setG = (g: { kid: Gender; guide: Gender }) => {
    setGender(g);
    try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); localStorage.setItem(PREF_KEY, JSON.stringify({ ...p, ...g })); } catch { /* ignore */ }
  };

  if (!ready) return <Skeleton lines={4} />;
  if (!token) {
    return (
      <div className="card st-gate">
        <h2>עוזר השיחות פתוח למדריכים מחוברים</h2>
        <p>השיחות עם חניכים הן מידע רגיש, ולכן הכלי זמין רק אחרי התחברות.</p>
        <p><Link className="btn btn-primary" href="/account">להתחברות או הרשמה</Link></p>
      </div>
    );
  }
  return (
    <div className="st-studio ch">
      <section className="card ch-privacy" aria-labelledby="ch-priv-h">
        <h2 id="ch-priv-h">פרטיות לפני הכול</h2>
        <ul>
          <li>השיחה <strong>לא נשמרת</strong>. היא נשלחת לשרת של האתר בחיבור מוצפן, מוסתרת בזיכרון (שמות הופכים ל"חניך א'", וטלפונים, מיילים, קישורים וכתובות נמחקים), מנותחת ונמחקת.</li>
          <li>אפשר לשמור סיכום <strong>בלי טקסט ובלי שמות</strong>, והוא נמחק אחרי 30 יום.</li>
          <li>רק שמות של משתתפי השיחה מוסתרים אוטומטית. שם של חבר שמוזכר בטקסט צריך להוסיף ידנית בשדה "שמות נוספים".</li>
          <li>הכלי הוא עזר לשיקול דעת, לא תחליף. הוא <strong>לא תופס הכול</strong>: שפה עקיפה, סלנג ועקיצות יכולים לחמוק, ושום סימן אזהרה לא אומר שהכול בסדר.</li>
        </ul>
      </section>
      <div className="actions" role="tablist" aria-label="חלקי עוזר השיחות">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`ch-tab-${k}`} aria-selected={tab === k} className={tab === k ? "btn btn-primary" : "btn"} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`ch-tab-${tab}`} className="st-panel">
        {tab === "analyze" && <AnalyzeTab token={token} gender={gender} setGender={setG} />}
        {tab === "reply" && <ReplyTab token={token} gender={gender} setGender={setG} />}
        {tab === "messages" && <MessagesTab token={token} gender={gender} />}
        {tab === "follow" && <FollowTab token={token} />}
        {tab === "ext" && <ExtensionTab token={token} />}
      </div>
    </div>
  );
}

/* ───────────── קריאת קובץ ייצוא (txt או zip) ───────────── */
async function unzipFirstTxt(u8: Uint8Array): Promise<string> {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("קובץ ה-zip לא תקין.");
  const total = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder("utf-8");
  let best: { name: string; method: number; csize: number; off: number } | null = null;
  for (let i = 0; i < total && dv.getUint32(p, true) === 0x02014b50; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    if (/\.txt$/i.test(name) && (!best || /chat|צ'אט|וואטסאפ|whatsapp/i.test(name))) best = { name, method, csize, off };
    p += 46 + nl + xl + cl;
  }
  if (!best) throw new Error("לא נמצא קובץ txt בתוך ה-zip.");
  const ln = dv.getUint16(best.off + 26, true), lx = dv.getUint16(best.off + 28, true);
  const start = best.off + 30 + ln + lx;
  const data = u8.subarray(start, start + best.csize);
  if (best.method === 0) return dec.decode(data);
  if (best.method !== 8 || typeof DecompressionStream === "undefined") throw new Error("הדפדפן לא יכול לפתוח את ה-zip. פתחו אותו במחשב והעלו את קובץ ה-txt.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return dec.decode(await new Response(stream).arrayBuffer());
}
async function readExport(file: File): Promise<string> {
  if (file.size > 40_000_000) throw new Error("הקובץ גדול מדי. ייצאו בלי מדיה.");
  const u8 = new Uint8Array(await file.arrayBuffer());
  return u8[0] === 0x50 && u8[1] === 0x4b ? unzipFirstTxt(u8) : new TextDecoder("utf-8").decode(u8);
}

/* ───────────── רכיבים משותפים ───────────── */
export function ReplyList({ variants, label = "תגובות מוצעות" }: { variants: Variant[]; label?: string }) {
  const toast = useToast();
  const slots = useMemo(() => [...new Set(variants.flatMap((v) => v.slots ?? []))].slice(0, 5), [variants]);
  const [fills, setFills] = useState<Record<string, string>>({});
  const render = (t: string) => slots.reduce((s, k) => (fills[k]?.trim() ? s.split(k).join(fills[k].trim()) : s), t);
  const [checks, setChecks] = useState<Record<string, { level: string; text: string }[] | "busy">>({});
  const { token } = useAuth();
  const check = async (v: Variant) => {
    setChecks((c) => ({ ...c, [v.id]: "busy" }));
    try {
      const r = await api<{ items: { level: string; text: string }[] }>("/api/chat/check-reply", { method: "POST", token, body: { draft: render(v.text), where: "private", hour: new Date().getHours() } });
      setChecks((c) => ({ ...c, [v.id]: r.items.length ? r.items : [{ level: "ok", text: "לא מצאנו בעיה בניסוח." }] }));
    } catch (e) { toast(errorMessage(e), { kind: "error" }); setChecks((c) => { const n = { ...c }; delete n[v.id]; return n; }); }
  };
  return (
    <div className="ch-replies">
      <h3>{label}</h3>
      <p className="hint">אלה טיוטות. קראו, התאימו לחניך ושלחו בעצמכם. שום דבר לא נשלח אוטומטית.</p>
      {slots.length > 0 && (
        <div className="ch-slots" role="group" aria-label="השלמת מקומות בטיוטות">
          {slots.map((s, i) => (
            <Field key={s} label={`להשלמה: ${s.slice(1, -1)}`} htmlFor={`ch-slot-${i}`}>
              <input id={`ch-slot-${i}`} value={fills[s] ?? ""} maxLength={80} onChange={(e) => setFills((f) => ({ ...f, [s]: e.target.value }))} />
            </Field>
          ))}
        </div>
      )}
      <ul className="st-list ch-vars">
        {variants.map((v) => {
          const text = render(v.text);
          const ck = checks[v.id];
          return (
            <li key={v.id}>
              <div className="ch-var">
                {v.label && <strong className="ch-var-label">{v.label}</strong>}
                <p className="ch-var-text" dir="auto">{text}</p>
                {v.neverHits && v.neverHits.length > 0 && <p className="hint">מכילה מילה שביקשתם לא להגיד: {v.neverHits.map((h) => h.word).join(", ")}</p>}
                {Array.isArray(ck) && <ul className="ch-checks">{ck.map((c, i) => <li key={i} className={`ch-lv-${c.level}`}><strong>{c.level === "red" ? "עצור: " : c.level === "warn" ? "שימו לב: " : c.level === "ok" ? "" : "הצעה: "}</strong>{c.text}</li>)}</ul>}
              </div>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => copyText(text, toast, /\[[^\]]+\]/.test(text) ? " יש עדיין מקום להשלמה בסוגריים." : "")}>העתקה</button>
                <button type="button" className="btn btn-small" disabled={ck === "busy"} onClick={() => check(v)}>בדיקת ניסוח</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SafetyBox({ safety, compact = false }: { safety: Safety; compact?: boolean }) {
  if (safety.level === "none" || !safety.advice) return null;
  const urgent = safety.level === "urgent";
  return (
    <section className={`card ch-safety ${urgent ? "ch-urgent" : "ch-attention"}`} role={urgent ? "alert" : "region"} aria-labelledby="ch-safe-h">
      <h2 id="ch-safe-h">{urgent ? "🛑 " : "⚠️ "}{safety.advice.title}</h2>
      {!compact && safety.items.length > 0 && (
        <>
          <h3>מה זוהה</h3>
          <ul>{safety.items.slice(0, 6).map((x, i) => <li key={i}><strong>{x.label}</strong> ({x.who}{x.at ? `, ${x.at.replace("T", " ")}` : ""}): <q dir="auto">{x.text}</q></li>)}</ul>
        </>
      )}
      <div className="st-two">
        <div><h3>מה כן לעשות</h3><ul>{safety.advice.do.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
        <div><h3>מה לא לעשות</h3><ul>{safety.advice.dont.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
      </div>
      {safety.advice.who.length > 0 && <p><strong>את מי מעדכנים:</strong> {safety.advice.who.join(", ")}.</p>}
      <h3>קווי סיוע</h3>
      <ul className="ch-hot">{safety.hotlines.map((h) => <li key={h.number}><strong>{h.name}</strong>: <a href={`tel:${h.number}`} dir="ltr">{h.number}</a>. {h.note}</li>)}</ul>
      <p className="hint">ודאו תמיד מול נוהל ההגנה על ילדים של התנועה והשבט שלכם. במקרה של סתירה, הנוהל קודם.</p>
    </section>
  );
}

/* ───────────── ניתוח שיחה ───────────── */
function AnalyzeTab({ token, gender, setGender }: { token: string; gender: { kid: Gender; guide: Gender }; setGender: (g: { kid: Gender; guide: Gender }) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [meName, setMeName] = useState("");
  const [range, setRange] = useState("0");
  const [mode, setMode] = useState("auto");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Analysis | null>(null);
  const [showNames, setShowNames] = useState(false);
  const [lastBody, setLastBody] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); if (typeof p.me === "string") setMeName(p.me.slice(0, 60)); } catch { /* ignore */ } }, []);
  const clip = (t: string) => (t.length > 2_400_000 ? t.slice(-2_400_000) : t);
  const rangeBody = () => (range === "0" ? {} : range.startsWith("d") ? { lastDays: Number(range.slice(1)) } : { lastN: Number(range.slice(1)) });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { const t = await readExport(f); setText(clip(t)); setFileName(f.name); setParsed(null); setA(null); toast("הקובץ נקרא. עכשיו לחצו על \"קריאת השיחה\"."); } catch (e) { toast(e instanceof Error ? e.message : "לא הצלחנו לקרוא את הקובץ.", { kind: "error" }); }
  };
  const read = async () => {
    setBusy(true); setA(null);
    try {
      const r = await api<Parsed>("/api/chat/parse", { method: "POST", token, body: { text: clip(text) } });
      setParsed(r);
      if (!meName || !r.participants.some((p) => p.name === meName)) setMeName("");
    } catch (e) { toast(errorMessage(e), { kind: "error" }); } finally { setBusy(false); }
  };
  const analyze = async () => {
    setBusy(true);
    try {
      const body = { text: clip(text), me: meName, mode, kid: gender.kid, guide: gender.guide, extra: extra.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 12), ...rangeBody() };
      const r = await api<Analysis>("/api/chat/analyze", { method: "POST", token, body });
      setA(r); setLastBody(body);
      try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); localStorage.setItem(PREF_KEY, JSON.stringify({ ...p, me: meName })); } catch { /* ignore */ }
    } catch (e) { toast(errorMessage(e), { kind: "error" }); } finally { setBusy(false); }
  };
  const clear = () => { setText(""); setFileName(""); setParsed(null); setA(null); setLastBody(null); setShowNames(false); toast("השיחה נמחקה מהמסך."); };

  return (
    <div className="ch-analyze">
      <section className="card" aria-labelledby="ch-in-h">
        <h2 id="ch-in-h">1. הביאו את השיחה</h2>
        <p className="hint">בווטסאפ: פתחו את השיחה, תפריט ⋮, עוד, ייצוא צ'אט, <strong>בלי מדיה</strong>. אפשר להעלות את הקובץ (txt או zip), או להדביק טקסט, או הודעה אחת.</p>
        <Field label="קובץ ייצוא" htmlFor="ch-file" hint="הקובץ נקרא בדפדפן שלכם ונשלח רק אחרי שתלחצו על קריאת השיחה.">
          <input id="ch-file" type="file" accept=".txt,.zip,text/plain,application/zip" onChange={(e) => onFile(e.target.files?.[0])} />
        </Field>
        {fileName && <p className="hint">נטען: {fileName}</p>}
        <Field label="או הדביקו כאן" htmlFor="ch-text">
          <textarea id="ch-text" rows={6} value={text} onChange={(e) => { setText(e.target.value); setParsed(null); setA(null); }} placeholder={'12.10.2026, 18:20 - דני: אפשר להגיע באיחור?\n12.10.2026, 18:25 - אני: בטח'} dir="auto" />
        </Field>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={read}>קריאת השיחה</button>
          {text && <button type="button" className="btn" onClick={clear}>מחיקה מהמסך</button>}
        </div>
      </section>

      {parsed && (
        <section className="card" aria-labelledby="ch-opt-h">
          <h2 id="ch-opt-h">2. כמה פרטים</h2>
          <p>נמצאו <strong>{parsed.count}</strong> הודעות, {parsed.participants.length} משתתפים{parsed.from ? `, מ-${parsed.from.slice(0, 10)} עד ${parsed.to?.slice(0, 10)}` : ""}.</p>
          {parsed.warnings.map((w, i) => <p key={i} className="hint">{w}</p>)}
          {parsed.participants.length > 0 && (
            <fieldset className="st-kind">
              <legend>מי אתם בשיחה?</legend>
              {parsed.participants.slice(0, 20).map((p) => (
                <label key={p.name} className="st-choice"><input type="radio" name="ch-me" checked={meName === p.name} onChange={() => setMeName(p.name)} /><span>{p.name} ({p.count})</span></label>
              ))}
              <label className="st-choice"><input type="radio" name="ch-me" checked={meName === ""} onChange={() => setMeName("")} /><span>אף אחד (הודעה שהדבקתי)</span></label>
            </fieldset>
          )}
          <div className="st-row">
            <Field label="טווח" htmlFor="ch-range">
              <select id="ch-range" value={range} onChange={(e) => setRange(e.target.value)}>
                <option value="0">כל השיחה</option><option value="d14">14 ימים אחרונים</option><option value="d30">30 ימים אחרונים</option><option value="n100">100 הודעות אחרונות</option><option value="n500">500 הודעות אחרונות</option>
              </select>
            </Field>
            <Field label="סוג שיחה" htmlFor="ch-mode">
              <select id="ch-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="auto">זיהוי אוטומטי</option><option value="one">שיחה עם חניך</option><option value="group">שיחת קבוצה (שכבה)</option>
              </select>
            </Field>
            <Field label="שמות נוספים להסתרה" htmlFor="ch-extra" hint="חברים שמוזכרים בטקסט, מופרדים בפסיק">
              <input id="ch-extra" value={extra} maxLength={200} onChange={(e) => setExtra(e.target.value)} />
            </Field>
          </div>
          <div className="st-row">
            <Field label="החניך" htmlFor="ch-kid">
              <select id="ch-kid" value={gender.kid} onChange={(e) => setGender({ ...gender, kid: e.target.value as Gender })}><option value="n">לא ידוע (בוא/י)</option><option value="m">בן</option><option value="f">בת</option></select>
            </Field>
            <Field label="אני" htmlFor="ch-guide">
              <select id="ch-guide" value={gender.guide} onChange={(e) => setGender({ ...gender, guide: e.target.value as Gender })}><option value="n">לא משנה (שמח/ה)</option><option value="m">מדריך</option><option value="f">מדריכה</option></select>
            </Field>
          </div>
          <div className="actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={analyze}>{busy ? "מנתח..." : "ניתוח השיחה"}</button></div>
        </section>
      )}

      {a && <Results a={a} token={token} showNames={showNames} setShowNames={setShowNames} body={lastBody} />}
    </div>
  );
}

/* ───────────── תוצאות ───────────── */
function Results({ a, token, showNames, setShowNames, body }: { a: Analysis; token: string; showNames: boolean; setShowNames: (b: boolean) => void; body: Record<string, unknown> | null }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [fAlias, setFAlias] = useState(a.aliases.find((x) => !x.isMe)?.alias ?? "חניך א'");
  const [fNote, setFNote] = useState("");
  const [fDue, setFDue] = useState("");
  const label = (id: string) => a.intentLabels[id] ?? id;
  const real = (alias: string) => (showNames ? a.aliases.find((x) => x.alias === alias)?.name ?? alias : alias);
  const save = async () => {
    try { await api("/api/chat/saved", { method: "POST", token, body: { title, analysis: a } }); toast("הסיכום נשמר בלי טקסט ובלי שמות, ויימחק אחרי 30 יום.", { kind: "success" }); setTitle(""); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const addFollow = async () => {
    try { await api("/api/chat/followups", { method: "POST", token, body: { alias: fAlias, note: fNote, due: fDue || null } }); toast("המעקב נוסף ללשונית \"מעקבים וסיכומים\".", { kind: "success" }); setFNote(""); } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const urgent = a.safety.level === "urgent";
  return (
    <div className="ch-results" aria-live="polite">
      <h2>התוצאות</h2>
      <SafetyBox safety={a.safety} />
      <p className="hint">{a.mode === "group" ? "שיחת קבוצה" : "שיחה עם חניך"}: {a.counts.messages} הודעות, {a.counts.speakers} משתתפים{a.counts.media ? `, ${a.counts.media} מדיה` : ""}.{a.parse.truncated ? " נותחו ההודעות האחרונות בלבד." : ""} {Object.keys(a.scrubbed).length > 0 && `הוסתרו פרטים מזהים: ${Object.entries(a.scrubbed).map(([k, v]) => `${k} ${v}`).join(", ")}.`}</p>
      {a.needMe && <p className="warn-box card">לא בחרתם מי אתם בשיחה, ולכן לא ניתן לדעת מה מחכה לתשובה. חזרו לשלב 2 ובחרו.</p>}
      {a.aliases.length > 0 && (
        <p><label className="st-check"><input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /><span>הצגת שמות אמיתיים במסך (נשארים רק במסך הזה, לא נשמרים)</span></label>
          {showNames && <span className="hint">{a.aliases.map((x) => `${x.alias} = ${x.name}`).join(" · ")}</span>}</p>
      )}

      <section className="card" aria-labelledby="ch-plan-h">
        <h3 id="ch-plan-h">מה כדאי לעשות עכשיו</h3>
        <ol className="ch-plan">{a.plan.map((s, i) => <li key={i} className={`ch-step ch-lv-${s.level}`}><span className="ch-badge">{LEVEL_LABEL[s.level]}</span> <strong>{showNames ? s.text.replace(/חניך [א-ת]'/g, (m) => real(m)) : s.text}</strong><br /><span className="hint">{s.why}</span></li>)}</ol>
      </section>

      {a.pending && (
        <section className="card" aria-labelledby="ch-pend-h">
          <h3 id="ch-pend-h">מה מחכה לתשובה</h3>
          <p>{a.pending.count} הודעות מ{showNames ? a.pending.who.map(real).join(", ") : a.pending.who.join(", ")}{a.pending.waitedHours != null ? `, מחכות כבר ${a.pending.waitedHours} שעות` : ""}.</p>
          <blockquote className="st-story" dir="auto">{a.pending.text}</blockquote>
          <p><strong>כוונה שזוהתה:</strong> {a.pending.intent.all.map(label).join(", ")}. <strong>מצב רוח אפשרי:</strong> {a.pending.tone.top.length ? a.pending.tone.top.map((t) => t.label).join(", ") : "לא זוהה"} (אמינות {a.pending.tone.confidence}).</p>
          <p className="hint">{a.pending.tone.note}</p>
        </section>
      )}
      {a.replies?.suppressed && <section className="card"><h3>תגובות בטוחות</h3><p>{a.replies.reason}</p><ReplyList label="תגובות שמתאימות לרגע כזה" variants={(a.replies.safe ?? []).map((t, i) => ({ id: `s${i}`, text: t }))} /></section>}
      {a.replies && !a.replies.suppressed && a.replies.variants && (
        <section className="card">
          {a.replies.tip && <p className="warn-box card">{a.replies.tip}</p>}
          <ReplyList variants={a.replies.variants} />
          {a.replies.avoid && a.replies.avoid.length > 0 && <><h4>מה לא להגיד</h4><ul>{a.replies.avoid.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
        </section>
      )}
      {a.waitingForThem && <section className="card"><h3>ממתינים לתשובה שלהם</h3><p>ההודעה האחרונה בשיחה היא שלכם ({a.waitingForThem.since.replace("T", " ")}).</p></section>}

      {!urgent && (
        <>
          <section className="card" aria-labelledby="ch-tone-h">
            <h3 id="ch-tone-h">מצב רוח בשיחה</h3>
            {a.tone.top.length ? <ul>{a.tone.top.map((t) => <li key={t.id}><strong>{t.label}</strong> ({t.count}): <q dir="auto">{t.example}</q></li>)}</ul> : <p>לא זוהו סימני מצב רוח ברורים.</p>}
            <p className="hint">אמינות {a.tone.confidence}. {a.tone.note}</p>
            {Object.keys(a.intents).length > 0 && <p><strong>סוגי הודעות:</strong> {Object.entries(a.intents).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${label(k)} ${v}`).join(" · ")}</p>}
          </section>
          {a.rhythm && (
            <section className="card" aria-labelledby="ch-rh-h">
              <h3 id="ch-rh-h">קצב ותגובתיות</h3>
              <ul>
                {a.rhythm.myMedianMinutes != null && <li>זמן התגובה שלכם (חציון): {fmtMin(a.rhythm.myMedianMinutes)}</li>}
                {a.rhythm.theirMedianMinutes != null && <li>זמן התגובה שלהם אליכם (חציון): {fmtMin(a.rhythm.theirMedianMinutes)}</li>}
                {a.rhythm.answeredSameDay != null && <li>הודעות שנענו באותו יום: {a.rhythm.answeredSameDay}%</li>}
                {a.rhythm.myNightShare != null && <li>הודעות שלכם בין 22:00 ל-06:00: {a.rhythm.myNightShare}%</li>}
              </ul>
              {a.rhythm.unanswered.length > 0 && <><h4>הודעות שחיכו הכי הרבה</h4><ul>{a.rhythm.unanswered.map((u, i) => <li key={i}>{showNames ? real(u.who) : u.who}, {u.at.replace("T", " ")}: חיכתה {u.waitedHours} שעות{u.answered ? "" : " (ועדיין לא נענתה)"} <q dir="auto">{u.text}</q></li>)}</ul></>}
            </section>
          )}
          {a.fading.length > 0 && <section className="card"><h3>מי מתרחק</h3><ul>{a.fading.map((f, i) => <li key={i}>{showNames ? real(f.who) : f.who}: {f.kind === "silent" ? "לא כתב/ה בשבועיים האחרונים" : "ירידה בפעילות"} (היו {f.was} הודעות לשבועיים, עכשיו {f.now}).</li>)}</ul></section>}
          {a.lengthTrend?.shorter && <section className="card"><h3>ההודעות מתקצרות</h3><p>אורך ההודעה הממוצע ירד מ-{a.lengthTrend.before} ל-{a.lengthTrend.after} מילים.</p></section>}
          {a.mode === "group" && <GroupResults a={a} showNames={showNames} real={real} />}
        </>
      )}

      {a.safety.level === "none" && body && <AiBox token={token} body={body} />}

      <section className="card" aria-labelledby="ch-save-h">
        <h3 id="ch-save-h">שמירה ומעקב</h3>
        <div className="st-row">
          <Field label="כותרת לסיכום (בלי שם מלא)" htmlFor="ch-sv-title"><input id="ch-sv-title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="שיחה עם חניך א', אוקטובר" /></Field>
          <div className="actions"><button type="button" className="btn" disabled={!title.trim()} onClick={save}>שמירת סיכום (בלי טקסט)</button></div>
        </div>
        {!urgent && (
          <div className="st-row">
            <Field label="כינוי החניך" htmlFor="ch-f-alias"><input id="ch-f-alias" value={fAlias} maxLength={40} onChange={(e) => setFAlias(e.target.value)} /></Field>
            <Field label="משימת מעקב" htmlFor="ch-f-note" hint="משימה בלבד, בלי פרטים רגישים"><input id="ch-f-note" value={fNote} maxLength={140} onChange={(e) => setFNote(e.target.value)} placeholder="לשאול מה שלומו אחרי הפעולה" /></Field>
            <Field label="תאריך (לא חובה)" htmlFor="ch-f-due"><input id="ch-f-due" type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} /></Field>
            <div className="actions"><button type="button" className="btn" disabled={!fAlias.trim()} onClick={addFollow}>הוספת מעקב</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function GroupResults({ a, showNames, real }: { a: Analysis; showNames: boolean; real: (s: string) => string }) {
  return (
    <>
      <section className="card" aria-labelledby="ch-part-h">
        <h3 id="ch-part-h">מי מדבר בקבוצה</h3>
        <table className="ch-table">
          <caption className="sr-only">שיתוף הפעולה בקבוצה לפי משתתף</caption>
          <thead><tr><th scope="col">משתתף</th><th scope="col">הודעות</th><th scope="col">אחוז</th><th scope="col">מילים בהודעה</th><th scope="col">אחרונה</th></tr></thead>
          <tbody>{a.participation.slice(0, 15).map((p) => <tr key={p.who}><th scope="row">{p.isMe ? "אני" : showNames ? real(p.who) : p.who}</th><td>{p.count}</td><td><span className="ch-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, p.share)}%` }} /></span> {p.share}%</td><td>{p.avgWords}</td><td>{p.last ? p.last.slice(0, 10) : "-"}</td></tr>)}</tbody>
        </table>
      </section>
      {a.openQuestions.length > 0 && <section className="card"><h3>שאלות שלא נענו על ידכם</h3><ul>{a.openQuestions.map((q, i) => <li key={i}>{showNames ? real(q.who) : q.who}{q.at ? `, ${q.at.replace("T", " ")}` : ""}: <q dir="auto">{q.text}</q></li>)}</ul></section>}
      {a.faq && a.faq.length > 0 && <section className="card"><h3>שאלות שחוזרות</h3><ul>{a.faq.map((f) => <li key={f.id}><strong>{f.label}</strong>: {f.count} פעמים. <span className="hint">{f.advice}</span></li>)}</ul><p className="hint">בלשונית "הודעות לשכבה" אפשר להכין הודעה אחת שעונה על הכול.</p></section>}
      {a.topics && a.topics.length > 0 && <section className="card"><h3>על מה מדברים</h3><p>{a.topics.map((t) => `${t.word} (${t.count})`).join(" · ")}</p></section>}
      {a.heat && a.heat.level !== "none" && (
        <section className="card" aria-labelledby="ch-heat-h">
          <h3 id="ch-heat-h">קללות והדרה</h3>
          <p>נמצאו {a.heat.count} הודעות. רמה: {a.heat.level === "high" ? "גבוהה" : a.heat.level === "medium" ? "בינונית" : "נמוכה"}.</p>
          <ul>{a.heat.events.slice(-5).map((e, i) => <li key={i}>{showNames ? real(e.who) : e.who}{e.at ? `, ${e.at.replace("T", " ")}` : ""} ({e.kind})</li>)}</ul>
          <p className="hint">אנחנו לא מציגים את הציטוט עצמו. דברו עם הנפגעים בפרטי לפני שמטפלים בקבוצה.</p>
        </section>
      )}
      {a.toneTrend && a.toneTrend.length > 0 && (
        <section className="card"><h3>מגמת מצב רוח (4 שבועות)</h3>
          <table className="ch-table"><caption className="sr-only">הודעות חיוביות ושליליות לפי שבוע</caption><thead><tr><th scope="col">שבוע שמסתיים ב</th><th scope="col">הודעות</th><th scope="col">חיובי</th><th scope="col">שלילי</th></tr></thead>
            <tbody>{a.toneTrend.map((w) => <tr key={w.week}><th scope="row">{w.week}</th><td>{w.messages}</td><td>{w.pos}</td><td>{w.neg}</td></tr>)}</tbody></table>
        </section>
      )}
    </>
  );
}

const fmtMin = (m: number) => (m < 90 ? `${m} דקות` : m < 60 * 36 ? `${Math.round(m / 60)} שעות` : `${Math.round(m / 1440)} ימים`);

/* ───────────── ניסוח עם AI (481), רק בלי סימני מצוקה ורק באישור ───────────── */
function AiBox({ token, body }: { token: string; body: Record<string, unknown> }) {
  const toast = useToast();
  const [okExt, setOkExt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ mode: "ai" | "prompt"; prompt?: string; replies?: { label: string; text: string; flags: string[] }[]; note: string; droppedCount?: number } | null>(null);
  const run = async () => {
    setBusy(true);
    try { setOut(await api("/api/chat/ai", { method: "POST", token, body: { ...body, confirmExternal: okExt } })); } catch (e) { toast(errorMessage(e), { kind: "error" }); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="ch-ai-h">
      <h3 id="ch-ai-h">ניסוח מתקדם עם AI (לא חובה)</h3>
      <p className="hint">בלי מפתח AI באתר תקבלו הנחיה מוכנה להעתקה לצ'אט שאתם משתמשים בו, והיא כבר מוסתרת משמות ופרטים. עם מפתח, ההודעות האחרונות (מוסתרות) נשלחות לשירות חיצוני, ורק אחרי האישור שלכם. שיחה עם סימני מצוקה לא נשלחת לשם בכלל.</p>
      <label className="st-check"><input type="checkbox" checked={okExt} onChange={(e) => setOkExt(e.target.checked)} /><span>אני מאשר/ת לשלוח את ההודעות האחרונות, אחרי הסתרת שמות ופרטים, לשירות AI חיצוני (רק אם הוגדר מפתח באתר)</span></label>
      <div className="actions"><button type="button" className="btn" disabled={busy} onClick={run}>{busy ? "מכין..." : "הכנת ניסוח או הנחיה"}</button></div>
      {out && (
        <div aria-live="polite">
          <p className="hint">{out.note}</p>
          {out.mode === "prompt" && out.prompt && (
            <>
              <Field label="הנחיה להעתקה" htmlFor="ch-ai-prompt"><textarea id="ch-ai-prompt" readOnly rows={6} value={out.prompt} dir="auto" onFocus={(e) => e.currentTarget.select()} /></Field>
              <button type="button" className="btn btn-small" onClick={() => copyText(out.prompt ?? "", toast)}>העתקת ההנחיה</button>
            </>
          )}
          {out.mode === "ai" && out.replies && <ReplyList label="טיוטות מה-AI" variants={out.replies.map((r, i) => ({ id: `ai${i}`, label: r.label, text: r.text }))} />}
        </div>
      )}
    </section>
  );
}
