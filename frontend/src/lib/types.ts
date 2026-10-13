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
  status: string;
  tags: string[];
  methods: { name: string; minutes: number }[];
  stages: Stage[];
  createdAt: string;
  updatedAt: string;
  source?: "ai" | "fallback";
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
