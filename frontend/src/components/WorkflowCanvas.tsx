"use client";

// שלב 61: מפת "איך נבנית פעולה". התוכן כאן מתאר את מה שהמערכת באמת עושה (מספרים נשלפים מהשרת),
// והתנועה האוטומטית מכבדת מצב תנועה רגועה / חיסכון / prefers-reduced-motion.
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { calmMotion } from "@/lib/lux/motion";

interface Metric {
  label: string;
  /** מספר אמיתי מהשרת (null = עדיין לא נטען, לא מציגים) או טקסט קבוע */
  value: string | number | null;
}

interface AgentNode {
  id: number;
  code: string;
  tag: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  /** מי עושה את השלב */
  who: string;
  /** תווית קצרה בעברית בפינת הכרטיס */
  status: string;
  color: string;
  /** גוון בהיר של אותו צבע לטקסט על רקע כהה (ניגודיות AA) */
  text: string;
  metrics: Metric[];
  terminalLogs: string[];
  inputs: string[];
  outputs: string[];
}

interface Counts {
  values: number | null;
  methods: number | null;
  kinds: number | null;
}

const buildNodes = (c: Counts): AgentNode[] => [
  {
    id: 1,
    code: "01",
    tag: "קלט והקשר",
    title: "1. מתארים את הקבוצה והמטרה",
    shortDesc: "שכבת גיל, ערך מרכזי, סוג פעולה ואורך.",
    fullDesc: "ממלאים כמה פרטים: למי הפעולה, איזה ערך צופי היא מקדמת, כמה זמן יש ומה אופי הקבוצה. מכאן נבנית כל הפעולה.",
    who: "אתם",
    status: "קלט",
    color: "#fb923c",
    text: "#fdba74",
    metrics: [
      { label: "שכבות גיל", value: "ג' עד יב'" },
      { label: "ערכים צופיים", value: c.values },
      { label: "סוגי פעולות", value: c.kinds },
    ],
    terminalLogs: ["קולט שכבת גיל, נושא ואורך...", "מצליב עם הערך שבחרתם...", "מועבר לבחירת מתודות."],
    inputs: ["שכבת גיל", "נושא וערך", "אורך הפעולה בדקות", "אופי הקבוצה"],
    outputs: ["הגדרת הפעולה", "מגבלת זמן", "דגשים חינוכיים"],
  },
  {
    id: 2,
    code: "02",
    tag: "בחירת מתודות",
    title: "2. בוחרים מתודות לכל שלב",
    shortDesc: "משחקים, דיונים והפעלות שמתאימים לגיל ולשלב.",
    fullDesc: "המערכת מציעה מתודה מתאימה לכל שלב לפי הגיל והמטרה. אפשר להשאיר את ההצעה או להחליף ידנית.",
    who: "אוטומטי, ואפשר לשנות",
    status: "בחירה",
    color: "#a855f7",
    text: "#d8b4fe",
    metrics: [
      { label: "מתודות במאגר", value: c.methods },
      { label: "בחירה לפי", value: "גיל ושלב" },
      { label: "החלפה ידנית", value: "אפשרית" },
    ],
    terminalLogs: ["סורק את מאגר המתודות...", "מתאים מתודה לכל שלב בפעולה...", "ההצעה מוכנה להחלפה או לאישור."],
    inputs: ["הגדרת הפעולה", "שכבת גיל", "שלב בפעולה"],
    outputs: ["מתודה לכל שלב", "חלוקת זמן ראשונית"],
  },
  {
    id: 3,
    code: "03",
    tag: "כתיבה",
    title: "3. כותבים חמישה שלבי פעולה",
    shortDesc: "פתיחה, ציר, זמן צופיות, דיון וסיכום, עם זמנים.",
    fullDesc: "נכתבת פעולה בחמישה שלבים עם הנחיות למדריך, שאלות לדיון וחלוקת זמנים. כשבינה מלאכותית מופעלת היא כותבת את הטיוטה, ובלעדיה נבנית טיוטה מתבניות מובנות. בשני המקרים אפשר לערוך כל שלב.",
    who: "אוטומטי, ואתם עורכים",
    status: "כתיבה",
    color: "#ec4899",
    text: "#f9a8d4",
    metrics: [
      { label: "שלבים בפעולה", value: 5 },
      { label: "טון הכתיבה", value: "לבחירתכם" },
      { label: "חלוקת זמנים", value: "אוטומטית" },
    ],
    terminalLogs: ["בונה ציר זמן: פתיחה, ציר, זמן צופיות, דיון, סיכום...", "מנסח הנחיות ושאלות לדיון...", "הטיוטה מוכנה לעריכה."],
    inputs: ["מתודות שנבחרו", "טון כתיבה", "מגבלת זמן"],
    outputs: ["פעולה מלאה בחמישה שלבים", "זמנים לכל שלב"],
  },
  {
    id: 4,
    code: "04",
    tag: "ציוד ובטיחות",
    title: "4. מכינים ציוד ובטיחות",
    shortDesc: "רשימת ציוד להכנה והערות בטיחות לכל פעולה.",
    fullDesc: "לכל פעולה יש רשימת ציוד והערות בטיחות. במאגר אפשר לסנן פעולות שדורשות מעט ציוד, כדי למצוא פעולה שאפשר להפעיל גם ברגע האחרון.",
    who: "אוטומטי",
    status: "הכנה",
    color: "#38bdf8",
    text: "#7dd3fc",
    metrics: [
      { label: "רשימת ציוד", value: "בכל פעולה" },
      { label: "הערות בטיחות", value: "בכל פעולה" },
      { label: "סינון במאגר", value: "ציוד מועט" },
    ],
    terminalLogs: ["עובר על שלבי הפעולה...", "אוסף את הציוד הנדרש לרשימה...", "מצרף הערות בטיחות."],
    inputs: ["הפעולה המלאה"],
    outputs: ["רשימת ציוד להכנה", "הערות בטיחות"],
  },
  {
    id: 5,
    code: "05",
    tag: "ייצוא ושטח",
    title: "5. מייצאים ומפעילים בשטח",
    shortDesc: "קובץ Word מעוצב, או מצב במה עם טיימר.",
    fullDesc: "מורידים את הפעולה כקובץ Word או PDF עם סמל השבט, או עוברים למצב במה בנייד: שלב אחד על המסך וטיימר גדול שמלווה את הפעולה.",
    who: "בלחיצה",
    status: "הפקה",
    color: "#4ade80",
    text: "#86efac",
    metrics: [
      { label: "ייצוא", value: "Word / PDF" },
      { label: "מצב במה", value: "עם טיימר" },
      { label: "שיתוף", value: "קישור לצוות" },
    ],
    terminalLogs: ["מטמיע את סמל השבט בעיצוב להדפסה...", "מסנכרן את השלבים עם הטיימר של מצב במה...", "הפעולה מוכנה להורדה ולהפעלה."],
    inputs: ["פעולה מאושרת", "רשימת ציוד"],
    outputs: ["קובץ Word או PDF", "מצב במה עם טיימר", "קישור שיתוף"],
  },
];

