"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage, storageGet, storageSet } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import { quickCreate, useKinds } from "@/lib/kinds";
import { useAuth, useToast } from "./Providers";
import { KindDetails } from "./KindGuide";
import { Field, Skeleton } from "./ui";

const AGE_KEY = "scout.quick.age";
const MINUTES = ["", "20", "30", "45", "60", "90"];

/** Create an activity with no topic at all: pick a kind (or none) and the site chooses the rest. */
export function QuickStart() {
  const kinds = useKinds();
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const { token, user } = useAuth();
  const [kind, setKind] = useState("");
  const [age, setAge] = useState("כיתה ח' - מעורב");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = storageGet(AGE_KEY);
    if (saved && AGE_GROUPS.includes(saved)) setAge(saved);
    const k = params.get("kind");
    if (k) setKind(k);
  }, [params]);

  const chosen = kinds.find((k) => k.id === kind);

  const go = async () => {
    setBusy(true);
    try {
      storageSet(AGE_KEY, age);
      const a = await quickCreate(token, {
        ...(kind ? { kind } : { surprise: true }),
        ageGroup: age,
        ...(minutes ? { minutes: Number(minutes) } : {}),
        ...(user ? { instructor: user.displayName } : {}),
      });
      toast(`נוצרה פעולה: ${a.title}`, { kind: "success" });
      router.push(`/library/${a.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <div aria-live="polite">
        <h2 className="section-title">בוחר נושא ובונה פעולה...</h2>
        <Skeleton lines={4} label="הפעולה נוצרת, זה לוקח כמה שניות" />
      </div>
    );
  }

  return (
    <section id="quick" className="card glass quick-start" aria-labelledby="quick-title">
      <h2 id="quick-title" className="section-title">
        אין לי נושא, תפתיעו אותי
      </h2>
      <p className="hint">בוחרים סוג פעולה, או משאירים לאתר להחליט. האתר בוחר נושא וערך (לפי החג, העונה ומה שחסר לך) ובונה פעולה מלאה.</p>
      <fieldset className="kind-picker">
        <legend>איזה סוג פעולה?</legend>
        <div className="kind-options">
          <label className={`kind-opt ${kind === "" ? "on" : ""}`}>
            <input type="radio" name="quick-kind" value="" checked={kind === ""} onChange={() => setKind("")} />
            <span>
              <strong>הפתעה</strong>
              <small>האתר בוחר גם את הסוג, לפי מה שחסר לך</small>
            </span>
          </label>
          {kinds.map((k) => (
            <label key={k.id} className={`kind-opt ${kind === k.id ? "on" : ""}`}>
              <input type="radio" name="quick-kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
              <span>
                <strong>{k.label}</strong>
                <small>{k.short}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {chosen && (
        <details className="kind-more" key={chosen.id}>
          <summary>מה זה {chosen.label} ואיך היא בנויה</summary>
          <KindDetails k={chosen} />
        </details>
      )}
      <div className="form-grid">
        <Field label="שכבת גיל" htmlFor="quick-age">
          <select id="quick-age" value={age} onChange={(e) => setAge(e.target.value)}>
            {AGE_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="משך" htmlFor="quick-min" hint="ריק: האורך הרגיל של הסוג">
          <select id="quick-min" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m ? `${m} דקות` : "ברירת מחדל"}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={go}>
          {kind ? `צרו לי ${chosen?.label ?? "פעולה"}` : "הפתיעו אותי"}
        </button>
        <Link className="btn" href="/types">
          כל סוגי הפעולות
        </Link>
        <Link className="btn" href="/ideas">
          רעיונות לפעולת שיא
        </Link>
      </div>
    </section>
  );
}
