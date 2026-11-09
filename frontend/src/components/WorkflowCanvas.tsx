"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";

interface AgentNode {
  id: number;
  code: string;
  tag: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  time: string;
  status: string;
  color: string;
  metrics: { label: string; value: string }[];
  terminalLogs: string[];
  inputs: string[];
  outputs: string[];
}

const WORKFLOW_NODES: AgentNode[] = [
  {
    id: 1,
    code: "AGT-01",
    tag: "INPUT & CONTEXT",
    title: "1. ניתוח שכבה ומטרות",
    shortDesc: "הגדרת שכבת גיל, ערך מרכזי ואופי הקבוצה בשבט מעוז.",
    fullDesc:
      "סוכן הקלט ממפה את מאפייני הקבוצה (גודל, שכבת גיל ד'–י\"ב, אנרגיה) ומצליב אותם עם מערך הערכים השבתי כדי לייצר תשתית פדגוגית מדויקת לפעולה.",
    time: "15 שניות",
    status: "ONLINE",
    color: "#fb923c",
    metrics: [
      { label: "שכבות גיל תומכות", value: "ד' - י\"ב" },
      { label: "ערכים במאגר", value: "45+" },
      { label: "דיוק התאמה", value: "99.4%" },
    ],
    terminalLogs: [
      "[AGT-01] טוען פרופיל קבוצה משבט מעוז...",
      "[AGT-01] מנתח דינמיקה קבוצתית ומטרות חינוכיות...",
      "[AGT-01] וקטור מטרות נוצר בהצלחה -> מועבר ל-AGT-02",
    ],
    inputs: ["שכבת גיל", "נושא הפעולה", "אורך פעולה (דקות)", "אופי הקבוצה"],
    outputs: ["פרופיל פדגוגי", "מגבלות זמן", "דגשים חינוכיים"],
  },
  {
    id: 2,
    code: "AGT-02",
    tag: "METHOD ENGINE",
    title: "2. מנוע מתודות חכם",
    shortDesc: "בחירה אוטומטית של משחקים, דיונים והפעלות מותאמות.",
    fullDesc:
      "סורק מאות מתודות צופיות ומסנן את אלו שמתאימות בדיוק למזג האוויר, למיקום (חדר/שטח) ולרמת הקשב של החניכים באותו שלב בפעולה.",
    time: "25 שניות",
    status: "READY",
    color: "#a855f7",
    metrics: [
      { label: "מתודות זמינות", value: "320+" },
      { label: "סוגי הפעלות", value: "14" },
      { label: "זמן סינון", value: "120ms" },
    ],
    terminalLogs: [
      "[AGT-02] מקבל וקטור מטרות מ-AGT-01...",
      "[AGT-02] מסנן מתודות לפי אנרגיה ומיקום בשבט...",
      "[AGT-02] נבחרו 4 מתודות ליבה + 2 מתודות גיבוי.",
    ],
    inputs: ["פרופיל פדגוגי", "מיקום (שטח/מבנה)", "ציוד זמין"],
    outputs: ["רשימת משחקים", "שאלות לדיון", "מתודת שיא"],
  },
  {
    id: 3,
    code: "AGT-03",
    tag: "AI CORE WRITER",
    title: "3. מחולל 5 שלבי הפעולה",
    shortDesc: "כתיבת פתיחה, גוף, שיא וסיכום עם חלוקת זמנים מדויקת.",
    fullDesc:
      "לב המערכת. מרכיב פעולה שלמה בת 5 שלבים מובנים, כולל הנחיות מדויקות למדריך, משפטי קישור, שאלות מנחות וחלוקת זמנים בדקות.",
    time: "מיידי",
    status: "ACTIVE CORE",
    color: "#ec4899",
    metrics: [
      { label: "מבנה שלבים", value: "5 שלבים" },
      { label: "סגנונות כתיבה", value: "8" },
      { label: "מהירות יצירה", value: "2.1s" },
    ],
    terminalLogs: [
      "[AGT-03] בונה ציר זמן: פתיחה (10 דק') -> גוף -> שיא...",
      "[AGT-03] מנסח הוראות הפעלה ושאלות רפלקציה למדריך...",
      "[AGT-03] טיוטת פעולה מלאה הורכבה בהצלחה.",
    ],
    inputs: ["מתודות נבחרות", "סגנון כתיבה אישי", "מגבלת זמן"],
    outputs: ["מערך פעולה מלא (5 שלבים)", "ציר זמנים דקה-אחר-דקה"],
  },
  {
    id: 4,
    code: "AGT-04",
    tag: "SAFETY & GEAR",
    title: "4. בקרת בטיחות וציוד",
    shortDesc: "גזירת רשימת ציוד מלאה לארון ובדיקת דגשי בטיחות.",
    fullDesc:
      "עובר אוטומטית על כל שלבי הפעולה כדי לחלץ כל פריט ציוד נדרש ומוסיף אזהרות בטיחות רלוונטיות לפעילות שטח, לילה או יצירה.",
    time: "אוטומטי",
    status: "GUARDING",
    color: "#38bdf8",
    metrics: [
      { label: "בדיקות בטיחות", value: "100%" },
      { label: "זיהוי ציוד אוטומטי", value: "פעיל" },
      { label: "תקן חוזר מנכ\"ל", value: "מותאם" },
    ],
    terminalLogs: [
      "[AGT-04] סורק טקסט לאיתור פריטי ציוד וחומרים...",
      "[AGT-04] מצליב פעילות עם נהלי בטיחות בשטח...",
      "[AGT-04] אושר: צורפה רשימת ציוד ודגשי בטיחות.",
    ],
    inputs: ["מערך פעולה מלא"],
    outputs: ["צ'ק-ליסט ציוד למחסן", "אזהרות ודגשי בטיחות"],
  },
  {
    id: 5,
    code: "AGT-05",
    tag: "EXPORT & FIELD",
    title: "5. ייצוא ל-Word ומצב שטח",
    shortDesc: "הורדת דף פעולה רשמי עם לוגו השבט או הפעלת טיימר חי.",
    fullDesc:
      "אורז את הפעולה לקובץ Word מעוצב להדפסה עם סמל שבט מעוז, או מעביר את המדריך ל'מצב שטח' בנייד עם טיימר ענק שמלווה את הפעולה בזמן אמת.",
    time: "בלחיצה",
    status: "READY",
    color: "#4ade80",
    metrics: [
      { label: "פורמטים לייצוא", value: "DOCX / PDF" },
      { label: "מצב שטח נייד", value: "כולל טיימר" },
      { label: "שיתוף לצוות", value: "מיידי" },
    ],
    terminalLogs: [
      "[AGT-05] מטמיע לוגו שבט מעוז ועיצוב הדפסה...",
      "[AGT-05] מסנכרן שלבים עם שעון העצר של מצב שטח...",
      "[AGT-05] הפעולה מוכנה להורדה ולהרצה מול החניכים!",
    ],
    inputs: ["פעולה מאושרת", "רשימת ציוד"],
    outputs: ["קובץ Word מעוצב", "ממשק מצב שטח חי", "קישור שיתוף"],
  },
];

