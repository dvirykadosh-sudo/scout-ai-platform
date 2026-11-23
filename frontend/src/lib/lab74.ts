// שלב 74: סוגי נתונים של נתיבי המחולל החדשים, ובדיקת ציר הזמן (פריט 8).
// הקובץ טהור ובלי תלות בדפדפן: בדיקות השרת מייבאות אותו ישירות (Node 22, הסרת טיפוסים), לכן רק תחביר שאפשר למחוק.

export interface TimelineStage {
  name: string;
  minutes: number;
}
export type Phase = "opening" | "body" | "closing";
export interface TimelineSegment {
  index: number;
  name: string;
  minutes: number;
  pct: number;
  phase: Phase;
}
export interface TimelineWarning {
  id: string;
  level: "high" | "medium";
  text: string;
}
export interface TimelineResult {
  total: number;
  planned: number;
  diff: number;
  status: "empty" | "ok" | "short" | "long";
  segments: TimelineSegment[];
  warnings: TimelineWarning[];
  summary: string;
}

export const PHASE_LABELS: Record<Phase, string> = { opening: "פתיחה", body: "גוף", closing: "סיום" };

/** הסטייה המותרת בין סכום הדקות בשלבים למשך המתוכנן: 5%, ולפחות 2 דקות. */
export function timelineTolerance(planned: number): number {
  return Math.max(2, Math.round(planned * 0.05));
}

/**
 * ציר זמן של הפעולה: השלב הראשון הוא הפתיחה, האחרון הוא הסיום, והשאר הם הגוף.
 * מתריע כשסכום הדקות לא מתאים למשך, כשיש שלב בלי דקות, או כשאחד השלבים שולט בפעולה.
 */
export function timelineCheck(stages: TimelineStage[], planned: number): TimelineResult {
  const list = (stages || []).map((s) => ({ name: String(s?.name ?? ""), minutes: Math.max(0, Math.round(Number(s?.minutes) || 0)) }));
  const total = list.reduce((s, x) => s + x.minutes, 0);
  const plan = Math.max(0, Math.round(Number(planned) || 0));
  const diff = total - plan;
  const n = list.length;
  const segments: TimelineSegment[] = list.map((s, i) => ({
    index: i,
    name: s.name,
    minutes: s.minutes,
    pct: total ? Math.round((s.minutes / total) * 100) : 0,
    phase: n === 1 ? "body" : i === 0 ? "opening" : i === n - 1 ? "closing" : "body",
  }));
  const warnings: TimelineWarning[] = [];
  if (!n || !total) {
    return { total, planned: plan, diff, status: "empty", segments, warnings, summary: "אין עדיין שלבים עם דקות." };
  }
  const tol = timelineTolerance(plan);
  let status: TimelineResult["status"] = "ok";
  if (plan && Math.abs(diff) > tol) {
    status = diff > 0 ? "long" : "short";
    const big = Math.abs(diff) > Math.max(10, plan * 0.1);
    warnings.push({
      id: "sum",
      level: big ? "high" : "medium",
      text: diff > 0 ? `סכום הדקות בשלבים (${total}) גדול ב-${diff} דקות מהמשך המתוכנן (${plan}).` : `סכום הדקות בשלבים (${total}) קטן ב-${-diff} דקות מהמשך המתוכנן (${plan}).`,
    });
  }
  for (const s of segments) {
    if (s.minutes === 0) warnings.push({ id: `zero-${s.index}`, level: "medium", text: `בשלב "${s.name}" לא הוגדרו דקות.` });
  }
  if (n >= 3) {
    const longest = segments.reduce((m, x) => (x.minutes > m.minutes ? x : m), segments[0]);
    if (total && longest.minutes / total > 0.6) warnings.push({ id: "dominant", level: "medium", text: `השלב "${longest.name}" תופס ${longest.pct}% מהזמן. כדאי לוודא שיש מקום לשאר השלבים.` });
    if (segments[0].pct > 25) warnings.push({ id: "long-opening", level: "medium", text: `הפתיחה תופסת ${segments[0].pct}% מהזמן. פתיחה טובה קצרה ומעוררת עניין.` });
    const last = segments[n - 1];
    if (total >= 30 && last.minutes < 3) warnings.push({ id: "short-closing", level: "medium", text: `הסיום קצר (${last.minutes} דקות). בלי סיכום החניכים לא מגבשים מה למדו.` });
  }
  const summary = warnings.length ? `${warnings.length} הערות על חלוקת הזמן.` : `חלוקת הזמן מאוזנת: ${total} דקות.`;
  return { total, planned: plan, diff, status, segments, warnings, summary };
}

// ───────── סוגי תשובות השרת ─────────

