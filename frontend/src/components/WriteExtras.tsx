"use client";

// כלים נלווים לעורך הכתיבה (רעיונות 127–138): מסך לוגו בפתיחה, ייצוא ל-Word/הדפסה/העתקה,
// ייבוא טקסט חופשי לשלבים, דף הכנה, ותפריט מהיר ו"המשך מאיפה שעצרת" לדף הבית.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api, errorMessage, extractStyleFile, fmtDate, postDownload } from "@/lib/api";
import { useLogoUrl } from "./Chrome";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";
import { toMarkdown } from "./WriteMore3";
import { KIND_LABEL, Md, type Block, type Snap } from "./WriteParts";

/** 127: מסך לוגו קצר בזמן שנוצר מסמך חדש. אפשר לדלג, ומכבד "הפחתת תנועה". */
export function LogoSplash({ show, onSkip }: { show: boolean; onSkip: () => void }) {
  const logo = useLogoUrl();
  const ref = (el: HTMLButtonElement | null) => el?.focus();
  if (!show) return null;
  return (
    <div className="write-splash" role="dialog" aria-modal="true" aria-label="פותחים מסמך חדש">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="write-splash-logo" src={logo} alt="" />
      )}
      <p className="write-splash-text" role="status">
        פותחים מסמך חדש…
      </p>
      <button type="button" className="btn btn-small" ref={ref} onClick={onSkip}>
        דילוג
      </button>
    </div>
  );
}

const body = (s: Snap, withNotes: boolean, extra: Record<string, unknown> = {}) => ({ title: s.title, meta: s.meta, blocks: s.blocks, withNotes, ...extra });
type Look = { theme: string; eco: boolean; large: boolean; qr: boolean };

/** 130–132, 134: ייצוא. */
export function ExportModal({ open, onClose, snap, token, docId }: { open: boolean; onClose: () => void; snap: Snap; token: string | null; docId?: number }) {
  const toast = useToast();
  const [notes, setNotes] = useState(false);
  const [look, setLook] = useState<Look>({ theme: "classic", eco: false, large: false, qr: false });
  const [busy, setBusy] = useState("");
  const extra = { ...look, ...(docId ? { docId } : {}) };
  const name = (snap.title || "פעולה").replace(/[\\/:*?"<>|]/g, " ").slice(0, 60);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy("");
  };
  const text = async (whatsapp: boolean) => (await api<{ text: string }>("/api/write/export/text", { method: "POST", token, body: { ...body(snap, false), whatsapp } })).text;
  const print = () => {
    document.body.classList.add("printing-write");
    const done = () => {
      document.body.classList.remove("printing-write");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 50);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="ייצוא ושיתוף" footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <label className="check">
        <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
        <span>לכלול את ההערות האישיות שלי בקובץ Word</span>
      </label>
      <label>
        <span>ערכת עיצוב </span>
        <select value={look.theme} onChange={(e) => setLook({ ...look, theme: e.target.value })}>
          <option value="classic">ירוק וסגול-כחול</option>
          <option value="purple">סגול</option>
          <option value="blue">כחול</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={look.eco} onChange={(e) => setLook({ ...look, eco: e.target.checked })} />
        <span>מצב חסכוני להדפסה (בלי גלים וסימן מים)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={look.large} onChange={(e) => setLook({ ...look, large: e.target.checked })} />
        <span>גופן גדול לקריאה בשטח</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={look.qr} onChange={(e) => setLook({ ...look, qr: e.target.checked })} />
        <span>הוספת קוד QR לפתיחת הפעולה באתר</span>
      </label>
      <div className="write-export-grid">
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run("docx", () => postDownload("/api/write/export/docx", token, body(snap, notes, extra), `${name}.docx`))}>
          {busy === "docx" ? "מכין…" : "הורדה כקובץ Word עם הלוגו"}
        </button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => run("sheet", () => postDownload("/api/write/export/sheet", token, body(snap, false, extra), `דף מדריך ${name}.docx`))}>
          {busy === "sheet" ? "מכין…" : "דף מדריך בעמוד אחד (Word)"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run("pdf", async () => {
              try {
                await postDownload("/api/write/export/pdf", token, body(snap, notes, extra), `${name}.pdf`);
              } catch (e) {
                if (e instanceof ApiError && e.status === 501) {
                  toast("PDF ישיר לא זמין בשרת הזה. עוברים להדפסה, ושם בוחרים שמירה כ-PDF.", { kind: "info" });
                  print();
                } else throw e;
              }
            })
          }
        >
          {busy === "pdf" ? "מכין…" : "הורדה כ-PDF באותו עיצוב"}
        </button>
        <button type="button" className="btn" onClick={print}>
          הדפסה או שמירה כ-PDF עם הלוגו
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run("wa", async () => {
              await navigator.clipboard.writeText(await text(true));
              toast("הועתק בפורמט וואטסאפ", { kind: "success" });
            })
          }
        >
          העתקה בפורמט וואטסאפ
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run("txt", async () => {
              const t = await text(false);
              const url = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `${name}.txt`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
            })
          }
        >
          הורדה כקובץ טקסט
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([toMarkdown(snap.title, snap.meta, snap.blocks)], { type: "text/markdown;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `${name}.md`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
          }}
        >
          הורדה כ-Markdown
        </button>
      </div>
      <p className="hint">הקובץ נבנה בשרת, כולל כותרת, פרטי הפעולה, כל השלבים והזמנים.</p>
    </Modal>
  );
}

