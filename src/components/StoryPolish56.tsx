"use client";

// שלב 56 (455–458, 461–466): ליטוש הקול. ניקוי תמלול, דיבורי/רשמי, קלישאות, הוראות במה, גרסאות גיל, הקראה, מדד חום, מילון והשוואה.
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import type { Draft, SetDraft } from "./Story56";
import { Field } from "./ui";
import { printHtml } from "./WriteV47";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface Analysis {
  score: { score: number | null; level: string; note: string; parts: { key: string; label: string; pts: number; max: number }[]; tips: { key: string; text: string }[]; penalties?: { cliches: number; structure: number } };
  cliches: { items: { kind: string; text: string; count: number; suggest: string | null; fix: boolean; why: string }[]; fixable: number };
  gaps: { questions: { key: string; q: string }[]; covered: number; total: number };
  read: { seconds: number; minutesText: string; sentences: number; words: number; long: { index: number; words: number; text: string }[]; notes: string[]; marked: string };
  dict: { sayHits: { word: string; count: number }[]; neverHits: { word: string; count: number }[]; suggestions: string[]; usage: number | null };
}
type Result =
  | { kind: "clean"; removed: number; fillers: { word: string; count: number }[]; punctAdded: number }
  | { kind: "register"; changes: { label: string; count: number }[]; flags: string[] }
  | { kind: "cliches"; applied: number }
  | { kind: "directions"; text: string; n: number }
  | { kind: "ages"; young: { text: string; notes: string[]; words: number }; older: { text: string; notes: string[]; words: number; removed: string[] }; note: string }
  | { kind: "ai"; mode: "ai" | "prompt"; text?: string; prompt?: string; note: string; warnings?: string[]; changes?: string[] };
interface DiffRes { diff: { w: string; t: "same" | "add" | "del" }[]; added: number; deleted: number }

interface SR { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }

function Dictation({ onText }: { onText: (t: string) => void }) {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<SR | null>(null);
  useEffect(() => setOk(typeof window !== "undefined" && !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)), []);
  useEffect(() => () => rec.current?.stop(), []);
  if (!ok) return <p className="hint">הקלטה בקול זמינה בדפדפן כרום ובאדג'. אפשר גם להכתיב עם המקלדת של הטלפון, ולהדביק כאן.</p>;
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const W = window as unknown as Record<string, new () => SR>;
    const r = new (W.SpeechRecognition || W.webkitSpeechRecognition)();
    r.lang = "he-IL"; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim()); };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r; setOn(true); r.start();
  };
  return <button type="button" className="btn" aria-pressed={on} onClick={toggle}>{on ? "מקליט... לחצו לעצירה" : "הכתבה בקול"}</button>;
}

