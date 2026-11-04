"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";

const GO: Record<string, [string, string]> = {
  h: ["/", "יצירת פעולה"],
  l: ["/library", "המאגר"],
  m: ["/methods", "ספריית המתודות"],
  p: ["/plan", "תכנון תקופתי"],
  i: ["/icebreakers", "משחקי היכרות"],
  a: ["/account", "האזור האישי"],
};

/** Keyboard shortcuts for the site (not the field mode, which has its own). */
export function Shortcuts() {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const pending = useRef<number | null>(null);
  const inField = path.startsWith("/field");

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("scout:shortcuts", show);
    return () => window.removeEventListener("scout:shortcuts", show);
  }, []);

  useEffect(() => {
    if (inField) return;
    let gTimer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector("dialog[open]")) return;
      if (pending.current) {
        const dest = GO[e.key.toLowerCase()];
        window.clearTimeout(gTimer);
        pending.current = null;
        if (dest) {
          e.preventDefault();
          router.push(dest[0]);
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        const box = document.getElementById("f-q");
        if (box) box.focus();
        else router.push("/library?focus=1");
      } else if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key.toLowerCase() === "g") {
        pending.current = 1;
        gTimer = window.setTimeout(() => (pending.current = null), 1500);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, inField]);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="קיצורי מקלדת" footer={<button type="button" className="btn" onClick={() => setOpen(false)}>סגירה</button>}>
      <p className="hint">הקיצורים לא פועלים כשמקלידים בתוך שדה.</p>
      <dl className="keys">
        <dt>/</dt>
        <dd>חיפוש במאגר</dd>
        <dt>?</dt>
        <dd>החלון הזה</dd>
        {Object.entries(GO).map(([k, [, label]]) => (
          <div key={k} className="keys-row">
            <dt>
              G ואז {k.toUpperCase()}
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      <p>במצב הדרכה בשטח: רווח (התחלה והשהיה), N (הבא), P (קודם), R (הקראה).</p>
    </Modal>
  );
}