export default function WorkflowCanvas() {
  const [activeId, setActiveId] = useState<number>(3);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [logIndex, setLogIndex] = useState<number>(0);
  const [counts, setCounts] = useState<Counts>({ values: null, methods: null, kinds: null });
  const [calm, setCalm] = useState<boolean>(true);
  const [visible, setVisible] = useState<boolean>(false);
  const root = useRef<HTMLElement>(null);

  const nodes = buildNodes(counts);
  const activeNode = nodes.find((n) => n.id === activeId) || nodes[2];

  // מספרים אמיתיים מהשרת (נקודות קצה ציבוריות). אם נכשל, מדלגים על המספר ולא ממציאים.
  useEffect(() => {
    let live = true;
    const len = (p: Promise<unknown>) => p.then((r) => (Array.isArray(r) ? r.length : null)).catch(() => null);
    Promise.all([len(api("/api/values")), len(api("/api/methods")), len(api("/api/kinds"))]).then(([values, methods, kinds]) => {
      if (live) setCounts({ values, methods, kinds });
    });
    return () => {
      live = false;
    };
  }, []);

  // ההדגמה רצה רק כשהקנבס על המסך
  useEffect(() => {
    const c = calmMotion();
    setCalm(c);
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!calm) setIsSimulating(true);
  }, [calm]);

  // התחלה אוטומטית רק בלי מצב רגוע; לחיצה מפורשת על הכפתור מפעילה גם במצב רגוע (בלי אנימציות, רק החלפת שלב)
  const running = isSimulating && visible;

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setActiveId((prev) => (prev >= 5 ? 1 : prev + 1));
    }, 4200);
    return () => clearInterval(interval);
  }, [running]);

  // שורות ה"טרמינל" של השלב הפעיל. במצב רגוע מוצגות כולן מיד.
  useEffect(() => {
    if (calm) {
      setLogIndex(2);
      return;
    }
    setLogIndex(0);
    const t1 = setTimeout(() => setLogIndex(1), 500);
    const t2 = setTimeout(() => setLogIndex(2), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [activeId, calm]);

  const handleSelectNode = useCallback((id: number) => {
    setIsSimulating(false);
    setActiveId(id);
  }, []);

  return (
    <section className="wf-canvas" ref={root} aria-label="איך נבנית פעולה: חמישה שלבים">
      <div className="wf-glow-orb wf-orb-1" aria-hidden="true" />
      <div className="wf-glow-orb wf-orb-2" aria-hidden="true" />

      <div className="wf-header">
        <div>
          <div className="wf-badge-row">
            <span className="wf-badge">
              <span className="wf-pulse" aria-hidden="true" />
              חמישה שלבים
            </span>
            <span className="wf-sub-pill">מהרעיון ועד הפעולה בשטח</span>
          </div>
          <h2 className="section-title wf-main-title">איך נבנית פעולה במחולל</h2>
          <p className="hint" style={{ margin: 0 }}>
            לחצו על שלב כדי לראות מה נכנס אליו ומה יוצא ממנו, או הפעילו הדגמה שעוברת בין השלבים.
          </p>
        </div>

        <div className="wf-controls">
          <button type="button" onClick={() => setIsSimulating((s) => !s)} aria-pressed={running} className={`btn wf-sim-btn ${running ? "is-running" : ""}`}>
            {running ? "⏸ השהיית ההדגמה" : "▶ הפעלת הדגמה"}
          </button>
          <Link href="/" className="btn btn-primary">
            בונים פעולה עכשיו ←
          </Link>
        </div>
      </div>

      <div className="wf-nodes-wrapper">
        <svg className="wf-connector-svg" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="wfGrad" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="50%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <line x1="40" y1="30" x2="960" y2="30" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <line x1="40" y1="30" x2="960" y2="30" stroke="url(#wfGrad)" strokeWidth="3" strokeDasharray="14 10" className="wf-svg-flow" />
        </svg>

        <div className="wf-nodes">
          {nodes.map((node) => {
            const isActive = activeId === node.id;
            const isPassed = node.id < activeId;
            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                aria-label={`שלב ${node.id}: ${node.title.replace(/^\d+\.\s*/, "")}`}
                onClick={() => handleSelectNode(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectNode(node.id);
                  }
                }}
                style={{ "--node-color": node.color, "--node-text": node.text } as React.CSSProperties}
                className={`wf-node ${isActive ? "active" : ""} ${isPassed ? "passed" : ""}`}
              >
                <div className="wf-node-top">
                  <span className="wf-node-code">{node.code}</span>
                  <span className="wf-node-status">
                    <span className="wf-status-dot" aria-hidden="true" />
                    {node.status}
                  </span>
                </div>

                <div className="wf-node-tag">{node.tag}</div>
                <div className="wf-node-title">{node.title}</div>
                <div className="wf-node-desc">{node.shortDesc}</div>

                <div className="wf-node-footer">
                  <span>מי עושה: {node.who}</span>
                  <span className="wf-node-arrow">{isActive ? "השלב הנבחר ●" : "לפרטים ←"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="wf-inspector" style={{ "--active-color": activeNode.color, "--active-text": activeNode.text } as React.CSSProperties}>
        <div className="wf-inspector-info">
          <div className="wf-ins-header">
            <span className="wf-ins-code">{activeNode.code}</span>
            <h3 className="wf-ins-title">{activeNode.title}</h3>
            <span className="wf-ins-badge">{activeNode.tag}</span>
          </div>

          <p className="wf-ins-desc">{activeNode.fullDesc}</p>

          <div className="wf-io-grid">
            <div className="wf-io-box">
              <div className="wf-io-label">📥 מה נכנס</div>
              <div className="wf-io-chips">
                {activeNode.inputs.map((inp) => (
                  <span key={inp} className="wf-chip">
                    {inp}
                  </span>
                ))}
              </div>
            </div>

            <div className="wf-io-box">
              <div className="wf-io-label">📤 מה יוצא</div>
              <div className="wf-io-chips">
                {activeNode.outputs.map((out) => (
                  <span key={out} className="wf-chip wf-chip-out">
                    {out}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="wf-metrics-row">
            {activeNode.metrics
              .filter((m) => m.value !== null)
              .map((m) => (
                <div key={m.label} className="wf-metric-card">
                  <div className="wf-metric-val">{m.value}</div>
                  <div className="wf-metric-lbl">{m.label}</div>
                </div>
              ))}
          </div>
        </div>

        <div className="wf-terminal">
          <div className="wf-term-bar">
            <div className="wf-term-dots" aria-hidden="true">
              <span style={{ background: "#ef4444" }} />
              <span style={{ background: "#f59e0b" }} />
              <span style={{ background: "#22c55e" }} />
            </div>
            <span className="wf-term-title">הדגמה להמחשה בלבד</span>
          </div>

          <div className="wf-term-body" dir="rtl" aria-hidden="true">
            {activeNode.terminalLogs.map((log, index) => (
              <div key={log} className={`wf-term-line ${index <= logIndex ? "visible" : "hidden"}`}>
                <span className="wf-term-prompt">❯</span> {log}
              </div>
            ))}
            <div className="wf-term-cursor-line">
              <span className="wf-term-prompt">❯</span> <span className="wf-cursor-blink">_</span>
            </div>
          </div>

          <div className="wf-term-footer">
            <span>
              שלב {activeNode.id} מתוך 5 · {activeNode.who}
            </span>
            <Link href="/library" className="wf-term-link">
              למאגר פעולות מוכן ↗
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
