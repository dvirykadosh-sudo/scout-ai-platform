// שלב 58 – כלים בסגנון MCP: רשימת פעולות קטנות, לכל אחת שם, תיאור, סכמת קלט (JSON Schema) ופונקציה.
// אותם כלים משרתים את מסך הניהול (REST), ואפשר לחבר אליהם בעתיד שרת MCP אמיתי בלי לשנות את הלוגיקה.
// כל קלט עובר אימות zod לפני שהפונקציה רצה.
import { z } from "zod";
import * as repo from "./repo.js";
import { enqueue, enqueueMany, overview } from "./queue.js";
import { liveStatus } from "./status.js";
import { renderTemplate, sampleValues, valuesFor, validateTemplate } from "./templates.js";
import { upcomingForUser, upcomingTeam, searchLibrary } from "./site-data.js";
import { waHint } from "./phone.js";

const MAX_BROADCAST = 60;
const when = z.string().datetime({ offset: true }).optional().describe("מועד שליחה (ISO). בלי ערך: מיד.");
const runAt = (iso) => (iso ? Math.max(Date.now(), Date.parse(iso)) : Date.now());
const brief = (j) => ({ id: j.id, to: j.contactName, status: j.status, runAt: j.runAt, source: j.source, text: (j.body || "").slice(0, 120), error: j.error });

/** הגנה על קטינים: שליחה לקבוצת חניכים דורשת אישור מפורש. */
function traineeGuard(contacts, confirm) {
  const t = contacts.filter((c) => c.audience === "trainees");
  return t.length && !confirm ? `בין הנמענים יש ${t.length} אנשי קשר מקהל "חניכים". לשליחה יש לאשר במפורש (confirmTrainees) ולוודא שזה תואם את נוהל התנועה.` : null;
}