export function PolishTab({ token, draft, setDraft }: { token: string; draft: Draft; setDraft: SetDraft }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [an, setAn] = useState<Analysis | null>(null);
  const [level, setLevel] = useState<0 | 1 | 2>(2);
  const [goal, setGoal] = useState("polish");
  const [pasteBack, setPasteBack] = useState("");
  const [dict, setDict] = useState({ say: "", never: "" });
  const [ca, setCa] = useState("current");
  const [cb, setCb] = useState("0");
  const [diff, setDiff] = useState<DiffRes | null>(null);
  const body = draft.body;
  const post = <T,>(path: string, b: object) => api<T>(path, { method: "POST", token, body: b });
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast(errorMessage(e), { kind: "error" }); } setBusy(false); };
  const apply = (text: string, note: string) => { setPrev(body); setDraft((d) => ({ ...d, body: text })); toast(`${note} אפשר לבטל בכפתור 'ביטול הפעולה האחרונה'.`); };
  const need = body.trim().length >= 10;

  useEffect(() => {
    api<{ say: string[]; never: string[] }>("/api/story/dict", { token }).then((d) => setDict({ say: d.say.join("\n"), never: d.never.join("\n") })).catch(() => undefined);
  }, [token]);

  const cleanVoice = () => run(async () => { const r = await post<{ text: string; removed: number; fillers: { word: string; count: number }[]; punctAdded: number }>("/api/story/voice-clean", { text: body }); setRes({ kind: "clean", ...r }); apply(r.text, `נוקו ${r.removed} מילות מילוי וגמגום.`); });
  const doRegister = () => run(async () => { const r = await post<{ text: string; changes: { label: string; count: number }[]; flags: string[] }>("/api/story/register", { text: body, level }); setRes({ kind: "register", changes: r.changes, flags: r.flags }); if (r.text !== body) apply(r.text, "הטקסט הותאם."); else toast("אין מה לשנות ברמה הזאת."); });
  const fixCliches = () => run(async () => { const r = await post<{ text: string; applied: number }>("/api/story/fix-cliches", { text: body }); setRes({ kind: "cliches", applied: r.applied }); if (r.applied) apply(r.text, `תוקנו ${r.applied} ניסוחים נדושים.`); else toast("לא נמצא ניסוח שאפשר לתקן אוטומטית."); });
  const directions = () => run(async () => { const r = await post<{ text: string; directions: unknown[] }>("/api/story/directions", { text: body }); setRes({ kind: "directions", text: r.text, n: r.directions.length }); });
  const ages = () => run(async () => { const r = await post<Extract<Result, { kind: "ages" }>>("/api/story/ages", { text: body }); setRes({ ...r, kind: "ages" }); });
  const askAi = () => run(async () => { const r = await post<{ mode: "ai" | "prompt"; text?: string; prompt?: string; note: string; warnings?: string[]; changes?: string[] }>("/api/story/ai", { text: body, goal, age: draft.age ? `כיתה ${draft.age}` : "", value: draft.value }); setRes({ kind: "ai", ...r }); setPasteBack(""); });
  const analyze = () => run(async () => { setAn(await post<Analysis>("/api/story/analyze", { text: body })); });
  const saveDict = () => run(async () => {
    const list = (t: string) => t.split(/[\n,،]/).map((x) => x.trim()).filter(Boolean);
    const d = await api<{ say: string[]; never: string[] }>("/api/story/dict", { method: "PUT", token, body: { say: list(dict.say), never: list(dict.never) } });
    setDict({ say: d.say.join("\n"), never: d.never.join("\n") });
    toast("המילים שלי נשמרו. הן נכנסות גם להנחיות כשיוצרים פעולות עם AI.", { kind: "success" });
  });
  const addSay = (w: string) => setDict((d) => ({ ...d, say: d.say.split("\n").includes(w) ? d.say : `${d.say ? d.say + "\n" : ""}${w}` }));
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast("הועתק."); } catch { toast("ההעתקה נחסמה בדפדפן. סמנו את הטקסט והעתיקו ידנית.", { kind: "error" }); } };
  const sheet = (text: string) => printHtml(draft.title || "דף מדריך", `<h1>${esc(draft.title || "דף מדריך")}</h1><p style="font-size:20px;line-height:2">${esc(text).replace(/\(([^)]+)\)/g, '<i style="color:#555;font-size:16px">($1)</i>')}</p>`, toast);

  const versions = [{ k: "current", label: "הטקסט הנוכחי", text: body }, ...draft.versions.map((v, i) => ({ k: String(i), label: `${i + 1}. ${v.label}`, text: v.text }))];
  const pick = (k: string) => versions.find((v) => v.k === k)?.text ?? "";
  const doDiff = () => run(async () => setDiff(await post<DiffRes>("/api/story/diff", { a: pick(cb), b: pick(ca) })));
  const words = body.split(/\s+/).filter(Boolean).length;

  return (
    <div>
      <section className="card" aria-labelledby="pl-text-h">
        <h3 id="pl-text-h">הסיפור</h3>
        <Field label={`הטקסט (${words} מילים)`} htmlFor="pl-body" hint="אפשר להקליד, להדביק או להכתיב. אחרי הכתבה לחצו 'ניקוי תמלול'">
          <textarea id="pl-body" rows={12} maxLength={8000} value={body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
        </Field>
        <div className="actions">
          <Dictation onText={(t) => setDraft((d) => ({ ...d, body: d.body ? `${d.body} ${t}` : t }))} />
          <button type="button" className="btn" disabled={busy || !need} onClick={cleanVoice}>ניקוי תמלול</button>
          <button type="button" className="btn" disabled={prev === null} onClick={() => { if (prev !== null) { setDraft((d) => ({ ...d, body: prev })); setPrev(null); setRes(null); } }}>ביטול הפעולה האחרונה</button>
        </div>
      </section>

      <section className="card" aria-labelledby="pl-tools-h">
        <h3 id="pl-tools-h">כלי ליטוש</h3>
        <fieldset className="st-kind">
          <legend>רמת הדיבור</legend>
          {([[0, "רשמי"], [1, "כמו שהוא"], [2, "דיבורי"]] as const).map(([v, l]) => (
            <label key={v} className="st-check"><input type="radio" name="pl-level" checked={level === v} onChange={() => setLevel(v)} /><span>{l}</span></label>
          ))}
          <button type="button" className="btn" disabled={busy || !need} onClick={doRegister}>החלת רמת הדיבור</button>
        </fieldset>
        <div className="actions">
          <button type="button" className="btn" disabled={busy || !need} onClick={fixCliches}>ניקוי קלישאות</button>
          <button type="button" className="btn" disabled={busy || !need} onClick={directions}>הוספת הוראות במה</button>
          <button type="button" className="btn" disabled={busy || !need} onClick={ages}>גרסאות לפי גיל</button>
          <button type="button" className="btn btn-primary" disabled={busy || !need} onClick={analyze}>בדיקת הקול</button>
        </div>
        <div className="st-ai">
          <Field label="ליטוש עם AI" htmlFor="pl-goal" hint="בלי מפתח AI באתר תקבלו הנחיה להעתקה לצ'אט שאתם משתמשים בו. המודל מונחה לא להמציא פרטים">
            <select id="pl-goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="polish">שכתוב בעברית מדוברת</option>
              <option value="shorter">קיצור בשליש</option>
              <option value="young">התאמה לילדים צעירים</option>
              <option value="older">התאמה לנוער, בלי הטפה</option>
            </select>
          </Field>
          <button type="button" className="btn" disabled={busy || body.trim().length < 40} onClick={askAi}>{busy ? "עובד..." : "בקשת ליטוש"}</button>
        </div>
      </section>

      <div aria-live="polite">
        {res?.kind === "clean" && <ResultBox title="ניקוי תמלול"><p>הוסרו {res.removed} מילים ({res.fillers.slice(0, 6).map((f) => `${f.word} ×${f.count}`).join(", ") || "אין"}). נוספו {res.punctAdded} סימני פיסוק.</p></ResultBox>}
        {res?.kind === "register" && <ResultBox title="רמת הדיבור">{res.changes.length ? <ul>{res.changes.map((c, i) => <li key={i}>{c.label} ({c.count})</li>)}</ul> : <p>לא היה מה להחליף.</p>}{res.flags.length > 0 && <p>מילות סלנג שנשארו, אם הקהל רשמי: {res.flags.join(", ")}.</p>}</ResultBox>}
        {res?.kind === "cliches" && <ResultBox title="קלישאות"><p>תוקנו {res.applied} ניסוחים. ניסוחים שדורשים החלטה מופיעים ב'בדיקת הקול'.</p></ResultBox>}
        {res?.kind === "directions" && (
          <ResultBox title="דף מדריך עם הוראות במה">
            <p className="st-story" lang="he">{res.text}</p>
            <p className="hint">נוספו {res.n} הוראות. הן לא נכנסות לטקסט הסיפור עצמו, כדי שלא יוקראו בטעות.</p>
            <div className="actions"><button type="button" className="btn" onClick={() => copy(res.text)}>העתקה</button><button type="button" className="btn" onClick={() => sheet(res.text)}>הדפסה</button></div>
          </ResultBox>
        )}
        {res?.kind === "ages" && (
          <ResultBox title="גרסאות לפי גיל">
            <div className="st-two st-ages">
              <div><h4>ילדים (ג'–ו')</h4><p className="st-story" lang="he">{res.young.text}</p><ul>{res.young.notes.map((n, i) => <li key={i}>{n}</li>)}</ul><button type="button" className="btn btn-small" onClick={() => apply(res.young.text, "הוחלפה גרסת הילדים.")}>שימוש בגרסה הזאת</button></div>
              <div><h4>נוער (ז'–יב')</h4><p className="st-story" lang="he">{res.older.text}</p><ul>{res.older.notes.map((n, i) => <li key={i}>{n}</li>)}</ul><button type="button" className="btn btn-small" onClick={() => apply(res.older.text, "הוחלפה גרסת הנוער.")}>שימוש בגרסה הזאת</button></div>
            </div>
            <p className="hint">{res.note}</p>
          </ResultBox>
        )}
        {res?.kind === "ai" && (
          <ResultBox title={res.mode === "ai" ? "הצעת שכתוב מהמודל" : "הנחיה להעתקה לצ'אט"}>
            <p>{res.note}</p>
            {res.mode === "ai" && res.text && (<>
              {(res.warnings?.length ?? 0) > 0 && <ul className="st-checks" role="alert">{res.warnings!.map((w, i) => <li key={i}><strong>הוסיף פרטים: </strong>{w}</li>)}</ul>}
              <p className="st-story" lang="he">{res.text}</p>
              {res.changes && res.changes.length > 0 && <p className="hint">שינויים: {res.changes.join(" · ")}</p>}
              <button type="button" className="btn btn-primary" onClick={() => apply(res.text!, "הוחל שכתוב המודל.")}>החלת השכתוב</button>
            </>)}
            {res.mode === "prompt" && res.prompt && (<>
              <Field label="ההנחיה" htmlFor="pl-prompt"><textarea id="pl-prompt" rows={6} readOnly value={res.prompt} /></Field>
              <button type="button" className="btn" onClick={() => copy(res.prompt!)}>העתקת ההנחיה</button>
              <Field label="הדביקו כאן את התשובה מהצ'אט" htmlFor="pl-back" hint="אם הצ'אט החזיר JSON, הדביקו רק את הטקסט שבתוכו"><textarea id="pl-back" rows={5} value={pasteBack} onChange={(e) => setPasteBack(e.target.value)} /></Field>
              <button type="button" className="btn btn-primary" disabled={pasteBack.trim().length < 20} onClick={() => apply(pasteBack.trim(), "הוחלפה התשובה שהדבקתם.")}>החלפת הסיפור</button>
            </>)}
          </ResultBox>
        )}
      </div>

      {an && <AnalysisView an={an} addSay={addSay} />}

      <section className="card" aria-labelledby="pl-cmp-h">
        <h3 id="pl-cmp-h">השוואת גרסאות</h3>
        {draft.versions.length === 0 ? <p className="hint">אחרי שתשמרו את הסיפור, וכל פעם שהטקסט ישתנה ותשמרו שוב, תוכלו להשוות בין הגרסאות (למשל לפני ואחרי ליטוש).</p> : (
          <>
            <div className="st-two">
              <Field label="גרסה ישנה" htmlFor="cmp-b"><select id="cmp-b" value={cb} onChange={(e) => setCb(e.target.value)}>{versions.map((v) => <option key={v.k} value={v.k}>{v.label}</option>)}</select></Field>
              <Field label="גרסה חדשה" htmlFor="cmp-a"><select id="cmp-a" value={ca} onChange={(e) => setCa(e.target.value)}>{versions.map((v) => <option key={v.k} value={v.k}>{v.label}</option>)}</select></Field>
            </div>
            <button type="button" className="btn" disabled={busy} onClick={doDiff}>השוואה</button>
            {diff && (
              <div aria-live="polite">
                <p className="hint">נוספו {diff.added} מילים, הוסרו {diff.deleted}. מילה שנוספה מסומנת בקו תחתון, מילה שהוסרה מסומנת בקו חוצה.</p>
                <p className="st-diff" lang="he">{diff.diff.map((d, i) => d.t === "same" ? <span key={i}>{d.w} </span> : d.t === "add" ? <ins key={i} className="st-add">{d.w} </ins> : <del key={i} className="st-del">{d.w} </del>)}</p>
              </div>
            )}
          </>
        )}
      </section>

      <details className="card st-dict">
        <summary>המילים שלי</summary>
        <p className="hint">מילים וביטויים שאתם אומרים, ומילים שלעולם לא. הבדיקה מסמנת אם הסיפור נשמע כמוכם, והמילים נכנסות להנחיות כשיוצרים פעולות עם AI.</p>
        <div className="st-two">
          <Field label="מילים שאני אומר (אחת בכל שורה)" htmlFor="dict-say"><textarea id="dict-say" rows={5} value={dict.say} onChange={(e) => setDict({ ...dict, say: e.target.value })} /></Field>
          <Field label="מילים שלעולם לא אומר (אחת בכל שורה)" htmlFor="dict-never"><textarea id="dict-never" rows={5} value={dict.never} onChange={(e) => setDict({ ...dict, never: e.target.value })} /></Field>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={saveDict}>שמירת המילים שלי</button>
      </details>
    </div>
  );
}

