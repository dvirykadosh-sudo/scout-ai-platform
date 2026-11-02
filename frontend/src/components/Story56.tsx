"use client";

// שלב 56 (453–469): סטודיו סיפור אישי. בניית סיפור בארבעה חלקים, זיכרונות, סיפורים שמורים והוספה לפעולה.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { GRADES } from "@/lib/constants";
import type { Activity } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { PolishTab } from "./StoryPolish56";
import { Field, Modal, Skeleton } from "./ui";

export interface Parts { situation: string; turn: string; feeling: string; learning: string; place: string; person: string; want: string }
export interface Version { at: string; label: string; text: string }
export interface Draft { id: number | null; title: string; value: string; age: string; parts: Parts; body: string; opening: string; closing: string; approved: boolean; dirty: boolean; versions: Version[] }
export const EMPTY_PARTS: Parts = { situation: "", turn: "", feeling: "", learning: "", place: "", person: "", want: "" };
export const EMPTY_DRAFT: Draft = { id: null, title: "", value: "", age: "", parts: EMPTY_PARTS, body: "", opening: "", closing: "", approved: false, dirty: false, versions: [] };
export type SetDraft = (fn: (d: Draft) => Draft) => void;

interface ValueRow { id: string; label: string; count: number }
interface Moment { id: string; label: string; short: string; moments: string[]; open: string; close: string; memories: { id: number; title: string; kind: string }[] }
interface Gap { key: string; q: string }
interface Built { text: string; parts: { key: string; label: string; text: string }[]; words: number; checks: { key: string; level: string; text: string }[]; gaps: { questions: Gap[]; covered: number; total: number }; openings: Opt[]; closings: Opt[]; moment: Moment | null }
interface Opt { kind: string; label: string; text: string; why: string }
interface Memory { id: number; kind: "memory" | "quote"; title: string; body: string; value: string; tags: string[]; place: string; year: number | null; consent: string }
interface StoryRow { id: number; title: string; value: string; age: string; approved: boolean; words: number; updatedAt: string; preview: string }
interface StoryFull extends StoryRow { parts: Partial<Parts>; body: string; opening: string; closing: string; versions: Version[] }

const TABS = [["build", "לבנות סיפור"], ["polish", "ליטוש הקול"], ["memories", "ספריית זיכרונות"], ["stories", "הסיפורים שלי"]] as const;
type Tab = (typeof TABS)[number][0];

const fromFull = (s: StoryFull): Draft => ({ id: s.id, title: s.title, value: s.value, age: s.age, parts: { ...EMPTY_PARTS, ...s.parts }, body: s.body, opening: s.opening, closing: s.closing, approved: s.approved, dirty: false, versions: s.versions });

