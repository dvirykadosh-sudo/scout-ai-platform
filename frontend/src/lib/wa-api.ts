// לקוח ה-API של מרכז הוואטסאפ (/api/admin/wa/*, מנהל ראשי בלבד). טיפוסים לפי מה שהשרת מחזיר.
import { API_URL, ApiError, api } from "./api";

export type BridgeState = "offline" | "starting" | "qr" | "connected" | "disconnected" | "reconnecting" | "conflict";
export type Audience = "guides" | "parents" | "trainees" | "other";
export type JobStatus = "queued" | "leased" | "sent" | "failed" | "cancelled";

export interface WaSettings {
  enabled: boolean;
  minGapSec: number;
  maxGapSec: number;
  perCharMs: number;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  perContactCooldownSec: number;
  quietFrom: string;
  quietTo: string;
  pauseShabbat: boolean;
  warmup: boolean;
  breakerFails: number;
  breakerPauseMin: number;
  botEnabled: boolean;
  botGroups: boolean;
  maxQueue: number;
}

export interface WaBridge {
  id: number;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  lastState: string | null;
  phoneHint: string | null;
  version: string | null;
  revokedAt: string | null;
}

export interface WaStatus {
  bridge: { state: BridgeState; account: { hint: string; name: string } | null; version: string | null; lastSeenMs: number | null; qrSvg: string | null; qrImage: string | null };
  queue: { counts: Record<string, number>; queued: number; sent: { minute: number; hour: number; day: number }; nextAllowedInMs: number; breakerUntil: string | null; reason: string; retryInMs: number };
  settings: WaSettings;
  bridges: WaBridge[];
  publicUrl: string | null;
}

export interface WaContact {
  id: number;
  kind: "person" | "group";
  name: string;
  waId: string;
  battalion: string;
  role: string;
  audience: Audience;
  userId: number | null;
  optedOut: boolean;
  botAllowed: boolean;
  note: string;
}
export interface ContactInput {
  kind: "person" | "group";
  name: string;
  phone?: string;
  waId?: string;
  battalion?: string;
  role?: string;
  audience: Audience;
  botAllowed?: boolean;
  optedOut?: boolean;
  note?: string;
}

export interface WaJob {
  id: number;
  contactId: number | null;
  contactName: string | null;
  body: string;
  status: JobStatus;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  source: string;
  expectsRsvp: boolean;
  createdAt: string;
  sentAt: string | null;
}

export interface WaTemplate { id: number; name: string; category: string; body: string; updatedAt: string }
export interface WaVariable { name: string; key: string; help: string; sample: string }
export interface WaRule { id: number; name: string; kind: "weekly" | "before_activity"; enabled: boolean; config: Record<string, unknown>; lastRunAt: string | null; summary: string }
export interface WaLogRow { id: number; at: string; jobId: number | null; contactName: string | null; hint: string | null; status: string; detail: string | null; source: string | null }
export interface WaInboxItem { id: number; at: string; contactId: number | null; contactName: string; isGroup: boolean; text: string; handled: string }
export interface WaGroup { id: string; name: string; size: number }
export interface RsvpSummary { yes: number; no: number; maybe: number; none: number; people: { id: number; name: string; battalion: string; answer: string | null; at: string | null }[] }
export interface BroadcastInput { contactIds: number[]; template: string; whenIso?: string; rsvp?: boolean; eventTitle?: string; confirmTrainees?: boolean }
export interface SendResult { jobId?: number; created?: unknown[]; skipped?: unknown[] }

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const AUDIENCE_LABEL: Record<Audience, string> = { guides: "מדריכים", parents: "הורים", trainees: "חניכים", other: "אחר" };

