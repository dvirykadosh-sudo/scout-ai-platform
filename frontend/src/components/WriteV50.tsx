"use client";

// שלב 50 (336–345): איורים, תבניות חג, מיזוג גרסאות, צופים בזמן אמת, הקלטות, פתיחות, מד השתתפות, כללי משחק, דף תרגום וסדרת המשך.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal } from "./ui";
import { printHtml } from "./WriteV47";
import { newBlockId, type Block, type Snap } from "./WriteParts";

export type V50Tool = "illus" | "holiday" | "merge" | "viewers" | "vnotes" | "hooks" | "meter" | "rules" | "translate" | "series";
const docBody = (s: Snap) => ({ title: s.title, meta: s.meta, blocks: s.blocks });
const Close = ({ onClose }: { onClose: () => void }) => (<button type="button" className="btn" onClick={onClose}>סגירה</button>);
const copy = async (t: string, toast: ReturnType<typeof useToast>) => {
  try { await navigator.clipboard.writeText(t); toast("הועתק", { kind: "success" }); } catch { toast("לא הצלחתי להעתיק. סמנו ידנית.", { kind: "error" }); }
};

/* ───── 336: ספריית איורים לדפי עבודה ───── */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const ILLUS: { id: string; label: string; el: React.ReactNode }[] = [
  { id: "tent", label: "אוהל", el: <g {...P}><path d="M6 40 L24 8 L42 40 Z" /><path d="M24 8 V40" /><path d="M24 40 L17 40 L24 26 L31 40" /></g> },
  { id: "fire", label: "מדורה", el: <g {...P}><path d="M24 6 C28 14 36 18 34 28 C33 34 28 38 24 38 C19 38 14 34 14 28 C14 22 20 20 24 6 Z" /><path d="M8 42 L40 36 M8 36 L40 42" /></g> },
  { id: "compass", label: "מצפן", el: <g {...P}><circle cx="24" cy="24" r="17" /><path d="M24 11 L29 24 L24 37 L19 24 Z" /><circle cx="24" cy="24" r="1.5" /></g> },
  { id: "flag", label: "דגל", el: <g {...P}><path d="M12 6 V42" /><path d="M12 8 H38 L32 16 L38 24 H12" /></g> },
  { id: "tree", label: "עץ", el: <g {...P}><circle cx="24" cy="18" r="12" /><path d="M24 30 V42" /><path d="M24 36 L30 30" /></g> },
  { id: "star", label: "כוכב", el: <g {...P}><path d="M24 5 L29.5 18 L43 19 L33 28 L36 42 L24 34.5 L12 42 L15 28 L5 19 L18.5 18 Z" /></g> },
  { id: "heart", label: "לב", el: <g {...P}><path d="M24 40 C8 28 6 20 10 14 C14 9 21 10 24 16 C27 10 34 9 38 14 C42 20 40 28 24 40 Z" /></g> },
  { id: "key", label: "מפתח", el: <g {...P}><circle cx="15" cy="24" r="8" /><path d="M23 24 H42 M36 24 V31 M42 24 V29" /></g> },
  { id: "lantern", label: "פנס", el: <g {...P}><path d="M18 8 H30 M20 8 V12 H28 V8" /><rect x="14" y="12" width="20" height="26" rx="4" /><path d="M14 20 H34 M14 30 H34 M24 12 V38" /></g> },
  { id: "backpack", label: "תרמיל", el: <g {...P}><rect x="10" y="12" width="28" height="30" rx="8" /><path d="M18 12 V8 H30 V12" /><rect x="16" y="26" width="16" height="10" rx="3" /></g> },
  { id: "rope", label: "חבל", el: <g {...P}><path d="M6 30 C12 18 18 18 24 30 C30 42 36 42 42 30" /><path d="M6 22 C12 10 18 10 24 22 C30 34 36 34 42 22" /></g> },
  { id: "map", label: "מפה", el: <g {...P}><path d="M6 12 L18 8 L30 12 L42 8 V36 L30 40 L18 36 L6 40 Z" /><path d="M18 8 V36 M30 12 V40" /></g> },
  { id: "drop", label: "מים", el: <g {...P}><path d="M24 6 C32 18 38 24 38 30 C38 37 31 42 24 42 C17 42 10 37 10 30 C10 24 16 18 24 6 Z" /></g> },
  { id: "sun", label: "שמש", el: <g {...P}><circle cx="24" cy="24" r="9" /><path d="M24 5 V10 M24 38 V43 M5 24 H10 M38 24 H43 M10 10 L14 14 M34 34 L38 38 M38 10 L34 14 M14 34 L10 38" /></g> },
  { id: "moon", label: "ירח", el: <g {...P}><path d="M32 8 C20 10 14 20 18 30 C22 40 34 42 40 36 C30 36 24 28 28 18 C29 14 30 11 32 8 Z" /></g> },
  { id: "mountain", label: "הר", el: <g {...P}><path d="M4 40 L18 14 L26 28 L32 20 L44 40 Z" /><path d="M14 22 L18 14 L22 22" /></g> },
  { id: "boat", label: "סירה", el: <g {...P}><path d="M6 32 H42 L36 42 H12 Z" /><path d="M24 6 V32 M24 8 L38 28 H24" /></g> },
  { id: "bridge", label: "גשר", el: <g {...P}><path d="M4 26 H44" /><path d="M8 26 C14 10 34 10 40 26" /><path d="M14 26 V42 M34 26 V42 M24 16 V26" /></g> },
  { id: "bulb", label: "רעיון", el: <g {...P}><path d="M18 34 C10 28 10 14 24 10 C38 14 38 28 30 34 V38 H18 Z" /><path d="M19 43 H29" /></g> },
  { id: "book", label: "ספר", el: <g {...P}><path d="M6 10 C14 8 20 10 24 14 C28 10 34 8 42 10 V38 C34 36 28 38 24 42 C20 38 14 36 6 38 Z" /><path d="M24 14 V42" /></g> },
  { id: "shield", label: "מגן", el: <g {...P}><path d="M24 5 L40 11 V24 C40 34 32 40 24 43 C16 40 8 34 8 24 V11 Z" /></g> },
  { id: "hands", label: "ידיים", el: <g {...P}><path d="M6 28 L16 20 L24 24 L32 18 L42 26" /><path d="M10 30 L18 38 M18 32 L24 40 M26 32 L32 38" /></g> },
  { id: "bell", label: "פעמון", el: <g {...P}><path d="M12 34 C14 28 12 20 16 14 C18 10 22 8 24 8 C26 8 30 10 32 14 C36 20 34 28 36 34 Z" /><path d="M20 38 C20 41 28 41 28 38" /></g> },
];
export function IllustrationsModal({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (t: string) => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const refs = useRef<Record<string, SVGSVGElement | null>>({});
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(0, 12)));
  const markup = (id: string) => {
    const el = refs.current[id];
    return el ? new XMLSerializer().serializeToString(el) : "";
  };
  const download = (id: string, label: string) => {
    const src = markup(id).replace("<svg ", '<svg width="600" height="600" style="color:#222" ');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 600; c.height = 600;
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 600, 600); ctx.drawImage(img, 0, 0, 600, 600);
      c.toBlob((b) => { if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${label}.png`; a.click(); }, "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src.replace(/currentColor/g, "#222"));
  };
  const printSheet = () => {
    if (!picked.length) return toast("בחרו לפחות איור אחד", { kind: "error" });
    const cells = picked.map((id) => `<div class="card" style="text-align:center">${markup(id).replace("<svg ", '<svg width="150" height="150" style="color:#222" ')}<p>${ILLUS.find((i) => i.id === id)!.label}</p><div class="line"></div><div class="line"></div></div>`).join("");
    printHtml("דף איורים לצביעה ולכתיבה", `<h1>דף איורים</h1><p>צבעו ותארו במשפט מה האיור אומר לכם.</p><div class="cards">${cells}</div>`, toast);
  };
  return (
    <Modal open={open} onClose={onClose} title="ספריית איורים" wide footer={<Close onClose={onClose} />}>
      <p className="hint">איורים פשוטים לצביעה ולדפי עבודה. בחרו עד 12 להדפסה, או הורידו איור בודד כתמונה.</p>
      <ul className="illus-grid">
        {ILLUS.map((i) => (
          <li key={i.id}>
            <button type="button" className={`illus-btn${picked.includes(i.id) ? " on" : ""}`} aria-pressed={picked.includes(i.id)} onClick={() => toggle(i.id)}>
              <svg ref={(n) => { refs.current[i.id] = n; }} width="64" height="64" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">{i.el}</svg>
              <span>{i.label}</span>
            </button>
            <span className="illus-act">
              <button type="button" className="btn btn-small" onClick={() => download(i.id, i.label)} aria-label={`הורדת ${i.label} כתמונה`}>הורדה</button>
              <button type="button" className="btn btn-small" onClick={() => { onInsert(`\n[איור: ${i.label}]\n`); toast("סימון האיור נוסף לשלב", { kind: "success" }); }} aria-label={`הוספת סימון ${i.label} לשלב`}>לשלב</button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={printSheet}>הדפסת דף איורים ({picked.length})</button>
    </Modal>
  );
}

/* ───── 337: תבניות לחגים ואירועים ───── */
interface HolidayRow { key: string; name: string; value: string; stages: number }
interface HolidayFull { key: string; name: string; stages: { title: string; kind: Block["kind"]; minutes: number; text: string }[] }
export function HolidayModal({ open, onClose, token, onAdd }: { open: boolean; onClose: () => void; token: string | null; onAdd: (blocks: Block[]) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<HolidayRow[]>([]);
  useEffect(() => {
    if (open) api<HolidayRow[]>("/api/write/holidays", { token }).then(setRows).catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [open, token, toast]);
  const add = async (key: string) => {
    try {
      const h = await api<HolidayFull>(`/api/write/holidays/${key}`, { token });
      onAdd(h.stages.map((s) => ({ id: newBlockId(), title: s.title, kind: s.kind, minutes: s.minutes, text: s.text, note: "" })));
      toast(`שלבי ${h.name} נוספו לסוף הפעולה`, { kind: "success" });
      onClose();
    } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  return (
    <Modal open={open} onClose={onClose} title="תבניות לחגים" footer={<Close onClose={onClose} />}>
      <p className="hint">כל תבנית מוסיפה ארבעה שלבים מוכנים שאפשר לערוך. הם מתווספים בסוף הפעולה, ואפשר לבטל עם Ctrl+Z.</p>
      <ul className="plain-list">
        {rows.map((r) => (
          <li key={r.key}><span><strong>{r.name}</strong> · ערך: {r.value} · {r.stages} שלבים</span>
            <button type="button" className="btn btn-small" onClick={() => void add(r.key)} aria-label={`הוספת תבנית ${r.name}`}>הוספה</button></li>
        ))}
      </ul>
    </Modal>
  );
}

/* ───── 338: מיזוג גרסאות של שני מדריכים ───── */
interface MRow { state: "same" | "changed" | "onlyA" | "onlyB"; a: Block | null; b: Block | null; similarity: number }
type Choice = "a" | "b" | "both" | "skip";
const STATE_LABEL: Record<MRow["state"], string> = { same: "זהה", changed: "שונה", onlyA: "רק בגרסה שלי", onlyB: "רק בגרסה האחרת" };
export function MergeModal({ open, onClose, token, currentId, blocks, onApply }: { open: boolean; onClose: () => void; token: string | null; currentId: number; blocks: Block[]; onApply: (blocks: Block[]) => void }) {
  const toast = useToast();
  const [docs, setDocs] = useState<{ id: number; title: string }[]>([]);
  const [rows, setRows] = useState<MRow[] | null>(null);
  const [choice, setChoice] = useState<Choice[]>([]);
  useEffect(() => {
    if (!open) return;
    setRows(null);
    api<{ id: number; title: string }[]>("/api/write/docs", { token }).then((r) => setDocs(r.filter((x) => x.id !== currentId))).catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [open, token, currentId, toast]);
  const pick = async (id: number) => {
    try {
      const other = await api<{ blocks: Block[] }>(`/api/write/docs/${id}`, { token });
      const r = await api<{ rows: MRow[] }>("/api/write/merge-plan", { method: "POST", token, body: { a: blocks, b: other.blocks } });
      setRows(r.rows);
      setChoice(r.rows.map((x) => (x.state === "onlyB" ? "b" : x.state === "same" ? "a" : x.state === "changed" ? "a" : "a")));
    } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const apply = () => {
    if (!rows) return;
    const out: Block[] = [];
    rows.forEach((r, i) => {
      const c = choice[i];
      if (c === "skip") return;
      if ((c === "a" || c === "both") && r.a) out.push(r.a);
      if ((c === "b" || c === "both") && r.b) out.push({ ...r.b, id: r.a && c === "both" ? newBlockId() : r.a?.id ?? newBlockId(), done: false });
    });
    if (!out.length) return toast("לא נבחר אף שלב", { kind: "error" });
    onApply(out.slice(0, 60));
    toast("המיזוג הוחל. אפשר לבטל עם Ctrl+Z.", { kind: "success" });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="מיזוג שתי גרסאות" wide footer={<><button type="button" className="btn btn-primary" disabled={!rows} onClick={apply}>החלת המיזוג</button><Close onClose={onClose} /></>}>
      {!rows ? (
        <>
          <p className="hint">בחרו את המסמך של המדריך השני (העתק שלו שמור אצלכם). השלבים ייושרו לפי דמיון בכותרת ובטקסט.</p>
          {docs.length === 0 ? <p>אין מסמכים אחרים לבחירה.</p> : (
            <ul className="plain-list">{docs.map((d) => (<li key={d.id}><span>{d.title || "מסמך ללא שם"}</span><button type="button" className="btn btn-small" onClick={() => void pick(d.id)}>השוואה</button></li>))}</ul>
          )}
        </>
      ) : (
        <ol className="merge-list">
          {rows.map((r, i) => (
            <li key={i} className={`merge-row m-${r.state}`}>
              <strong>{STATE_LABEL[r.state]}{r.state === "changed" ? ` · דמיון ${r.similarity}%` : ""}</strong>
              <div className="merge-cols">
                <div><small>שלי</small><p>{r.a ? `${r.a.title || "שלב"}: ${r.a.text.slice(0, 110)}` : "—"}</p></div>
                <div><small>האחרת</small><p>{r.b ? `${r.b.title || "שלב"}: ${r.b.text.slice(0, 110)}` : "—"}</p></div>
              </div>
              <div role="radiogroup" aria-label={`בחירה לשלב ${i + 1}`} className="actions">
                {(["a", "b", "both", "skip"] as Choice[]).filter((c) => (c === "a" ? !!r.a : c === "b" ? !!r.b : c === "both" ? !!r.a && !!r.b : true)).map((c) => (
                  <label key={c} className="check"><input type="radio" name={`m${i}`} checked={choice[i] === c} onChange={() => setChoice((p) => p.map((x, j) => (j === i ? c : x)))} /> {{ a: "שלי", b: "האחרת", both: "שתיהן", skip: "בלי" }[c]}</label>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

/* ───── 339: מי צופה עכשיו ───── */
export function ViewersModal({ open, onClose, token, docId, blocks }: { open: boolean; onClose: () => void; token: string | null; docId: number; blocks: Block[] }) {
  const [v, setV] = useState<{ cid: string; name: string; blockId: string }[]>([]);
  const [share, setShare] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<{ token: string | null }>(`/api/write/docs/${docId}/share`, { token }).then((s) => alive && setShare(s.token)).catch(() => alive && setShare(null));
    const tick = () => api<{ viewers: typeof v }>(`/api/write/docs/${docId}/presence`, { token }).then((r) => alive && setV(r.viewers)).catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [open, token, docId]);
  const where = (id: string) => { const i = blocks.findIndex((b) => b.id === id); return i < 0 ? "בראש המסמך" : `בשלב ${i + 1}: ${blocks[i].title || "ללא שם"}`; };
  return (
    <Modal open={open} onClose={onClose} title="מי צופה עכשיו" footer={<Close onClose={onClose} />}>
      {share === null && <p className="hint">אין קישור צפייה פעיל. צרו קישור בתפריט השיתוף ושלחו אותו לשותף. כשהוא ייכנס, תראו כאן באיזה שלב הוא נמצא.</p>}
      <div aria-live="polite">
        {v.length === 0 ? <p>אף אחד לא צופה כרגע.</p> : (
          <ul className="plain-list">{v.map((x) => (<li key={x.cid}><span><span className="viewer-dot" aria-hidden="true" /> <strong>{x.name}</strong> · {where(x.blockId)}</span></li>))}</ul>
        )}
      </div>
      <p className="hint">זו צפייה חיה בלבד: הצופה לא יכול לערוך, ואתם רואים באיזה שלב הוא נמצא. הרשימה מתעדכנת כל 4 שניות.</p>
    </Modal>
  );
}

/* ───── 340: הקלטות קוליות לשלב (נשמרות במכשיר בלבד) ───── */
interface Note { id: string; docId: number; blockId: string; at: number; blob: Blob }
const DB = "scout-voice-notes";
const openDb = () => new Promise<IDBDatabase>((ok, no) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore("n", { keyPath: "id" });
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});
const idb = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDb();
  return new Promise<T>((ok, no) => { const q = f(db.transaction("n", mode).objectStore("n")); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
};
export function VoiceNotesModal({ open, onClose, docId, block }: { open: boolean; onClose: () => void; docId: number; block: Block | undefined }) {
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const urls = useRef<string[]>([]);
  const supported = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
  const load = useCallback(async () => {
    try {
      const all = await idb<Note[]>("readonly", (s) => s.getAll());
      setNotes(all.filter((n) => n.docId === docId && n.blockId === (block?.id ?? "")).sort((a, b) => b.at - a.at));
    } catch { setNotes([]); }
  }, [docId, block?.id]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  const stop = useCallback(() => { if (timer.current) clearInterval(timer.current); mr.current?.state === "recording" && mr.current.stop(); setRec(false); }, []);
  useEffect(() => { if (!open) stop(); }, [open, stop]);
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  const start = async () => {
    if (!block) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        try { await idb("readwrite", (s) => s.put({ id: newBlockId(), docId, blockId: block.id, at: Date.now(), blob } satisfies Note)); toast("ההקלטה נשמרה במכשיר הזה", { kind: "success" }); } catch { toast("לא הצלחתי לשמור את ההקלטה", { kind: "error" }); }
        void load();
      };
      mr.current = r; r.start(); setRec(true); setSecs(0);
      timer.current = setInterval(() => setSecs((s) => { if (s >= 119) { stop(); return s; } return s + 1; }), 1000);
    } catch { toast("אין גישה למיקרופון. אפשרו אותו בדפדפן ונסו שוב.", { kind: "error" }); }
  };
  const del = async (id: string) => { try { await idb("readwrite", (s) => s.delete(id)); } catch {} void load(); };
  const urlFor = (b: Blob) => { const u = URL.createObjectURL(b); urls.current.push(u); return u; };
  const items = useMemo(() => notes.map((n) => ({ n, url: urlFor(n.blob) })), [notes]);
  return (
    <Modal open={open} onClose={onClose} title={`הקלטות לשלב: ${block?.title || "השלב הנוכחי"}`} footer={<Close onClose={onClose} />}>
      {!supported ? <p className="error-box" role="alert">הדפדפן הזה לא תומך בהקלטה.</p> : (
        <>
          <p className="hint">הערות קוליות לעצמכם, עד שתי דקות כל אחת. הן נשמרות רק במכשיר הזה ולא עולות לשרת.</p>
          <div className="actions">
            {!rec ? <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={!block}>התחלת הקלטה</button> : <button type="button" className="btn btn-primary" onClick={stop}>עצירה ({secs} שנ׳)</button>}
          </div>
          <div aria-live="polite" className="sr-only">{rec ? "מקליט" : ""}</div>
          {items.length === 0 ? <p>אין עדיין הקלטות לשלב הזה.</p> : (
            <ul className="plain-list">{items.map(({ n, url }) => (
              <li key={n.id}><span>{new Date(n.at).toLocaleString("he-IL")}<br /><audio controls src={url} aria-label="נגן הקלטה" /></span>
                <button type="button" className="btn btn-small" onClick={() => void del(n.id)}>מחיקה</button></li>
            ))}</ul>
          )}
        </>
      )}
    </Modal>
  );
}

/* ───── 341: שאלות פתיחה ───── */
export function HooksModal({ open, onClose, token, snap, onInsert }: { open: boolean; onClose: () => void; token: string | null; snap: Snap; onInsert: (t: string) => void }) {
  const toast = useToast();
  const [hooks, setHooks] = useState<{ type: string; text: string }[]>([]);
  useEffect(() => {
    if (open) api<{ hooks: typeof hooks }>("/api/write/hooks", { method: "POST", token, body: docBody(snap) }).then((r) => setHooks(r.hooks)).catch((e) => toast(errorMessage(e), { kind: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="שאלות פתיחה" wide footer={<Close onClose={onClose} />}>
      <ul className="plain-list">
        {hooks.map((h) => (<li key={h.text}><span><strong>{h.type}:</strong> {h.text}</span>
          <button type="button" className="btn btn-small" onClick={() => { onInsert(`\n${h.text}\n`); toast("נוסף לשלב", { kind: "success" }); }}>הוספה לשלב</button></li>))}
      </ul>
      <p className="hint">השאלות בנויות מהנושא והמילים המרכזיות בפעולה שלכם. התאימו לקבוצה.</p>
    </Modal>
  );
}

/* ───── 342: מד השתתפות ───── */
export function ParticipationModal({ open, onClose, docId }: { open: boolean; onClose: () => void; docId: number }) {
  const key = `scout.meter.${docId}`;
  const [names, setNames] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(true);
  useEffect(() => {
    if (!open) return;
    try { const s = JSON.parse(localStorage.getItem(key) || "null"); if (s) { setNames(s.names ?? ""); setCounts(s.counts ?? {}); setEditing(!(s.names ?? "").trim()); } } catch {}
  }, [open, key]);
  const save = (n: string, c: Record<string, number>) => { try { localStorage.setItem(key, JSON.stringify({ names: n, counts: c })); } catch {} };
  const list = names.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 40);
  const max = Math.max(1, ...list.map((n) => counts[n] ?? 0));
  const min = Math.min(...list.map((n) => counts[n] ?? 0));
  const quiet = list.filter((n) => (counts[n] ?? 0) === min).slice(0, 4);
  const bump = (n: string, d: number) => { const c = { ...counts, [n]: Math.max(0, (counts[n] ?? 0) + d) }; setCounts(c); save(names, c); };
  const total = list.reduce((s, n) => s + (counts[n] ?? 0), 0);
  return (
    <Modal open={open} onClose={onClose} title="מד השתתפות" wide footer={<Close onClose={onClose} />}>
      {editing ? (
        <>
          <Field label="שמות החניכים (שם בכל שורה)" htmlFor="meter-names">
            <textarea id="meter-names" rows={8} value={names} onChange={(e) => setNames(e.target.value)} />
          </Field>
          <button type="button" className="btn btn-primary" onClick={() => { save(names, counts); setEditing(false); }}>התחלה</button>
        </>
      ) : (
        <>
          <p className="hint">לחצו על שם בכל פעם שחניך מדבר או משתתף. השמות והספירה נשמרים רק במכשיר הזה.</p>
          <ul className="meter-list">
            {list.map((n) => (
              <li key={n}>
                <button type="button" className="meter-name" onClick={() => bump(n, 1)} aria-label={`${n}: ${counts[n] ?? 0}. הוספת השתתפות`}>{n}</button>
                <span className="meter-bar" aria-hidden="true"><span style={{ width: `${((counts[n] ?? 0) / max) * 100}%` }} /></span>
                <span className="meter-n">{counts[n] ?? 0}</span>
                <button type="button" className="btn btn-small" onClick={() => bump(n, -1)} aria-label={`הפחתת השתתפות של ${n}`}>−</button>
              </li>
            ))}
          </ul>
          {total >= 5 && quiet.length > 0 && quiet.length < list.length && (
            <p role="status" className="meter-tip"><strong>כדאי לתת במה ל:</strong> {quiet.join(", ")}</p>
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={() => setEditing(true)}>עריכת שמות</button>
            <button type="button" className="btn" onClick={() => { setCounts({}); save(names, {}); }}>איפוס ספירה</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ───── 343: מחולל כללי משחק ───── */
export function GameRulesModal({ open, onClose, token, onInsert }: { open: boolean; onClose: () => void; token: string | null; onInsert: (t: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", players: 16, space: "outdoor", goal: "", style: "teams" });
  const [text, setText] = useState("");
  const [err, setErr] = useState<Record<string, string[]>>({});
  const go = async () => {
    setErr({});
    try { setText((await api<{ text: string }>("/api/write/game-rules", { method: "POST", token, body: { ...f, players: Number(f.players) } })).text); }
    catch (e) { const fields = (e as { fields?: Record<string, string[]> }).fields; if (fields) setErr(fields); toast(errorMessage(e), { kind: "error" }); }
  };
  return (
    <Modal open={open} onClose={onClose} title="מחולל כללי משחק" wide footer={<Close onClose={onClose} />}>
      <Field label="שם המשחק" htmlFor="gr-name" error={err.name?.[0]}><input id="gr-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="מטרת המשחק" htmlFor="gr-goal" error={err.goal?.[0]}><input id="gr-goal" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} /></Field>
      <Field label="מספר משתתפים" htmlFor="gr-n"><input id="gr-n" type="number" min={2} max={120} value={f.players} onChange={(e) => setF({ ...f, players: Number(e.target.value) })} /></Field>
      <Field label="מקום" htmlFor="gr-space"><select id="gr-space" value={f.space} onChange={(e) => setF({ ...f, space: e.target.value })}><option value="outdoor">בחוץ</option><option value="hall">אולם</option><option value="room">חדר</option></select></Field>
      <Field label="סוג" htmlFor="gr-style"><select id="gr-style" value={f.style} onChange={(e) => setF({ ...f, style: e.target.value })}><option value="teams">קבוצות מתחרות</option><option value="coop">שיתופי: כולם יחד</option><option value="solo">אישי</option></select></Field>
      <button type="button" className="btn btn-primary" onClick={() => void go()}>יצירת כללים</button>
      {text && (
        <>
          <pre className="rules-out" dir="rtl" tabIndex={0} aria-label="כללי המשחק">{text}</pre>
          <div className="actions">
            <button type="button" className="btn" onClick={() => { onInsert(`\n${text}\n`); toast("הכללים נוספו לשלב", { kind: "success" }); }}>הוספה לשלב</button>
            <button type="button" className="btn" onClick={() => void copy(text, toast)}>העתקה</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ───── 344: דף עזר דו-לשוני ───── */
interface Sheet { language: string; stages: { n: number; kind: string; minutes: number | null; original: string }[]; phrases: { he: string; tr: string }[]; glossary: { he: string; tr: string }[]; note: string }
export function TranslateModal({ open, onClose, token, snap }: { open: boolean; onClose: () => void; token: string | null; snap: Snap }) {
  const toast = useToast();
  const [lang, setLang] = useState<"en" | "ru">("en");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  useEffect(() => {
    if (!open) return;
    api<Sheet>("/api/write/translate-sheet", { method: "POST", token, body: { lang, doc: docBody(snap) } }).then(setSheet).catch((e) => toast(errorMessage(e), { kind: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lang]);
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const print = () => {
    if (!sheet) return;
    const rows = (a: { he: string; tr: string }[]) => `<table border="1" cellpadding="6" style="width:100%">${a.map((r) => `<tr><td>${esc(r.he)}</td><td dir="ltr">${esc(r.tr)}</td></tr>`).join("")}</table>`;
    printHtml(`דף עזר ${sheet.language}`, `<h1>${esc(snap.title || "פעולה")} · ${esc(sheet.language)}</h1><h2>שלבים</h2><ol>${sheet.stages.map((s) => `<li dir="ltr">${esc(s.kind)}${s.minutes ? ` (${s.minutes} min)` : ""} · ${esc(s.original)}</li>`).join("")}</ol><h2>ביטויים</h2>${rows(sheet.phrases)}${sheet.glossary.length ? `<h2>מילון לפעולה</h2>${rows(sheet.glossary)}` : ""}`, toast);
  };
  return (
    <Modal open={open} onClose={onClose} title="דף עזר באנגלית או ברוסית" wide footer={<Close onClose={onClose} />}>
      <Field label="שפה" htmlFor="tr-lang"><select id="tr-lang" value={lang} onChange={(e) => setLang(e.target.value as "en" | "ru")}><option value="en">English</option><option value="ru">Русский</option></select></Field>
      {sheet && (
        <>
          <p className="hint">{sheet.note}</p>
          <h3>ביטויים שימושיים</h3>
          <table className="bi-table"><tbody>{sheet.phrases.map((p) => (<tr key={p.he}><td>{p.he}</td><td dir="ltr" lang={lang}>{p.tr}</td></tr>))}</tbody></table>
          {sheet.glossary.length > 0 && (<><h3>מילים מהפעולה שלכם</h3><table className="bi-table"><tbody>{sheet.glossary.map((p) => (<tr key={p.he}><td>{p.he}</td><td dir="ltr" lang={lang}>{p.tr}</td></tr>))}</tbody></table></>)}
          <div className="actions"><button type="button" className="btn btn-primary" onClick={print}>הדפסה</button></div>
        </>
      )}
    </Modal>
  );
}

/* ───── 345: סדרה והפעולה הבאה ───── */
interface Series { series: string; items: { step: string; title: string; goal: string; text: string }[] }
export function SeriesModal({ open, onClose, token, snap, onInsert, onOpened }: { open: boolean; onClose: () => void; token: string | null; snap: Snap; onInsert: (t: string) => void; onOpened: (id: number) => void }) {
  const toast = useToast();
  const [s, setS] = useState<Series | null>(null);
  useEffect(() => {
    if (open) api<Series>("/api/write/next-series", { method: "POST", token, body: docBody(snap) }).then(setS).catch((e) => toast(errorMessage(e), { kind: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const create = async (title: string) => {
    try { const d = await api<{ id: number }>("/api/write/docs", { method: "POST", token, body: { template: "blank", title } }); onOpened(d.id); onClose(); }
    catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  return (
    <Modal open={open} onClose={onClose} title="הפעולה הבאה בסדרה" wide footer={<Close onClose={onClose} />}>
      {s && (
        <>
          <h3>{s.series}</h3>
          <ol>
            {s.items.map((it) => (
              <li key={it.step}>
                <strong>{it.step}: {it.title}</strong><br />{it.goal}<br /><small>{it.text}</small>
                <div className="actions">
                  <button type="button" className="btn btn-small" onClick={() => void create(it.title)}>פתיחת פעולה חדשה</button>
                  <button type="button" className="btn btn-small" onClick={() => { onInsert(`\n**להמשך הסדרה (${it.step}):** ${it.title}. ${it.goal}.\n`); toast("נוסף כהערת המשך", { kind: "success" }); }}>הוספת הערת המשך</button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}
