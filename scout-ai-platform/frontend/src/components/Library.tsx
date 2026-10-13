"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { AGE_GROUPS, METHODS } from "@/lib/constants";
import { useFavorites } from "@/lib/favorites";
import type { Activity, ListResponse } from "@/lib/types";
import { ActivityActions } from "./ActivityActions";
import { ActivityMeta } from "./ActivityView";
import { Field, Skeleton } from "./ui";

const PAGE_SIZE = 6;

export function Library() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [age, setAge] = useState("");
  const [method, setMethod] = useState("");
  const [minD, setMinD] = useState("");
  const [maxD, setMaxD] = useState("");
  const [sort, setSort] = useState("new");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [favOnly, setFavOnly] = useState(false);
  const { ids: favIds } = useFavorites();
  const favKey = favIds.join(",");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, age, method, minD, maxD, sort, favOnly]);

  useEffect(() => {
    const ctrl = new AbortController();
    const p = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQ) p.set("q", debouncedQ);
    if (age) p.set("age", age);
    if (method) p.set("method", method);
    if (minD) p.set("minDuration", minD);
    if (maxD) p.set("maxDuration", maxD);
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
  }, [debouncedQ, age, method, minD, maxD, sort, page, reloadKey, favOnly, favKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = !!(q || age || method || minD || maxD || favOnly);
  const clear = () => {
    setQ("");
    setAge("");
    setMethod("");
    setMinD("");
    setMaxD("");
    setFavOnly(false);
  };

  return (
    <>
      <form className="card glass filters" role="search" aria-label="חיפוש וסינון פעולות" onSubmit={(e) => e.preventDefault()}>
        <div className="form-grid filters-grid">
          <Field label="חיפוש חופשי" htmlFor="f-q" className="span-2">
            <input id="f-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם פעולה, ערך, מילה מהתוכן..." />
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

      <ul className="list" aria-busy={loading}>
        {data?.items.map((a: Activity) => (
          <li key={a.id} className="card glass activity-card">
            <h2 className="card-title">
              <Link href={`/library/${a.id}`}>{a.title}</Link>
            </h2>
            <ActivityMeta a={a} />
            {a.tags.length > 0 && (
              <ul className="tags" aria-label="תגיות">
                {a.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
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
    </>
  );
}
