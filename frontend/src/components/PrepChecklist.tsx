"use client";

import { useEffect, useState } from "react";
import { storageGet, storageSet } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { useToast } from "./Providers";

export function prepItems(a: Activity): string[] {
  const gear = a.equipment
    .split(/[,،\n;]/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(אין|ללא)$/.test(x))
    .map((x) => `להכין: ${x}`);
  const items = [
    ...gear,
    `לקרוא שוב את הערות הבטיחות: ${a.safetyNotes}`,
    "לבדוק את המרחב: גודל, ביטחון, מקום לקבוצה",
    `לעבור על ${a.stages.length} השלבים ועל הזמנים (${a.durationMin} דקות)`,
    "להכין שעון או לפתוח את מצב הדרכה בשטח בטלפון",
    "לחשוב מראש על דוגמה אישית לסיכום ולמידות ד' ו-ח'",
  ];
  if (a.activeScouting) items.splice(gear.length, 0, "לתרגל מראש את הקשר או את העזרה הראשונה שמלמדים בפעולה");
  if (a.energeticMode) items.push("להגדיר גבולות גזרה לריצה ולהוריד שעונים וצמידים");
  return items;
}

export function PrepChecklist({ activity }: { activity: Activity }) {
  const key = `scout.prep.${activity.id}`;
  const toast = useToast();
  const items = prepItems(activity);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    try {
      setDone(JSON.parse(storageGet(key) ?? "[]"));
    } catch {
      setDone([]);
    }
  }, [key]);

  const toggle = (it: string) => {
    const next = done.includes(it) ? done.filter((x) => x !== it) : [...done, it];
    setDone(next);
    storageSet(key, JSON.stringify(next));
  };
  const reset = () => {
    setDone([]);
    storageSet(key, "[]");
  };
  const copy = async () => {
    const text = `${activity.title}\n` + items.map((i) => `${done.includes(i) ? "[x]" : "[ ]"} ${i}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("הרשימה הועתקה", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק. אפשר להדפיס את העמוד", { kind: "info" });
    }
  };

  return (
    <section className="card glass prep" aria-labelledby={`prep-title-${activity.id}`}>
      <h2 id={`prep-title-${activity.id}`} className="section-title">
        רשימת הכנה לפעולה
      </h2>
      <p className="hint no-print">מסמנים מה כבר הוכן. הסימונים נשמרים בדפדפן הזה. {done.length}/{items.length} הושלמו.</p>
      <ul className="checklist">
        {items.map((it, i) => (
          <li key={it}>
            <label className="check">
              <input type="checkbox" id={`prep-${activity.id}-${i}`} checked={done.includes(it)} onChange={() => toggle(it)} />
              <span>{it}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="actions no-print">
        <button type="button" className="btn" onClick={copy}>
          העתקת הרשימה
        </button>
        <button type="button" className="btn" onClick={reset}>
          איפוס סימונים
        </button>
      </div>
    </section>
  );
}
