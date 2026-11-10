"use client";

// שלב 61: פתיח מקופל בדף הבית שמראה איך נבנית פעולה. הקנבס נטען רק כשפותחים, כדי לא להכביד על הדף ולא להזיז את הטופס.
import dynamic from "next/dynamic";
import { useState } from "react";

const WorkflowCanvas = dynamic(() => import("../WorkflowCanvas"), { ssr: false });

export function HomeHow() {
  const [open, setOpen] = useState(false);
  return (
    <details className="home-how card glass" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>איך נבנית פעולה? הדגמה בחמישה שלבים</summary>
      {open && <WorkflowCanvas />}
    </details>
  );
}
