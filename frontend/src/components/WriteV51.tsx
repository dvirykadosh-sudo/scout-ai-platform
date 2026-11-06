"use client";

// שלב 51 (346–366): ארגז כלים לעורך: בדיקות, ציוד, חלוקות, כלי כיתה ודפי הדפסה.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal } from "./ui";
import { printHtml } from "./WriteV47";
import type { Block, Snap } from "./WriteParts";

const docBody = (s: Snap) => ({ title: s.title, meta: s.meta, blocks: s.blocks });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const linesOf = (t: string, max = 60) => t.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, max);
const reduced = () => typeof window !== "undefined" && (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("hc"));
const lsGet = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const rand = (n: number) => Math.floor(Math.random() * n);

interface P { snap: Snap; token: string | null; docId: number; names: string; onInsert: (t: string) => void }

function useInsight<T>(tool: string, snap: Snap, token: string | null) {
  const toast = useToast();
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    api<T>(`/api/write/insights/${tool}`, { method: "POST", token, body: docBody(snap) }).then(setData).catch((e) => toast(errorMessage(e), { kind: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
  return data;
}
const Loading = () => <p role="status">בודק…</p>;

/* 346 */
function Pace(p: P) {
  const d = useInsight<{ total: number; target: number; issues: { level: string; text: string }[] }>("pace", p.snap, p.token);
  if (!d) return <Loading />;
  const tag: Record<string, string> = { ok: "תקין", warn: "שימו לב", info: "הערה" };
  return (<><p>סך הכול {d.total} דקות{d.target ? ` מתוך ${d.target}` : ""}.</p><ul className="plain-list">{d.issues.map((i, k) => (<li key={k}><span><strong>{tag[i.level] ?? "הערה"}:</strong> {i.text}</span></li>))}</ul></>);
}

/* 347 */
function Energy(p: P) {
  const d = useInsight<{ points: { n: number; name: string; energy: number }[]; advice: string[] }>("energy", p.snap, p.token);
  if (!d) return <Loading />;
  const W = 320, H = 120, step = d.points.length > 1 ? (W - 40) / (d.points.length - 1) : 0;
  const xy = d.points.map((pt, i) => [20 + i * step, H - 16 - ((pt.energy - 1) / 4) * (H - 32)] as const);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="energy-svg" role="img" aria-label={`עקומת אנרגיה: ${d.points.map((x) => `שלב ${x.n} רמה ${x.energy}`).join(", ")}`}>
        <polyline points={xy.map((q) => q.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="3" />
        {xy.map((q, i) => (<g key={i}><circle cx={q[0]} cy={q[1]} r="5" fill="currentColor" /><text x={q[0]} y={H - 2} textAnchor="middle" fontSize="11" fill="currentColor">{d.points[i].n}</text></g>))}
      </svg>
      <ul className="plain-list">{d.points.map((x) => (<li key={x.n}><span>{x.n}. {x.name}: אנרגיה {x.energy} מתוך 5</span></li>))}</ul>
      {d.advice.map((a) => (<p key={a} className="meter-tip">{a}</p>))}
    </>
  );
}

/* 348 */
function Teams(p: P) {
  const toast = useToast();
  const [n, setN] = useState(3);
  const [apart, setApart] = useState("");
  const [res, setRes] = useState<string[][]>([]);
  const go = () => {
    const names = linesOf(p.names, 80);
    if (names.length < 2) return toast("הוסיפו שמות בתיבת השמות למעלה", { kind: "error" });
    const pairs = linesOf(apart).map((l) => l.split(/[,،]/).map((x) => x.trim()).filter(Boolean)).filter((x) => x.length >= 2);
    const bad = (a: string, b: string) => pairs.some((q) => q.includes(a) && q.includes(b));
    let best: string[][] = [];
    for (let t = 0; t < 80; t++) {
      const teams: string[][] = Array.from({ length: n }, () => []);
      let okAll = true;
      for (const name of shuffle(names)) {
        const cand = teams.map((m, i) => ({ m, i })).filter((x) => !x.m.some((o) => bad(o, name))).sort((a, b) => a.m.length - b.m.length);
        if (!cand.length) { okAll = false; teams.sort((a, b) => a.length - b.length)[0].push(name); } else cand[0].m.push(name);
      }
      best = teams;
      if (okAll) break;
    }
    setRes(best);
  };
  const text = res.map((t, i) => `קבוצה ${i + 1}: ${t.join(", ")}`).join("\n");
  return (
    <>
      <Field label="מספר קבוצות" htmlFor="v51-teams-n"><input id="v51-teams-n" type="number" min={2} max={10} value={n} onChange={(e) => setN(Math.max(2, Math.min(10, Number(e.target.value) || 2)))} /></Field>
      <Field label="מי לא באותה קבוצה? (שורה לכל קבוצת שמות מופרדים בפסיק)" htmlFor="v51-apart"><textarea id="v51-apart" rows={3} value={apart} onChange={(e) => setApart(e.target.value)} /></Field>
      <button type="button" className="btn btn-primary" onClick={go}>{res.length ? "ערבוב מחדש" : "חלוקה"}</button>
      {res.length > 0 && (<><ul className="plain-list" aria-live="polite">{res.map((t, i) => (<li key={i}><span><strong>קבוצה {i + 1} ({t.length}):</strong> {t.join(", ")}</span></li>))}</ul><button type="button" className="btn" onClick={() => { p.onInsert(`\n**חלוקה לקבוצות:**\n${text}\n`); toast("נוסף לשלב", { kind: "success" }); }}>הוספה לשלב</button></>)}
    </>
  );
}

/* 349 */
function Gear(p: P) {
  const toast = useToast();
  const d = useInsight<{ participants: number; teams: number; items: { item: string; qty: number; basis: string }[]; note: string }>("gear", p.snap, p.token);
  if (!d) return <Loading />;
  const text = d.items.map((i) => `- ${i.item}: ${i.qty}`).join("\n");
  return d.items.length === 0 ? <p>לא זיהיתי ציוד בטקסט. כתבו בשלבים מילים כמו חבל, כדור, נייר או קונוסים.</p> : (
    <>
      <p className="hint">לפי {d.participants} משתתפים ו-{d.teams} קבוצות.</p>
      <ul className="plain-list">{d.items.map((i) => (<li key={i.item}><span><strong>{i.item}:</strong> {i.qty} · {i.basis}</span></li>))}</ul>
      <p className="hint">{d.note}</p>
      <button type="button" className="btn" onClick={() => { p.onInsert(`\n**ציוד:**\n${text}\n`); toast("נוסף לשלב", { kind: "success" }); }}>הוספה לשלב</button>
    </>
  );
}

/* 350 */
function Roles(p: P) {
  const toast = useToast();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [who, setWho] = useState<Record<string, string>>({});
  const names = [a || "מדריך א׳", b || "מדריך ב׳"];
  const cur = (blk: Block, i: number) => who[blk.id] ?? names[i % 2];
  const text = p.snap.blocks.map((blk, i) => `${i + 1}. ${blk.title || "שלב"}: ${cur(blk, i)}`).join("\n");
  return (
    <>
      <Field label="מדריך ראשון" htmlFor="v51-r-a"><input id="v51-r-a" value={a} onChange={(e) => setA(e.target.value)} /></Field>
      <Field label="מדריך שני" htmlFor="v51-r-b"><input id="v51-r-b" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      <ul className="plain-list">{p.snap.blocks.map((blk, i) => (
        <li key={blk.id}><label htmlFor={`v51-r-${blk.id}`}>{i + 1}. {blk.title || "שלב"}</label>
          <select id={`v51-r-${blk.id}`} value={cur(blk, i)} onChange={(e) => setWho({ ...who, [blk.id]: e.target.value })}>{[...names, "שניהם"].map((n) => (<option key={n}>{n}</option>))}</select></li>
      ))}</ul>
      <button type="button" className="btn" onClick={() => { p.onInsert(`\n**חלוקת תפקידים:**\n${text}\n`); toast("נוסף לשלב", { kind: "success" }); }}>הוספה לשלב</button>
    </>
  );
}

/* 351 */
function Poster(p: P) {
  const toast = useToast();
  const [start, setStart] = useState("17:00");
  const rows = useMemo(() => {
    const [h, m] = start.split(":").map(Number);
    let t = (h || 0) * 60 + (m || 0);
    return p.snap.blocks.map((b) => { const s = t; t += b.minutes || 0; const f = (x: number) => `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; return { time: `${f(s)}–${f(t)}`, title: b.title || "שלב", minutes: b.minutes }; });
  }, [p.snap.blocks, start]);
  const print = () => printHtml("לוח זמנים", `<h1 style="font-size:44px">${esc(p.snap.title || "הפעולה")}</h1><table style="width:100%;font-size:30px"><tbody>${rows.map((r) => `<tr><td style="padding:14px;width:34%" dir="ltr">${r.time}</td><td style="padding:14px;text-align:right">${esc(r.title)}</td></tr>`).join("")}</tbody></table>`, toast);
  return (
    <>
      <Field label="שעת התחלה" htmlFor="v51-start"><input id="v51-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <ul className="plain-list">{rows.map((r, i) => (<li key={i}><span><span dir="ltr">{r.time}</span> · {r.title}</span></li>))}</ul>
      <button type="button" className="btn btn-primary" onClick={print}>הדפסה לקיר</button>
    </>
  );
}

/* 352, 365: רשימות להוספה */
function PickList({ tool, field, p, label }: { tool: string; field: string; p: P; label: string }) {
  const toast = useToast();
  const d = useInsight<Record<string, string[]>>(tool, p.snap, p.token);
  if (!d) return <Loading />;
  return (<><ul className="plain-list">{d[field].map((q) => (<li key={q}><span>{q}</span><button type="button" className="btn btn-small" onClick={() => { p.onInsert(`\n${q}\n`); toast("נוסף לשלב", { kind: "success" }); }}>הוספה לשלב</button></li>))}</ul>
    <button type="button" className="btn" onClick={() => { p.onInsert(`\n**${label}:**\n${d[field].map((q, i) => `${i + 1}. ${q}`).join("\n")}\n`); toast("כולן נוספו", { kind: "success" }); }}>הוספת הכול</button></>);
}

/* 353 */
function Emergency(p: P) {
  const toast = useToast();
  const [f, setF] = useState({ leader: "", phone: "", place: "", hospital: "", note: "" });
  const line = (v: string) => (v ? esc(v) : '<div class="line"></div>');
  const print = () => printHtml("כרטיס חירום", `<h1>כרטיס חירום: ${esc(p.snap.title || "פעולה")}</h1><p><b>מדריך אחראי:</b> ${line(f.leader)}</p><p><b>טלפון:</b> ${line(f.phone)}</p><p><b>מיקום הפעולה:</b> ${line(f.place)}</p><p><b>בית חולים / מד״א קרוב:</b> ${line(f.hospital)}</p><p><b>רגישויות, תרופות וחניכים שצריכים תשומת לב:</b></p>${f.note ? `<p>${esc(f.note)}</p>` : '<div class="line"></div><div class="line"></div><div class="line"></div>'}<p><b>מספרי חירום:</b> מד״א 101 · כבאות 102 · משטרה 100</p>`, toast);
  return (
    <>
      <p className="hint">הנתונים לא נשמרים באתר: הם נכנסים רק לדף המודפס. שדה ריק יודפס כקו למילוי ביד.</p>
      <Field label="מדריך אחראי" htmlFor="v51-e1"><input id="v51-e1" value={f.leader} onChange={(e) => setF({ ...f, leader: e.target.value })} /></Field>
      <Field label="טלפון" htmlFor="v51-e2"><input id="v51-e2" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="מיקום הפעולה" htmlFor="v51-e3"><input id="v51-e3" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
      <Field label="בית חולים קרוב" htmlFor="v51-e4"><input id="v51-e4" value={f.hospital} onChange={(e) => setF({ ...f, hospital: e.target.value })} /></Field>
      <Field label="הערות (בלי פרטים רפואיים של חניכים מזוהים אם אתם לא רוצים להדפיס אותם)" htmlFor="v51-e5"><textarea id="v51-e5" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <button type="button" className="btn btn-primary" onClick={print}>הדפסה</button>
    </>
  );
}

/* 354 */
function Tips(p: P) {
  const d = useInsight<{ tips: { n: number; name: string; say: string; watch: string; stuck: string }[] }>("tips", p.snap, p.token);
  if (!d) return <Loading />;
  return (<ol>{d.tips.map((t) => (<li key={t.n}><strong>{t.name}</strong><br />מה לומר: {t.say}<br />על מה לשים לב: {t.watch}<br />אם נתקעים: {t.stuck}</li>))}</ol>);
}

/* 355, 356 */
function Clarity(p: P) {
  const d = useInsight<{ issues: { stage: number; name: string; text: string; why: string }[]; ok: boolean }>("clarity", p.snap, p.token);
  if (!d) return <Loading />;
  return d.ok ? <p>הניסוח ברור: לא נמצאו משפטים ארוכים במיוחד.</p> : (<ul className="plain-list">{d.issues.map((i, k) => (<li key={k}><span><strong>שלב {i.stage} ({i.name}):</strong> “{i.text}” · {i.why}</span></li>))}</ul>);
}
function Inclusive(p: P) {
  const d = useInsight<{ hits: { stage: number; name: string; found: string; suggest: string; count: number }[]; note: string }>("inclusive", p.snap, p.token);
  if (!d) return <Loading />;
  return (<>{d.hits.length === 0 ? <p>לא נמצאו ניסוחים לבדיקה.</p> : <ul className="plain-list">{d.hits.map((h, k) => (<li key={k}><span><strong>שלב {h.stage}:</strong> “{h.found}” ({h.count}) · אפשר: {h.suggest}</span></li>))}</ul>}<p className="hint">{d.note}</p></>);
}

/* 357 */
function Score(p: P) {
  const key = `scout.v51.score.${p.docId}`;
  const [teams, setTeams] = useState<{ n: string; s: number }[]>(() => lsGet(key, [{ n: "קבוצה 1", s: 0 }, { n: "קבוצה 2", s: 0 }]));
  const save = (t: typeof teams) => { setTeams(t); lsSet(key, t); };
  const top = Math.max(...teams.map((t) => t.s));
  return (
    <>
      <ul className="score-list">{teams.map((t, i) => (
        <li key={i}>
          <input aria-label={`שם קבוצה ${i + 1}`} value={t.n} onChange={(e) => save(teams.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} />
          <output className={`score-n${t.s === top && top > 0 ? " lead" : ""}`} aria-live="polite">{t.s}{t.s === top && top > 0 ? " (מובילה)" : ""}</output>
          {[1, 5, -1].map((d) => (<button key={d} type="button" className="btn" onClick={() => save(teams.map((x, j) => (j === i ? { ...x, s: x.s + d } : x)))} aria-label={`${d > 0 ? "הוספת" : "הורדת"} ${Math.abs(d)} נקודות ל${t.n}`}>{d > 0 ? `+${d}` : `−${Math.abs(d)}`}</button>))}
        </li>))}</ul>
      <div className="actions">
        {teams.length < 6 && <button type="button" className="btn" onClick={() => save([...teams, { n: `קבוצה ${teams.length + 1}`, s: 0 }])}>הוספת קבוצה</button>}
        {teams.length > 2 && <button type="button" className="btn" onClick={() => save(teams.slice(0, -1))}>הסרת קבוצה</button>}
        <button type="button" className="btn" onClick={() => save(teams.map((t) => ({ ...t, s: 0 })))}>איפוס</button>
      </div>
    </>
  );
}

/* 358 */
function Wheel(p: P) {
  const names = linesOf(p.names, 80);
  const [shown, setShown] = useState("");
  const [busy, setBusy] = useState(false);
  const spin = () => {
    if (names.length < 2) return;
    const final = names[rand(names.length)];
    if (reduced()) return setShown(final);
    setBusy(true);
    let i = 0;
    const t = setInterval(() => { setShown(names[rand(names.length)]); if (++i > 14) { clearInterval(t); setShown(final); setBusy(false); } }, 90);
  };
  return (
    <>
      {names.length < 2 ? <p>הוסיפו לפחות שני שמות בתיבת השמות למעלה.</p> : <button type="button" className="btn btn-primary" onClick={spin} disabled={busy}>הגרלה</button>}
      <p className="wheel-out" aria-live="polite" aria-atomic="true">{busy ? "מגריל…" : shown ? `נבחר/ה: ${shown}` : ""}</p>
      <div className="wheel-vis" aria-hidden="true">{shown}</div>
    </>
  );
}

/* 359 */
function Dice(p: P) {
  void p;
  const [out, setOut] = useState("");
  const roll = (s: number) => setOut(`קובייה של ${s}: ${1 + rand(s)}`);
  return (
    <>
      <div className="actions">
        {[6, 12, 20].map((s) => (<button key={s} type="button" className="btn" onClick={() => roll(s)}>קובייה {s}</button>))}
        <button type="button" className="btn" onClick={() => setOut(`מטבע: ${rand(2) ? "עץ" : "פלי"}`)}>הטלת מטבע</button>
      </div>
      <p className="wheel-out" aria-live="polite">{out}</p>
    </>
  );
}

/* 360 */
function Noise(p: P) {
  void p;
  const [on, setOn] = useState(false);
  const [lvl, setLvl] = useState(0);
  const [limit, setLimit] = useState(60);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const toast = useToast();
  const stop = useCallback(() => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach((t) => t.stop()); void ctx.current?.close().catch(() => {}); ctx.current = null; setOn(false); setLvl(0); }, []);
  useEffect(() => stop, [stop]);
  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext(); ctx.current = ac;
      const an = ac.createAnalyser(); an.fftSize = 512;
      ac.createMediaStreamSource(stream.current).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) ** 2; setLvl(Math.min(100, Math.round(Math.sqrt(s / buf.length) * 2.2))); raf.current = requestAnimationFrame(loop); };
      loop(); setOn(true);
    } catch { toast("אין גישה למיקרופון. אפשרו אותו בדפדפן.", { kind: "error" }); }
  };
  const label = lvl > limit ? "רועש מדי" : lvl > limit * 0.6 ? "מתחמם" : "שקט";
  return (
    <>
      <p className="hint">המד מודד עוצמה בלבד. שום קול לא נשמר ולא נשלח.</p>
      <Field label={`סף רעש (${limit})`} htmlFor="v51-limit"><input id="v51-limit" type="range" min={20} max={90} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></Field>
      {on ? <button type="button" className="btn btn-primary" onClick={stop}>עצירה</button> : <button type="button" className="btn btn-primary" onClick={() => void start()}>הפעלת המד</button>}
      <div className="noise-bar" role="meter" aria-label="רמת רעש" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lvl} aria-valuetext={`${label}, ${lvl}`}><span style={{ width: `${lvl}%` }} className={lvl > limit ? "hot" : ""} /></div>
      <p className="wheel-out" aria-live="off">{on ? label : ""}</p>
    </>
  );
}

/* 361 */
function Sounds(p: P) {
  void p;
  const [vol, setVol] = useState(0.4);
  const ac = useRef<AudioContext | null>(null);
  const beep = (seq: [number, number][]) => {
    ac.current ??= new AudioContext();
    const c = ac.current; let t = c.currentTime;
    for (const [f, d] of seq) { const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = f; g.gain.value = vol; o.connect(g).connect(c.destination); o.start(t); o.stop(t + d); t += d + 0.04; }
  };
  const S: [string, [number, number][]][] = [["התחלה", [[660, 0.15], [880, 0.3]]], ["עצירה", [[300, 0.5]]], ["צפצוף", [[1000, 0.15]]], ["נכון", [[660, 0.12], [990, 0.25]]], ["לא נכון", [[220, 0.4]]], ["סיום זמן", [[880, 0.15], [880, 0.15], [880, 0.4]]]];
  return (
    <>
      <Field label="עוצמה" htmlFor="v51-vol"><input id="v51-vol" type="range" min={0.1} max={1} step={0.1} value={vol} onChange={(e) => setVol(Number(e.target.value))} /></Field>
      <div className="actions">{S.map(([n, seq]) => (<button key={n} type="button" className="btn" onClick={() => beep(seq)}>{n}</button>))}</div>
    </>
  );
}

/* 362 */
function Tags(p: P) {
  const toast = useToast();
  const names = linesOf(p.names, 60);
  const print = () => {
    if (!names.length) return toast("הוסיפו שמות בתיבת השמות", { kind: "error" });
    printHtml("תגי שם", `<div class="cards">${names.map((n) => `<div class="card" style="text-align:center"><div style="font-size:16px">שלום, אני</div><div style="font-size:34px;font-weight:700;margin-top:8px">${esc(n)}</div></div>`).join("")}</div>`, toast);
  };
  return (<><p>{names.length} שמות מוכנים להדפסה.</p><button type="button" className="btn btn-primary" onClick={print}>הדפסת תגים</button></>);
}

/* 363 */
function Summary(p: P) {
  const toast = useToast();
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), worked: "", change: "", rating: "4" });
  const print = () => printHtml("כרטיס סיכום", `<h1>סיכום פעולה: ${esc(p.snap.title || "")}</h1><p><b>תאריך:</b> ${esc(f.date)} · <b>גיל:</b> ${esc(p.snap.meta.ageGroup || "")} · <b>משתתפים:</b> ${p.snap.meta.groupSize ?? ""}</p><p><b>הערכה כללית:</b> ${f.rating} מתוך 5</p><h3>מה עבד</h3><p>${esc(f.worked) || '<div class="line"></div>'}</p><h3>מה הייתי משנה</h3><p>${esc(f.change) || '<div class="line"></div>'}</p>`, toast);
  return (
    <>
      <Field label="תאריך" htmlFor="v51-s1"><input id="v51-s1" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="הערכה" htmlFor="v51-s2"><select id="v51-s2" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}>{[1, 2, 3, 4, 5].map((n) => (<option key={n}>{n}</option>))}</select></Field>
      <Field label="מה עבד" htmlFor="v51-s3"><textarea id="v51-s3" rows={3} value={f.worked} onChange={(e) => setF({ ...f, worked: e.target.value })} /></Field>
      <Field label="מה הייתי משנה" htmlFor="v51-s4"><textarea id="v51-s4" rows={3} value={f.change} onChange={(e) => setF({ ...f, change: e.target.value })} /></Field>
      <button type="button" className="btn btn-primary" onClick={print}>הדפסה</button>
    </>
  );
}

/* 364 */
function Preflight(p: P) {
  const d = useInsight<{ items: string[] }>("preflight", p.snap, p.token);
  const key = `scout.v51.pre.${p.docId}`;
  const [done, setDone] = useState<string[]>(() => lsGet(key, []));
  if (!d) return <Loading />;
  const tog = (i: string) => { const n = done.includes(i) ? done.filter((x) => x !== i) : [...done, i]; setDone(n); lsSet(key, n); };
  const k = d.items.filter((i) => done.includes(i)).length;
  return (
    <>
      <p role="status">סומנו {k} מתוך {d.items.length}</p>
      <ul className="check-list">{d.items.map((i) => (<li key={i}><label className="check"><input type="checkbox" checked={done.includes(i)} onChange={() => tog(i)} /> {i}</label></li>))}</ul>
      <button type="button" className="btn" onClick={() => { setDone([]); lsSet(key, []); }}>ניקוי סימונים</button>
    </>
  );
}

/* 366 */
const NAME_SETS: Record<string, string[]> = {
  "בעלי חיים": ["נשרים", "שועלים", "דולפינים", "פנתרים", "ינשופים", "צבאים", "נמרים", "זאבים", "עיטים", "לוויתנים"],
  "טבע": ["רוחות", "סערה", "אש", "נחלים", "הרים", "ענן", "ברק", "גלים", "אורנים", "קשת"],
  "ערכים": ["אומץ", "רעות", "יושר", "נאמנות", "חוסן", "יוזמה", "כבוד", "תקווה", "אחדות", "נתינה"],
  "צבעים": ["כחולים", "ירוקים", "כתומים", "סגולים", "זהובים", "כסופים", "אדומים", "טורקיז", "ורודים", "שחורים"],
};
function Names(p: P) {
  void p;
  const toast = useToast();
  const [set, setSet] = useState("בעלי חיים");
  const [n, setN] = useState(4);
  const [out, setOut] = useState<string[]>([]);
  return (
    <>
      <Field label="נושא" htmlFor="v51-nset"><select id="v51-nset" value={set} onChange={(e) => setSet(e.target.value)}>{Object.keys(NAME_SETS).map((k) => (<option key={k}>{k}</option>))}</select></Field>
      <Field label="כמה שמות" htmlFor="v51-nn"><input id="v51-nn" type="number" min={2} max={10} value={n} onChange={(e) => setN(Math.max(2, Math.min(10, Number(e.target.value) || 2)))} /></Field>
      <button type="button" className="btn btn-primary" onClick={() => setOut(shuffle(NAME_SETS[set]).slice(0, n))}>הגרלת שמות</button>
      {out.length > 0 && (<><p aria-live="polite">{out.join(" · ")}</p><button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(out.join("\n")).then(() => toast("הועתק", { kind: "success" }))}>העתקה</button></>)}
    </>
  );
}

const TOOLS: { n: number; label: string; group: string; C: (p: P) => React.ReactNode; needNames?: boolean }[] = [
  { n: 346, label: "בדיקת קצב", group: "בדיקות לפעולה", C: Pace },
  { n: 347, label: "עקומת אנרגיה", group: "בדיקות לפעולה", C: Energy },
  { n: 355, label: "בדיקת בהירות", group: "בדיקות לפעולה", C: Clarity },
  { n: 356, label: "בדיקת לשון מכלילה", group: "בדיקות לפעולה", C: Inclusive },
  { n: 354, label: "רמזים למדריך", group: "בדיקות לפעולה", C: Tips },
  { n: 349, label: "רשימת ציוד", group: "הכנה", C: Gear },
  { n: 364, label: "רשימה לפני יציאה", group: "הכנה", C: Preflight },
  { n: 350, label: "חלוקת תפקידים בין מדריכים", group: "הכנה", C: Roles },
  { n: 351, label: "לוח זמנים לקיר", group: "הכנה", C: Poster },
  { n: 353, label: "כרטיס חירום", group: "הכנה", C: Emergency },
  { n: 348, label: "חלוקה לקבוצות", group: "בזמן הפעולה", C: Teams, needNames: true },
  { n: 366, label: "שמות לקבוצות", group: "בזמן הפעולה", C: Names },
  { n: 357, label: "לוח ניקוד", group: "בזמן הפעולה", C: Score },
  { n: 358, label: "גלגל בחירה", group: "בזמן הפעולה", C: Wheel, needNames: true },
  { n: 359, label: "קוביות ומטבע", group: "בזמן הפעולה", C: Dice },
  { n: 360, label: "מד רעש", group: "בזמן הפעולה", C: Noise },
  { n: 361, label: "לוח צלילים", group: "בזמן הפעולה", C: Sounds },
  { n: 362, label: "תגי שם", group: "בזמן הפעולה", C: Tags, needNames: true },
  { n: 352, label: "שאלות רפלקציה", group: "סיכום", C: (p) => <PickList tool="reflect" field="questions" p={p} label="רפלקציה" /> },
  { n: 365, label: "משפט לסיום", group: "סיכום", C: (p) => <PickList tool="closing" field="lines" p={p} label="משפט לסיום" /> },
  { n: 363, label: "כרטיס סיכום", group: "סיכום", C: Summary },
];

const ToolView = ({ C, p }: { C: (p: P) => React.ReactNode; p: P }) => <>{C(p)}</>;

export function ToolboxModal({ open, onClose, snap, token, docId, onInsert }: { open: boolean; onClose: () => void; snap: Snap; token: string | null; docId: number; onInsert: (t: string) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const [names, setNames] = useState("");
  const nkey = `scout.v51.names.${docId}`;
  useEffect(() => { if (open) { setSel(null); setNames(lsGet(nkey, "")); } }, [open, nkey]);
  const t = TOOLS.find((x) => x.n === sel);
  const groups = [...new Set(TOOLS.map((x) => x.group))];
  return (
    <Modal open={open} onClose={onClose} title={t ? `${t.n}. ${t.label}` : "ארגז כלים"} wide footer={<>{t && <button type="button" className="btn" onClick={() => setSel(null)}>חזרה לכלים</button>}<button type="button" className="btn" onClick={onClose}>סגירה</button></>}>
      {!t ? (
        groups.map((g) => (
          <section key={g} aria-label={g}>
            <h3>{g}</h3>
            <div className="actions">{TOOLS.filter((x) => x.group === g).map((x) => (<button key={x.n} type="button" className="btn" onClick={() => setSel(x.n)}>{x.label}</button>))}</div>
          </section>
        ))
      ) : (
        <>
          {t.needNames && (
            <Field label="שמות החניכים (שם בכל שורה, נשמרים במכשיר הזה)" htmlFor="v51-names">
              <textarea id="v51-names" rows={4} value={names} onChange={(e) => { setNames(e.target.value); lsSet(nkey, e.target.value); }} />
            </Field>
          )}
          <ToolView key={t.n} C={t.C} p={{ snap, token, docId, names, onInsert }} />
        </>
      )}
    </Modal>
  );
}
