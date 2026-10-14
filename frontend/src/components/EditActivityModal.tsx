"use client";

import { useEffect, useState } from "react";
import { api, errorMessage, fieldErrorLines } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import type { Activity, Stage } from "@/lib/types";
import { StageRegen } from "./StageRegen";
import { QualityPanel, type QItem } from "./QualityPanel";
import { Field, Modal } from "./ui";

interface Props {
  open: boolean;
  activity: Activity;
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
  onAuthError: (e: unknown) => boolean;
}

export function EditActivityModal({ open, activity, token, onClose, onSaved, onAuthError }: Props) {
  const [title, setTitle] = useState(activity.title);
  const [ageGroup, setAgeGroup] = useState(activity.ageGroup);
  const [groupSize, setGroupSize] = useState(String(activity.groupSize));
  const [leadingValue, setLeadingValue] = useState(activity.leadingValue);
  const [equipment, setEquipment] = useState(activity.equipment);
  const [safetyNotes, setSafetyNotes] = useState(activity.safetyNotes);
  const [conclusionNote, setConclusionNote] = useState(activity.conclusionNote ?? "");
  const [tags, setTags] = useState(activity.tags.join(", "));
  const [stages, setStages] = useState<Stage[]>(activity.stages);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // reset the form each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setTitle(activity.title);
    setAgeGroup(activity.ageGroup);
    setGroupSize(String(activity.groupSize));
    setLeadingValue(activity.leadingValue);
    setEquipment(activity.equipment);
    setSafetyNotes(activity.safetyNotes);
    setConclusionNote(activity.conclusionNote ?? "");
    setTags(activity.tags.join(", "));
    setStages(activity.stages.map((s) => ({ ...s })));
    setErrors([]);
  }, [open, activity]);

  const total = stages.reduce((s, x) => s + (Number(x.minutes) || 0), 0);
  const setStage = (i: number, patch: Partial<Stage>) => setStages((st) => st.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const save = async () => {
    const problems: string[] = [];
    if (title.trim().length < 2) problems.push("שם הפעולה קצר מדי");
    if (!leadingValue.trim()) problems.push("יש להזין ערך מוביל");
    if (!equipment.trim()) problems.push("יש להזין ציוד (אפשר לכתוב 'אין')");
    if (!safetyNotes.trim()) problems.push("יש להזין הערות בטיחות");
    const size = Number(groupSize);
    if (!Number.isInteger(size) || size < 1 || size > 200) problems.push("גודל הקבוצה חייב להיות בין 1 ל-200");
    stages.forEach((s) => {
      const m = Number(s.minutes);
      if (!Number.isInteger(m) || m < 1) problems.push(`בשלב "${s.name}" הזמן חייב להיות מספר שלם של דקות (לפחות 1)`);
      if (s.content.trim().length < 5) problems.push(`בשלב "${s.name}" התוכן קצר מדי`);
    });
    if (problems.length) return setErrors(problems);

    setSaving(true);
    setErrors([]);
    try {
      await api(`/api/activities/${activity.id}`, {
        method: "PUT",
        token,
        body: {
          title: title.trim(),
          ageGroup,
          groupSize: size,
          leadingValue: leadingValue.trim(),
          equipment: equipment.trim(),
          safetyNotes: safetyNotes.trim(),
          conclusionNote: conclusionNote.trim() || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          stages: stages.map((s) => ({ name: s.name, minutes: Number(s.minutes), layer: s.layer.trim(), content: s.content.trim() })),
        },
      });
      onSaved();
    } catch (e) {
      if (onAuthError(e)) return setSaving(false);
      const lines = fieldErrorLines(e);
      setErrors(lines.length ? lines : [errorMessage(e)]);
    }
    setSaving(false);
  };

  const qItems: QItem[] = [
    ...stages.map((s, i) => ({ key: `stage:${i}`, label: `שלב ${i + 1}: ${s.name}`, text: s.content })),
    { key: "equipment", label: "ציוד", text: equipment },
    { key: "safety", label: "בטיחות", text: safetyNotes },
    { key: "concl", label: "סיכום", text: conclusionNote },
  ];
  const applyQ = (key: string, text: string) => {
    if (key.startsWith("stage:")) setStage(Number(key.slice(6)), { content: text });
    else if (key === "equipment") setEquipment(text);
    else if (key === "safety") setSafetyNotes(text);
    else if (key === "concl") setConclusionNote(text);
  };

  const id = (n: string) => `edit-${activity.id}-${n}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`עריכת "${activity.title}"`}
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "שומר..." : "שמירה"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            ביטול
          </button>
          <span className="total" aria-live="polite">
            סה"כ זמן: {total} דקות
          </span>
        </>
      }
    >
      {errors.length > 0 && (
        <div className="error-box" role="alert">
          <p>
            <strong>יש לתקן:</strong>
          </p>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="form-grid">
        <Field label="שם הפעולה" htmlFor={id("title")}>
          <input id={id("title")} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="שכבת גיל" htmlFor={id("age")}>
          <select id={id("age")} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            {AGE_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="גודל קבוצה" htmlFor={id("size")}>
          <input id={id("size")} type="number" min={1} max={200} value={groupSize} onChange={(e) => setGroupSize(e.target.value)} />
        </Field>
        <Field label="ערך מוביל" htmlFor={id("value")}>
          <input id={id("value")} value={leadingValue} onChange={(e) => setLeadingValue(e.target.value)} />
        </Field>
        <Field label="תגיות (מופרדות בפסיקים)" htmlFor={id("tags")} className="span-2">
          <input id={id("tags")} value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="ציוד" htmlFor={id("eq")} className="span-2">
          <textarea id={id("eq")} rows={2} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
        </Field>
        <Field label="בטיחות ורגישות" htmlFor={id("safety")} className="span-2">
          <textarea id={id("safety")} rows={2} value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} />
        </Field>
        <Field label="סיכום וקישור למידות" htmlFor={id("concl")} className="span-2">
          <textarea id={id("concl")} rows={2} value={conclusionNote} onChange={(e) => setConclusionNote(e.target.value)} />
        </Field>
      </div>
      {stages.map((s, i) => (
        <fieldset key={s.name} className="stage-fieldset">
          <legend>
            שלב {i + 1}: {s.name}
          </legend>
          <div className="form-grid">
            <Field label="דקות" htmlFor={id(`min${i}`)}>
              <input id={id(`min${i}`)} type="number" min={1} value={s.minutes} onChange={(e) => setStage(i, { minutes: Number(e.target.value) })} />
            </Field>
            <Field label="שכבה חינוכית" htmlFor={id(`layer${i}`)}>
              <input id={id(`layer${i}`)} value={s.layer} onChange={(e) => setStage(i, { layer: e.target.value })} />
            </Field>
            <Field label="תוכן" htmlFor={id(`content${i}`)} className="span-2">
              <textarea id={id(`content${i}`)} rows={4} value={s.content} onChange={(e) => setStage(i, { content: e.target.value })} />
            </Field>
          </div>
          <StageRegen activityId={activity.id} index={i} onAccept={(content) => setStage(i, { content })} />
        </fieldset>
      ))}
      <QualityPanel items={qItems} onChange={applyQ} />
    </Modal>
  );
}