function ResultBox({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card st-result"><h3>{title}</h3>{children}</section>;
}

function AnalysisView({ an, addSay }: { an: Analysis; addSay: (w: string) => void }) {
  const s = an.score;
  return (
    <section className="card st-analysis" aria-labelledby="an-h" aria-live="polite">
      <h3 id="an-h">בדיקת הקול</h3>
      {s.score === null ? <p>{s.note}</p> : (
        <>
          <p className="st-score"><span className="st-score-num">{s.score}</span> מתוך 100 · <strong>{s.level}</strong></p>
          <div className="st-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.score} aria-label="מדד חום ואנושיות"><span style={{ width: `${s.score}%` }} /></div>
          <ul className="st-parts">{s.parts.map((p) => <li key={p.key}>{p.label}: <strong>{p.pts}</strong> מתוך {p.max}</li>)}</ul>
          {s.penalties && (s.penalties.cliches > 0 || s.penalties.structure > 0) && <p className="hint">הורדו נקודות על ניסוחים נדושים ({s.penalties.cliches}) ומבנים חוזרים ({s.penalties.structure}).</p>}
          {s.tips.length > 0 && (<><h4>מה לשפר קודם</h4><ul>{s.tips.map((t) => <li key={t.key}>{t.text}</li>)}</ul></>)}
          <p className="hint">{s.note}</p>
        </>
      )}
      {an.cliches.items.length > 0 && (
        <>
          <h4>ניסוחים נדושים ומבנים חוזרים</h4>
          <ul>{an.cliches.items.map((c, i) => <li key={i}><strong>{c.text}</strong>{c.count > 1 ? ` (×${c.count})` : ""}: {c.why}{c.fix && c.suggest !== null ? ` ← ${c.suggest || "למחוק"}` : ""}</li>)}</ul>
        </>
      )}
      {an.gaps.questions.length > 0 && (
        <>
          <h4>פרטים שחסרים בסיפור ({an.gaps.covered} מתוך {an.gaps.total} קיימים)</h4>
          <ul>{an.gaps.questions.map((q) => <li key={q.key}>{q.q}</li>)}</ul>
        </>
      )}
      <h4>הקראה בקול</h4>
      <p>{an.read.words} מילים, בערך {an.read.minutesText} בהקראה איטית.</p>
      <ul>{an.read.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      {an.read.long.length > 0 && <p className="st-story" lang="he">{an.read.marked}</p>}
      {(an.dict.sayHits.length > 0 || an.dict.neverHits.length > 0 || an.dict.suggestions.length > 0) && (
        <>
          <h4>המילים שלי</h4>
          {an.dict.sayHits.length > 0 && <p>מילים שלכם שמופיעות: {an.dict.sayHits.map((h) => `${h.word} (${h.count})`).join(", ")}.</p>}
          {an.dict.neverHits.length > 0 && <p role="alert"><strong>מילים שבחרתם לא להגיד, והן מופיעות:</strong> {an.dict.neverHits.map((h) => `${h.word} (${h.count})`).join(", ")}.</p>}
          {an.dict.suggestions.length > 0 && <p>מילים מדוברות שכבר כתבתם: {an.dict.suggestions.map((w) => <button key={w} type="button" className="btn btn-small" onClick={() => addSay(w)} aria-label={`הוספת ${w} למילים שלי`}>{w} +</button>)}</p>}
        </>
      )}
    </section>
  );
}