export default function WorkflowCanvas() {
  const [activeId, setActiveId] = useState<number>(3);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [logIndex, setLogIndex] = useState<number>(0);

  const activeNode =
    WORKFLOW_NODES.find((n) => n.id === activeId) || WORKFLOW_NODES[2];

  // סימולציה אוטומטית שעוברת בין הסוכנים (כמו בווידאו)
  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => {
      setActiveId((prev) => (prev >= WORKFLOW_NODES.length ? 1 : prev + 1));
    }, 4200);
    return () => clearInterval(interval);
  }, [isSimulating]);

  // אנימציית שורות הטרמינל של הסוכן הפעיל
  useEffect(() => {
    setLogIndex(0);
    const t1 = setTimeout(() => setLogIndex(1), 500);
    const t2 = setTimeout(() => setLogIndex(2), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [activeId]);

  const handleSelectNode = (id: number) => {
    setIsSimulating(false);
    setActiveId(id);
  };

  return (
    <section className="wf-canvas" aria-label="מפת זרימת סוכני בינה מלאכותית">
      {/* אלמנטים של תאורת עומק ברקע הקנבס */}
      <div className="wf-glow-orb wf-orb-1" />
      <div className="wf-glow-orb wf-orb-2" />

      {/* כותרת עליונה ופקדי שליטה */}
      <div className="wf-header">
        <div>
          <div className="wf-badge-row">
            <span className="wf-badge">
              <span className="wf-pulse" />
              VISION ENGINE • 5 AI AGENTS
            </span>
            <span className="wf-sub-pill">שבט מעוז • ארכיטקטורה חיה</span>
          </div>
          <h2 className="section-title wf-main-title">
            רשת הסוכנים לבניית פעולה מושלמת
          </h2>
          <p className="hint" style={{ margin: 0 }}>
            לחץ על כל סוכן במפה כדי לבחון את קלט/פלט המערכת או הפעל הדמיה חיה של הזרימה:
          </p>
        </div>

        <div className="wf-controls">
          <button
            type="button"
            onClick={() => setIsSimulating((s) => !s)}
            className={`btn wf-sim-btn ${isSimulating ? "is-running" : ""}`}
          >
            {isSimulating ? "⏸ השהה סימולציה" : "▶ הפעל הדמיית זרימה"}
          </button>
          <Link href="/generator" className="btn btn-primary">
            בנה פעולה עכשיו ←
          </Link>
        </div>
      </div>

      {/* קו הזרימה הראשי עם כרטיסיות הסוכנים */}
      <div className="wf-nodes-wrapper">
        {/* קו אנרגיה מונפש ברקע שמחבר את כל הסוכנים */}
        <svg
          className="wf-connector-svg"
          viewBox="0 0 1000 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="wfGrad" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="50%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <line
            x1="40"
            y1="30"
            x2="960"
            y2="30"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="3"
          />
          <line
            x1="40"
            y1="30"
            x2="960"
            y2="30"
            stroke="url(#wfGrad)"
            strokeWidth="3"
            strokeDasharray="14 10"
            className="wf-svg-flow"
          />
        </svg>

        <div className="wf-nodes">
          {WORKFLOW_NODES.map((node) => {
            const isActive = activeId === node.id;
            const isPassed = node.id < activeId;
            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectNode(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectNode(node.id);
                  }
                }}
                style={{ "--node-color": node.color } as React.CSSProperties}
                className={`wf-node ${isActive ? "active" : ""} ${
                  isPassed ? "passed" : ""
                }`}
              >
                <div className="wf-node-top">
                  <span className="wf-node-code">{node.code}</span>
                  <span className="wf-node-status">
                    <span className="wf-status-dot" />
                    {node.status}
                  </span>
                </div>

                <div className="wf-node-tag">{node.tag}</div>
                <div className="wf-node-title">{node.title}</div>
                <div className="wf-node-desc">{node.shortDesc}</div>

                <div className="wf-node-footer">
                  <span>⏱ {node.time}</span>
                  <span className="wf-node-arrow">
                    {isActive ? "פעיל כעת ●" : "בחר סוכן ←"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* פאנל Inspector מתקדם + טרמינל חי של הסוכן שנבחר */}
      <div
        className="wf-inspector"
        style={{ "--active-color": activeNode.color } as React.CSSProperties}
      >
        <div className="wf-inspector-info">
          <div className="wf-ins-header">
            <span className="wf-ins-code">{activeNode.code}</span>
            <h3 className="wf-ins-title">{activeNode.title}</h3>
            <span className="wf-ins-badge">{activeNode.tag}</span>
          </div>

          <p className="wf-ins-desc">{activeNode.fullDesc}</p>

          <div className="wf-io-grid">
            <div className="wf-io-box">
              <div className="wf-io-label">📥 קלט סוכן (Inputs)</div>
              <div className="wf-io-chips">
                {activeNode.inputs.map((inp, i) => (
                  <span key={i} className="wf-chip">
                    {inp}
                  </span>
                ))}
              </div>
            </div>

            <div className="wf-io-box">
              <div className="wf-io-label">📤 פלט סוכן (Outputs)</div>
              <div className="wf-io-chips">
                {activeNode.outputs.map((out, i) => (
                  <span key={i} className="wf-chip wf-chip-out">
                    {out}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="wf-metrics-row">
            {activeNode.metrics.map((m, idx) => (
              <div key={idx} className="wf-metric-card">
                <div className="wf-metric-val">{m.value}</div>
                <div className="wf-metric-lbl">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* חלונית טרמינל חיה בסגנון סוכני AI */}
        <div className="wf-terminal">
          <div className="wf-term-bar">
            <div className="wf-term-dots">
              <span style={{ background: "#ef4444" }} />
              <span style={{ background: "#f59e0b" }} />
              <span style={{ background: "#22c55e" }} />
            </div>
            <span className="wf-term-title">
              agent-stream://{activeNode.code.toLowerCase()}.maoz
            </span>
          </div>

          <div className="wf-term-body" dir="rtl">
            {activeNode.terminalLogs.map((log, index) => (
              <div
                key={index}
                className={`wf-term-line ${
                  index <= logIndex ? "visible" : "hidden"
                }`}
              >
                <span className="wf-term-prompt">❯</span> {log}
              </div>
            ))}
            <div className="wf-term-cursor-line">
              <span className="wf-term-prompt">❯</span>{" "}
              <span className="wf-cursor-blink">_</span>
            </div>
          </div>

          <div className="wf-term-footer">
            <span>STATUS: {activeNode.status}</span>
            <Link href="/library" className="wf-term-link">
              פתח מאגר פעולות מוכן ↗
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}