export interface QualityDim {
  key: string;
  label: string;
  weight: number;
  score: number;
  tip: string;
}
export interface QualityReport {
  overall: number;
  grade: string;
  dimensions: QualityDim[];
  top: QualityDim[];
  best: string;
  libraryAverage: number | null;
  why: { reasons: string[]; line: string; overall: number | null };
}
export interface AgeFit {
  band: string;
  bandLabel: string;
  grade: number;
  score: number | null;
  ok: number;
  total: number;
  checks: { id: string; ok: boolean; label: string; tip: string }[];
  hints: { stage: string; hint: string }[];
}
export interface GoalInfo {
  matched: boolean;
  value: string;
  goal: string;
  indicators: string[];
  measure: string;
}
export interface ScanRisk {
  id: string;
  label: string;
  stages?: string[];
  suggestion: string;
  covered: boolean;
  severity: 1 | 2 | 3;
  origin: "base" | "ext" | "context";
}
export interface SafetyScan {
  risks: ScanRisk[];
  missingCount: number;
  ok: boolean;
  score: number;
  level: "ok" | "attention" | "high";
  addition: string;
  extended: number;
}
export interface PrivacyFinding {
  field: string;
  fieldLabel: string;
  kind: string;
  label: string;
  severity: "high" | "medium" | "low";
  auto: boolean;
  match: string;
  context: string;
}
export interface PrivacyScanResult {
  findings: PrivacyFinding[];
  count: number;
  autoCount: number;
  high: number;
  ok: boolean;
}
export interface DiffOp {
  op: "same" | "add" | "del" | "skip";
  text?: string;
  n?: number;
}
export interface VersionDiff {
  from: { id: number | string; label: string; at: string };
  to: { id: number | string; label: string; at: string };
  fields: { field: string; label: string; ops: DiffOp[] }[];
  stages: { index: number; name: string; minutes: [number, number] | null; ops: DiffOp[] }[];
  tags: { before: string[]; after: string[] } | null;
  changed: number;
}
export interface CompareItem {
  id: number;
  title: string;
  ageGroup: string;
  durationMin: number;
  groupSize: number | null;
  leadingValue: string;
  kind: string;
  methods: string[];
  stageMinutes: number[];
  gearLoad: number;
  gearItems: number;
  safetyMissing: number;
  safetyScore: number;
  quality: number;
  qualityGrade: string;
  rating: { count: number; average: number };
  runCount: number;
  access: string[];
}
export interface CompareResult {
  items: CompareItem[];
  highlights: { label: string; id: number; title: string }[];
}
export interface SavedSearchRow {
  id: number;
  name: string;
  qs: string;
  createdAt: string;
  lastSeenAt: string;
  fresh: number;
}
export interface ImportReport {
  readiness: number;
  label: string;
  issues: { id: string; level: "high" | "medium"; text: string; tip: string }[];
  duplicates: { id: number; title: string }[];
}
export interface WorkedItem {
  id: number;
  title: string;
  ageGroup: string;
  durationMin: number;
  runs: number;
  avgEngagement: number | null;
  lastRan: string;
  daysSince: number;
  note: string;
  repeatable: boolean;
}
export interface DiversityResult {
  days: number;
  source: string;
  count: number;
  score: number | null;
  level: "none" | "low" | "ok" | "good";
  flags: string[];
  kinds: { id: string; label: string; count: number }[];
  missingKinds: string[];
  topMethods: { name: string; count: number }[];
  note: string;
}
export interface HolidayEvent {
  name: string;
  date: string;
  inDays: number;
  have: number;
  items: { id: number; title: string }[];
  gap: boolean;
  idea: string | null;
}
export interface AccessTag {
  id: string;
  label: string;
}
export interface ConditionInfo {
  key: string;
  label: string;
  group: string;
}

/** תגיות הנגישות שאפשר לסנן לפיהן במאגר (אותו סדר ושמות כמו בשרת). */
export const ACCESS_FILTERS: AccessTag[] = [
  { id: "noRun", label: "בלי ריצה" },
  { id: "seated", label: "אפשר בישיבה" },
  { id: "quiet", label: "שקטה" },
  { id: "noReadWrite", label: "בלי קריאה וכתיבה" },
  { id: "noContact", label: "בלי מגע" },
  { id: "noFood", label: "בלי אוכל" },
  { id: "lightGear", label: "ציוד קל" },
];
export const MAX_ACCESS_FILTERS = 3;

/** תנאי התאמה שסותרים זה את זה. אותם זוגות כמו בשרת (יש בדיקה שמוודאת שהם זהים). */
export const CONDITION_CONFLICTS: [string, string][] = [
  ["few", "many"],
  ["beginners", "strong"],
];
export const MAX_CONDITIONS = 3;
