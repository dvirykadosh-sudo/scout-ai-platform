"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, downloadBooklet, errorMessage } from "@/lib/api";
import { AGE_GROUPS, METHODS } from "@/lib/constants";
import { useFavorites } from "@/lib/favorites";
import type { Activity, ListResponse } from "@/lib/types";
import { ActivityActions } from "./ActivityActions";
import { ActivityGlance } from "./ActivityView";
import { useToast } from "./Providers";
import { Field, Skeleton } from "./ui";
import { ActivityMeta } from "./ActivityView";
const PAGE_SIZE = 6;

/**
 * פונקציית עזר לחישוב "מד הטירוף" (אנרגיה) של הפעולה
 */
const getEnergyRating = (methods: any[]) => {
  const highEnergyNames = ['משחק תחרות', 'משחק הדמייה', 'עשייה', 'פירוק'];
  const count = methods.filter(m => {
    const name = typeof m === 'string' ? m : m.method;
    return highEnergyNames.includes(name);
  }).length;

  if (count >= 2) return { label: 'אנרגיה בשמיים', color: 'from-orange-500 to-red-500', width: 'w-full', icon: '🔥' };
  if (count === 1) return { label: 'קצב מעולה', color: 'from-purple-500 to-blue-500', width: 'w-2/3', icon: '⚡' };
  return { label: 'פעולה רגועה', color: 'from-teal-500 to-emerald-500', width: 'w-1/3', icon: '🧘' };
};

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

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, age, method, minD, maxD, sort]);

  useEffect(() => {
    const ctrl = new AbortController();
    const p = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQ) p.set("q", debouncedQ);
    if (age) p.set("age", age);
    if (method) p.set("method", method);
    if (minD) p.set("minDuration", minD);
    if (maxD) p.set("maxDuration", maxD);
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
  }, [debouncedQ, age, method, minD, maxD, sort, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = !!(q || age || method || minD || maxD);
  
  const clear = () => {
    setQ(""); setAge(""); setMethod(""); setMinD(""); setMaxD("");
  };

  return (
    <div className="library-container space-y-8">
      {/* כותרת עליונה עם השראה */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-purple-500/20 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
            מאגר הפעולות של ההנהגה
          </h1>
          <p className="text-purple-300 mt-2 italic">
            "הדרכה היא לא להעביר חומר, אלא להעביר חוויה." • מצא את הפעולה הבאה שלך
          </p>
        </div>
        <div className="text-left text-xs text-purple-400/60 font-mono">
           SHEVET MAOZ • DVIR KADOSH • SYSTEM v2.0
        </div>
      </div>

      {/* פילטרים משודרגים */}
      <form className="card glass p-6 shadow-2xl border-t border-l border-white/10" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-1 block">חיפוש מהיר</label>
            <input 
              className="w-full bg-purple-950/30 border border-purple-500/30 rounded-lg p-2 text-white focus:ring-2 focus:ring-pink-500 outline-none transition-all"
              type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="מה הנושא היום?..." 
            />
          </div>
          
          <div>
            <label className="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-1 block">שכבה</label>
            <select className="w-full bg-purple-950/30 border border-purple-500/30 rounded-lg p-2 text-white outline-none" value={age} onChange={(e) => setAge(e.target.value)}>
              <option value="">הכול</option>
              {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-1 block">שיטה</label>
            <select className="w-full bg-purple-950/30 border border-purple-500/30 rounded-lg p-2 text-white outline-none" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">הכול</option>
              {METHODS.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-1 block">זמן (דקות)</label>
            <input className="w-full bg-purple-950/30 border border-purple-500/30 rounded-lg p-2 text-white outline-none" type="number" placeholder="עד..." value={maxD} onChange={(e) => setMaxD(e.target.value)} />
          </div>

          <div className="flex items-end">
            {hasFilters ? (
              <button type="button" className="btn btn-outline w-full text-xs" onClick={clear}>ניקוי סינון</button>
            ) : (
               <div className="w-full text-center text-[10px] text-purple-500 italic pb-2">מסונן לפי הכי חדשים</div>
            )}
          </div>
        </div>
      </form>

      {/* הודעות סטטוס */}
      <div className="flex justify-between items-center text-sm">
        <p className="text-purple-200" aria-live="polite">
          {loading ? "סורק את המאגר..." : `מצאנו עבורך ${data?.total || 0} פעולות מעולות`}
        </p>
      </div>

      {loading && !data && <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Skeleton lines={8} /><Skeleton lines={8} /></div>}

      {/* רשימת הכרטיסים המטורפת */}
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.items.map((a: Activity) => {
          const energy = getEnergyRating(a.methods || []);
          return (
            <li key={a.id} className="group relative flex flex-col bg-[#1E1245]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-5 hover:border-purple-500/50 transition-all hover:-translate-y-1 shadow-xl">
              {/* מד האנרגיה בראש הכרטיס */}
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-black text-purple-300 tracking-tighter opacity-70">
                  {a.ageGroup}
                </span>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">{energy.label}</span>
                  <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${energy.color} ${energy.width}`}></div>
                  </div>
                </div>
              </div>

              {/* כותרת הפעולה */}
              <h2 className="text-xl font-bold text-white group-hover:text-pink-400 transition-colors mb-2">
                <Link href={`/library/${a.id}`}>{a.title}</Link>
              </h2>

              <div className="flex-grow">
                <ActivityMeta a={a} />
              </div>

              {/* תגיות מעוצבות */}
              {a.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {a.tags.slice(0, 3).map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* קרדיט תחתון ופעולות */}
              <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-[10px] text-white font-bold shadow-lg">
                    {a.instructor?.[0] || 'מ'}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-white/80 font-bold">{a.instructor || 'מדריך מעוז'}</span>
                    <span className="text-[8px] text-purple-400 uppercase tracking-tighter">צוות הדרכה • שבט מעוז</span>
                  </div>
                </div>
                <ActivityActions activity={a} onChanged={reload} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* ריק? */}
      {data?.items.length === 0 && !loading && (
        <div className="text-center py-20 card glass">
          <div className="text-6xl mb-4">🤷‍♂️</div>
          <h3 className="text-xl font-bold text-white mb-2">אופס... המאגר ריק?</h3>
          <p className="text-purple-300 mb-6">לא מצאנו כלום תחת הפילטרים האלו. אולי תנסה לחפש משהו אחר?</p>
          <button onClick={clear} className="btn btn-primary">נקה הכל ונתחיל מחדש</button>
        </div>
      )}

      {/* עמודים */}
      {data && pages > 1 && (
        <nav className="flex justify-center items-center gap-6 pt-10" aria-label="Pagination">
          <button className="btn btn-circle" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
          <span className="text-sm font-bold text-purple-200">עמוד {page} מתוך {pages}</span>
          <button className="btn btn-circle" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>→</button>
        </nav>
      )}

      {/* קרדיט קבוע להנהגה */}
      <footer className="mt-20 py-8 text-center opacity-40 hover:opacity-100 transition-opacity">
        <div className="h-px w-32 bg-gradient-to-r from-transparent via-purple-500 to-transparent mx-auto mb-4"></div>
        <p className="text-xs text-purple-300 uppercase tracking-[0.2em]">
          פותח עבור הנהגת הצופים • שבט מעוז • ייעוץ פדגוגי: דביר קדוש
        </p>
      </footer>
    </div>
  );
}