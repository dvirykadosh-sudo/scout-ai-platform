"use client";

// פעולה חדשה משלי: רשימת מסמכים ותבניות (101, 108) ועמוד העורך.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, fmtDate } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Skeleton } from "./ui";
import { LogoSplash } from "./WriteExtras";
import { BackupPanel } from "./WriteMore";
import { StatsModal } from "./WriteMore2";
import { TrashPanel, TribeTemplates } from "./WriteMore3";
import { WriteEditor } from "./WriteEditor";
import type { Doc } from "./WriteParts";

interface Tpl {
  id: string;
  name: string;
  desc: string;
  minutes: number | null;
  stages: number;
}
interface Row {
  id: number;
  title: string;
  words: number;
  stages: number;
  ageGroup: string;
  pinned?: boolean;
  tags?: string[];
  template?: boolean;
  archived?: boolean;
  updatedAt: string;
}

const NeedLogin = () => (
  <p className="warn-box">
    כדי לכתוב ולשמור מסמכים צריך להתחבר. <Link href="/account">להתחברות והרשמה</Link>
  </p>
);

export function WriteList() {
  const { token, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [docs, setDocs] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [splash, setSplash] = useState(false);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [showArch, setShowArch] = useState(false);
  const [sort, setSort] = useState<"updated" | "title" | "words">("updated");
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [statsOpen, setStatsOpen] = useState(false);
  const [trashKey, setTrashKey] = useState(0);
  const skip = useRef<() => void>(() => {});

  const load = useCallback(() => {
    if (!token) return;
    api<Row[]>("/api/write/docs", { token })
      .then(setDocs)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [token, toast]);
  useEffect(load, [load]);
  useEffect(() => {
    api<Tpl[]>("/api/write/templates")
      .then(setTpls)
      .catch(() => {});
  }, []);

  if (!user) return <NeedLogin />;

  const create = async (template: string, fromDoc?: number, tribe?: number) => {
    setBusy(true);
    setSplash(true);
    const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = new Promise((r) => window.setTimeout(r, calm ? 300 : 1600));
    skip.current = () => {};
    try {
      const d = await api<Doc>("/api/write/docs", { method: "POST", token, body: tribe ? { tribeTemplate: tribe } : fromDoc ? { fromDoc } : { template } });
      await Promise.race([wait, new Promise<void>((r) => (skip.current = r))]);
      router.push(`/write/${d.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
      setBusy(false);
      setSplash(false);
    }
  };
  const dup = async (r: Row) => {
    try {
      await api(`/api/write/docs/${r.id}/duplicate`, { method: "POST", token, body: {} });
      toast("נוצר עותק", { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const del = async (r: Row) => {
    if (!window.confirm(`למחוק את "${r.title}"? אי אפשר לשחזר.`)) return;
    try {
      await api(`/api/write/docs/${r.id}`, { method: "DELETE", token });
      toast("המסמך הועבר לסל המחזור", { kind: "success" });
      setTrashKey((k) => k + 1);
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  const allTags = [...new Set((docs ?? []).flatMap((r) => r.tags ?? []))].sort();
  const templatesMine = (docs ?? []).filter((r) => r.template && !r.archived);
  const bulk = async (action: "archive" | "unarchive" | "delete" | "tag", tag?: string) => {
    const ids = Object.keys(sel).filter((k) => sel[Number(k)]).map(Number);
    if (!ids.length) return;
    if (action === "delete" && !window.confirm(`למחוק ${ids.length} מסמכים? אי אפשר לשחזר.`)) return;
    try {
      const r = await api<{ changed: number }>("/api/write/bulk", { method: "POST", token, body: { ids, action, ...(tag ? { tag } : {}) } });
      toast(`עודכנו ${r.changed} מסמכים`, { kind: "success" });
      setSel({});
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const shown = (docs ?? []).filter((r) => !!r.archived === showArch)
    .filter((r) => (!q.trim() || r.title.includes(q.trim())) && (!tag || (r.tags ?? []).includes(tag))).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (sort === "title" ? a.title.localeCompare(b.title, "he") : sort === "words" ? b.words - a.words : 0));

  return (
    <>
      <LogoSplash show={splash} onSkip={() => skip.current()} />
      <section aria-labelledby="w-new" className="card glass">
        <h2 id="w-new" className="section-title">
          מתחילים פעולה חדשה
        </h2>
        <p className="hint">בוחרים נקודת פתיחה. הכול אפשר לשנות אחר כך: שלבים, סדר וזמנים.</p>
        <ul className="write-tpls">
          {tpls.map((t) => (
            <li key={t.id} className="card">
              <h3 className="subtitle">{t.name}</h3>
              <p>{t.desc}</p>
              <p className="hint">
                {t.stages} {t.stages === 1 ? "שלב" : "שלבים"}
                {t.minutes ? ` · ${t.minutes} דקות` : ""}
              </p>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => create(t.id)}>
                להתחיל<span className="sr-only">: {t.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <TribeTemplates token={token} isAdmin={user?.role === "ADMIN"} busy={busy} onCreate={(id) => create("blank", undefined, id)} />
        {templatesMine.length > 0 && (
          <>
            <h3 className="subtitle">התבניות האישיות שלי</h3>
            <ul className="plain-list">
              {templatesMine.map((r) => (
                <li key={r.id}>
                  <span>
                    <strong>{r.title}</strong> <span className="hint">· {r.stages} שלבים</span>
                  </span>
                  <button type="button" className="btn btn-small" disabled={busy} onClick={() => create("blank", r.id)}>
                    התחלה מהתבנית<span className="sr-only">: {r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="w-mine" className="card glass">
        <h2 id="w-mine" className="section-title">
          המסמכים שלי
        </h2>
        {docs === null ? (
          <Skeleton lines={3} />
        ) : docs.length === 0 ? (
          <p>עוד אין מסמכים. בחרו תבנית למעלה והתחילו.</p>
        ) : (
          <>
          {docs.length > 4 && (
            <div className="field">
              <label htmlFor="w-q">חיפוש במסמכים שלי</label>
              <input id="w-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חלק מהשם" />
            </div>
          )}
          {allTags.length > 0 && (
            <div className="field">
              <label htmlFor="w-tag">סינון לפי תגית</label>
              <select id="w-tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">הכול</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="actions">
            <label className="check-inline">
              <input type="checkbox" checked={showArch} onChange={(e) => setShowArch(e.target.checked)} />
              הצגת הארכיון
            </label>
            <label htmlFor="w-sort" className="sr-only">
              מיון
            </label>
            <select id="w-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="updated">מיון: עודכנו לאחרונה</option>
              <option value="title">מיון: לפי שם</option>
              <option value="words">מיון: לפי אורך</option>
            </select>
            <button type="button" className="btn btn-small" onClick={() => setStatsOpen(true)}>
              הסטטיסטיקה שלי
            </button>
          </div>
          {Object.values(sel).some(Boolean) && (
            <div className="actions" role="group" aria-label="פעולות על המסמכים שנבחרו">
              <button type="button" className="btn btn-small" onClick={() => bulk(showArch ? "unarchive" : "archive")}>
                {showArch ? "הוצאה מהארכיון" : "העברה לארכיון"}
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  const t = window.prompt("איזו תגית להוסיף לכל המסמכים שנבחרו?");
                  if (t?.trim()) bulk("tag", t.trim().slice(0, 20));
                }}
              >
                הוספת תגית לנבחרים
              </button>
              <button type="button" className="btn btn-small" onClick={async () => { await bulk("delete"); setTrashKey((k) => k + 1); }}>
                מחיקת הנבחרים
              </button>
            </div>
          )}
          {shown.length === 0 && <p>לא נמצא מסמך כזה.</p>}
          <ul className="plain-list">
            {shown.map((r) => (
              <li key={r.id}>
                <input type="checkbox" aria-label={`בחירה: ${r.title}`} checked={!!sel[r.id]} onChange={(e) => setSel((x) => ({ ...x, [r.id]: e.target.checked }))} />
                <span>
                  <Link href={`/write/${r.id}`}>
                    <strong>{r.pinned ? "★ " : ""}{r.title}</strong>
                  </Link>
                  <br />
                  <span className="hint">
                    {r.words} מילים · {r.stages} שלבים{r.ageGroup ? ` · ${r.ageGroup}` : ""} · עודכן {fmtDate(r.updatedAt)}
                  </span>
                </span>
                <span className="actions">
                  <Link className="btn btn-small" href={`/write/${r.id}`}>
                    פתיחה<span className="sr-only">: {r.title}</span>
                  </Link>
                  <button type="button" className="btn btn-small" onClick={() => dup(r)}>
                    שכפול<span className="sr-only">: {r.title}</span>
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => del(r)}>
                    מחיקה<span className="sr-only">: {r.title}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
          </>
        )}
      </section>
      <TrashPanel token={token} refreshKey={trashKey} onRestored={load} />
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} token={token} />
      <BackupPanel token={token} onDone={load} />
    </>
  );
}

export function WriteDocPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user, ready } = useAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;
    api<Doc>(`/api/write/docs/${Number(id)}`, { token })
      .then(setDoc)
      .catch((e) => setErr(errorMessage(e)));
  }, [id, token]);

  return (
    <>
      <h1>עורך פעולה</h1>
      <p className="hint">
        <Link href="/write">חזרה לכל המסמכים</Link> · המסמך נשמר לבד בזמן שכותבים.
      </p>
      {!user && ready && <NeedLogin />}
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      {user && !doc && !err && <Skeleton lines={6} />}
      {doc && <WriteEditor key={doc.id} initial={doc} />}
    </>
  );
}
