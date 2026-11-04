"use client";

// עזרה במתודות בעורך הכתיבה (113–126): הצעות לשלב, החלפה, העמקה וקיצור, גשר בין שלבים,
// "מה חסר", העדפות אישיות, חיפוש מתודה והשוואת גרסאות של שלב. הכול מבוסס כללים, בלי מודל שפה.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Modal } from "./ui";
import { KIND_LABEL, type Block, type Snap } from "./WriteParts";

export type InsertMode = "append" | "cursor" | "replace-sentence" | "replace-all";
export interface InsertFn {
  (blockId: string, text: string, mode: InsertMode, replaceWhat?: string): void;
}

interface Suggestion {
  method: string;
  category: string | null;
  score: number;
  why: string[];
  warn: string[];
  text: string;
  valueLink: string;
  minutes: number | null;
  unit: string;
  pref: number;
}
interface SuggestRes {
  blockId: string;
  kind: string;
  voice: string;
  detected: unknown[];
  suggestions: Suggestion[];
  rest: number;
}
interface SwapAlt {
  method: string;
  why: string;
  text: string;
  already: boolean;
  pref: number;
}
interface SwapRes {
  found: boolean;
  method?: string;
  current?: string;
  alternatives: SwapAlt[];
  detected: string[];
}
interface Expanded {
  method: string;
  minutes: number;
  text: string;
}
interface BridgeRes {
  from: string;
  to: string;
  options: { text: string; kind: string }[];
}
export interface Gap {
  id: string;
  label: string;
  severity: "high" | "mid" | "low";
  blockId?: string;
  action: { type: "suggest" | "add" | "focus" | "none"; blockId?: string; kind?: string; field?: string };
}
interface GapsRes {
  gaps: Gap[];
  filled: number;
  total: number;
}
interface Catalog {
  categories: { id: string; label: string; methods: string[] }[];
  playbook: string[];
  gear: { id: string; label: string }[];
}
interface SearchRes {
  catalog: { method: string; category: string | null; playbook: string[] }[];
  library: { activityId: number; title: string; ageGroup: string; stage: string; excerpt: string; hits: number }[];
  mine: { docId: number; docTitle: string; blockTitle: string; excerpt: string; hits: number }[];
}

const payload = (s: Snap) => ({ title: s.title, meta: s.meta, blocks: s.blocks.map((b) => ({ id: b.id, title: b.title, kind: b.kind, minutes: b.minutes, text: b.text, note: b.note })) });
const stageName = (b: Block | undefined, i: number) => (b ? b.title || KIND_LABEL[b.kind] : `שלב ${i + 1}`);

export function useCatalog(token: string | null) {
  const [cat, setCat] = useState<Catalog | null>(null);
  useEffect(() => {
    if (!token) return;
    api<Catalog>("/api/write/method-catalog", { token }).then(setCat).catch(() => setCat(null));
  }, [token]);
  return cat;
}

