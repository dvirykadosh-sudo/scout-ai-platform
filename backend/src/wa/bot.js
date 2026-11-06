// שלב 58 – הבוט השבטי. מקבל הודעה נכנסת ומחליט: להתעלם, לרשום אישור הגעה, לטפל בהסרה, או לענות על פקודה.
// עקרונות אבטחה: עונה רק לאנשי קשר מוגדרים שסומנו "מורשה לבוט" (מדריכים), רק על שאילתות קריאה מוכרות,
// לעולם לא על מידע של חניכים, בקצב מוגבל לכל שולח, ולא עונה להודעות של עצמו (הגנה מלולאות).
import * as repo from "./repo.js";
import { enqueue } from "./queue.js";
import { upcomingForUser, upcomingTeam, searchLibrary, eventLine } from "./site-data.js";
import { ilParts } from "./il-time.js";

export const SIGNATURE = "🤖 מעוז: ";
const MAX_IN = 2000;
// בקבוצה הבוט עונה רק כשפונים אליו במפורש: "!מעוז ..." או "@מעוז ..." (לא כל הודעה שמתחילה במילה מעוז)
const GROUP_TRIGGER = /^\s*[!@]\s*מעוז(?![א-ת])[\s,:-]*/;
const BOT_PER_HOUR = 8;

/** נירמול להשוואה: בלי ניקוד ופיסוק, אותיות קטנות, רווחים בודדים. */
export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const OPT_OUT = new Set(["הסר", "הסרה", "הסירו", "תסירו", "stop", "עצור", "הפסק", "unsubscribe"]);
const OPT_IN = new Set(["הצטרף", "חזרה", "התחל", "start", "הצטרפות"]);
const ANSWERS = {
  yes: ["1", "כן", "מגיע", "מגיעה", "בא", "באה", "אגיע", "נגיע", "אישור", "מאשר", "מאשרת"],
  no: ["2", "לא", "לא מגיע", "לא מגיעה", "לא אוכל", "לא אגיע", "לא נגיע", "מבטל", "מבטלת"],
  maybe: ["3", "אולי", "לא בטוח", "לא בטוחה", "עוד לא יודע", "עוד לא יודעת"],
};
const ACK = { yes: "תודה! רשמתי שאתם מגיעים ✅", no: "תודה על העדכון, רשמתי שלא תגיעו.", maybe: "רשמתי: אולי. עדכנו כשתדעו 🙂" };

/** מזהה תשובת אישור הגעה: מספר/מילה בלבד, או תחילת משפט קצר. */
export function parseRsvp(text) {
  const t = norm(text);
  if (!t || t.length > 40) return null;
  for (const [k, words] of Object.entries(ANSWERS)) if (words.some((w) => t === w)) return k;
  // "לא" בתחילת משפט גובר על "כן" בהמשכו (למשל "לא, אי אפשר")
  for (const k of ["no", "maybe", "yes"]) if (ANSWERS[k].some((w) => t.startsWith(`${w} `))) return k;
  return null;
}

const HELP = ["אני הבוט של שבט מעוז. אפשר לכתוב לי:", "• *הפעולה הבאה*", "• *פעולות השבוע*", "• *מה להביא*", "• *חפש* ואחריו נושא (למשל: חפש אחריות)", "• *אירועי השבט*", "• *הסר* כדי להפסיק לקבל הודעות"].join("\n");

/** מפענח פקודה מהטקסט המנורמל. מחזיר { cmd, arg } או null. */
export function resolveCommand(t) {
  if (/^(עזרה|תפריט|help|מה אתה יודע)$/.test(t)) return { cmd: "help" };
  const s = t.match(/^(?:חפש|חיפוש|פעולה על|רעיון ל|פעולות על)\s+(.{2,60})$/);
  if (s) return { cmd: "search", arg: s[1] };
  if (/(פעולה הבאה|הפעולה הבאה|מתי הפעולה|מתי הפעולה הבאה|מה הפעולה הבאה)/.test(t)) return { cmd: "next" };
  if (/(פעולות השבוע|מה יש השבוע|מה השבוע|הלוז שלי|לוז השבוע|^השבוע$)/.test(t)) return { cmd: "week" };
  if (/(מה להביא|מה צריך להביא|ציוד)/.test(t)) return { cmd: "gear" };
  if (/(אירועי השבט|מה קורה בשבט|לוח השבט|לוח הצוות)/.test(t)) return { cmd: "team" };
  return null;
}

