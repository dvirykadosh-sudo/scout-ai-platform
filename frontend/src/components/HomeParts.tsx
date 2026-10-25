"use client";

// דף הבית מסודר: שלוש פעולות עיקריות, כל הכלים מקופלים, ולשוניות שמפרידות בין יצירה, השראה והשבוע שלי.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, fmtDate } from "@/lib/api";
import { useAuth } from "./Providers";

const MAIN = [
  { href: "/#create", t: "יצירת פעולה חכמה", d: "ממלאים כמה פרטים ומקבלים פעולה מלאה", id: "create" },
  { href: "/write", t: "כתיבת פעולה משלי", d: "עורך חופשי עם הצעות מתודה", id: "write" },
  { href: "/library", t: "מאגר הפעולות", d: "לחפש פעולה קיימת ולהתאים אותה", id: "library" },
];
const MORE = [
  { href: "/assistant", t: "עוזר הכתיבה", d: "לבדוק ולשפר טיוטה" },
  { href: "/quick", t: "פעולת חירום", d: "10 דקות בלי ציוד" },
  { href: "/plan", t: "תכנון תקופתי", d: "שבועות וחודשים קדימה" },
  { href: "/methods", t: "ספריית המתודות", d: "כל השיטות במקום אחד" },
  { href: "/tools", t: "כלים ורעיונות", d: "משחקים, סיפורים, שאלות" },
  { href: "/whats-new", t: "מה חדש באתר", d: "מה השתנה בשדרוגים האחרונים" },
];

interface DocRow {
  id: number;
  title: string;
  updatedAt: string;
}

/** שלוש פעולות עיקריות בלבד, ו"כל הכלים" מקופל. */
export function HomeMenu({ onCreate }: { onCreate: () => void }) {
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
        מה רוצים לעשות היום?
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
        <ul className="home-menu-grid home-menu-main">
          {MAIN.map((m) => (
            <li key={m.href}>
              {m.id === "create" ? (
                <a
                  href="#create"
                  onClick={(e) => {
                    e.preventDefault();
                    onCreate();
                  }}
                >
                  <strong>{m.t}</strong>
                  <span className="hint">{m.d}</span>
                </a>
              ) : (
                <Link href={m.href}>
                  <strong>{m.t}</strong>
                  <span className="hint">{m.d}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
        <details className="home-more">
          <summary>כל הכלים</summary>
          <ul className="home-menu-grid">
            {MORE.map((m) => (
              <li key={m.href}>
                <Link href={m.href}>
                  <strong>{m.t}</strong>
                  <span className="hint">{m.d}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </nav>
    </section>
  );
}

const TABS = [
  { id: "create", label: "יצירת פעולה" },
  { id: "ideas", label: "השראה והצעות" },
  { id: "week", label: "השבוע שלי והודעות" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** לשוניות. כל לשונית נטענת בפעם הראשונה שפותחים אותה ונשארת בזיכרון, כדי שטיוטה לא תיעלם. */
export function HomeTabs({ create, ideas, week, active, setActive }: { create: ReactNode; ideas: ReactNode; week: ReactNode; active: TabId; setActive: (t: TabId) => void }) {
  const [seen, setSeen] = useState<Set<TabId>>(new Set([active]));
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => setSeen((s) => (s.has(active) ? s : new Set(s).add(active))), [active]);
  const pick = (t: TabId) => {
    setActive(t);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = TABS[(i + dir + TABS.length) % TABS.length];
    pick(n.id);
    refs.current[n.id]?.focus();
  };
  const panels: Record<TabId, ReactNode> = { create, ideas, week };
  return (
    <section aria-label="אזורי דף הבית">
      <div role="tablist" aria-label="אזורי דף הבית" className="home-tabs">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className="btn"
            onClick={() => pick(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>
          {seen.has(t.id) ? panels[t.id] : null}
        </div>
      ))}
    </section>
  );
}

/** מצב הלשונית: מהכתובת (?tab=), מהזיכרון, או "יצירה". */
export function useHomeTab(): [TabId, (t: TabId) => void] {
  const [tab, setTab] = useState<TabId>("create");
  const sp = useSearchParams();
  const q = sp.get("tab");
  const topic = sp.get("topic");
  useEffect(() => {
    const pick = (topic ? "create" : TABS.find((t) => t.id === q)?.id) as TabId | undefined;
    if (pick) setTab(pick);
  }, [q, topic]);
  return [tab, setTab];
}
