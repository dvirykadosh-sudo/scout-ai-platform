"use client";

// כלי עזר משותפים לרכיבי מרכז הוואטסאפ: טעינה עם רענון, שדות טופס, והתראות קצרות.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/api";
import { useToast } from "../Providers";

/** טוען נתונים, ומרענן כל `every` מילישניות (רק כשהלשונית גלויה). deps: מתי לטעון מחדש. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], every = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const ref = useRef(fn);
  ref.current = fn;
  const reload = useCallback(async () => {
    try {
      setData(await ref.current());
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    if (!every) return;
    const t = window.setInterval(() => document.visibilityState === "visible" && void reload(), every);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, every, reload]);
  return { data, error, loading, reload };
}

/** מריץ פעולה עם הודעת הצלחה או שגיאה */
export function useAct() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | null> => {
      setBusy(true);
      try {
        const r = await fn();
        if (ok) toast(ok, { kind: "success" });
        return r;
      } catch (e) {
        toast(errorMessage(e), { kind: "error" });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { act, busy };
}

export function Alert({ children, info }: { children: ReactNode; info?: boolean }) {
  return <p className={`wa-alert${info ? " info" : ""}`} role={info ? "status" : "alert"}>{children}</p>;
}

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="wa-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className="wa-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export const fmtTime = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
};
