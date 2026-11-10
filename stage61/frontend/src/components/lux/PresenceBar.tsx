"use client";

// שלב 61 (רעיון 18): אווטארים של מי שנמצא בטיוטה עכשיו, וחיווי "מקליד/ה". הכרזות לקורא מסך בקול נמוך ובלי להציף.
import { useEffect, useRef, useState } from "react";
import type { Person } from "@/lib/lux/presence";

const initial = (n: string) => Array.from(n.trim())[0] ?? "?";

export function PresenceBar({ people, label = "נמצאים כאן עכשיו" }: { people: Person[]; label?: string }) {
  const [said, setSaid] = useState("");
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set(people.map((p) => p.id));
    if (known.current) {
      const joined = people.filter((p) => !known.current!.has(p.id) && !p.you);
      if (joined.length) setSaid(`${joined[0].name} הצטרף/ה לטיוטה`);
    }
    known.current = now;
  }, [people]);

  const others = people.filter((p) => !p.you);
  const typers = others.filter((p) => p.typing);
  const status = typers.length === 1 ? `${typers[0].name} מקליד/ה תגובה...` : typers.length > 1 ? `${typers.length} אנשים מקלידים תגובה...` : "";
  const shown = people.slice(0, 6);
  if (!people.length) return null;
  return (
    <div className="lux-presence" role="group" aria-label={label}>
      <ul className="lux-pres-list">
        {shown.map((p) => (
          <li key={p.id} className={`lux-pres-av ${p.typing && !p.you ? "typing" : ""}`} style={{ ["--pc" as string]: p.color }} title={`${p.name}${p.you ? " (אתם)" : ""}${p.owner ? " · הכותב/ת" : ""}`}>
            <span aria-hidden="true">{initial(p.name)}</span>
            <span className="sr-only">
              {p.name}
              {p.you ? " (אתם)" : ""}
              {p.owner ? ", הכותב/ת" : ""}
            </span>
          </li>
        ))}
        {people.length > shown.length && (
          <li className="lux-pres-av more">
            <span aria-hidden="true">+{people.length - shown.length}</span>
            <span className="sr-only">ועוד {people.length - shown.length}</span>
          </li>
        )}
      </ul>
      <span className="lux-pres-txt">{others.length === 0 ? "רק אתם כאן" : `${people.length} ${people.length === 1 ? "אדם" : "אנשים"} כאן`}</span>
      <span className="lux-pres-typing" aria-hidden="true">
        {status && (
          <>
            <i className="dots" />
            {status}
          </>
        )}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
