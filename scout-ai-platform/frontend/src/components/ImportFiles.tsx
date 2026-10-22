"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, api, errorMessage, parseImportFile, storageGet, type ParsedDoc } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import type { Activity } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Field } from "./ui";

interface Item {
  key: string;
  file: string;
  draft?: ParsedDoc;
  title: string;
  age: string;
  error?: string;
  saved?: number;
  saving?: boolean;
}

export function ImportFiles() {
  const { token, user } = useAuth();
  const toast = useToast();
  const [defaultAge, setDefaultAge] = useState("כיתה ח' - מעורב");
  const [instructor, setInstructor] = useState(() => {
    try {
      return (JSON.parse(storageGet("scout.form") ?? "{}") as { instructor?: string }).instructor ?? "";
    } catch {
      return "";
    }
  });
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const who = instructor || user?.displayName || "";

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const next: Item[] = [];
    for (const f of Array.from(files).slice(0, 15)) {
      const key = `${f.name}-${f.size}-${Math.random()}`;
      try {
        const d = await parseImportFile(f);
        next.push({ key, file: f.name, draft: d, title: d.title, age: d.ageGroup ?? defaultAge });
      } catch (e) {
        next.push({ key, file: f.name, title: f.name, age: defaultAge, error: errorMessage(e) });
      }
    }
    setItems((l) => [...l, ...next]);
    setBusy(false);
  };

  const patch = (key: string, p: Partial<Item>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const save = async (it: Item): Promise<boolean> => {
    if (!it.draft || it.saved) return !!it.saved;
    if (!who.trim()) {
      toast("יש להזין שם מדריך/ה לפני השמירה", { kind: "error" });
      return false;
    }
    patch(it.key, { saving: true });
    try {
      const a = await api<Activity>("/api/activities/import-parsed", {
        method: "POST",
        token,
        body: { title: it.title, ageGroup: it.age, leadingValue: it.draft.leadingValue, equipment: it.draft.equipment, safetyNotes: it.draft.safetyNotes, instructor: who.trim(), stages: it.draft.stages },
      });
      patch(it.key, { saved: a.id, saving: false });
      return true;
    } catch (e) {
      patch(it.key, { saving: false, error: errorMessage(e instanceof ApiError ? e : e) });
      return false;
    }
  };

  const saveAll = async () => {
    let ok = 0;
    for (const it of items) if (it.draft && !it.saved && (await save(it))) ok++;
    if (ok) toast(`${ok} פעולות נשמרו במאגר`, { kind: "success" });
  };

  const pending = items.filter((i) => i.draft && !i.saved).length;

  return (
    <>
      <section className="card glass" aria-label="הגדרות ייבוא">
        <div className="form-grid">
          <Field label="שם המדריך/ה" htmlFor="imp-instr">
            <input id="imp-instr" value={instructor} onChange={(e) => setInstructor(e.target.value)} placeholder={user?.displayName ?? ""} />
          </Field>
          <Field label="שכבת גיל כשלא נמצאה בקובץ" htmlFor="imp-age">
            <select id="imp-age" value={defaultAge} onChange={(e) => setDefaultAge(e.target.value)}>
              {AGE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="בחירת קבצים (עד 15)" htmlFor="imp-files" hint="Word (docx) או טקסט (txt)" className="span-2">
            <input id="imp-files" type="file" multiple accept=".docx,.txt,.md" onChange={(e) => void pick(e.target.files)} disabled={busy} />
          </Field>
        </div>
        {busy && <p role="status">קורא את הקבצים...</p>}
      </section>

      {items.length > 0 && (
        <section aria-label="תוצאות הקריאה">
          {pending > 1 && (
            <button type="button" className="btn btn-primary" onClick={saveAll}>
              שמירת כל הפעולות ({pending})
            </button>
          )}
          <ul className="list">
            {items.map((it, n) => (
              <li key={it.key} className="card glass">
                <h2 className="card-title">{it.file}</h2>
                {it.error && (
                  <p className="error-box" role="alert">
                    {it.error}
                  </p>
                )}
                {it.draft && (
                  <>
                    <p>
                      זוהו {it.draft.stages.length} שלבים, כ-{it.draft.durationMin} דקות.
                    </p>
                    {it.draft.warnings.length > 0 && (
                      <ul className="bullets warn-box" aria-label="דברים לבדוק">
                        {it.draft.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                    <div className="form-grid">
                      <Field label="שם הפעולה" htmlFor={`imp-t-${n}`}>
                        <input id={`imp-t-${n}`} value={it.title} onChange={(e) => patch(it.key, { title: e.target.value })} disabled={!!it.saved} />
                      </Field>
                      <Field label="שכבת גיל" htmlFor={`imp-a-${n}`}>
                        <select id={`imp-a-${n}`} value={it.age} onChange={(e) => patch(it.key, { age: e.target.value })} disabled={!!it.saved}>
                          {AGE_GROUPS.map((g) => (
                            <option key={g}>{g}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    {it.saved ? (
                      <p role="status">
                        נשמרה. <Link href={`/library/${it.saved}`}>פתיחה במאגר</Link>
                      </p>
                    ) : (
                      <button type="button" className="btn btn-primary" onClick={() => save(it)} disabled={it.saving}>
                        {it.saving ? "שומר..." : "שמירה במאגר"}
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