/** ההודעה שהבוט יענה לפקודה. deps.publicUrl לקישורים. */
export function answerCommand(db, contact, cmd, deps = {}) {
  const base = deps.publicUrl || "";
  switch (cmd.cmd) {
    case "help":
      return HELP;
    case "next": {
      const mine = contact.userId ? upcomingForUser(db, contact.userId, { days: 30, limit: 1 })[0] : null;
      if (mine) return `הפעולה הבאה שלך:\n${eventLine(mine)}${mine.duration_min ? `\nמשך: ${mine.duration_min} דקות` : ""}`;
      const t = upcomingTeam(db, { limit: 1 })[0];
      return t ? `אין פעולה ביומן האישי שלך. האירוע הבא בשבט:\n${eventLine({ ...t, group_label: t.age_group })}` : "אין כרגע פעולה ביומן שלך או אירוע בלוח השבט.";
    }
    case "week": {
      const rows = contact.userId ? upcomingForUser(db, contact.userId, { days: 7, limit: 6 }) : [];
      return rows.length ? `השבוע ביומן שלך:\n${rows.map((r) => `• ${eventLine(r)}`).join("\n")}` : "אין פעולות ביומן שלך ל-7 הימים הקרובים.";
    }
    case "gear": {
      const r = contact.userId ? upcomingForUser(db, contact.userId, { days: 30, limit: 3 }).find((x) => x.equipment) : null;
      return r ? `הציוד לפעולה "${r.title}":\n${String(r.equipment).slice(0, 400)}` : "לא מצאתי פעולה קרובה עם רשימת ציוד ביומן שלך.";
    }
    case "team": {
      const rows = upcomingTeam(db, { limit: 5 });
      return rows.length ? `אירועי השבט הקרובים:\n${rows.map((r) => `• ${eventLine({ ...r, group_label: r.age_group })}`).join("\n")}` : "אין אירועים בלוח השבט ב-14 הימים הקרובים.";
    }
    case "search": {
      const rows = searchLibrary(db, cmd.arg, 3);
      return rows.length ? `מצאתי:\n${rows.map((r) => `• ${r.title} (${r.age_group}, ${r.duration_min} דק')${base ? `\n  ${base}/library/${r.id}` : ""}`).join("\n")}` : `לא מצאתי פעולה בנושא "${cmd.arg}".`;
    }
    default:
      return HELP;
  }
}

/**
 * מטפל בהודעה נכנסת אחת. msg: { id, from, isGroup, groupId, text }.
 * מחזיר { handled } (מחרוזת לתיעוד) ו-{ replyJobId } אם נוצרה תשובה.
 */
export function handleInbound(db, settings, msg, deps = {}) {
  const nowMs = deps.now ?? Date.now();
  const text = String(msg.text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, MAX_IN).trim();
  if (repo.inboxSeen(db, msg.id)) return { handled: "duplicate" };
  if (!text || text.startsWith("🤖")) return { handled: "ignored" };

  const sender = repo.getContactByWaId(db, msg.from);
  // מספר לא מוכר: לא שומרים את הטקסט ולא עונים
  if (!sender) { repo.insertInbox(db, { msgId: msg.id, isGroup: msg.isGroup, handled: "unknown" }); return { handled: "unknown" }; }
  const group = msg.isGroup ? repo.getContactByWaId(db, msg.groupId) : null;
  if (msg.isGroup && !group) { repo.insertInbox(db, { msgId: msg.id, isGroup: true, handled: "unknown-group" }); return { handled: "unknown-group" }; }

  const store = (handled) => repo.insertInbox(db, { msgId: msg.id, contactId: sender.id, isGroup: msg.isGroup, text: text.slice(0, 300), handled });
  const reply = (to, body, opts = {}) => enqueue(db, settings, { contact: to, body: `${SIGNATURE}${body}`, source: "bot", priority: 1, runAtMs: nowMs, ...opts });
  const t = norm(text);

  if (!msg.isGroup) {
    if (OPT_OUT.has(t)) {
      repo.setOptedOut(db, sender.id, true);
      store("optout");
      const r = reply(sender, "הוסרתם מהרשימה ולא תקבלו עוד הודעות. כדי לחזור כתבו: הצטרף", { source: "bot-optout" });
      return { handled: "optout", replyJobId: r.id };
    }
    if (OPT_IN.has(t) && sender.optedOut) {
      repo.setOptedOut(db, sender.id, false);
      store("optin");
      return { handled: "optin", replyJobId: reply({ ...sender, optedOut: false }, "ברוכים השבים! תקבלו שוב הודעות.").id };
    }
  }
  if (sender.optedOut) { store("optedout"); return { handled: "optedout" }; }

  if (!msg.isGroup) {
    const pending = repo.pendingRsvpJob(db, sender.id, new Date(nowMs - 4 * 86_400_000).toISOString());
    const ans = pending && parseRsvp(text);
    if (ans) {
      repo.setRsvp(db, pending.eventKey, sender.id, ans);
      store("rsvp");
      return { handled: "rsvp", answer: ans, replyJobId: reply(sender, ACK[ans]).id };
    }
  }

  // מכאן: פקודות. רק אם הבוט פעיל והשולח מורשה (מדריך)
  if (!settings.botEnabled || !sender.botAllowed || sender.audience !== "guides") { store("stored"); return { handled: "stored" }; }
  let body = t;
  if (msg.isGroup) {
    if (!settings.botGroups || !group.botAllowed || !GROUP_TRIGGER.test(text)) { store("stored"); return { handled: "stored" }; }
    body = norm(text.replace(GROUP_TRIGGER, ""));
  }
  if (repo.botRepliesSince(db, sender.id, new Date(nowMs - 3_600_000).toISOString()) >= BOT_PER_HOUR) { store("rate-limited"); return { handled: "rate-limited" }; }
  const cmd = resolveCommand(body);
  const to = msg.isGroup ? group : sender;
  if (!cmd) {
    const recent = repo.botRepliesSince(db, sender.id, new Date(nowMs - 600_000).toISOString());
    store("unknown-command");
    if (recent) return { handled: "unknown-command" };
    return { handled: "unknown-command", replyJobId: reply(to, "לא הבנתי. כתבו *עזרה* כדי לראות מה אפשר לשאול.").id };
  }
  store(`cmd:${cmd.cmd}`);
  const r = reply(to, answerCommand(db, sender, cmd, deps));
  return { handled: `cmd:${cmd.cmd}`, replyJobId: r.id };
}

export { ilParts };
