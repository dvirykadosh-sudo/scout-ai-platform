"use client";

import { FlipBookModal } from "./Depth3D2";
import { EmptyArt, KindIcon } from "./Polish";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, downloadBooklet, errorMessage, storageGet, storageSet } from "@/lib/api";
import { AGE_GROUPS, METHODS } from "@/lib/constants";
import { KIND_LABELS } from "@/lib/kind-labels";
import { useFavorites } from "@/lib/favorites";
import type { Activity, ListResponse } from "@/lib/types";
import { ActivityActions } from "./ActivityActions";
import { ActivityGlance } from "./ActivityView";
import { useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

const PAGE_SIZE = 6;
const SAVED_KEY = "scout.savedSearches";

interface Adv {
  energetic: boolean;
  scouting: boolean;
  lightGear: boolean;
  minSize: string;
  maxSize: string;
  author: string;
}
const NO_ADV: Adv = { energetic: false, scouting: false, lightGear: false, minSize: "", maxSize: "", author: "" };
interface Saved {
  name: string;
  qs: string;
}

export function Library() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [age, setAge] = useState("");
  const [method, setMethod] = useState("");
  const [kind, setKind] = useState("");
  const [minD, setMinD] = useState("");
  const [maxD, setMaxD] = useState("");
  const [sort, setSort] = useState("new");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [favOnly, setFavOnly] = useState(false);
  const [stack, setStack] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  useEffect(() => { try { setStack(localStorage.getItem("scout.stack") === "1"); } catch {} }, []);
  const [minRating, setMinRating] = useState("");
  const [adv, setAdv] = useState<Adv>(NO_ADV);
  const [hydrated, setHydrated] = useState(false);
  const [suggest, setSuggest] = useState<string[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [saveName, setSaveName] = useState("");
  const [picked, setPicked] = useState<{ id: number; title: string }[]>([]);
  const [bookTitle, setBookTitle] = useState("חוברת פעולות");
  const [bookBusy, setBookBusy] = useState(false);
  const toast = useToast();
  const { ids: favIds } = useFavorites();
  const favKey = favIds.join(",");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  // טעינת מסננים מהכתובת (קישור שמור או שיתוף), ורשימת החיפושים השמורים
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    applyParams(sp);
    try {
      const list = JSON.parse(storageGet(SAVED_KEY) ?? "[]");
      if (Array.isArray(list)) setSaved(list.filter((x) => x && typeof x.name === "string" && typeof x.qs === "string").slice(0, 8));
    } catch {
      /* ignore */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, age, method, kind, minD, maxD, sort, favOnly, minRating, adv]);

  // השלמה אוטומטית של החיפוש החופשי
  useEffect(() => {
    if (debouncedQ.length < 2) {
      setSuggest([]);
      return;
    }
    let live = true;
    api<{ text: string }[]>(`/api/search/suggest?q=${encodeURIComponent(debouncedQ)}`)
      .then((r) => live && setSuggest(r.map((x) => x.text)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [debouncedQ]);

  useEffect(() => {
    if (!hydrated) return;
    const ctrl = new AbortController();
    const p = filterParams();
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    if (favOnly) {
      if (!favKey) {
        setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
        setLoading(false);
        return;
      }
      p.set("ids", favKey.split(",").slice(0, 100).join(","));
    }
    setLoading(true);
    api<ListResponse>(`/api/activities?${p}`, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, debouncedQ, age, method, kind, minD, maxD, sort, page, reloadKey, favOnly, favKey, minRating, adv]);

  // הכתובת תמיד משקפת את המסננים, כך שאפשר לשמור או לשלוח קישור לחיפוש
  useEffect(() => {
    if (!hydrated) return;
    const qs = filterParams().toString();
    const base = window.location.pathname;
    window.history.replaceState(null, "", qs ? `${base}?${qs}` : base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, debouncedQ, age, method, kind, minD, maxD, sort, minRating, adv]);

  function filterParams() {
    const p = new URLSearchParams();
    if (sort !== "new") p.set("sort", sort);
    if (debouncedQ) p.set("q", debouncedQ);
    if (age) p.set("age", age);
    if (method) p.set("method", method);
    if (kind) p.set("kind", kind);
    if (minD) p.set("minDuration", minD);
    if (maxD) p.set("maxDuration", maxD);
    if (minRating) p.set("minRating", minRating);
    if (adv.energetic) p.set("energetic", "1");
    if (adv.scouting) p.set("scouting", "1");
    if (adv.lightGear) p.set("lightGear", "1");
    if (adv.minSize) p.set("minSize", adv.minSize);
    if (adv.maxSize) p.set("maxSize", adv.maxSize);
    if (adv.author.trim()) p.set("author", adv.author.trim());
    return p;
  }
  function applyParams(sp: URLSearchParams) {
    const g = (k: string) => sp.get(k) ?? "";
    setQ(g("q"));
    setDebouncedQ(g("q"));
    setAge(g("age"));
    setMethod(g("method"));
    setKind(g("kind"));
    setMinD(g("minDuration"));
    setMaxD(g("maxDuration"));
    setMinRating(g("minRating"));
    setSort(g("sort") || "new");
    setAdv({ energetic: g("energetic") === "1", scouting: g("scouting") === "1", lightGear: g("lightGear") === "1", minSize: g("minSize"), maxSize: g("maxSize"), author: g("author") });
  }
  const saveSearch = () => {
    const name = saveName.trim();
    const qs = filterParams().toString();
    if (!name) return toast("תנו שם לחיפוש כדי לשמור אותו", { kind: "error" });
    if (!qs) return toast("אין מסננים לשמירה", { kind: "error" });
    const next = [{ name, qs }, ...saved.filter((x) => x.name !== name)].slice(0, 8);
    setSaved(next);
    storageSet(SAVED_KEY, JSON.stringify(next));
    setSaveName("");
    toast("החיפוש נשמר", { kind: "success" });
  };
  const removeSaved = (name: string) => {
    const next = saved.filter((x) => x.name !== name);
    setSaved(next);
    storageSet(SAVED_KEY, JSON.stringify(next));
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("הקישור לחיפוש הועתק", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק את הקישור", { kind: "error" });
    }
  };
  const advCount = [adv.energetic, adv.scouting, adv.lightGear, adv.minSize, adv.maxSize, adv.author.trim()].filter(Boolean).length;

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = !!(q || age || method || kind || minD || maxD || favOnly || minRating || advCount);
  const clear = () => {
    setQ("");
    setAge("");
    setMethod("");
    setKind("");
    setMinD("");
    setMaxD("");
    setFavOnly(false);
    setMinRating("");
    setAdv(NO_ADV);
  };
  const isPicked = (id: number) => picked.some((x) => x.id === id);
  const togglePick = (a: Activity) => setPicked((l) => (l.some((x) => x.id === a.id) ? l.filter((x) => x.id !== a.id) : l.length >= 40 ? l : [...l, { id: a.id, title: a.title }]));
  const makeBooklet = async () => {
    setBookBusy(true);
    try {
      await downloadBooklet(picked.map((x) => x.id), bookTitle.trim() || "חוברת פעולות");
      toast("החוברת ירדה", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBookBusy(false);
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("focus") === "1") document.getElementById("f-q")?.focus();
  }, []);

  return (
    <>
      <nav className="tool-links no-print" aria-label="כלים נוספים">
        <Link className="btn btn-small" href="/library/import">
          ייבוא מקבצי Word
        </Link>
        <Link className="btn btn-small" href="/icebreakers">
          משחקי היכרות
        </Link>
        <Link className="btn btn-small" href="/plan">
          תכנון תקופתי
        </Link>
      </nav>
      <form className="card glass filters" role="search" aria-label="חיפוש וסינון פעולות" onSubmit={(e) => e.preventDefault()}>
        <div className="form-grid filters-grid">
          <Field label="חיפוש חופשי" htmlFor="f-q" className="span-2">
            <input id="f-q" type="search" list="f-q-list" value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם פעולה, ערך, מילה מהתוכן..." />
            <datalist id="f-q-list">
              {suggest.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="שכבת גיל" htmlFor="f-age">
            <select id="f-age" value={age} onChange={(e) => setAge(e.target.value)}>
              <option value="">הכול</option>
              {AGE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="שיטה" htmlFor="f-method">
            <select id="f-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">הכול</option>
              {METHODS.map((m) => (
                <option key={m.name}>{m.name}</option>
              ))}
            </select>
          </Field>
          <Field label="סוג פעולה" htmlFor="f-kind">
            <select id="f-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">הכול</option>
              {Object.entries(KIND_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="משך מינימלי (דקות)" htmlFor="f-min">
            <input id="f-min" type="number" min={1} value={minD} onChange={(e) => setMinD(e.target.value)} />
          </Field>
          <Field label="משך מקסימלי (דקות)" htmlFor="f-max">
            <input id="f-max" type="number" min={1} value={maxD} onChange={(e) => setMaxD(e.target.value)} />
          </Field>
          <Field label="מיון" htmlFor="f-sort">
            <select id="f-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="new">החדשות ביותר</option>
              <option value="duration">לפי משך</option>
              <option value="title">לפי שם</option>
              <option value="rating">לפי דירוג</option>
              <option value="popular">הכי מופעלות</option>
            </select>
          </Field>
          <Field label="דירוג מינימלי" htmlFor="f-rating">
            <select id="f-rating" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
              <option value="">הכול</option>
              <option value="3">3 כוכבים ומעלה</option>
              <option value="4">4 כוכבים ומעלה</option>
            </select>
          </Field>
          <div className="field filters-clear">
            <label className="check">
              <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
              <span>מועדפים בלבד</span>
            </label>
          </div>
          {hasFilters && (
            <div className="field filters-clear">
              <button type="button" className="btn" onClick={clear}>
                ניקוי סינון
              </button>
            </div>
          )}
        </div>
        <details className="adv-filters" open={advCount > 0}>
          <summary>סינון מתקדם{advCount > 0 ? ` (${advCount} פעילים)` : ""}</summary>
          <div className="form-grid filters-grid">
            <div className="field filters-clear">
              <label className="check">
                <input type="checkbox" checked={adv.energetic} onChange={(e) => setAdv({ ...adv, energetic: e.target.checked })} />
                <span>תנועתית בלבד</span>
              </label>
            </div>
            <div className="field filters-clear">
              <label className="check">
                <input type="checkbox" checked={adv.scouting} onChange={(e) => setAdv({ ...adv, scouting: e.target.checked })} />
                <span>עם זמן צופיות מעשי</span>
              </label>
            </div>
            <div className="field filters-clear">
              <label className="check">
                <input type="checkbox" checked={adv.lightGear} onChange={(e) => setAdv({ ...adv, lightGear: e.target.checked })} />
                <span>ציוד קל (עד פריט אחד)</span>
              </label>
            </div>
            <Field label="גודל קבוצה מינימלי" htmlFor="f-smin">
              <input id="f-smin" type="number" min={1} max={200} value={adv.minSize} onChange={(e) => setAdv({ ...adv, minSize: e.target.value })} />
            </Field>
            <Field label="גודל קבוצה מקסימלי" htmlFor="f-smax">
              <input id="f-smax" type="number" min={1} max={200} value={adv.maxSize} onChange={(e) => setAdv({ ...adv, maxSize: e.target.value })} />
            </Field>
            <Field label="מחבר/ת או מדריך/ה" htmlFor="f-author">
              <input id="f-author" value={adv.author} maxLength={60} onChange={(e) => setAdv({ ...adv, author: e.target.value })} />
            </Field>
          </div>
        </details>
        <div className="saved-searches">
          <div className="inline-form">
            <Field label="שם לחיפוש הנוכחי" htmlFor="f-save-name">
              <input id="f-save-name" value={saveName} maxLength={40} onChange={(e) => setSaveName(e.target.value)} />
            </Field>
            <button type="button" className="btn" onClick={saveSearch}>
              שמירת החיפוש
            </button>
            <button type="button" className="btn" onClick={copyLink}>
              העתקת קישור לחיפוש
            </button>
          </div>
          {saved.length > 0 && (
            <ul className="chip-list" aria-label="חיפושים שמורים">
              {saved.map((x) => (
                <li key={x.name}>
                  <button type="button" className="btn btn-small" onClick={() => applyParams(new URLSearchParams(x.qs))}>
                    {x.name}
                  </button>
                  <button type="button" className="icon-btn" aria-label={`מחיקת החיפוש השמור ${x.name}`} onClick={() => removeSaved(x.name)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>

      <p className="count" role="status" aria-live="polite">
        {loading ? "טוען..." : data ? `נמצאו ${data.total} פעולות` : ""}
      </p>

      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
          <button type="button" className="btn" onClick={reload}>
            ניסיון חוזר
          </button>
        </div>
      )}

      {loading && !data && <Skeleton lines={5} />}

      {data && data.items.length === 0 && !loading && (
        <div className="card empty">
          <EmptyArt />
          <p>{favOnly && !favKey ? "עדיין לא סימנתם פעולות כמועדפות. לחצו על 'הוספה למועדפים' בכל פעולה." : "לא נמצאו פעולות שמתאימות לחיפוש."}</p>
          {hasFilters ? (
            <button type="button" className="btn" onClick={clear}>
              ניקוי סינון
            </button>
          ) : (
            <Link className="btn btn-primary" href="/">
              יצירת פעולה חדשה
            </Link>
          )}
        </div>
      )}

      <p className="no-print">
        <button type="button" className="btn btn-small" aria-pressed={stack} onClick={() => { setStack(!stack); try { localStorage.setItem("scout.stack", stack ? "0" : "1"); } catch {} }}>
          {stack ? "תצוגת רשימה" : "תצוגת ערימה"}
        </button>
      </p>
      <ul className={`list${stack ? " stacked" : ""}`} aria-busy={loading}>
        {data?.items.map((a: Activity) => (
          <li key={a.id} className="card glass activity-card">
            {a.kind && KIND_LABELS[a.kind] && (
              <p className="kind-line">
                <span className="chip chip-accent"><KindIcon kind={a.kind} /> {KIND_LABELS[a.kind]}</span>
              </p>
            )}
            <h2 className="card-title">
              <Link href={`/library/${a.id}`}>{a.title}</Link>
            </h2>
            <ActivityGlance a={a} />
            {a.snippet && <p className="snippet">…{a.snippet}…</p>}
            {a.tags.length > 0 && (
              <ul className="tags" aria-label="תגיות">
                {a.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <label className="check pick">
              <input type="checkbox" checked={isPicked(a.id)} onChange={() => togglePick(a)} />
              <span>הוספה לחוברת</span>
            </label>
            <ActivityActions activity={a} onChanged={reload} compact />
          </li>
        ))}
      </ul>

      {data && pages > 1 && (
        <nav className="pager" aria-label="עימוד">
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            הקודם
          </button>
          <span>
            עמוד {page} מתוך {pages}
          </span>
          <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            הבא
          </button>
        </nav>
      )}
      {picked.length > 0 && (
        <section className="booklet-bar glass" aria-label="חוברת פעולות">
          <p>
            <strong>{picked.length}</strong> פעולות נבחרו לחוברת Word
          </p>
          <label className="sr-only" htmlFor="book-title">
            שם החוברת
          </label>
          <input id="book-title" value={bookTitle} maxLength={80} onChange={(e) => setBookTitle(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={makeBooklet} disabled={bookBusy}>
            {bookBusy ? "יוצר..." : "הורדת חוברת"}
          </button>
          <button type="button" className="btn" onClick={() => setBookOpen(true)}>
            עיון כספר
          </button>
          <button type="button" className="btn" onClick={() => setPicked([])}>
            ניקוי בחירה
          </button>
          <FlipBookModal open={bookOpen} onClose={() => setBookOpen(false)} title={bookTitle} picks={picked} />
        </section>
      )}
    </>
  );
}
