"use client";

// שלב 68: אזור "מעוז בשטח" בעמוד עוזר הכתיבה: מכשיר קשר (דיבור) וסימולטור חניכים, בשתי לשוניות.
// הלשונית הלא פעילה לא נטענת בכלל, ולכן שום מיקרופון ושום בקשה לשרת לא מתחילים לפני שהמשתמש בוחר.
import { useRef, useState, type KeyboardEvent } from "react";
import { useTabIndicator } from "../v21/useTabIndicator";
import { Spar } from "./Spar";
import { Walkie } from "./Walkie";

const TABS = [
  { id: "walkie", label: "מכשיר קשר" },
  { id: "spar", label: "סימולטור חניכים" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function MaozLab() {
  const [tab, setTab] = useState<TabId>("walkie");
  const t = useTabIndicator(tab);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = TABS.findIndex((x) => x.id === tab);
    // ב-RTL חץ ימינה = הלשונית הקודמת בסדר הקריאה
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowLeft" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    refs.current[TABS[next].id]?.focus();
  };

  return (
    <section className="v21-card maoz-lab no-print" aria-labelledby="maoz-lab-h">
      <h2 id="maoz-lab-h" className="section-title">
        מעוז בשטח
      </h2>
      <p className="hint">שאלו את מעוז בקול כשהידיים תפוסות, או תרגלו מול חניכים בדויים לפני הפעולה.</p>
      <div className={`maoz-tabs ${t.cls}`} role="tablist" aria-label="כלי מעוז בשטח" ref={t.ref} data-switch={t.sw} onKeyDown={onKey}>
        {t.ind}
        {TABS.map((x) => (
          <button
            key={x.id}
            ref={(el) => {
              refs.current[x.id] = el;
            }}
            type="button"
            role="tab"
            id={`maoz-tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls={`maoz-panel-${x.id}`}
            tabIndex={tab === x.id ? 0 : -1}
            className="maoz-tab"
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`maoz-panel-${tab}`} aria-labelledby={`maoz-tab-${tab}`} className="maoz-panel">
        {tab === "walkie" ? <Walkie variant="assistant" /> : <Spar />}
      </div>
    </section>
  );
}