export function StoryStudio() {
  const { token, ready } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("build");
  const [draft, setDraftRaw] = useState<Draft>(EMPTY_DRAFT);
  const [values, setValues] = useState<ValueRow[]>([]);
  const setDraft: SetDraft = useCallback((fn) => setDraftRaw((d) => ({ ...fn(d), dirty: true })), []);
  const load = useCallback((d: Draft) => setDraftRaw(d), []);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("value");
    if (v) setDraftRaw((d) => (d.value ? d : { ...d, value: v.slice(0, 60) }));
  }, []);
  useEffect(() => {
    if (!token) return;
    api<{ values: ValueRow[] }>("/api/story/moments", { token }).then((r) => setValues(r.values)).catch(() => setValues([]));
  }, [token]);

  if (!ready) return <Skeleton lines={4} />;
  if (!token) {
    return (
      <div className="card st-gate">
        <h2>הסטודיו פתוח למדריכים מחוברים</h2>
        <p>הסיפורים והזיכרונות שלכם אישיים, ולכן נשמרים בחשבון שלכם ורק אתם רואים אותם.</p>
        <p><Link className="btn btn-primary" href="/account">להתחברות או הרשמה</Link></p>
      </div>
    );
  }

  return (
    <div className="st-studio">
      <p className="hint st-intro">
        הכלי מסדר, שואל ובודק, אבל הסיפור הוא שלכם: הוא לא ממציא אירועים, שמות או ציטוטים. הבדיקות הן כללים ולא הבנה של משמעות, ולכן הן הצעות.
      </p>
      <div className="actions" role="tablist" aria-label="חלקי הסטודיו">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`st-tab-${k}`} aria-selected={tab === k} className={tab === k ? "btn btn-primary" : "btn"} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`st-tab-${tab}`} className="st-panel">
        {tab === "build" && <BuildTab token={token} values={values} draft={draft} setDraft={setDraft} goPolish={() => setTab("polish")} />}
        {tab === "polish" && <PolishTab token={token} draft={draft} setDraft={setDraft} />}
        {tab === "memories" && <MemoriesTab token={token} values={values} onUse={(m) => { setDraft((d) => ({ ...d, value: m.value || d.value, parts: { ...d.parts, situation: d.parts.situation ? `${d.parts.situation} ${m.body}` : m.body } })); setTab("build"); toast("הזיכרון הועתק לשדה 'מצב פתיחה'. אפשר לערוך אותו."); }} />}
        {tab === "stories" && <StoriesTab token={token} onOpen={(d) => { load(d); setTab("polish"); }} currentId={draft.id} />}
      </div>
      <SaveBar token={token} draft={draft} setDraft={setDraft} load={load} />
    </div>
  );
}

/* ───────────── שמירה ואישור (465, 469) ───────────── */
function SaveBar({ token, draft, setDraft, load }: { token: string; draft: Draft; setDraft: SetDraft; load: (d: Draft) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState(false);
  const payload = (extra: object = {}) => ({ title: draft.title.trim(), value: draft.value, age: draft.age, parts: draft.parts, body: draft.body, opening: draft.opening, closing: draft.closing, versionLabel: label, ...extra });
  const save = async (extra: object = {}) => {
    if (!draft.title.trim()) { toast("כתבו כותרת לסיפור לפני השמירה.", { kind: "error" }); return null; }
    setBusy(true);
    try {
      const s = await api<StoryFull>(draft.id ? `/api/story/stories/${draft.id}` : "/api/story/stories", { method: draft.id ? "PUT" : "POST", token, body: payload(extra) });
      load(fromFull(s));
      setLabel("");
      return s;
    } catch (e) { toast(errorMessage(e), { kind: "error" }); return null; } finally { setBusy(false); }
  };
  const approve = async () => {
    const s = await save({ approved: true, confirm: true });
    if (s?.approved) { toast("הסיפור אושר. עכשיו אפשר להוסיף אותו לפעולה מעמוד הפעולה, בכפתור 'הסיפור שלי'.", { kind: "success" }); setConfirm(false); }
  };
  const words = draft.body.split(/\s+/).filter(Boolean).length;
  return (
    <section className="card st-savebar" aria-labelledby="st-save-h">
      <h2 id="st-save-h">שמירה ואישור</h2>
      <div className="st-row">
        <Field label="כותרת הסיפור" htmlFor="st-title"><input id="st-title" value={draft.title} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} /></Field>
        <Field label="שכבת גיל" htmlFor="st-age">
          <select id="st-age" value={draft.age} onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))}>
            <option value="">לא נבחרה</option>
            {GRADES.map((g) => (<option key={g} value={g}>כיתה {g}</option>))}
          </select>
        </Field>
        <Field label="שם הגרסה (לא חובה)" htmlFor="st-vlabel" hint="למשל: כללי, או אחרי ליטוש">
          <input id="st-vlabel" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save().then((s) => s && toast(draft.id ? "הסיפור נשמר (גרסה חדשה אם הטקסט השתנה)." : "הסיפור נשמר.", { kind: "success" }))}>
          {draft.id ? "שמירת שינויים" : "שמירת סיפור חדש"}
        </button>
        <button type="button" className="btn" onClick={() => load(EMPTY_DRAFT)}>סיפור חדש</button>
        <span className="st-status" role="status">
          {draft.id ? (draft.approved ? "מאושר לשילוב בפעולות" : "שמור, עדיין לא מאושר") : "עדיין לא נשמר"}
          {draft.dirty && draft.id ? " · יש שינויים שלא נשמרו" : ""}
        </span>
      </div>
      {draft.id && !draft.dirty && !draft.approved && (
        <div className="st-approve">
          <label className="st-check">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>קראתי את הסיפור בקול ({words} מילים), והוא נשמע כמוכם</span>
          </label>
          <button type="button" className="btn" disabled={!confirm || busy} onClick={approve}>אישור הסיפור</button>
          <p className="hint">רק סיפור מאושר אפשר להוסיף לפעולה. כל שינוי בטקסט מבטל את האישור, כדי שלא יצא סיפור שלא קראתם.</p>
        </div>
      )}
    </section>
  );
}

