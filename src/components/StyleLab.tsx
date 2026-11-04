"use client";

// שלב 53 (388–422): מעבדת סגנון. פירוק פעולה לגורמים, טביעת סגנון, כתיבה לפי הסגנון, פרופילים ובדיקות עומק.
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal } from "./ui";
import { printHtml } from "./WriteV47";
import type { Snap } from "./WriteParts";

const docBody = (s: Snap) => ({ title: s.title, meta: s.meta, blocks: s.blocks });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface Stage { n: number; title: string; kind: string; minutes: number; words: number; sentences: number; questions: string[]; speech: string[]; instructions: string[]; methods: string[]; hook: string }
interface Decomp { title: string; value: string; age: string; goal: string; equipment: string[]; safety: string[]; stages: Stage[]; opening: string; peak: string; closing: string; totalMinutes: number }
type FP = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Analysis { decomposition: Decomp; fingerprint: FP; description: string[]; card: string }
interface Profile { id: number; name: string; fingerprint: FP; card: string; createdAt: string }
interface Review { completeness: { score: number; checks: { key: string; label: string; ok: boolean }[] }; consistency: { value: string; covered: number; total: number; missing: string[] } | null; concepts: { stage: string; words: string[] }[]; similar: { id: number; title: string; similarity: number }[]; realistic: { planned: number; withTransitions: number; note: string } | null; compare: { stages: { mine: number; avg: number }; minutes: { mine: number; avg: number }; perStage: { mine: number; avg: number } } | null; tips: { key: string; text: string }[]; tags: string[] }
interface MyStyle { docs: number; description: string[]; trend: { id: number; title: string; avgSentence: number; exclaim: number; questions: number }[] }

const KIND: Record<string, string> = { open: "פתיחה", body: "גוף", peak: "שיא", close: "סיכום", free: "חופשי" };
const TABS = [["analyze", "פירוק וסגנון"], ["write", "כתיבה בסגנון"], ["profiles", "פרופילים"], ["review", "בדיקות עומק"], ["text", "פירוק טקסט חופשי"], ["mine", "הסגנון שלי"]] as const;
type Tab = (typeof TABS)[number][0];

