export interface Stage {
  name: string;
  minutes: number;
  layer: string;
  content: string;
}

export interface Activity {
  id: number;
  title: string;
  durationMin: number;
  author: string | null;
  instructor: string | null;
  instructorRole: string | null;
  tribe: string;
  battalion: string;
  ageGroup: string;
  groupSize: number;
  leadingValue: string;
  equipment: string;
  safetyNotes: string;
  conclusionNote: string | null;
  activeScouting: boolean;
  energeticMode: boolean;
  isSeed: boolean;
  ownerId: number | null;
  status: string;
  tags: string[];
  methods: { name: string; minutes: number }[];
  stages: Stage[];
  snippet?: string;
  runCount?: number;
  createdAt: string;
  updatedAt: string;
  source?: "ai" | "fallback" | "external";
  rating?: RatingSummary;
}

export interface RatingSummary {
  count: number;
  average: number;
}

export interface RatingItem {
  id: number;
  stars: number;
  comment: string | null;
  author: string | null;
  ageUsed: string | null;
  createdAt: string;
}

export interface RatingsResponse extends RatingSummary {
  items: RatingItem[];
}

export interface ListResponse {
  items: Activity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionRow {
  ip: string;
  userAgent: string | null;
  firstSeen: string;
  lastSeen: string;
  username: string | null;
}

export interface LogRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  details: Record<string, unknown> | null;
}

export interface Stats {
  total: number;
  byAgeGroup: Record<string, number>;
  byValue: Record<string, number>;
  byMethod: Record<string, number>;
  generatedLast7Days: number;
  emailQueue: { status: string; c: number }[];
}

export interface Run {
  id: number;
  activityId: number;
  ranOn: string;
  groupLabel: string;
  worked: string;
  changeNext: string;
  notes: string;
  createdAt: string;
  title?: string;
}

export interface QualityIssue {
  label: string;
  phrase: string;
  why: string;
  fix: string | null;
  index: number;
  context: string;
}
export interface QualityResult {
  score: number;
  issues: QualityIssue[];
}

export interface ActivitySnapshot {
  title: string;
  ageGroup: string;
  groupSize: number;
  leadingValue: string;
  equipment: string;
  safetyNotes: string;
  conclusionNote: string | null;
  tags: string[];
  stages: Stage[];
  durationMin: number;
}
export interface VersionItem {
  id: number;
  editor: string | null;
  note: string | null;
  savedAt: string;
  snapshot: ActivitySnapshot;
}

export interface PlanSlot {
  week: number;
  date: string | null;
  wantedValue: string | null;
  note: string;
  activity: { id: number; title: string; durationMin: number; ageGroup: string; leadingValue: string } | null;
}
export interface PlanResponse {
  slots: PlanSlot[];
  coverage: { value: string; count: number; planned: number }[];
  missing: string[];
}