/** גרסה להדפסה: מוסתר במסך, מוצג רק כשמדפיסים, עם הלוגו. */
export function PrintSheet({ snap }: { snap: Snap }) {
  const logo = useLogoUrl();
  const m = snap.meta;
  return (
    <div className="write-print" aria-hidden="true">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="write-print-logo" src={logo} alt="" />
      )}
      <h1>{snap.title || "פעולה ללא שם"}</h1>
      <p>
        {[m.leader && `מדריך/ה: ${m.leader}`, `תאריך: ${m.date || new Date().toLocaleDateString("he-IL")}`, m.ageGroup, m.minutes ? `${m.minutes} דקות` : "", m.groupSize ? `${m.groupSize} חניכים` : "", m.value && `ערך: ${m.value}`].filter(Boolean).join(" · ")}
      </p>
      {snap.blocks.map((b) => (
        <section key={b.id}>
          <h2>
            {b.title || KIND_LABEL[b.kind]}
            {b.minutes ? ` (${b.minutes} דקות)` : ""}
          </h2>
          <Md text={b.text} />
        </section>
      ))}
    </div>
  );
}

/** 135: הדבקת טקסט חופשי ופירוק לשלבים. */
export function ImportModal({ open, onClose, token, onApply }: { open: boolean; onClose: () => void; token: string | null; onApply: (blocks: Block[], mode: "append" | "replace") => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [found, setFound] = useState<Block[] | null>(null);
  const [busy, setBusy] = useState(false);
  const split = async () => {
    setBusy(true);
    try {
      const r = await api<{ blocks: Block[] }>("/api/write/split", { method: "POST", token, body: { text } });
      setFound(r.blocks);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };
  const close = () => {
    setFound(null);
    onClose();
  };
  return (
    <Modal open={open} onClose={close} title="הדבקת טקסט וחלוקה לשלבים" wide footer={<button type="button" className="btn" onClick={close}>סגירה</button>}>
      <p className="hint">הדביקו פעולה שכתבתם במקום אחר. האתר מזהה כותרות כמו "פתיחה:", "שלב 2" או "שיא (10 דקות)", ואם אין כותרות הוא מפצל לפי שורות ריקות.</p>
      <Field label="או קובץ Word / טקסט ישן (docx, txt)" htmlFor="imp-file">
        <input
          id="imp-file"
          type="file"
          accept=".docx,.txt,.md"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const r = await extractStyleFile<{ text: string }>(f);
              setText(r.text);
              toast("הקובץ נקרא. אפשר ללחוץ על חלוקה לשלבים");
            } catch (er) {
              toast(errorMessage(er), { kind: "error" });
            }
            e.target.value = "";
          }}
        />
      </Field>
      <Field label="הטקסט" htmlFor="imp-text">
        <textarea id="imp-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={split}>
        {busy ? "מפרק…" : "חלוקה לשלבים"}
      </button>
      {found && (
        <div role="region" aria-label="תוצאת החלוקה">
          <p>
            נמצאו <strong>{found.length}</strong> שלבים:
          </p>
          <ol>
            {found.map((b) => (
              <li key={b.id}>
                {b.title || KIND_LABEL[b.kind]} ({KIND_LABEL[b.kind]}
                {b.minutes ? `, ${b.minutes} דקות` : ""}) · {b.text.split(/\s+/).filter(Boolean).length} מילים
              </li>
            ))}
          </ol>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onApply(found, "append");
                setText("");
                close();
              }}
            >
              הוספה בסוף המסמך
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!window.confirm("להחליף את כל השלבים הקיימים? אפשר לבטל עם הכפתור ביטול.")) return;
                onApply(found, "replace");
                setText("");
                close();
              }}
            >
              החלפת כל השלבים
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface Prep {
  prepMinutes?: number;
  gear: string[];
  methods: { name: string; n: number }[];
  totalMinutes: number;
  plannedMinutes: number | null;
  warnings: string[];
  checklist: string[];
}