export const TOOLS = [
  {
    name: "wa_status",
    description: "מצב החיבור לוואטסאפ ומצב התור (בלי QR).",
    input: z.object({}),
    run: ({ db, settings }) => ({ bridge: { ...liveStatus(), qr: undefined }, queue: overview(db, settings) }),
  },
  {
    name: "wa_queue",
    description: "משימות בתור או שנשלחו לאחרונה. אפשר לסנן לפי סטטוס (queued,sent,failed...).",
    input: z.object({ status: z.string().max(60).optional(), limit: z.number().int().min(1).max(50).default(20) }),
    run: ({ db }, a) => repo.listJobs(db, { status: a.status, limit: a.limit }).map(brief),
  },
  {
    name: "wa_contacts",
    description: "אנשי קשר וקבוצות (הטלפון מוצג מוסתר).",
    input: z.object({ q: z.string().max(60).optional(), kind: z.enum(["person", "group"]).optional() }),
    run: ({ db }, a) => repo.listContacts(db, a).map((c) => ({ id: c.id, name: c.name, kind: c.kind, battalion: c.battalion, audience: c.audience, optedOut: c.optedOut, phone: waHint(c.waId) })),
  },
  {
    name: "wa_send",
    description: "שולח (או מתזמן) הודעה אחת לאיש קשר. ההודעה נכנסת לתור ויוצאת בקצב מבוקר.",
    input: z.object({ contactId: z.number().int(), text: z.string().min(1).max(4000), whenIso: when, confirmTrainees: z.boolean().optional() }),
    run: ({ db, settings, actor }, a) => {
      const c = repo.getContact(db, a.contactId);
      if (!c) return { error: "איש הקשר לא נמצא" };
      const g = traineeGuard([c], a.confirmTrainees);
      if (g) return { error: g };
      const r = enqueue(db, settings, { contact: c, body: a.text, runAtMs: runAt(a.whenIso), source: "manual", createdBy: actor });
      return r.ok ? { ok: true, jobId: r.id } : { error: `לא נוסף לתור: ${r.reason}` };
    },
  },
  {
    name: "wa_broadcast",
    description: "שולח תבנית לכמה אנשי קשר. משתנים כמו {{שם_מדריך}} מוחלפים לכל נמען. אפשר לבקש אישור הגעה (1 מגיע, 2 לא, 3 אולי).",
    input: z.object({ contactIds: z.array(z.number().int()).min(1).max(MAX_BROADCAST), template: z.string().min(1).max(4000), whenIso: when, rsvp: z.boolean().optional(), eventTitle: z.string().max(80).optional(), extra: z.record(z.string(), z.string().max(120)).optional(), confirmTrainees: z.boolean().optional() }),
    run: ({ db, settings, actor }, a) => {
      const v = validateTemplate(a.template);
      if (!v.ok) return { error: v.errors.join(". ") };
      const contacts = a.contactIds.map((id) => repo.getContact(db, id)).filter(Boolean);
      if (!contacts.length) return { error: "לא נמצאו אנשי קשר" };
      const g = traineeGuard(contacts, a.confirmTrainees);
      if (g) return { error: g };
      const eventKey = a.rsvp ? `bc:${Date.now().toString(36)}` : undefined;
      const body = a.rsvp ? `${a.template}\n\nאישור הגעה: השיבו 1 = מגיע/ה, 2 = לא מגיע/ה, 3 = אולי` : a.template;
      return enqueueMany(db, settings, contacts, (c) => renderTemplate(body, valuesFor(c, a.extra && mapExtra(a.extra))), { runAtMs: runAt(a.whenIso), source: "broadcast", eventKey, eventTitle: a.eventTitle, expectsRsvp: !!a.rsvp, createdBy: actor });
    },
  },
  {
    name: "wa_render_template",
    description: "תצוגה מקדימה של תבנית עם ערכים של איש קשר (או ערכי דוגמה).",
    input: z.object({ template: z.string().min(1).max(4000), contactId: z.number().int().optional() }),
    run: ({ db }, a) => {
      const c = a.contactId ? repo.getContact(db, a.contactId) : null;
      const r = renderTemplate(a.template, c ? valuesFor(c, sampleEvent()) : sampleValues());
      return { ...r, validation: validateTemplate(a.template) };
    },
  },
  {
    name: "wa_cancel_job",
    description: "מבטל הודעה שעוד לא נשלחה.",
    input: z.object({ jobId: z.number().int() }),
    run: ({ db }, a) => (repo.cancelJob(db, a.jobId) ? { ok: true } : { error: "אי אפשר לבטל: ההודעה נשלחה או לא קיימת" }),
  },
  {
    name: "wa_rsvp_summary",
    description: "סיכום אישורי הגעה לאירוע.",
    input: z.object({ eventKey: z.string().min(1).max(80) }),
    run: ({ db }, a) => repo.rsvpSummary(db, a.eventKey),
  },
  {
    name: "site_upcoming",
    description: "אירועים קרובים: ביומן של משתמש (userId) או בלוח הצוות.",
    input: z.object({ userId: z.number().int().optional(), days: z.number().int().min(1).max(60).default(14) }),
    run: ({ db }, a) => (a.userId ? upcomingForUser(db, a.userId, { days: a.days, limit: 10 }) : upcomingTeam(db, { days: a.days, limit: 10 })),
  },
  {
    name: "site_search",
    description: "חיפוש בפעולות המפורסמות במאגר.",
    input: z.object({ q: z.string().min(2).max(60) }),
    run: ({ db }, a) => searchLibrary(db, a.q, 5),
  },
];

const sampleEvent = () => ({ date: "יום חמישי, 5.11", day: "חמישי", time: "17:30", activity: "אחריות אישית", event: "ישיבת שכב\"ג", place: "המועדון" });
const KEYMAP = { תאריך: "date", יום: "day", שעה: "time", שם_פעולה: "activity", אירוע: "event", מקום: "place", הערה: "note" };
const mapExtra = (x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [KEYMAP[k] ?? k, v]));

/** תיאור הכלים (שם, תיאור, JSON Schema) למסך הניהול או לשרת MCP עתידי. */
export const describeTools = () => TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.input) }));

/** מריץ כלי לפי שם. מחזיר { result } או { error }. ctx: { db, settings, actor } */
export function callTool(ctx, name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: "כלי לא קיים", status: 404 };
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) return { error: "קלט לא תקין: " + parsed.error.issues.map((i) => `${i.path.join(".") || "_"} ${i.message}`).join("; "), status: 400 };
  const out = tool.run(ctx, parsed.data);
  return out?.error ? { error: out.error, status: 422 } : { result: out };
}