/** קריאות ה-API עם האסימון של המנהל */
export function waApi(token: string) {
  const A = "/api/admin/wa";
  const call = <T>(path: string, method = "GET", body?: unknown) => api<T>(`${A}${path}`, { method, body, token });
  return {
    status: () => call<WaStatus>("/status"),
    saveSettings: (s: Partial<WaSettings>) => call<WaSettings>("/settings", "PUT", s),
    clearBreaker: () => call<{ ok: boolean }>("/breaker/clear", "POST", {}),
    createBridge: (name: string) => call<{ id: number; token: string; note: string }>("/bridges", "POST", { name }),
    revokeBridge: (id: number) => call<{ ok: boolean }>(`/bridges/${id}`, "DELETE"),

    contacts: (p: { q?: string; audience?: string; kind?: string } = {}) => call<WaContact[]>(`/contacts${qs(p)}`),
    addContact: (c: ContactInput) => call<WaContact>("/contacts", "POST", c),
    updateContact: (id: number, c: Partial<ContactInput>) => call<WaContact>(`/contacts/${id}`, "PUT", c),
    deleteContact: (id: number) => call<{ ok: boolean }>(`/contacts/${id}`, "DELETE"),
    groups: () => call<{ at: number; items: WaGroup[] }>("/groups"),
    importGroups: (ids: string[], audience: Audience) => call<{ added: number }>("/groups/import", "POST", { ids, audience }),

    templates: () => call<{ templates: WaTemplate[]; variables: WaVariable[] }>("/templates"),
    saveTemplate: (id: number | null, t: { name: string; category: string; body: string }) => call<WaTemplate>(id ? `/templates/${id}` : "/templates", id ? "PUT" : "POST", t),
    deleteTemplate: (id: number) => call<{ ok: boolean }>(`/templates/${id}`, "DELETE"),
    preview: (body: string, contactId?: number) => call<{ text: string; missing: string[]; validation: { ok: boolean; unknown: string[] } }>("/templates/preview", "POST", { body, contactId }),

    jobs: (p: { status?: string; contactId?: number; limit?: number } = {}) => call<WaJob[]>(`/jobs${qs(p)}`),
    send: (b: { contactId: number; text: string; whenIso?: string; confirmTrainees?: boolean }) => call<SendResult>("/jobs/send", "POST", b),
    broadcast: (b: BroadcastInput) => call<SendResult>("/jobs/broadcast", "POST", b),
    cancelJob: (id: number) => call<{ ok: boolean }>(`/jobs/${id}/cancel`, "POST", {}),
    retryJob: (id: number) => call<{ ok: boolean }>(`/jobs/${id}/retry`, "POST", {}),

    log: (p: { status?: string; q?: string; limit?: number; offset?: number } = {}) => call<{ total: number; rows: WaLogRow[] }>(`/log${qs(p)}`),
    stats: () => call<{ days: { day: string; status: string; c: number }[]; counts: Record<string, number> }>("/stats"),

    rules: () => call<WaRule[]>("/rules"),
    saveRule: (id: number | null, r: { name: string; kind: string; enabled: boolean; config: Record<string, unknown> }) => call<WaRule>(id ? `/rules/${id}` : "/rules", id ? "PUT" : "POST", r),
    deleteRule: (id: number) => call<{ ok: boolean }>(`/rules/${id}`, "DELETE"),
    runRules: () => call<{ created: number }>("/rules/run", "POST", {}),

    rsvpEvents: () => call<{ key: string; title: string; lastSent: string; sent: number }[]>("/rsvp"),
    rsvp: (key: string) => call<RsvpSummary>(`/rsvp/${encodeURIComponent(key)}`),

    inbox: (contactId?: number) => call<WaInboxItem[]>(`/inbox${qs({ contactId })}`),
    reply: (contactId: number, text: string) => call<{ jobId: number }>(`/inbox/${contactId}/reply`, "POST", { text }),
  };
}

/** הורדת יומן השליחות כ-CSV (צריך כותרת הרשאה, ולכן לא קישור רגיל) */
export async function downloadLogCsv(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/wa/log.csv`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(res.status, "EXPORT", "הורדת היומן נכשלה");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "wa-log.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