// ───── חלון עזרה לשלב: הצעות, החלפה, גשר ─────
type Tab = "suggest" | "swap" | "bridge";
export function HelpModal({ open, onClose, snap, blockId, token, onInsert }: { open: boolean; onClose: () => void; snap: Snap; blockId: string | null; token: string | null; onInsert: InsertFn }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("suggest");
  const [sug, setSug] = useState<SuggestRes | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [swap, setSwap] = useState<SwapRes | null>(null);
  const [swapFrom, setSwapFrom] = useState("");
  const [bridge, setBridge] = useState<BridgeRes | null>(null);
  const [exp, setExp] = useState<Expanded | null>(null);
  const [busy, setBusy] = useState(false);
  const [mins, setMins] = useState(15);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const idx = snap.blocks.findIndex((b) => b.id === blockId);
  const block = idx >= 0 ? snap.blocks[idx] : undefined;
  const next = idx >= 0 ? snap.blocks[idx + 1] : undefined;

  const run = useCallback(
    async <T,>(path: string, body: unknown): Promise<T | null> => {
      setBusy(true);
      try {
        return await api<T>(path, { method: "POST", token, body });
      } catch (e) {
        toast(errorMessage(e), { kind: "error" });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [token, toast],
  );

  const loadSuggest = useCallback(
    async (more: boolean) => {
      if (!blockId) return;
      const exclude = more ? shown : [];
      const r = await run<SuggestRes>("/api/write/suggest", { doc: payload(snapRef.current), blockId, exclude });
      if (!r) return;
      setSug(r);
      setShown(more ? [...exclude, ...r.suggestions.map((s) => s.method)] : r.suggestions.map((s) => s.method));
    },
    [blockId, run, shown],
  );

  // טעינה בפתיחה ובכל מעבר בין לשוניות
  useEffect(() => {
    if (!open || !blockId) return;
    setExp(null);
    if (tab === "suggest") {
      setShown([]);
      void (async () => {
        const r = await run<SuggestRes>("/api/write/suggest", { doc: payload(snapRef.current), blockId, exclude: [] });
        if (r) {
          setSug(r);
          setShown(r.suggestions.map((s) => s.method));
        }
      })();
    }
    if (tab === "swap") {
      void (async () => {
        const r = await run<SwapRes>("/api/write/swap", { doc: payload(snapRef.current), blockId, method: swapFrom || "" });
        if (r) setSwap(r);
      })();
    }
    if (tab === "bridge" && next) {
      void (async () => {
        const r = await run<BridgeRes>("/api/write/bridge", { doc: payload(snapRef.current), fromId: blockId, toId: next.id });
        if (r) setBridge(r);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blockId, tab]);

  const doExpand = async (method: string, short: boolean) => {
    const r = short ? await run<Expanded>("/api/write/short", { doc: payload(snapRef.current), method }) : await run<Expanded>("/api/write/expand", { doc: payload(snapRef.current), method, minutes: mins });
    if (r) setExp(r);
  };

  const add = (text: string, mode: InsertMode = "append", what?: string) => {
    if (!blockId) return;
    onInsert(blockId, text, mode, what);
    toast("נוסף לשלב. אפשר לבטל עם הכפתור 'ביטול'", { kind: "success" });
  };

  const methodOptions = useMemo(() => (swap?.detected ?? []).map((m) => m), [swap]);

  return (
    <Modal open={open} onClose={onClose} title={`עזרה במתודות: ${stageName(block, idx)}`} wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <div className="write-tabs" role="tablist" aria-label="סוגי עזרה">
        {([["suggest", "הצעות לשלב"], ["swap", "החלפת מתודה"], ["bridge", "מעבר לשלב הבא"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`wh-tab-${id}`} aria-selected={tab === id} aria-controls="wh-panel" className={`btn btn-small ${tab === id ? "btn-primary" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div id="wh-panel" role="tabpanel" aria-labelledby={`wh-tab-${tab}`} className="write-help">
        <p className="hint" role="status">
          {busy ? "מחפש הצעות..." : "ההצעות מבוססות על כללים ועל מה שכתבתם במסמך, לא על מודל שפה. תמיד אפשר לערוך אחרי ההוספה."}
        </p>

        {tab === "suggest" && sug && (
          <>
            {sug.suggestions.length === 0 && <p>אין עוד הצעות לשלב הזה. נסו לשנות את הציוד או את הערך למעלה.</p>}
            <ol className="plain-list write-sugs">
              {sug.suggestions.map((s) => (
                <li key={s.method} className="write-sug">
                  <h3 className="subtitle">
                    {s.method} {s.pref > 0 && <span className="chip">מהמועדפות שלכם</span>}
                  </h3>
                  <p className="write-sug-text">{s.text}</p>
                  {s.why.length > 0 && (
                    <p className="hint">
                      <strong>למה:</strong> {s.why.join(" · ")}
                    </p>
                  )}
                  {s.warn.length > 0 && (
                    <p className="hint" role="note">
                      <strong>שימו לב:</strong> {s.warn.join(" · ")}
                    </p>
                  )}
                  <div className="actions">
                    <button type="button" className="btn btn-small btn-primary" onClick={() => add(s.text, "append")}>
                      הוספה בסוף השלב<span className="sr-only">: {s.method}</span>
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => add(s.text, "cursor")}>
                      הוספה במקום הסמן<span className="sr-only">: {s.method}</span>
                    </button>
                    {PLAYABLE.has(s.method) && (
                      <>
                        <button type="button" className="btn btn-small" onClick={() => doExpand(s.method, false)}>
                          העמקה לתסריט<span className="sr-only">: {s.method}</span>
                        </button>
                        <button type="button" className="btn btn-small" onClick={() => doExpand(s.method, true)}>
                          גרסה קצרה של 10 דקות<span className="sr-only">: {s.method}</span>
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <div className="actions">
              <button type="button" className="btn btn-small" onClick={() => loadSuggest(true)} disabled={busy || sug.rest <= 0}>
                עוד הצעות ({sug.rest})
              </button>
              <label className="inline-label" htmlFor="wh-mins">
                משך העמקה (דקות)
              </label>
              <input id="wh-mins" type="number" min={5} max={60} dir="ltr" value={mins} onChange={(e) => setMins(Math.max(5, Math.min(60, Math.round(Number(e.target.value)) || 15)))} style={{ width: "5rem" }} />
            </div>
          </>
        )}

        {tab === "swap" && (
          <>
            {swap && swap.detected.length === 0 && <p>לא זיהיתי בשלב הזה מתודה מוכרת להחליף. כתבו עוד קצת, או עברו ללשונית ההצעות.</p>}
            {swap && swap.detected.length > 0 && (
              <div className="inline-form">
                <label htmlFor="wh-from">מתודה להחלפה</label>
                <select
                  id="wh-from"
                  value={swapFrom || swap.method || ""}
                  onChange={async (e) => {
                    setSwapFrom(e.target.value);
                    const r = await run<SwapRes>("/api/write/swap", { doc: payload(snapRef.current), blockId, method: e.target.value });
                    if (r) setSwap(r);
                  }}
                >
                  {methodOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {swap?.found && (
              <>
                <p className="hint">
                  המשפט שיוחלף: <q>{swap.current}</q>
                </p>
                <ol className="plain-list write-sugs">
                  {swap.alternatives.map((a) => (
                    <li key={a.method} className="write-sug">
                      <h3 className="subtitle">
                        {a.method} {a.already && <span className="chip">כבר מופיעה במסמך</span>} {a.pref > 0 && <span className="chip">מהמועדפות שלכם</span>}
                      </h3>
                      <p className="write-sug-text">{a.text}</p>
                      <p className="hint">{a.why}</p>
                      <div className="actions">
                        <button type="button" className="btn btn-small btn-primary" onClick={() => add(a.text, "replace-sentence", swap.current)}>
                          החלפה במשפט הקיים<span className="sr-only">: {a.method}</span>
                        </button>
                        <button type="button" className="btn btn-small" onClick={() => add(a.text, "append")}>
                          הוספה בלי להחליף<span className="sr-only">: {a.method}</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}

        {tab === "bridge" &&
          (!next ? (
            <p>זה השלב האחרון, אין לאן לעבור. אפשר להוסיף שלב חדש ואז לחזור לכאן.</p>
          ) : (
            bridge && (
              <>
                <p className="hint">
                  מעבר מ<strong>{bridge.from}</strong> אל <strong>{bridge.to}</strong>. המשפט נכנס בסוף השלב הנוכחי.
                </p>
                <ol className="plain-list write-sugs">
                  {bridge.options.map((o, i) => (
                    <li key={i} className="write-sug">
                      <p className="write-sug-text">{o.text}</p>
                      <div className="actions">
                        <button type="button" className="btn btn-small btn-primary" onClick={() => add(o.text, "append")}>
                          הוספה בסוף השלב<span className="sr-only">: אפשרות {i + 1}</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )
          ))}

        {exp && (
          <section className="write-sug" aria-label={`תסריט מלא: ${exp.method}`}>
            <h3 className="subtitle">
              {exp.method} ({exp.minutes} דקות)
            </h3>
            <pre className="write-ver-text">{exp.text}</pre>
            <div className="actions">
              <button type="button" className="btn btn-small btn-primary" onClick={() => add(exp.text, "append")}>
                הוספה בסוף השלב<span className="sr-only">: התסריט</span>
              </button>
              <button type="button" className="btn btn-small" onClick={() => add(exp.text, "replace-all")}>
                החלפת כל תוכן השלב<span className="sr-only">: בתסריט</span>
              </button>
              <button type="button" className="btn btn-small" onClick={() => setExp(null)}>
                סגירת התסריט
              </button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
const PLAYABLE_LIST = ["משחק תחרות", "עשייה", "הבעה יצירתית", "ייצוג", "משחק הדמייה", "חשיבה משותפת", "התבוננות", "שיתוף", "דיון בשאלה", "הסבר", "פירוק", "השראה", "סיפור", "שיר"];
const PLAYABLE = new Set<string>(PLAYABLE_LIST);

// ───── "מה חסר": רשימה חיה (123) ─────
export function GapsPanel({ snap, token, onSuggest, onAdd, onFocus }: { snap: Snap; token: string | null; onSuggest: (blockId: string) => void; onAdd: (kind: string) => void; onFocus: (blockId: string, field: string) => void }) {
  const [res, setRes] = useState<GapsRes | null>(null);
  const [err, setErr] = useState(false);
  const key = useMemo(() => JSON.stringify(payload(snap)), [snap]);
  useEffect(() => {
    if (!token) return;
    const t = window.setTimeout(() => {
      api<GapsRes>("/api/write/gaps", { method: "POST", token, body: { doc: JSON.parse(key) } })
        .then((r) => {
          setRes(r);
          setErr(false);
        })
        .catch(() => setErr(true));
    }, 900);
    return () => window.clearTimeout(t);
  }, [key, token]);

  const act = (g: Gap) => {
    const a = g.action;
    if (a.type === "suggest" && a.blockId) onSuggest(a.blockId);
    else if (a.type === "add" && a.kind) onAdd(a.kind);
    else if (a.type === "focus" && a.blockId) onFocus(a.blockId, a.field || "minutes");
  };
  const actLabel = (g: Gap) => (g.action.type === "suggest" ? "הצעות לשלב" : g.action.type === "add" ? "הוספת שלב" : g.action.type === "focus" ? "מעבר לשדה" : "");

  return (
    <section className="card glass write-gaps" aria-label="מה חסר בפעולה">
      <h2 className="subtitle">מה חסר בפעולה</h2>
      <div role="status" aria-live="polite">
        {err && <p className="hint">אין חיבור לשרת כרגע, הרשימה לא מתעדכנת.</p>}
        {!res ? (
          <p className="hint">בודק...</p>
        ) : res.gaps.length === 0 ? (
          <p>לא מצאתי חוסרים. הפעולה נראית שלמה ({res.filled} מתוך {res.total} שלבים מלאים).</p>
        ) : (
          <>
            <p className="hint">
              {res.gaps.length} דברים לשקול · {res.filled} מתוך {res.total} שלבים מלאים
            </p>
            <ul className="plain-list">
              {res.gaps.map((g) => (
                <li key={g.id} className={`gap-${g.severity}`}>
                  <span>
                    <span className="sr-only">{g.severity === "high" ? "חשוב: " : g.severity === "mid" ? "כדאי: " : "אפשר: "}</span>
                    {g.label}
                  </span>
                  {g.action.type !== "none" && (
                    <button type="button" className="btn btn-small" onClick={() => act(g)}>
                      {actLabel(g)}
                      <span className="sr-only">: {g.label}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

// ───── העדפות אישיות (124) ─────
export function PrefsModal({ open, onClose, token, cat }: { open: boolean; onClose: () => void; token: string | null; cat: Catalog | null }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    api<Record<string, number>>("/api/write/prefs", { token }).then(setPrefs).catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [open, token, toast]);
  const set = async (method: string, weight: number) => {
    try {
      setPrefs(await api<Record<string, number>>("/api/write/prefs", { method: "PUT", token, body: { method, weight } }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="המתודות שלי" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p className="hint">סמנו מתודות שאתם אוהבים או רוצים להימנע מהן. הצעות עתידיות יקחו את זה בחשבון: מועדפות יקבלו עדיפות, ולא-רצויות יורדו למטה.</p>
      {!cat ? (
        <p>טוען...</p>
      ) : (
        cat.categories.map((c) => (
          <fieldset key={c.id} className="write-pref-group">
            <legend>{c.label}</legend>
            <ul className="plain-list">
              {c.methods.map((m) => (
                <li key={m}>
                  <span id={`pref-${m}`}>{m}</span>
                  <span role="radiogroup" aria-labelledby={`pref-${m}`} className="actions">
                    {([[1, "אוהב"], [0, "רגיל"], [-1, "לא"]] as [number, string][]).map(([w, l]) => (
                      <button key={w} type="button" role="radio" aria-checked={(prefs[m] ?? 0) === w} className={`btn btn-small ${(prefs[m] ?? 0) === w ? "btn-primary" : ""}`} onClick={() => set(m, w)}>
                        {l}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </fieldset>
        ))
      )}
    </Modal>
  );
}

// ───── חיפוש מתודה (126) ─────
export function SearchModal({ open, onClose, token, blockId, onInsert }: { open: boolean; onClose: () => void; token: string | null; blockId: string | null; onInsert: InsertFn }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchRes | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setRes(await api<SearchRes>(`/api/write/methods/search?q=${encodeURIComponent(q.trim())}`, { token }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const add = (text: string) => {
    if (!blockId) return;
    onInsert(blockId, text, "append");
    toast("נוסף לשלב הנוכחי", { kind: "success" });
  };
  return (
    <Modal open={open} onClose={onClose} title="חיפוש מתודה או רעיון" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <form
        className="inline-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <label htmlFor="ws-q">מה מחפשים</label>
        <input id="ws-q" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} placeholder="למשל: סיפור, מירוץ, שיתוף" />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          חיפוש
        </button>
      </form>
      <p className="hint">התוצאות מגיעות מקטלוג המתודות, ממאגר הפעולות של השבט וממסמכים שכתבתם. "הוספה" מכניסה את הקטע לסוף השלב הנוכחי.</p>
      <div role="status" aria-live="polite">
        {res && res.catalog.length + res.library.length + res.mine.length === 0 && <p>לא נמצא כלום. נסו מילה אחרת.</p>}
      </div>
      {res && res.catalog.length > 0 && (
        <section aria-label="מתודות מהקטלוג">
          <h3 className="subtitle">מהקטלוג</h3>
          <ul className="plain-list">
            {res.catalog.map((c) => (
              <li key={c.method}>
                <span>
                  <strong>{c.method}</strong> {c.playbook.length > 0 && <span className="hint">· {c.playbook.join(" · ")}</span>}
                </span>
                <button type="button" className="btn btn-small" onClick={() => add(c.playbook.length ? `${c.method}: ${c.playbook.join(". ")}.` : c.method)}>
                  הוספה<span className="sr-only">: {c.method}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {res && res.library.length > 0 && (
        <section aria-label="ממאגר השבט">
          <h3 className="subtitle">ממאגר השבט</h3>
          <ul className="plain-list">
            {res.library.map((l, i) => (
              <li key={`${l.activityId}-${i}`}>
                <span>
                  <strong>{l.title}</strong> {l.stage && `· ${l.stage}`}
                  <br />
                  <span className="hint">{l.excerpt}</span>
                </span>
                <button type="button" className="btn btn-small" onClick={() => add(l.excerpt)}>
                  הוספה<span className="sr-only">: {l.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {res && res.mine.length > 0 && (
        <section aria-label="מהמסמכים שלי">
          <h3 className="subtitle">מהמסמכים שלי</h3>
          <ul className="plain-list">
            {res.mine.map((l, i) => (
              <li key={`${l.docId}-${i}`}>
                <span>
                  <strong>{l.docTitle}</strong> {l.blockTitle && `· ${l.blockTitle}`}
                  <br />
                  <span className="hint">{l.excerpt}</span>
                </span>
                <button type="button" className="btn btn-small" onClick={() => add(l.excerpt)}>
                  הוספה<span className="sr-only">: {l.docTitle}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}

// ───── השוואת שלב מול גרסה קודמת (125) ─────
export type DiffRow = { t: "same" | "add" | "del"; s: string };
export function lineDiff(a: string, b: string): DiffRow[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  if (n * m > 250_000) return [...x.map((s) => ({ t: "del" as const, s })), ...y.map((s) => ({ t: "add" as const, s }))];
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) out.push({ t: "same", s: x[i++] }), j++;
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: "del", s: x[i++] });
    else out.push({ t: "add", s: y[j++] });
  }
  while (i < n) out.push({ t: "del", s: x[i++] });
  while (j < m) out.push({ t: "add", s: y[j++] });
  return out;
}

export function StageCompare({ current, old, onRestoreStage }: { current: Snap; old: Snap; onRestoreStage: (blockId: string, text: string) => void }) {
  const [sel, setSel] = useState(current.blocks[0]?.id ?? "");
  const cb = current.blocks.find((b) => b.id === sel);
  const ob = old.blocks.find((b) => b.id === sel);
  const rows = useMemo(() => (cb && ob ? lineDiff(ob.text, cb.text) : []), [cb, ob]);
  if (!current.blocks.length) return null;
  const changed = rows.some((r) => r.t !== "same");
  return (
    <section aria-label="השוואת שלב לגרסה הזו" className="write-compare">
      <h3 className="subtitle">השוואת שלב מול הגרסה הזו</h3>
      <div className="inline-form">
        <label htmlFor="wc-stage">שלב להשוואה</label>
        <select id="wc-stage" value={sel} onChange={(e) => setSel(e.target.value)}>
          {current.blocks.map((b, i) => (
            <option key={b.id} value={b.id}>
              {i + 1}. {stageName(b, i)}
            </option>
          ))}
        </select>
      </div>
      {!ob ? (
        <p className="hint">השלב הזה לא היה קיים בגרסה הישנה.</p>
      ) : !changed ? (
        <p className="hint" role="status">
          אין הבדל בטקסט של השלב בין הגרסה הנוכחית לישנה.
        </p>
      ) : (
        <>
          <p className="hint">שורות שנמחקו מהגרסה הישנה מסומנות ב"−", שורות שנוספו מאז ב"+".</p>
          <div className="write-diff" tabIndex={0} role="region" aria-label="הבדלים בטקסט השלב">
            {rows.map((r, i) => (
              <div key={i} className={`diff-${r.t}`}>
                <span aria-hidden="true">{r.t === "add" ? "+ " : r.t === "del" ? "− " : "  "}</span>
                <span className="sr-only">{r.t === "add" ? "נוסף: " : r.t === "del" ? "נמחק: " : ""}</span>
                {r.s || " "}
              </div>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={() => onRestoreStage(sel, ob.text)}>
              החזרת הטקסט הישן לשלב הזה בלבד
            </button>
          </div>
        </>
      )}
    </section>
  );
}
