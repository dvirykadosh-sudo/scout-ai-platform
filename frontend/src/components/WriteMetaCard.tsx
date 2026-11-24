"use client";

// שלב 75: כרטיס פרטי המסמך (שם, שכבה, משך, ציוד...), הופרד מהעורך הגדול ועטוף ב-memo:
// הקלדה בשלב לא מרנדרת אותו מחדש, כי רק title ו-meta שלו נכנסים כ-props.
import { memo } from "react";
import { AGE_GROUPS } from "@/lib/constants";
import { Field } from "./ui";
import type { useCatalog } from "./WriteHelp";
import type { Meta } from "./WriteParts";

export interface MetaApi {
  setTitle: (v: string) => void;
  patch: (p: Partial<Meta>, coalesce?: boolean) => void;
}

const VALUES = ["אחריות", "אומץ", "חברות", "יושרה", "כבוד", "נתינה", "התנדבות", "ערבות הדדית", "הגינות", "אהבת הארץ", "עבודת צוות", "סבלנות", "הקשבה", "התמדה"];
const clamp = (v: string, max: number) => (v === "" ? null : Math.max(0, Math.min(max, Math.round(Number(v)))));

export const WriteMetaCard = memo(function WriteMetaCard({ title, meta, cat, api }: { title: string; meta: Meta; cat: ReturnType<typeof useCatalog>; api: MetaApi }) {
  return (
    <div className="card glass write-meta">
      <Field label="שם הפעולה" htmlFor="w-title">
        <input id="w-title" value={title} maxLength={120} onChange={(e) => api.setTitle(e.target.value)} placeholder="למשל: מה זה אומץ" />
      </Field>
      <Field label="שכבה" htmlFor="w-age">
        <select id="w-age" value={meta.ageGroup} onChange={(e) => api.patch({ ageGroup: e.target.value })}>
          <option value="">לא נבחרה</option>
          {AGE_GROUPS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </Field>
      <Field label="משך מתוכנן (דקות)" htmlFor="w-min">
        <input id="w-min" type="number" min={0} max={480} dir="ltr" value={meta.minutes ?? ""} onChange={(e) => api.patch({ minutes: clamp(e.target.value, 480) }, true)} />
      </Field>
      <Field label="גודל קבוצה" htmlFor="w-size">
        <input id="w-size" type="number" min={0} max={200} dir="ltr" value={meta.groupSize ?? ""} onChange={(e) => api.patch({ groupSize: clamp(e.target.value, 200) }, true)} />
      </Field>
      <datalist id="w-values">
        {VALUES.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <Field label="שעת התחלה" htmlFor="w-start" hint="מציגה שעה לכל שלב">
        <input id="w-start" type="time" dir="ltr" value={meta.startTime ?? ""} onChange={(e) => api.patch({ startTime: e.target.value })} />
      </Field>
      <Field label="תגיות" htmlFor="w-tags" hint="מופרדות בפסיק, עד 8">
        <input
          id="w-tags"
          defaultValue={(meta.tags ?? []).join(", ")}
          key={(meta.tags ?? []).join("|")}
          onBlur={(e) => {
            const tags = [...new Set(e.target.value.split(/[,،]/).map((x) => x.trim().slice(0, 20)).filter(Boolean))].slice(0, 8);
            if (tags.join("|") !== (meta.tags ?? []).join("|")) api.patch({ tags });
          }}
        />
      </Field>
      <Field label="שם המדריך/ה" htmlFor="w-leader" hint="יופיע בקובץ Word ובהדפסה">
        <input id="w-leader" value={meta.leader ?? ""} maxLength={60} onChange={(e) => api.patch({ leader: e.target.value }, true)} />
      </Field>
      <Field label="תאריך הפעולה" htmlFor="w-date">
        <input id="w-date" type="date" dir="ltr" value={meta.date ?? ""} onChange={(e) => api.patch({ date: e.target.value })} />
      </Field>
      <label className="check write-pin">
        <input type="checkbox" checked={!!meta.pinned} onChange={(e) => api.patch({ pinned: e.target.checked })} />
        <span>סימון בכוכב (יופיע ראשון ברשימה)</span>
      </label>
      <label className="check write-pin">
        <input type="checkbox" checked={!!meta.template} onChange={(e) => api.patch({ template: e.target.checked })} />
        <span>שמירה כתבנית אישית</span>
      </label>
      <label className="check write-pin">
        <input type="checkbox" checked={!!meta.archived} onChange={(e) => api.patch({ archived: e.target.checked })} />
        <span>העברה לארכיון</span>
      </label>
      <Field label="ערך או מטרה" htmlFor="w-value" hint="ההצעות יחברו אליו">
        <input id="w-value" list="w-values" value={meta.value ?? ""} maxLength={40} onChange={(e) => api.patch({ value: e.target.value }, true)} placeholder="למשל: אחריות" />
      </Field>
      {cat && (
        <fieldset className="write-gear">
          <legend>ציוד שיש לכם</legend>
          {cat.gear.map((g) => {
            const on = (meta.gear ?? []).includes(g.id);
            return (
              <label key={g.id} className="check-inline">
                <input type="checkbox" checked={on} onChange={() => api.patch({ gear: on ? (meta.gear ?? []).filter((x) => x !== g.id) : [...(meta.gear ?? []), g.id] })} />
                {g.label}
              </label>
            );
          })}
        </fieldset>
      )}
    </div>
  );
});
