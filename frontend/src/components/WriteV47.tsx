"use client";

// שלב 47 (326–335): מפת תחנות, הקראה, תרגול קולי, פתיחות וחידון, כרטיסי תפקידים ודפי הדפסה.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal } from "./ui";
import type { Block, Snap } from "./WriteParts";

const docBody = (s: Snap) => ({ title: s.title, meta: s.meta, blocks: s.blocks });
const Close = ({ onClose }: { onClose: () => void }) => (<button type="button" className="btn" onClick={onClose}>סגירה</button>);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const plain = (t: string) => t.replace(/[#>*|_`]/g, " ").replace(/\s+/g, " ").trim();

export function printHtml(title: string, body: string, toast: ReturnType<typeof useToast>) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return toast("הדפדפן חסם את החלון. אפשרו חלונות קופצים ונסו שוב.", { kind: "error" });
  w.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:Arial,sans-serif;padding:20px;line-height:1.5}h1{border-bottom:4px solid #4a3fc9;padding-bottom:6px;color:#2a1766}
table{border-collapse:collapse}td{border:1px solid #333;text-align:center}
.cw td{width:34px;height:34px;position:relative;font-size:18px}.cw td.b{background:#222}.cw td sup{position:absolute;top:1px;right:3px;font-size:10px}
.bingo td{width:130px;height:90px;font-size:18px;font-weight:700;padding:6px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.card{border:2px dashed #4a3fc9;border-radius:12px;padding:14px;min-height:130px;break-inside:avoid}
.mem{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.mem div{border:2px solid #4a3fc9;border-radius:10px;padding:10px;min-height:90px;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;break-inside:avoid}
.line{border-bottom:1px solid #333;height:26px;margin:6px 0}.pg{page-break-after:always}@media print{button{display:none}}
</style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

/* ───── 326, 327: מפת תחנות ───── */
interface Station { n: string; x: number; y: number }
const BG: Record<string, string> = { field: "מגרש", room: "חדר", trail: "שביל", blank: "ריק" };
function place(x: number, y: number) {
  const h = x < 34 ? "בצד שמאל" : x > 66 ? "בצד ימין" : "באמצע";
  const v = y < 34 ? "למעלה" : y > 66 ? "למטה" : "";
  return `${h}${v ? " " + v : ""}`;
}
export function MapModal({ open, onClose, docId, onInsert }: { open: boolean; onClose: () => void; docId: number; onInsert: (t: string) => void }) {
  const toast = useToast();
  const [st, setSt] = useState<Station[]>([]);
  const [bg, setBg] = useState("field");
  const svg = useRef<SVGSVGElement>(null);
  const key = `scout.map.${docId}`;
  useEffect(() => {
    if (!open) return;
    try { const s = JSON.parse(localStorage.getItem(key) || "null"); if (s) { setSt(s.st ?? []); setBg(s.bg ?? "field"); } } catch {}
  }, [open, key]);
  const save = (s: Station[], b = bg) => { setSt(s); try { localStorage.setItem(key, JSON.stringify({ st: s, bg: b })); } catch {} };
  const add = (x = 50, y = 50) => save([...st, { n: `תחנה ${st.length + 1}`, x, y }].slice(0, 12));
  const upd = (i: number, p: Partial<Station>) => save(st.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    add(Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100));
  };
  const png = () => {
    const el = svg.current;
    if (!el) return;
    const src = new XMLSerializer().serializeToString(el);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 1200; c.height = 800;
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1200, 800); ctx.drawImage(img, 0, 0, 1200, 800);
      c.toBlob((b) => { if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "מפת-תחנות.png"; a.click(); }, "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
  };
  const insert = () => {
    onInsert(`\n**מפת תחנות:**\n${st.map((s, i) => `${i + 1}. ${s.n} (${place(s.x, s.y)})`).join("\n")}\n`);
    toast("המפה נוספה לשלב כרשימה", { kind: "success" });
  };
  return (
    <Modal open={open} onClose={onClose} title="מפת תחנות" wide footer={<Close onClose={onClose} />}>
      <Field label="רקע" htmlFor="map-bg">
        <select id="map-bg" value={bg} onChange={(e) => { setBg(e.target.value); save(st, e.target.value); }}>
          {Object.entries(BG).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
        </select>
      </Field>
      <svg ref={svg} className="station-map" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`מפת תחנות עם ${st.length} תחנות`} onClick={onClick}>
        <rect width="600" height="400" fill={bg === "field" ? "#dff3df" : bg === "room" ? "#f3ede0" : "#f4f0ff"} />
        {bg === "field" && (<g fill="none" stroke="#6aa86a" strokeWidth="3"><rect x="20" y="20" width="560" height="360" rx="8" /><line x1="300" y1="20" x2="300" y2="380" /><circle cx="300" cy="200" r="50" /></g>)}
        {bg === "room" && (<g fill="none" stroke="#a89878" strokeWidth="4"><rect x="20" y="20" width="560" height="360" /><rect x="260" y="352" width="80" height="28" fill="#f3ede0" /></g>)}
        {bg === "trail" && <path d="M40 360 C150 300 120 200 260 190 S420 120 340 60 S540 40 560 40" fill="none" stroke="#b5a37a" strokeWidth="26" strokeLinecap="round" strokeDasharray="2 30" />}
        {st.map((s, i) => (
          <g key={i} transform={`translate(${s.x * 6},${s.y * 4})`}>
            <circle r="20" fill="#5d2fa3" stroke="#fff" strokeWidth="3" />
            <text textAnchor="middle" dy="7" fontSize="20" fontWeight="700" fill="#fff">{i + 1}</text>
            <text textAnchor="middle" y="38" fontSize="16" fontWeight="700" fill="#2a1766" stroke="#fff" strokeWidth="3" paintOrder="stroke">{s.n}</text>
          </g>
        ))}
      </svg>
      <p className="hint">אפשר ללחוץ על המפה כדי להוסיף תחנה, או להשתמש בכפתור ובשדות למטה (נגיש גם בלי עכבר).</p>
      <ul className="plain-list">
        {st.map((s, i) => (
          <li key={i} className="inline-form">
            <Field label={`שם תחנה ${i + 1}`} htmlFor={`st-n-${i}`}><input id={`st-n-${i}`} maxLength={30} value={s.n} onChange={(e) => upd(i, { n: e.target.value })} /></Field>
            <Field label="מיקום אופקי (0–100)" htmlFor={`st-x-${i}`}><input id={`st-x-${i}`} type="number" min={0} max={100} value={s.x} onChange={(e) => upd(i, { x: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></Field>
            <Field label="מיקום אנכי (0–100)" htmlFor={`st-y-${i}`}><input id={`st-y-${i}`} type="number" min={0} max={100} value={s.y} onChange={(e) => upd(i, { y: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></Field>
            <button type="button" className="btn btn-small" onClick={() => save(st.filter((_, j) => j !== i))}>מחיקה<span className="sr-only">: {s.n}</span></button>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" className="btn" onClick={() => add()} disabled={st.length >= 12}>הוספת תחנה</button>
        <button type="button" className="btn" onClick={png} disabled={!st.length}>הורדת תמונה</button>
        <button type="button" className="btn btn-primary" onClick={insert} disabled={!st.length}>הוספה לשלב כרשימה</button>
      </div>
    </Modal>
  );
}

/* ───── 328: הקראה בקול ───── */
export function ReadAloudModal({ open, onClose, snap, block }: { open: boolean; onClose: () => void; snap: Snap; block: Block | undefined }) {
  const [scope, setScope] = useState<"stage" | "all">("stage");
  const [rate, setRate] = useState(0.95);
  const [state, setState] = useState<"idle" | "play" | "pause">("idle");
  const [hasVoice, setHasVoice] = useState(true);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const stop = useCallback(() => { if (supported) window.speechSynthesis.cancel(); setState("idle"); }, [supported]);
  useEffect(() => {
    if (!supported) return;
    const check = () => setHasVoice(window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith("he")) || window.speechSynthesis.getVoices().length === 0);
    check();
    window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", check);
  }, [supported]);
  useEffect(() => { if (!open) stop(); }, [open, stop]);
  const play = () => {
    const blocks = scope === "all" ? snap.blocks : block ? [block] : [];
    const chunks = blocks.flatMap((b) => [b.title, ...plain(b.text).split(/(?<=[.!?:])\s+/)]).filter((x) => x && x.length > 1);
    if (!chunks.length) return;
    window.speechSynthesis.cancel();
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("he"));
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = "he-IL"; u.rate = rate;
      if (voice) u.voice = voice;
      if (i === chunks.length - 1) u.onend = () => setState("idle");
      window.speechSynthesis.speak(u);
    });
    setState("play");
  };
  return (
    <Modal open={open} onClose={onClose} title="הקראת הפעולה בקול" footer={<Close onClose={onClose} />}>
      {!supported ? <p role="alert">הדפדפן הזה לא תומך בהקראה.</p> : (
        <>
          {!hasVoice && <p className="hint" role="status">לא נמצא קול בעברית במכשיר הזה. ההקראה עשויה להישמע באנגלית או להיכשל. בטלפון אנדרואיד אפשר להתקין קול עברי בהגדרות הדיבור.</p>}
          <fieldset>
            <legend>מה להקריא?</legend>
            <label className="check"><input type="radio" name="ra-scope" checked={scope === "stage"} onChange={() => setScope("stage")} /><span>השלב הנוכחי ({block?.title || "ללא שם"})</span></label>
            <label className="check"><input type="radio" name="ra-scope" checked={scope === "all"} onChange={() => setScope("all")} /><span>כל הפעולה</span></label>
          </fieldset>
          <Field label={`מהירות: ${rate.toFixed(2)}`} htmlFor="ra-rate"><input id="ra-rate" type="range" min={0.7} max={1.3} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} /></Field>
          <div className="actions">
            {state === "idle" && <button type="button" className="btn btn-primary" onClick={play}>הקראה</button>}
            {state === "play" && <button type="button" className="btn" onClick={() => { window.speechSynthesis.pause(); setState("pause"); }}>השהיה</button>}
            {state === "pause" && <button type="button" className="btn" onClick={() => { window.speechSynthesis.resume(); setState("play"); }}>המשך</button>}
            {state !== "idle" && <button type="button" className="btn" onClick={stop}>עצירה</button>}
          </div>
          <p className="hint" role="status">{state === "play" ? "מקריא…" : state === "pause" ? "מושהה" : "הקול הוא קול מחשב של המכשיר, וזה לא תחליף לשמיעה אמיתית. כדאי להקריא בעצמכם פעם אחת."}</p>
        </>
      )}
    </Modal>
  );
}

/* ───── 329: תרגול קולי ───── */
export function PracticeModal({ open, onClose, block }: { open: boolean; onClose: () => void; block: Block | undefined }) {
  const [phase, setPhase] = useState<"idle" | "rec" | "done">("idle");
  const [sec, setSec] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => { if (!open) { cleanup(); setPhase("idle"); setSec(0); setUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); } }, [open, cleanup]);
  const start = async () => {
    setErr("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setErr("הדפדפן לא תומך בהקלטה.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = () => { setUrl(URL.createObjectURL(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }))); setPhase("done"); };
      r.start();
      rec.current = r;
      setSec(0); setPhase("rec");
      timer.current = window.setInterval(() => setSec((s) => s + 1), 1000);
    } catch {
      setErr("אין הרשאה למיקרופון. אשרו בדפדפן ונסו שוב.");
    }
  };
  const stop = () => { cleanup(); };
  const planned = (block?.minutes ?? 0) * 60;
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const verdict = !planned ? "" : sec > planned * 1.15 ? "ארוך מהמתוכנן. כדאי לקצר או להגדיל את הזמן של השלב." : sec < planned * 0.4 ? "קצר בהרבה מהמתוכנן. ייתכן שנשאר זמן לשאלות ולפעילות." : "בתוך הטווח המתוכנן. מצוין.";
  return (
    <Modal open={open} onClose={onClose} title={`תרגול קולי: ${block?.title || "השלב הנוכחי"}`} footer={<Close onClose={onClose} />}>
      <p>קראו את השלב בקול, ואני אמדוד כמה זמן לקח. ההקלטה נשארת רק בדפדפן שלכם ואינה נשלחת לשום מקום.</p>
      {err && <p role="alert" className="error-box">{err}</p>}
      <p role="status" aria-live="polite"><strong className="big-score">{mm(sec)}</strong>{planned ? ` מתוך ${mm(planned)} מתוכננות` : ""}</p>
      <div className="actions">
        {phase !== "rec" && <button type="button" className="btn btn-primary" onClick={() => void start()}>{phase === "done" ? "הקלטה חדשה" : "התחלת הקלטה"}</button>}
        {phase === "rec" && <button type="button" className="btn" onClick={stop}>עצירה</button>}
      </div>
      {phase === "done" && (<>{verdict && <p role="status">{verdict}</p>}{url && <audio controls src={url} aria-label="ההקלטה שלכם" />}</>)}
    </Modal>
  );
}

/* ───── 330, 331: פתיחות וחידון ───── */
interface Story { style: string; text: string }
interface Quiz { items: { q: string; options: string[]; answer: string }[]; note: string }
export function StoryQuizModal({ open, onClose, snap, token, onInsert }: { open: boolean; onClose: () => void; snap: Snap; token: string | null; onInsert: (t: string) => void }) {
  const toast = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const run = async () => {
    try {
      const [s, q] = await Promise.all([
        api<{ ideas: Story[] }>("/api/write/story-ideas", { method: "POST", token, body: { topic: snap.title, value: snap.meta.value ?? "" } }),
        api<Quiz>("/api/write/quiz", { method: "POST", token, body: docBody(snap) }),
      ]);
      setStories(s.ideas); setQuiz(q);
    } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  useEffect(() => { if (open) void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="פתיחה וחידון" wide footer={<Close onClose={onClose} />}>
      <h3>הצעות לפתיחה</h3>
      <ul className="plain-list">
        {stories.map((s) => (
          <li key={s.text}><span><strong>{s.style}:</strong> {s.text}</span>
            <button type="button" className="btn btn-small" onClick={() => { onInsert(`\n${s.text}\n`); toast("נוסף לשלב", { kind: "success" }); }}>הוספה לשלב</button></li>
        ))}
      </ul>
      <button type="button" className="btn btn-small" onClick={() => void run()}>הצעות אחרות</button>
      <h3>חידון מהטקסט שלכם</h3>
      {!quiz ? <p>מכין…</p> : quiz.items.length === 0 ? <p>{quiz.note}</p> : (
        <>
          <ol>
            {quiz.items.map((it, i) => (<li key={i}>{it.q}<br /><small>{it.options.join("  /  ")}</small></li>))}
          </ol>
          <button type="button" className="btn btn-primary" onClick={() => { onInsert(`\n**חידון:**\n${quiz.items.map((it, i) => `${i + 1}. ${it.q} (${it.options.join(" / ")})`).join("\n")}\n`); toast("החידון נוסף לשלב", { kind: "success" }); }}>הוספת החידון לשלב</button>
          <p className="hint">השאלות נוצרות אוטומטית ממשפטים בטקסט. עברו עליהן לפני שימוש.</p>
        </>
      )}
    </Modal>
  );
}

/* ───── 332–335: כרטיסי תפקידים, דף עבודה, תשבץ, בינגו וזיכרון ───── */
interface KW { word: string; clue: string }
type Placed = { w: string; x: number; y: number; across: boolean; clue: string };
export function buildCrossword(words: KW[]): { placed: Placed[]; minX: number; maxX: number; minY: number; maxY: number } | null {
  const ws = [...words].filter((k) => k.word.length >= 3).sort((a, b) => b.word.length - a.word.length).slice(0, 12);
  if (ws.length < 4) return null;
  const grid = new Map<string, string>();
  const placed: Placed[] = [];
  const cell = (x: number, y: number) => grid.get(`${x},${y}`);
  const can = (w: string, x: number, y: number, across: boolean) => {
    const dx = across ? -1 : 0, dy = across ? 0 : 1;
    if (cell(x - dx, y - dy) || cell(x + dx * w.length, y + dy * w.length)) return false;
    let cross = 0;
    for (let i = 0; i < w.length; i++) {
      const cx = x + dx * i, cy = y + dy * i, c = cell(cx, cy);
      if (c) { if (c !== w[i]) return false; cross++; }
      else if (across ? cell(cx, cy - 1) || cell(cx, cy + 1) : cell(cx - 1, cy) || cell(cx + 1, cy)) return false;
    }
    return cross > 0 || placed.length === 0;
  };
  const put = (k: KW, x: number, y: number, across: boolean) => {
    const dx = across ? -1 : 0, dy = across ? 0 : 1;
    for (let i = 0; i < k.word.length; i++) grid.set(`${x + dx * i},${y + dy * i}`, k.word[i]);
    placed.push({ w: k.word, x, y, across, clue: k.clue });
  };
  put(ws[0], 0, 0, true);
  for (const k of ws.slice(1)) {
    let done = false;
    for (const p of [...placed]) {
      if (done) break;
      for (let i = 0; i < k.word.length && !done; i++) for (let j = 0; j < p.w.length && !done; j++) {
        if (k.word[i] !== p.w[j]) continue;
        const across = !p.across;
        const px = p.across ? p.x - j : p.x, py = p.across ? p.y : p.y + j;
        const x = across ? px + i : px, y = across ? py : py - i;
        if (can(k.word, x, y, across)) { put(k, x, y, across); done = true; }
      }
    }
  }
  if (placed.length < 4) return null;
  const xs = [...grid.keys()].map((k) => Number(k.split(",")[0])), ys = [...grid.keys()].map((k) => Number(k.split(",")[1]));
  return { placed, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function crosswordHtml(cw: NonNullable<ReturnType<typeof buildCrossword>>, solved: boolean) {
  const starts = [...cw.placed].sort((a, b) => a.y - b.y || b.x - a.x);
  const num = new Map<string, number>();
  starts.forEach((p) => { const k = `${p.x},${p.y}`; if (!num.has(k)) num.set(k, num.size + 1); });
  const letters = new Map<string, string>();
  cw.placed.forEach((p) => [...p.w].forEach((ch, i) => letters.set(`${p.across ? p.x - i : p.x},${p.across ? p.y : p.y + i}`, ch)));
  let rows = "";
  for (let y = cw.minY; y <= cw.maxY; y++) {
    rows += "<tr>";
    for (let x = cw.maxX; x >= cw.minX; x--) {
      const k = `${x},${y}`, l = letters.get(k);
      rows += l ? `<td>${num.has(k) ? `<sup>${num.get(k)}</sup>` : ""}${solved ? esc(l) : ""}</td>` : `<td class="b"></td>`;
    }
    rows += "</tr>";
  }
  const clues = (across: boolean) => cw.placed.filter((p) => p.across === across).map((p) => `<li value="${num.get(`${p.x},${p.y}`)}">${esc(p.clue)} (${p.w.length} אותיות)</li>`).join("");
  return `<table class="cw" dir="rtl">${rows}</table><h3>אופקי</h3><ol>${clues(true)}</ol><h3>אנכי</h3><ol>${clues(false)}</ol>`;
}
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

export function PrintablesModal({ open, onClose, snap, token }: { open: boolean; onClose: () => void; snap: Snap; token: string | null }) {
  const toast = useToast();
  const [words, setWords] = useState("");
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [roleSet, setRoleSet] = useState("כללי");
  const [roleText, setRoleText] = useState("");
  const [size, setSize] = useState(4);
  const [copies, setCopies] = useState(1);
  useEffect(() => {
    if (!open) return;
    api<{ words: KW[] }>("/api/write/keywords", { method: "POST", token, body: docBody(snap) }).then((r) => setWords(r.words.map((w) => `${w.word} | ${w.clue}`).join("\n"))).catch((e) => toast(errorMessage(e), { kind: "error" }));
    api<Record<string, string[]>>("/api/write/role-sets", { token }).then((r) => { setRoles(r); setRoleText((r["כללי"] ?? []).join("\n")); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const kws: KW[] = words.split("\n").map((l) => { const [w, ...c] = l.split("|"); return { word: w.trim(), clue: c.join("|").trim() }; }).filter((k) => k.word);
  const title = snap.title || "פעולה";
  const need = (n: number) => { if (kws.length < n) { toast(`צריך לפחות ${n} מילים. הוסיפו מילים לרשימה.`, { kind: "error" }); return false; } return true; };
  const doRoles = () => {
    const rs = roleText.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!rs.length) return;
    printHtml("כרטיסי תפקידים", `<h1>כרטיסי תפקידים: ${esc(title)}</h1><div class="cards">${rs.map((r) => `<div class="card"><small>התפקיד שלך</small><h2>${esc(r)}</h2><p>במהלך הפעולה, מלא/י את התפקיד הזה ודווח/י בסוף מה למדת ממנו.</p></div>`).join("")}</div>`, toast);
  };
  const doSheet = async () => {
    try {
      const q = await api<Quiz>("/api/write/quiz", { method: "POST", token, body: docBody(snap) });
      const items = q.items.map((it, i) => `<p><strong>${i + 1}.</strong> ${esc(it.q)}<br>${it.options.map((o) => `☐ ${esc(o)}`).join("&nbsp;&nbsp;&nbsp;")}</p>`).join("");
      printHtml("דף עבודה", `<h1>דף עבודה: ${esc(title)}</h1><p>שם: ______________ &nbsp; תאריך: __________</p>${items || "<p>(אין מספיק טקסט לשאלות)</p>"}<h3>מה למדתי היום?</h3><div class="line"></div><div class="line"></div><div class="line"></div>`, toast);
    } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const doCross = (solved: boolean) => {
    const cw = buildCrossword(kws.filter((k) => k.clue));
    if (!cw) return toast("לא הצלחתי לבנות תשבץ. צריך לפחות ארבע מילים עם רמז שיש ביניהן אותיות משותפות.", { kind: "error" });
    printHtml(solved ? "תשבץ (פתרון)" : "תשבץ", `<h1>תשבץ: ${esc(title)}${solved ? " (פתרון)" : ""}</h1>${crosswordHtml(cw, solved)}`, toast);
  };
  const doBingo = () => {
    const n = size * size, free = size % 2 === 1 ? 1 : 0;
    if (!need(n - free)) return;
    const pages = Array.from({ length: copies }, () => {
      const pick = shuffle(kws.map((k) => k.word)).slice(0, n - free);
      let html = `<table class="bingo" dir="rtl">`;
      let idx = 0;
      for (let r = 0; r < size; r++) { html += "<tr>"; for (let c = 0; c < size; c++) html += `<td>${free && r === (size - 1) / 2 && c === (size - 1) / 2 ? "חופשי" : esc(pick[idx++])}</td>`; html += "</tr>"; }
      return `<div class="pg"><h1>בינגו: ${esc(title)}</h1>${html}</table></div>`;
    });
    printHtml("בינגו", pages.join(""), toast);
  };
  const doMemory = () => {
    if (!need(4)) return;
    const cards = shuffle(kws.slice(0, 10).flatMap((k) => [k.word, k.clue.replace(/_____/g, "…").slice(0, 60) || k.word]));
    printHtml("משחק זיכרון", `<h1>משחק זיכרון: ${esc(title)}</h1><p>גזרו את הכרטיסים. כל מילה מתאימה לרמז שלה.</p><div class="mem">${cards.map((c) => `<div>${esc(c)}</div>`).join("")}</div>`, toast);
  };
  return (
    <Modal open={open} onClose={onClose} title="הדפסות: תפקידים, תשבץ, בינגו וזיכרון" wide footer={<Close onClose={onClose} />}>
      <Field label="מילים ורמזים (מילה | רמז בכל שורה). נוצרו אוטומטית מהטקסט, אפשר לערוך" htmlFor="pr-words">
        <textarea id="pr-words" rows={7} value={words} onChange={(e) => setWords(e.target.value)} />
      </Field>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => doCross(false)}>תשבץ</button>
        <button type="button" className="btn" onClick={() => doCross(true)}>תשבץ עם פתרון</button>
        <button type="button" className="btn" onClick={doMemory}>משחק זיכרון</button>
        <button type="button" className="btn" onClick={() => void doSheet()}>דף עבודה</button>
      </div>
      <div className="inline-form">
        <Field label="גודל לוח בינגו" htmlFor="pr-size"><select id="pr-size" value={size} onChange={(e) => setSize(Number(e.target.value))}><option value={3}>3×3</option><option value={4}>4×4</option><option value={5}>5×5</option></select></Field>
        <Field label="כמה כרטיסים שונים" htmlFor="pr-copies"><input id="pr-copies" type="number" min={1} max={12} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} /></Field>
        <button type="button" className="btn" onClick={doBingo}>הדפסת בינגו</button>
      </div>
      <h3>כרטיסי תפקידים</h3>
      <Field label="סוג פעולה" htmlFor="pr-roleset">
        <select id="pr-roleset" value={roleSet} onChange={(e) => { setRoleSet(e.target.value); setRoleText((roles[e.target.value] ?? []).join("\n")); }}>
          {Object.keys(roles).map((k) => (<option key={k} value={k}>{k}</option>))}
        </select>
      </Field>
      <Field label="תפקידים (אחד בכל שורה)" htmlFor="pr-roles"><textarea id="pr-roles" rows={5} value={roleText} onChange={(e) => setRoleText(e.target.value)} /></Field>
      <button type="button" className="btn" onClick={doRoles}>הדפסת כרטיסי תפקידים</button>
    </Modal>
  );
}
