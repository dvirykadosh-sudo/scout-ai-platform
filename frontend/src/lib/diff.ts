import type { ActivitySnapshot } from "./types";

export interface Change {
  label: string;
  before: string;
  after: string;
}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** What changed when going from `from` (an old version) to `to` (the current content). */
export function diffSnapshots(from: ActivitySnapshot, to: ActivitySnapshot): Change[] {
  const out: Change[] = [];
  const simple: [keyof ActivitySnapshot, string][] = [
    ["title", "שם הפעולה"],
    ["ageGroup", "שכבת גיל"],
    ["groupSize", "גודל קבוצה"],
    ["leadingValue", "ערך מוביל"],
    ["equipment", "ציוד"],
    ["safetyNotes", "בטיחות ורגישות"],
    ["conclusionNote", "סיכום"],
  ];
  for (const [k, label] of simple) {
    const a = String(from[k] ?? "");
    const b = String(to[k] ?? "");
    if (a !== b) out.push({ label, before: clip(a), after: clip(b) });
  }
  if (from.tags.join(",") !== to.tags.join(",")) out.push({ label: "תגיות", before: from.tags.join(", "), after: to.tags.join(", ") });
  from.stages.forEach((s, i) => {
    const t = to.stages[i];
    if (!t) return;
    if (s.minutes !== t.minutes) out.push({ label: `${s.name}: דקות`, before: String(s.minutes), after: String(t.minutes) });
    if (s.layer !== t.layer) out.push({ label: `${s.name}: שכבה חינוכית`, before: s.layer, after: t.layer });
    if (s.content !== t.content) out.push({ label: `${s.name}: תוכן`, before: clip(s.content), after: clip(t.content) });
  });
  return out;
}