export function StyleLabModal({ open, onClose, snap, token, onInsert }: { open: boolean; onClose: () => void; snap: Snap; token: string | null; onInsert: (t: string) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("analyze");
  const [an, setAn] = useState<Analysis | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [pname, setPname] = useState("");
  const [pid, setPid] = useState<number | "">("");
  const [text, setText] = useState("");
  const [rw, setRw] = useState<{ text: string; changes: string[]; note: string; diff: { w: string; added: boolean }[]; before: { avg: number }; after: { avg: number } } | null>(null);
  const [topic, setTopic] = useState("");
  const [score, setScore] = useState<{ score: number; level: string; gaps: string[] } | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [free, setFree] = useState("");
  const [freeOut, setFreeOut] = useState<{ title: string; blocks: { title: string; kind: string; minutes: number | null; text: string }[]; decomposition: Decomp } | null>(null);
  const [mine, setMine] = useState<MyStyle | null>(null);
  const [mergeB, setMergeB] = useState<number | "">("");
  const [imp, setImp] = useState("");

  const err = (e: unknown) => toast(errorMessage(e), { kind: "error" });
  const loadProfiles = () => api<{ profiles: Profile[] }>("/api/write/lab/profiles", { token }).then((r) => setProfiles(r.profiles)).catch(err);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { err(e); } finally { setBusy(false); } };

  useEffect(() => { if (open) { loadProfiles(); setAn(null); setRw(null); setScore(null); setReview(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => { if (open && tab === "mine" && !mine) api<MyStyle>("/api/write/lab/my-style", { token }).then(setMine).catch(err); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, tab]);

  const analyze = () => run(async () => setAn(await api<Analysis>("/api/write/lab/analyze", { method: "POST", token, body: docBody(snap) })));
  const saveProfile = () => run(async () => {
    await api("/api/write/lab/profiles", { method: "POST", token, body: { name: pname || snap.title || "הסגנון שלי", doc: docBody(snap) } });
    setPname(""); toast("הפרופיל נשמר"); await loadProfiles();
  });
  const target = async () => {
    if (pid) return { profileId: pid };
    const a = an ?? (await api<Analysis>("/api/write/lab/analyze", { method: "POST", token, body: docBody(snap) }));
    setAn(a);
    return { fingerprint: a.fingerprint };
  };
  const doScore = () => run(async () => setScore(await api("/api/write/lab/score", { method: "POST", token, body: { doc: { title: "", meta: {}, blocks: [{ title: "", kind: "free", minutes: null, text }] }, ...(await target()) } })));
  const doRewrite = () => run(async () => setRw(await api("/api/write/lab/rewrite", { method: "POST", token, body: { text, ...(await target()) } })));
  const doDraft = () => run(async () => {
    const d = await api<{ title: string; blocks: { title: string; text: string }[]; note: string }>("/api/write/lab/draft", { method: "POST", token, body: { doc: docBody(snap), topic, value: snap.meta?.value || topic, profileId: pid || undefined } });
    onInsert(d.blocks.map((b) => `### ${b.title}\n${b.text}`).join("\n\n"));
    toast("הטיוטה נוספה לסוף הפעולה");
  });
  const doReview = () => run(async () => setReview(await api<Review>("/api/write/lab/review", { method: "POST", token, body: docBody(snap) })));
  const doFree = () => run(async () => setFreeOut(await api("/api/write/lab/from-text", { method: "POST", token, body: { text: free } })));
  const applyCard = (profileId?: number, clear = false) => run(async () => {
    await api("/api/write/lab/apply-card", { method: "POST", token, body: { profileId, card: profileId ? "" : an?.card ?? "", clear } });
    toast(clear ? "כרטיס הסגנון הוסר" : "כרטיס הסגנון הופעל. ייכלל בהנחיות כשמפעילים מפתח AI");
  });
  const doExport = (id: number) => run(async () => {
    const d = await api<unknown>(`/api/write/lab/profiles/${id}/export`, { token });
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "style-profile.json"; a.click(); URL.revokeObjectURL(a.href);
  });
  const doImport = () => run(async () => { await api("/api/write/lab/profiles/import", { method: "POST", token, body: JSON.parse(imp) }); setImp(""); toast("הפרופיל יובא"); await loadProfiles(); });
  const printCard = () => { if (!an) return; const d = an.decomposition; printHtml(`כרטיס פעולה: ${d.title}`, `<h1>${esc(d.title)}</h1><p>ערך: ${esc(d.value)} · גיל: ${esc(d.age)} · סך הכול ${d.totalMinutes} דקות</p><p><strong>מטרה:</strong> ${esc(d.goal || "—")}</p><p><strong>ציוד:</strong> ${esc(d.equipment.join(", ") || "—")}</p><ol>${d.stages.map((s) => `<li><strong>${esc(s.title)}</strong> (${s.minutes} דק׳, ${esc(KIND[s.kind] ?? s.kind)}) ${s.questions[0] ? "— שאלה: " + esc(s.questions[0]) : ""}</li>`).join("")}</ol>`, toast); };

  const ProfileSelect = (
    <Field label="סגנון יעד" htmlFor="lab-prof">
      <select id="lab-prof" value={pid} onChange={(e) => setPid(e.target.value ? Number(e.target.value) : "")}>
        <option value="">{an ? "הפעולה הנוכחית" : "בחרו פרופיל"}</option>
        {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
      </select>
    </Field>
  );

  return (
    <Modal open={open} onClose={onClose} title="מעבדת סגנון ופירוק" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <div className="actions" role="tablist" aria-label="חלקי המעבדה">
        {TABS.map(([k, label]) => (<button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "btn btn-primary" : "btn"} onClick={() => setTab(k)}>{label}</button>))}
      </div>

      {tab === "analyze" && (
        <section aria-label="פירוק וסגנון">
          <p>המעבדה מפרקת את הפעולה שכתבתם לגורמים וממדדת איך אתם כותבים: אורך משפט, פנייה, רישום, פיסוק, שאלות ועוד. הכול נעשה בכללים על הטקסט שלכם, בלי מודל שפה.</p>
          <div className="actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={analyze}>{busy ? "מנתח…" : "פרקו את הפעולה"}</button>{an && <button type="button" className="btn" onClick={printCard}>כרטיס פעולה להדפסה</button>}</div>
          {an && (
            <>
              <h3>הרכב הפעולה</h3>
              <p>{an.decomposition.title} · {an.decomposition.totalMinutes} דקות{an.decomposition.value ? ` · ערך: ${an.decomposition.value}` : ""}</p>
              {an.decomposition.goal && <p><strong>מטרה:</strong> {an.decomposition.goal}</p>}
              {an.decomposition.equipment.length > 0 && <p><strong>ציוד:</strong> {an.decomposition.equipment.join(", ")}</p>}
              {an.decomposition.safety.length > 0 && <p><strong>נושאי בטיחות שזוהו:</strong> {an.decomposition.safety.join(", ")}</p>}
              <div className="table-wrap" role="region" aria-label="שלבי הפעולה" tabIndex={0}>
                <table>
                  <thead><tr><th scope="col">שלב</th><th scope="col">סוג</th><th scope="col">דקות</th><th scope="col">מילים</th><th scope="col">שאלות</th><th scope="col">שיטות</th></tr></thead>
                  <tbody>{an.decomposition.stages.map((s) => (<tr key={s.n}><th scope="row">{s.n}. {s.title}</th><td>{KIND[s.kind] ?? s.kind}</td><td>{s.minutes || "—"}</td><td>{s.words}</td><td>{s.questions.length}</td><td>{s.methods.join(", ") || "—"}</td></tr>))}</tbody>
                </table>
              </div>
              <h3>טביעת הסגנון שלכם</h3>
              <ul className="plain-list">{an.description.map((d) => (<li key={d}><span>{d}</span></li>))}</ul>
              <h3>כרטיס סגנון להנחיית AI</h3>
              <pre className="lab-card" tabIndex={0} aria-label="כרטיס הסגנון">{an.card}</pre>
              <Field label="שם לשמירת הפרופיל" htmlFor="lab-pname"><input id="lab-pname" value={pname} maxLength={40} onChange={(e) => setPname(e.target.value)} placeholder="למשל: פעולות פתיחה" /></Field>
              <div className="actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={saveProfile}>שמרו כפרופיל סגנון</button>
                <button type="button" className="btn" disabled={busy} onClick={() => applyCard()}>הפעילו את הכרטיס בסגנון שלי</button>
                <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(an.card).then(() => toast("הכרטיס הועתק"))}>העתקה</button>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "write" && (
        <section aria-label="כתיבה בסגנון">
          {ProfileSelect}
          <h3>שכתוב לפי הסגנון</h3>
          <Field label="טקסט לשכתוב" htmlFor="lab-text"><textarea id="lab-text" rows={5} value={text} maxLength={12000} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={busy || text.length < 10} onClick={doRewrite}>שכתבו לסגנון</button>
            <button type="button" className="btn" disabled={busy || text.length < 10} onClick={doScore}>בדקו התאמה</button>
          </div>
          {rw && (
            <>
              <p>משפט ממוצע: {rw.before.avg} ← {rw.after.avg} מילים.</p>
              {rw.changes.length > 0 && <ul className="plain-list">{rw.changes.map((c) => (<li key={c}><span>{c}</span></li>))}</ul>}
              <p className="lab-diff" lang="he">{rw.diff.map((d, i) => (d.added ? <mark key={i}>{d.w} </mark> : <span key={i}>{d.w} </span>))}</p>
              <p className="meter-tip">{rw.note}</p>
              <button type="button" className="btn" onClick={() => onInsert(rw.text)}>הוסיפו לפעולה</button>
            </>
          )}
          {score && (<><h3>נאמנות לסגנון: {score.score}/100 ({score.level})</h3><ul className="plain-list">{score.gaps.map((g) => (<li key={g}><span>{g}</span></li>))}</ul></>)}
          <h3>טיוטה חדשה בסגנון שלכם</h3>
          <Field label="נושא הפעולה החדשה" htmlFor="lab-topic"><input id="lab-topic" value={topic} maxLength={80} onChange={(e) => setTopic(e.target.value)} /></Field>
          <button type="button" className="btn" disabled={busy || !topic.trim()} onClick={doDraft}>בנו טיוטה לפי שלד הפעולה</button>
          <p className="meter-tip">הטיוטה בנויה משלד הפעולה הנוכחית ומהסגנון שנמדד, וללא מפתח AI היא תבנית לעריכה. עם מפתח AI, כרטיס הסגנון מועבר כהנחיה לכתיבה חופשית.</p>
        </section>
      )}

      {tab === "profiles" && (
        <section aria-label="פרופילים">
          {profiles.length === 0 ? <p>אין עדיין פרופילים. פרקו פעולה ושמרו אותה כפרופיל.</p> : (
            <ul className="plain-list">
              {profiles.map((p) => (
                <li key={p.id}>
                  <span><strong>{p.name}</strong> · משפט {p.fingerprint.sentence?.avg} מילים · {p.fingerprint.register?.level === "colloquial" ? "דיבורי" : p.fingerprint.register?.level === "formal" ? "רשמי" : "ניטרלי"}</span>
                  <span className="actions">
                    <button type="button" className="btn" onClick={() => applyCard(p.id)}>הפעלת כרטיס</button>
                    <button type="button" className="btn" onClick={() => doExport(p.id)}>ייצוא</button>
                    <button type="button" className="btn btn-danger" onClick={() => run(async () => { await api(`/api/write/lab/profiles/${p.id}`, { method: "DELETE", token }); await loadProfiles(); })}>מחיקה</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {profiles.length >= 2 && (
            <div className="actions">
              <Field label="מזגו את הנבחר עם" htmlFor="lab-merge"><select id="lab-merge" value={mergeB} onChange={(e) => setMergeB(e.target.value ? Number(e.target.value) : "")}><option value="">בחרו</option>{profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></Field>
              <button type="button" className="btn" disabled={busy || !pid || !mergeB || pid === mergeB} onClick={() => run(async () => { await api("/api/write/lab/profiles/merge", { method: "POST", token, body: { a: pid, b: mergeB, name: "ממוזג" } }); await loadProfiles(); toast("נוצר פרופיל ממוזג"); })}>מיזוג (נבחר למעלה)</button>
            </div>
          )}
          {profiles.length >= 2 && ProfileSelect}
          <button type="button" className="btn" onClick={() => applyCard(undefined, true)}>כיבוי כרטיס הסגנון</button>
          <Field label="ייבוא פרופיל (JSON שקיבלתם ממדריך אחר)" htmlFor="lab-imp"><textarea id="lab-imp" rows={3} value={imp} onChange={(e) => setImp(e.target.value)} /></Field>
          <button type="button" className="btn" disabled={busy || !imp.trim()} onClick={doImport}>ייבוא</button>
        </section>
      )}

      {tab === "review" && (
        <section aria-label="בדיקות עומק">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={doReview}>{busy ? "בודק…" : "הריצו בדיקות"}</button>
          {review && (
            <>
              <h3>שלמות הפעולה: {review.completeness.score}/100</h3>
              <ul className="plain-list">{review.completeness.checks.map((c) => (<li key={c.key}><span>{c.ok ? "✔ " : "✘ "}{c.label}</span></li>))}</ul>
              {review.tips.length > 0 && (<><h3>שלושת השיפורים החשובים</h3><ol>{review.tips.map((t) => (<li key={t.key}>{t.text}</li>))}</ol></>)}
              {review.consistency && <p>הערך "{review.consistency.value}" מופיע ב-{review.consistency.covered} מתוך {review.consistency.total} שלבים{review.consistency.missing.length ? `. חסר ב: ${review.consistency.missing.join(", ")}` : ""}.</p>}
              {review.realistic && <p>זמן מתוכנן {review.realistic.planned} דקות, ובפועל כדאי לחשב {review.realistic.withTransitions}. {review.realistic.note}.</p>}
              {review.compare && <p>מול המאגר: {review.compare.stages.mine} שלבים (ממוצע {review.compare.stages.avg}), {review.compare.minutes.mine} דקות (ממוצע {review.compare.minutes.avg}).</p>}
              {review.similar.length > 0 && (<><h3>דומה לפעולות במאגר</h3><ul className="plain-list">{review.similar.map((s) => (<li key={s.id}><span>{s.title} ({s.similarity}%)</span></li>))}</ul></>)}
              <h3>מפת מושגים לפי שלב</h3>
              <ul className="plain-list">{review.concepts.map((c) => (<li key={c.stage}><span><strong>{c.stage}:</strong> {c.words.join(", ") || "—"}</span></li>))}</ul>
              {review.tags.length > 0 && <p>תגיות מוצעות: {review.tags.join(", ")}</p>}
            </>
          )}
        </section>
      )}

      {tab === "text" && (
        <section aria-label="פירוק טקסט חופשי">
          <p>הדביקו פעולה שכתבתם במקום אחר, והמעבדה תפרק אותה לשלבים ותזהה את הרכבה.</p>
          <Field label="הטקסט" htmlFor="lab-free"><textarea id="lab-free" rows={8} value={free} maxLength={40000} onChange={(e) => setFree(e.target.value)} /></Field>
          <button type="button" className="btn btn-primary" disabled={busy || free.length < 30} onClick={doFree}>פרקו לשלבים</button>
          {freeOut && (
            <>
              <ol>{freeOut.blocks.map((b, i) => (<li key={i}><strong>{b.title}</strong> ({KIND[b.kind] ?? b.kind}{b.minutes ? `, ${b.minutes} דק׳` : ""})</li>))}</ol>
              <button type="button" className="btn" onClick={() => onInsert(freeOut.blocks.map((b) => `### ${b.title}\n${b.text}`).join("\n\n"))}>הוסיפו לפעולה הפתוחה</button>
            </>
          )}
        </section>
      )}

      {tab === "mine" && (
        <section aria-label="הסגנון שלי">
          {!mine ? <p role="status">טוען…</p> : mine.docs === 0 ? <p>עוד אין מספיק פעולות לניתוח.</p> : (
            <>
              <p>הסגנון המצטבר מתוך {mine.docs} הפעולות האחרונות שלכם:</p>
              <ul className="plain-list">{mine.description.map((d) => (<li key={d}><span>{d}</span></li>))}</ul>
              <h3>מגמה לאורך הזמן</h3>
              <div className="table-wrap" role="region" aria-label="מגמת סגנון" tabIndex={0}>
                <table><thead><tr><th scope="col">פעולה</th><th scope="col">משפט ממוצע</th><th scope="col">קריאות ל-10</th><th scope="col">שאלות בשלב</th></tr></thead>
                  <tbody>{mine.trend.map((t) => (<tr key={t.id}><th scope="row">{t.title}</th><td>{t.avgSentence}</td><td>{t.exclaim}</td><td>{t.questions}</td></tr>))}</tbody></table>
              </div>
            </>
          )}
        </section>
      )}
    </Modal>
  );
}