/** 138: דף הכנה. */
export function PrepModal({ open, onClose, snap, token }: { open: boolean; onClose: () => void; snap: Snap; token: string | null }) {
  const [prep, setPrep] = useState<Prep | null>(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!open) return;
    setPrep(null);
    setErr("");
    api<Prep>("/api/write/prep", { method: "POST", token, body: body(snap, false) })
      .then(setPrep)
      .catch((e) => setErr(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const tick = (k: string) => setDone((d) => ({ ...d, [k]: !d[k] }));
  return (
    <Modal open={open} onClose={onClose} title="דף הכנה לפני הפעולה" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {err && <p className="error-box" role="alert">{err}</p>}
      {!prep && !err && <p role="status">בודק…</p>}
      {prep && (
        <>
          {prep.warnings.length > 0 && (
            <ul className="warn-box" aria-label="דברים לשים לב אליהם">
              {prep.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {prep.prepMinutes ? <p className="hint">זמן הכנה משוער: כ-{prep.prepMinutes} דקות (לפי אורך הטקסט וכמות הציוד).</p> : null}
          <h3 className="subtitle">ציוד להכין</h3>
          {prep.gear.length ? (
            <ul className="plain-list">
              {prep.gear.map((g) => (
                <li key={g}>
                  <label className="check">
                    <input type="checkbox" checked={!!done[`g:${g}`]} onChange={() => tick(`g:${g}`)} />
                    <span>{g}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">לא זוהה ציוד מיוחד בטקסט. אם צריך משהו, כתבו אותו בשלב.</p>
          )}
          <h3 className="subtitle">לפני שיוצאים</h3>
          <ul className="plain-list">
            {prep.checklist.map((c) => (
              <li key={c}>
                <label className="check">
                  <input type="checkbox" checked={!!done[`c:${c}`]} onChange={() => tick(`c:${c}`)} />
                  <span>{c}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="hint">
            סך הזמנים בשלבים: {prep.totalMinutes} דקות{prep.plannedMinutes ? ` מתוך ${prep.plannedMinutes} מתוכננות` : ""}.
            {prep.methods.length ? ` מתודות שזוהו: ${prep.methods.map((m) => m.name).join(", ")}.` : ""}
          </p>
        </>
      )}
    </Modal>
  );
}

interface DocRow {
  id: number;
  title: string;
  updatedAt: string;
}

const MENU = [
  { href: "/write", t: "כתיבת פעולה משלי", d: "עורך חופשי עם הצעות מתודה" },
  { href: "/library", t: "מאגר הפעולות", d: "לחפש פעולה קיימת" },
  { href: "/assistant", t: "עוזר הכתיבה", d: "לבדוק ולשפר טיוטה" },
  { href: "/quick", t: "פעולת חירום", d: "10 דקות בלי ציוד" },
  { href: "/plan", t: "תכנון תקופתי", d: "שבועות וחודשים קדימה" },
  { href: "/methods", t: "ספריית המתודות", d: "כל השיטות במקום אחד" },
];

/** 129 + 136: תפריט מהיר בדף הבית, ו"המשך מאיפה שעצרת". */
export function HomeMenu() {
  const { token, user } = useAuth();
  const [last, setLast] = useState<DocRow | null>(null);
  useEffect(() => {
    if (!token) return;
    api<DocRow[]>("/api/write/docs", { token })
      .then((r) => setLast(r[0] ?? null))
      .catch(() => {});
  }, [token]);
  return (
    <section className="card glass home-menu" aria-labelledby="hm-title">
      <h2 id="hm-title" className="section-title">
        תפריט מהיר
      </h2>
      {user && last && (
        <p className="home-continue">
          <Link className="btn btn-primary" href={`/write/${last.id}`}>
            להמשיך לכתוב: {last.title || "מסמך ללא שם"}
          </Link>{" "}
          <span className="hint">נערך {fmtDate(last.updatedAt)}</span>
        </p>
      )}
      <nav aria-label="תפריט מהיר">
        <ul className="home-menu-grid">
          {MENU.map((m) => (
            <li key={m.href}>
              <Link href={m.href}>
                <strong>{m.t}</strong>
                <span className="hint">{m.d}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