/* ───────────── 453, 458–460, 468, 469: בניית סיפור ───────────── */
function BuildTab({ token, values, draft, setDraft, goPolish }: { token: string; values: ValueRow[]; draft: Draft; setDraft: SetDraft; goPolish: () => void }) {
  const toast = useToast();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<Record<string, string>>({});
  const [idea, setIdea] = useState("");
  const p = draft.parts;
  const setPart = (k: keyof Parts, v: string) => setDraft((d) => ({ ...d, parts: { ...d.parts, [k]: v } }));

  useEffect(() => {
    if (!draft.value) { setMoment(null); return; }
    api<Moment>(`/api/story/moments?value=${encodeURIComponent(draft.value)}`, { token }).then(setMoment).catch(() => setMoment(null));
  }, [draft.value, token]);

  const build = async () => {
    setBusy(true);
    try { setBuilt(await api<Built>("/api/story/build", { method: "POST", token, body: { ...p, value: draft.value } })); setAns({}); }
    catch (e) { toast(errorMessage(e), { kind: "error" }); }
    setBusy(false);
  };
  const FIELD: Record<string, keyof Parts> = { quote: "turn", sensory: "situation", body: "feeling", place: "place", number: "situation", time: "situation" };
  const addAnswer = (g: Gap) => {
    const a = (ans[g.key] || "").trim();
    if (!a) return;
    const f = FIELD[g.key] || "situation";
    const text = g.key === "quote" ? `${/["“„]/.test(a) ? a : `"${a}"`}` : a;
    setPart(f, f === "place" ? a : `${p[f] ? p[f].replace(/\s+$/, "") + " " : ""}${/[.!?"]$/.test(text) ? text : text + "."}`);
    setAns((x) => ({ ...x, [g.key]: "" }));
    toast("התשובה נוספה לשדה המתאים. לחצו שוב על 'בניית הסיפור' כדי לעדכן.");
  };
  const toPolish = () => {
    if (!built) return;
    setDraft((d) => ({ ...d, body: built.text }));
    goPolish();
  };

  return (
    <div>
      <div className="st-two">
        <Field label="הערך שהסיפור מקדם" htmlFor="st-value" hint="אפשר גם בלי ערך, ואז לא יתווסף משפט קישור">
          <select id="st-value" value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}>
            <option value="">בלי ערך</option>
            {values.map((v) => (<option key={v.id} value={v.label}>{v.label}</option>))}
          </select>
        </Field>
      </div>
      {moment && (
        <section className="st-moments" aria-labelledby="st-m-h">
          <h3 id="st-m-h">איזה רגע מהחיים שלכם מתאים ל"{moment.label}"?</h3>
          <ul className="st-list">
            {moment.moments.map((m) => (
              <li key={m}>
                <span>{m}</span>
                <button type="button" className="btn btn-small" aria-pressed={idea === m} onClick={() => setIdea(idea === m ? "" : m)}>הרעיון הזה</button>
              </li>
            ))}
          </ul>
          {moment.memories.length > 0 && <p className="hint">יש לכם {moment.memories.length} זיכרונות שמורים בערך הזה. מצאו אותם בלשונית "ספריית זיכרונות".</p>}
        </section>
      )}
      <div className="st-fields">
        {idea && <p className="st-idea" role="status">הרעיון שבחרתם: {idea}</p>}
        <Field label="1. מצב פתיחה: איפה הייתם ומה קרה לפני הרגע החשוב?" htmlFor="st-sit" hint="כתבו במילים שלכם, כמו שהייתם מספרים לחבר">
          <textarea id="st-sit" rows={3} maxLength={1500} value={p.situation} onChange={(e) => setPart("situation", e.target.value)} />
        </Field>
        <div className="st-two">
          <Field label="איפה זה קרה? (כולל ה-ב, למשל: בחורשה)" htmlFor="st-place"><input id="st-place" maxLength={80} value={p.place} onChange={(e) => setPart("place", e.target.value)} /></Field>
          <Field label="מי עוד היה שם? (למשל: אבא שלי)" htmlFor="st-person"><input id="st-person" maxLength={80} value={p.person} onChange={(e) => setPart("person", e.target.value)} /></Field>
        </div>
        <Field label="2. רגע השבירה: מה קרה פתאום?" htmlFor="st-turn" hint="הרגע שבו משהו השתנה. אם מישהו אמר משהו, כתבו את המילים שלו בדיוק">
          <textarea id="st-turn" rows={3} maxLength={1500} value={p.turn} onChange={(e) => setPart("turn", e.target.value)} />
        </Field>
        <Field label="3. מה הרגשתם?" htmlFor="st-feel" hint="מילה אחת מספיקה, ועוד טוב: מה קרה לכם בגוף">
          <textarea id="st-feel" rows={2} maxLength={800} value={p.feeling} onChange={(e) => setPart("feeling", e.target.value)} />
        </Field>
        <Field label="4. מה למדתם או לקחתם מזה?" htmlFor="st-learn">
          <textarea id="st-learn" rows={2} maxLength={800} value={p.learning} onChange={(e) => setPart("learning", e.target.value)} />
        </Field>
        <Field label="5. מה אתם רוצים שיישאר להם בסוף? (לסיום)" htmlFor="st-want" hint="משפט אחד. הוא ישמש להצעות לסיום">
          <input id="st-want" maxLength={300} value={p.want} onChange={(e) => setPart("want", e.target.value)} />
        </Field>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={busy || !(p.situation || p.turn || p.feeling || p.learning)} onClick={build}>{busy ? "בונה..." : "בניית הסיפור"}</button>
      </div>

      {built && (
        <div aria-live="polite">
          <section className="card st-built" aria-labelledby="st-b-h">
            <h3 id="st-b-h">הסיפור שנבנה ({built.words} מילים)</h3>
            <p className="st-story" lang="he">{built.text || "אין עדיין טקסט."}</p>
            {built.checks.length > 0 && (
              <ul className="st-checks">
                {built.checks.map((c, i) => (<li key={i}><strong>{c.level === "missing" ? "חסר: " : c.level === "heavy" ? "שימו לב: " : "הערה: "}</strong>{c.text}</li>))}
              </ul>
            )}
            <button type="button" className="btn btn-primary" disabled={!built.text} onClick={toPolish}>המשך לליטוש הקול</button>
          </section>

          {built.gaps.questions.length > 0 && (
            <section className="card" aria-labelledby="st-q-h">
              <h3 id="st-q-h">שלוש שאלות שהופכות סיפור לאמיתי</h3>
              <p className="hint">פרטים קטנים, כמו ציטוט מדויק או ריח, הם מה שגורם לשומעים להאמין. אפשר להשאיר שאלה בלי תשובה.</p>
              <ul className="st-qs">
                {built.gaps.questions.map((g) => (
                  <li key={g.key}>
                    <label htmlFor={`st-ans-${g.key}`}>{g.q}</label>
                    <div className="st-ans">
                      <input id={`st-ans-${g.key}`} value={ans[g.key] || ""} maxLength={300} onChange={(e) => setAns((x) => ({ ...x, [g.key]: e.target.value }))} />
                      <button type="button" className="btn btn-small" disabled={!(ans[g.key] || "").trim()} onClick={() => addAnswer(g)}>הוספה לסיפור</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ChoiceGroup legend="איך פותחים? שלוש הצעות" name="opening" options={built.openings} value={draft.opening} onPick={(t) => setDraft((d) => ({ ...d, opening: t }))} none="בלי פתיחה מיוחדת" />
          <ChoiceGroup legend="איך מסיימים? הצעות לסיום מהלב" name="closing" options={built.closings} value={draft.closing} onPick={(t) => setDraft((d) => ({ ...d, closing: t }))} none="בלי סיום מיוחד" note={built.closings.length === 0 ? "כתבו בשלב 5 מה אתם רוצים שיישאר, או בחרו ערך, כדי לקבל הצעות." : undefined} />
          <p className="hint">הפתיחה והסיום שבחרתם נשמרים עם הסיפור, ואפשר להוסיף אותם לשלב הראשון והאחרון בפעולה.</p>
        </div>
      )}
    </div>
  );
}

function ChoiceGroup({ legend, name, options, value, onPick, none, note }: { legend: string; name: string; options: Opt[]; value: string; onPick: (t: string) => void; none: string; note?: string }) {
  return (
    <fieldset className="card st-choices">
      <legend>{legend}</legend>
      {note && <p className="hint">{note}</p>}
      {options.map((o, i) => (
        <label key={i} className="st-choice">
          <input type="radio" name={name} checked={value === o.text} onChange={() => onPick(o.text)} />
          <span><strong>{o.label}:</strong> {o.text}<br /><small className="hint">{o.why}</small></span>
        </label>
      ))}
      <label className="st-choice">
        <input type="radio" name={name} checked={value === ""} onChange={() => onPick("")} />
        <span>{none}</span>
      </label>
      {value && !options.some((o) => o.text === value) && <p className="hint">נשמר: {value}</p>}
    </fieldset>
  );
}

/* ───────────── 454, 467: ספריית זיכרונות ───────────── */
function MemoriesTab({ token, values, onUse }: { token: string; values: ValueRow[]; onUse: (m: Memory) => void }) {
  const toast = useToast();
  const [list, setList] = useState<Memory[] | null>(null);
  const [f, setF] = useState({ kind: "", q: "", value: "" });
  const [form, setForm] = useState({ kind: "memory" as "memory" | "quote", title: "", body: "", value: "", tags: "", place: "", year: "", consent: "anonymous", names: "" });
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string[]>([]);

  const reload = useCallback(() => {
    const qs = new URLSearchParams();
    if (f.kind) qs.set("kind", f.kind);
    if (f.q) qs.set("q", f.q);
    if (f.value) qs.set("value", f.value);
    api<Memory[]>(`/api/story/memories?${qs}`, { token }).then(setList).catch((e) => { setList([]); toast(errorMessage(e), { kind: "error" }); });
  }, [f, token, toast]);
  useEffect(reload, [reload]);

  const save = async () => {
    setBusy(true); setWarn([]);
    try {
      const r = await api<{ warnings?: string[]; masked?: { name: string; label: string; count: number }[] }>("/api/story/memories", {
        method: "POST", token,
        body: { kind: form.kind, title: form.title, body: form.body, value: form.value, tags: form.tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean).slice(0, 8), place: form.place, year: form.year ? Number(form.year) : null, consent: form.kind === "quote" ? form.consent : "self", maskNames: form.names.split(/[,،]/).map((t) => t.trim()).filter(Boolean) },
      });
      setWarn(r.warnings || []);
      const hid = (r.masked || []).filter((m) => m.count > 0);
      toast(hid.length ? `נשמר. ${hid.length} שמות הוחלפו בתוויות.` : "נשמר בספרייה.", { kind: "success" });
      setForm({ ...form, title: "", body: "", tags: "", place: "", year: "", names: "" });
      reload();
    } catch (e) { toast(errorMessage(e), { kind: "error" }); }
    setBusy(false);
  };
  const del = async (m: Memory) => {
    try { await api(`/api/story/memories/${m.id}`, { method: "DELETE", token }); toast("נמחק."); reload(); }
    catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  const quote = form.kind === "quote";

  return (
    <div>
      <section className="card" aria-labelledby="st-mem-h">
        <h3 id="st-mem-h">הוספה לספרייה</h3>
        <fieldset className="st-kind">
          <legend>מה שומרים?</legend>
          <label className="st-check"><input type="radio" name="st-kind" checked={!quote} onChange={() => setForm({ ...form, kind: "memory" })} /><span>זיכרון שלי</span></label>
          <label className="st-check"><input type="radio" name="st-kind" checked={quote} onChange={() => setForm({ ...form, kind: "quote" })} /><span>ציטוט או רגע של חניך</span></label>
        </fieldset>
        {quote && (
          <div className="st-privacy" role="note">
            <strong>פרטיות חניכים.</strong> שומרים רק ציטוט בעילום שם מלא, או אחרי שקיבלתם אישור מהחניך ומההורים. אי אפשר לשמור מספר טלפון, כתובת, מייל או נושא רגיש (בריאות, משפחה, כסף). השרת חוסם אותם.
          </div>
        )}
        <Field label="כותרת קצרה" htmlFor="mem-title"><input id="mem-title" maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={quote ? "מה נאמר או קרה" : "הזיכרון"} htmlFor="mem-body"><textarea id="mem-body" rows={4} maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
        <div className="st-two">
          <Field label="ערך קשור" htmlFor="mem-value">
            <select id="mem-value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}>
              <option value="">ללא</option>
              {values.map((v) => (<option key={v.id} value={v.label}>{v.label}</option>))}
            </select>
          </Field>
          <Field label="תגיות (מופרדות בפסיק)" htmlFor="mem-tags"><input id="mem-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
          <Field label="מקום" htmlFor="mem-place"><input id="mem-place" maxLength={80} value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} /></Field>
          <Field label="שנה" htmlFor="mem-year"><input id="mem-year" inputMode="numeric" maxLength={4} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "") })} /></Field>
        </div>
        <Field label="שמות להסתרה (מופרדים בפסיק)" htmlFor="mem-names" hint="כל שם יוחלף בתווית 'חניך א'', 'חניך ב'' וכן הלאה, גם עם תחילית (לדני, מדני)">
          <input id="mem-names" value={form.names} onChange={(e) => setForm({ ...form, names: e.target.value })} />
        </Field>
        {quote && (
          <fieldset className="st-kind">
            <legend>על מה מסתמך השימוש בציטוט?</legend>
            <label className="st-check"><input type="radio" name="st-consent" checked={form.consent === "anonymous"} onChange={() => setForm({ ...form, consent: "anonymous" })} /><span>בעילום שם מלא, בלי פרטים מזהים</span></label>
            <label className="st-check"><input type="radio" name="st-consent" checked={form.consent === "approved"} onChange={() => setForm({ ...form, consent: "approved" })} /><span>קיבלתי אישור מהחניך ומההורים</span></label>
          </fieldset>
        )}
        <div className="actions"><button type="button" className="btn btn-primary" disabled={busy || !form.title.trim() || form.body.trim().length < 5} onClick={save}>שמירה בספרייה</button></div>
        {warn.length > 0 && <ul className="st-checks" role="status">{warn.map((w, i) => (<li key={i}>{w}</li>))}</ul>}
      </section>

      <section aria-labelledby="st-lib-h">
        <h3 id="st-lib-h">הספרייה שלי{list ? ` (${list.length})` : ""}</h3>
        <div className="st-two">
          <Field label="חיפוש" htmlFor="mem-q"><input id="mem-q" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
          <Field label="סוג" htmlFor="mem-k">
            <select id="mem-k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="">הכול</option><option value="memory">זיכרונות שלי</option><option value="quote">ציטוטי חניכים</option>
            </select>
          </Field>
          <Field label="ערך" htmlFor="mem-fv">
            <select id="mem-fv" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })}>
              <option value="">הכול</option>
              {values.map((v) => (<option key={v.id} value={v.label}>{v.label}</option>))}
            </select>
          </Field>
        </div>
        {!list ? <Skeleton lines={3} /> : list.length === 0 ? <p className="hint">הספרייה ריקה. שמרו רגע שזכרתם, והוא יחכה לכם כשתכתבו את הפעולה הבאה.</p> : (
          <ul className="st-cards">
            {list.map((m) => (
              <li key={m.id} className="card">
                <h4>{m.title} <span className="chip">{m.kind === "quote" ? "ציטוט חניך" : "זיכרון"}</span></h4>
                <p>{m.body}</p>
                <p className="hint">{[m.value, m.place, m.year, m.tags.join(", "), m.kind === "quote" ? (m.consent === "approved" ? "באישור" : "בעילום שם") : ""].filter(Boolean).join(" · ")}</p>
                <div className="actions">
                  <button type="button" className="btn btn-small" onClick={() => onUse(m)}>לכתוב ממנו סיפור</button>
                  <button type="button" className="btn btn-small" aria-label={`מחיקת ${m.title}`} onClick={() => del(m)}>מחיקה</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ───────────── הסיפורים שלי ───────────── */
function StoriesTab({ token, onOpen, currentId }: { token: string; onOpen: (d: Draft) => void; currentId: number | null }) {
  const toast = useToast();
  const [list, setList] = useState<StoryRow[] | null>(null);
  const reload = useCallback(() => { api<StoryRow[]>("/api/story/stories", { token }).then(setList).catch(() => setList([])); }, [token]);
  useEffect(reload, [reload]);
  const open = async (id: number) => { try { onOpen(fromFull(await api<StoryFull>(`/api/story/stories/${id}`, { token }))); } catch (e) { toast(errorMessage(e), { kind: "error" }); } };
  const del = async (s: StoryRow) => { try { await api(`/api/story/stories/${s.id}`, { method: "DELETE", token }); toast("הסיפור נמחק."); reload(); } catch (e) { toast(errorMessage(e), { kind: "error" }); } };
  if (!list) return <Skeleton lines={3} />;
  if (!list.length) return <p className="hint">עדיין לא שמרתם סיפורים. בנו סיפור בלשונית הראשונה ושמרו אותו בסרגל השמירה שלמטה.</p>;
  return (
    <ul className="st-cards">
      {list.map((s) => (
        <li key={s.id} className="card">
          <h4>{s.title} <span className="chip">{s.approved ? "מאושר" : "לא מאושר"}</span></h4>
          <p className="hint">{[s.value, s.age && `כיתה ${s.age}`, `${s.words} מילים`, new Date(s.updatedAt).toLocaleDateString("he-IL")].filter(Boolean).join(" · ")}</p>
          <p>{s.preview}{s.words > 20 ? "…" : ""}</p>
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={() => open(s.id)}>{currentId === s.id ? "פתוח כעת, לטעינה מחדש" : "פתיחה לעריכה"}</button>
            <button type="button" className="btn btn-small" aria-label={`מחיקת ${s.title}`} onClick={() => del(s)}>מחיקה</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── 453: הוספת הסיפור שלי לפעולה (בעמוד הפעולה) ───────────── */
export function MyStoryModal({ open, onClose, activity, onChanged }: { open: boolean; onClose: () => void; activity: Activity; onChanged: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<{ value: { label: string } | null; stories: (StoryRow & { match: number; hasOpening: boolean; hasClosing: boolean })[]; total: number } | null>(null);
  const [sid, setSid] = useState<number | null>(null);
  const [mode, setMode] = useState<"bookend" | "full">("bookend");
  const [stage, setStage] = useState("0");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !token) return;
    api<NonNullable<typeof data>>(`/api/story/suggest?activityId=${activity.id}`, { token }).then((d) => { setData(d); setSid((c) => (d.stories.some((s) => s.id === c) ? c : (d.stories[0]?.id ?? null))); }).catch(() => setData({ value: null, stories: [], total: 0 }));
  }, [open, token, activity.id]);
  const chosen = data?.stories.find((s) => s.id === sid);
  const go = async () => {
    if (!sid) return;
    setBusy(true);
    try {
      await api(`/api/activities/${activity.id}/add-my-story`, { method: "POST", token, body: { storyId: sid, mode, stage: Number(stage) } });
      toast("הסיפור נוסף לפעולה. אפשר לחזור לגרסה הקודמת בהיסטוריית הגרסאות.", { kind: "success" });
      onClose(); onChanged();
    } catch (e) { toast(errorMessage(e), { kind: "error" }); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="הסיפור שלי בפעולה" footer={<>
      <button type="button" className="btn btn-primary" disabled={busy || !sid} onClick={go}>{busy ? "מוסיף..." : "הוספה לפעולה"}</button>
      <button type="button" className="btn" onClick={onClose}>ביטול</button>
    </>}>
      {!data ? <Skeleton lines={3} /> : data.stories.length === 0 ? (
        <div>
          <p>{data.total ? "יש לכם סיפורים, אבל אף אחד מהם עדיין לא אושר. אפשר להוסיף לפעולה רק סיפור שאישרתם אחרי קריאה בקול." : "עוד לא כתבתם סיפור אישי."}</p>
          <p><Link className="btn btn-primary" href={`/story?value=${encodeURIComponent(activity.leadingValue)}`}>לסטודיו הסיפור האישי</Link></p>
        </div>
      ) : (
        <div>
          <p>הסיפורים המאושרים שלכם, הקרובים ביותר לערך "{activity.leadingValue}" קודם.</p>
          <fieldset className="st-choices">
            <legend>איזה סיפור?</legend>
            {data.stories.map((s) => (
              <label key={s.id} className="st-choice">
                <input type="radio" name="my-story" checked={sid === s.id} onChange={() => setSid(s.id)} />
                <span><strong>{s.title}</strong> {s.value ? `· ${s.value}` : ""}{s.match >= 2 ? " · אותו ערך" : ""}<br /><small className="hint">{s.preview}…</small></span>
              </label>
            ))}
          </fieldset>
          <fieldset className="st-choices">
            <legend>איך להוסיף?</legend>
            <label className="st-choice"><input type="radio" name="my-mode" checked={mode === "bookend"} onChange={() => setMode("bookend")} /><span>פתיחה בהתחלה וסיום בסוף {chosen && !chosen.hasOpening && !chosen.hasClosing ? "(לסיפור הזה לא נשמרו פתיחה וסיום)" : ""}</span></label>
            <label className="st-choice"><input type="radio" name="my-mode" checked={mode === "full"} onChange={() => setMode("full")} /><span>הסיפור כולו בשלב אחד</span></label>
          </fieldset>
          {mode === "full" && (
            <Field label="לאיזה שלב?" htmlFor="my-stage">
              <select id="my-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                {activity.stages.map((s, i) => (<option key={i} value={i}>{i + 1}. {s.name || `שלב ${i + 1}`}</option>))}
              </select>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
