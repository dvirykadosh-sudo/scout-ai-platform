"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { QualityResult } from "@/lib/types";
import { useToast } from "./Providers";

export interface QItem {
  key: string;
  label: string;
  text: string;
}

/** Checks the text for stiff, office-style wording and offers one-click replacements. */
export function QualityPanel({ items, onChange }: { items: QItem[]; onChange: (key: string, text: string) => void }) {
  const toast = useToast();
  const [res, setRes] = useState<QualityResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (list: QItem[] = items) => {
    setBusy(true);
    try {
      setRes(await api<QualityResult>("/api/quality", { method: "POST", body: { items: list.map((i) => ({ label: i.label, text: i.text })) } }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  const fixOne = (label: string, phrase: string, fix: string) => {
    const it = items.find((i) => i.label === label);
    if (!it) return;
    const next = { ...it, text: it.text.replace(phrase, fix) };
    onChange(it.key, next.text);
    void run(items.map((i) => (i.key === it.key ? next : i)));
  };

  const fixAll = () => {
    if (!res) return;
    const next = items.map((it) => {
      let t = it.text;
      for (const iss of res.issues) if (iss.label === it.label && iss.fix) t = t.split(iss.phrase).join(iss.fix);
      if (t !== it.text) onChange(it.key, t);
      return { ...it, text: t };
    });
    void run(next);
  };

  const fixable = res?.issues.filter((i) => i.fix).length ?? 0;
  return (
    <section className="quality" aria-labelledby="quality-title">
      <h3 id="quality-title" className="sub-title">
        בדיקת סגנון
      </h3>
      <p className="hint">מסמנת ניסוחים משרדיים ("במסגרת הפעילות", "לאחר מכן", "יתבקשו") ומציעה עברית מדוברת.</p>
      <button type="button" className="btn" onClick={() => run()} disabled={busy}>
        {busy ? "בודק..." : "בדיקת סגנון"}
      </button>
      {res && (
        <div role="status" aria-live="polite">
          <p>
            ציון טבעיות: <strong>{res.score}</strong> מתוך 100. {res.issues.length === 0 ? "לא נמצאו ניסוחים משרדיים." : `נמצאו ${res.issues.length} הערות.`}
          </p>
          {fixable > 0 && (
            <button type="button" className="btn btn-small" onClick={fixAll}>
              תיקון כל מה שאפשר ({fixable})
            </button>
          )}
          <ul className="plain-list quality-list">
            {res.issues.map((i, n) => (
              <li key={`${i.label}-${i.index}-${n}`}>
                <span>
                  <strong>{i.label}:</strong> "{i.phrase}" · {i.why}
                  {i.fix && <> · הצעה: "{i.fix}"</>}
                </span>
                {i.fix && (
                  <button type="button" className="btn btn-small" onClick={() => fixOne(i.label, i.phrase, i.fix as string)} aria-label={`החלפת "${i.phrase}" ב-"${i.fix}"`}>
                    החלפה
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
