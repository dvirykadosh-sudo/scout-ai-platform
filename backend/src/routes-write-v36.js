// שלב 36 (201–220): הקרוב אליי, ציוד לשבוע, נוכחות, קריאות, קיצור ל-10 דקות.
import { z } from "zod";
import crypto from "node:crypto";
import { metaDefaults } from "./routes-write.js";

export const CHEERS = [
  { mood: "אנרגיה", title: "קריאת פתיחה", call: "מי אנחנו?", reply: "הצופים! (בשיא הקול)" },
  { mood: "אנרגיה", title: "שאגה עולה", call: "מתחילים בלחישה, ובכל פעם חזק יותר: אנחנו… כאן… עכשיו!", reply: "כולם יחד, ובסוף קפיצה" },
  { mood: "אנרגיה", title: "מחיאה מתגלגלת", call: "מחיאה אחת, שתיים, שלוש, ועוד אחת גדולה", reply: "הקבוצה חוזרת אחריכם" },
  { mood: "אנרגיה", title: "מי פה הכי חזק", call: "מי פה?", reply: "אנחנו פה! ומי חזק? אנחנו חזקים!" },
  { mood: "אנרגיה", title: "גל", call: "גל מימין לשמאל, אחרי זה משמאל לימין", reply: "כל אחד קם ומתיישב בתורו" },
  { mood: "אנרגיה", title: "מיקס קצבים", call: "דפיקה על הברכיים, מחיאה, נקישת אצבעות", reply: "חוזרים על הקצב ומאיצים" },
  { mood: "שקט", title: "מעגל נשימה", call: "שואפים ביחד לאט, עוצרים רגע, נושפים", reply: "שלוש פעמים בשקט" },
  { mood: "שקט", title: "משפט אחד", call: "כל אחד אומר מילה אחת על איך הוא מרגיש", reply: "עוברים במעגל בלי להגיב" },
  { mood: "שקט", title: "העברת לחיצה", call: "לוחצים יד של השכן בשקט, והלחיצה עוברת במעגל", reply: "הלחיצה חוזרת למי שהתחיל" },
  { mood: "שקט", title: "דקת הקשבה", call: "עוצמים עיניים ומנסים לשמוע שלושה צלילים", reply: "אחר כך כל אחד מספר מה שמע" },
  { mood: "כבוד", title: "פתיחה לטקס", call: "בדומייה, מסדר", reply: "עומדים זקופים ומחכים לסימן" },
  { mood: "כבוד", title: "הבטחה משותפת", call: "אני מבטיח לעשות כמיטב יכולתי", reply: "כולם חוזרים משפט אחר משפט" },
  { mood: "כבוד", title: "תודה במעגל", call: "כל אחד אומר תודה על דבר אחד מהשבוע", reply: "בלי הערות, רק מקשיבים" },
  { mood: "כבוד", title: "ברכת סיום", call: "ביחד, יד ביד", reply: "הפה אחד: להתראות בשבוע הבא" },
  { mood: "צחוק", title: "הד", call: "המדריך אומר משפט מצחיק, והקבוצה חוזרת בלחישה", reply: "ואז בצעקה" },
  { mood: "צחוק", title: "שפת בעלי חיים", call: "כל אחד בוחר חיה ומדבר רק בקול שלה", reply: "אחרי דקה מנסים לנהל שיחה" },
  { mood: "צחוק", title: "הפוך", call: "כשאומרים 'ימינה' כולם זזים שמאלה", reply: "והפוך, ומי שטועה מקבל תפקיד מצחיק" },
  { mood: "צחוק", title: "פסל חי", call: "מי שנוגעים בו קופא בפוזה", reply: "הקבוצה מנחשת מה הפסל מייצג" },
  { mood: "ריכוז", title: "ספירה משותפת", call: "סופרים עד 20 בלי שיגידו אותו מספר שניים בו-זמנית", reply: "אם התנגשו, מתחילים מחדש" },
  { mood: "ריכוז", title: "העתק אותי", call: "מדריך עושה תנועה, כולם מעתיקים רגע אחר כך", reply: "מסלימים בהדרגה" },
  { mood: "ריכוז", title: "מי הוביל", call: "אחד יוצא החוצה, אחר מוביל תנועות במעגל", reply: "היוצא חוזר ומנחש מי מוביל" },
  { mood: "ריכוז", title: "מילה אחרי מילה", call: "בונים סיפור, כל אחד מוסיף מילה אחת", reply: "עד שהסיפור נסגר" },
];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const nid = () => crypto.randomBytes(5).toString("hex");

export function registerWriteV36Routes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 60);
  const mine = (id, uid) => db.prepare("SELECT * FROM write_docs WHERE id = ? AND owner_id = ?").get(id, uid);

  /** 201, 202, 209: פעולות קרובות עם ציוד להכנה. */
  app.get("/api/write/upcoming", requireUser(), lim, (req, res) => {
    const t = today(), end = addDays(t, 14);
    const rows = db.prepare("SELECT id, title, meta_json, blocks_json FROM write_docs WHERE owner_id = ?").all(req.user.id);
    const items = [];
    for (const r of rows) {
      let m;
      try {
        m = metaDefaults(JSON.parse(r.meta_json));
      } catch {
        continue;
      }
      if (m.template || m.archived || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || m.date < t || m.date > end) continue;
      const blocks = JSON.parse(r.blocks_json);
      items.push({ id: r.id, title: r.title || "פעולה ללא שם", date: m.date, daysLeft: Math.round((Date.parse(m.date) - Date.parse(t)) / 86400000), minutes: m.minutes ?? blocks.reduce((s, b) => s + (b.minutes || 0), 0), equipment: m.equipment, stages: blocks.length });
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    const week = items.filter((i) => i.daysLeft <= 7);
    const merged = new Map();
    for (const i of week) for (const e of i.equipment) { const k = e.trim(); if (!merged.has(k)) merged.set(k, []); merged.get(k).push(i.title); }
    res.json({ today: t, items, tomorrow: items.filter((i) => i.daysLeft === 1), equipmentWeek: [...merged].map(([name, forDocs]) => ({ name, forDocs })) });
  });

  /** 206: נוכחות. */
  const attZ = z.object({ names: z.array(z.string().trim().min(1).max(40)).max(80), present: z.array(z.string().trim().min(1).max(40)).max(80) });
  app.get("/api/write/docs/:id/attendance", requireUser(), lim, (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
    const a = db.prepare("SELECT names_json, present_json, updated_at FROM write_attendance WHERE doc_id = ?").get(d.id);
    // הצעת שמות מהמסמך האחרון שיש לו רשימה
    const last = a ? null : db.prepare("SELECT names_json FROM write_attendance WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 1").get(req.user.id);
    res.json({ names: JSON.parse(a?.names_json ?? last?.names_json ?? "[]"), present: JSON.parse(a?.present_json ?? "[]"), updatedAt: a?.updated_at ?? null });
  });
  app.put("/api/write/docs/:id/attendance", requireUser(), lim, (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
    const v = attZ.parse(req.body ?? {});
    const names = [...new Set(v.names)];
    const present = v.present.filter((p) => names.includes(p));
    db.prepare("INSERT INTO write_attendance (doc_id, owner_id, names_json, present_json, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(doc_id) DO UPDATE SET names_json=excluded.names_json, present_json=excluded.present_json, updated_at=excluded.updated_at").run(d.id, req.user.id, JSON.stringify(names), JSON.stringify(present), new Date().toISOString());
    res.json({ names, present });
  });
  app.get("/api/write/attendance/stats", requireUser(), lim, (req, res) => {
    const rows = db.prepare("SELECT names_json, present_json FROM write_attendance WHERE owner_id = ?").all(req.user.id);
    const stat = new Map();
    for (const r of rows) {
      const names = JSON.parse(r.names_json), present = new Set(JSON.parse(r.present_json));
      for (const n of names) { const s = stat.get(n) ?? { name: n, came: 0, total: 0 }; s.total++; if (present.has(n)) s.came++; stat.set(n, s); }
    }
    res.json({ sessions: rows.length, people: [...stat.values()].sort((a, b) => b.came / b.total - a.came / a.total) });
  });

  /** 214: קריאות ופעילויות קול. */
  app.get("/api/write/cheers", requireUser(), lim, (req, res) => res.json(CHEERS));

  /** 220: עותק מקוצר ל-10 דקות. */
  app.post("/api/write/docs/:id/short10", requireUser(), limiter(60_000, 20), (req, res) => {
    const d = mine(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
    if (db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c >= 200) return res.status(409).json(fail("LIMIT", "הגעתם למספר המסמכים המרבי"));
    const blocks = JSON.parse(d.blocks_json);
    const pick = blocks.length <= 3 ? blocks : [blocks[0], blocks.find((b) => b.kind === "peak") ?? blocks[Math.floor(blocks.length / 2)], blocks[blocks.length - 1]].filter((b, i, a) => a.indexOf(b) === i);
    const weights = pick.map((b) => (b.kind === "peak" ? 5 : b.kind === "open" ? 2 : b.kind === "close" ? 2 : 3));
    const sum = weights.reduce((x, y) => x + y, 0);
    const out = pick.map((b, i) => {
      const lines = String(b.text || "").split("\n").filter((l) => l.trim());
      return { ...b, id: nid(), done: false, minutes: Math.max(1, Math.round((10 * weights[i]) / sum)), text: lines.slice(0, 4).join("\n"), note: b.note || "" };
    });
    const m = { ...JSON.parse(d.meta_json), minutes: 10, template: false, archived: false, pinned: false, runs: [], date: "" };
    const at = new Date().toISOString();
    const r = db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)").run(req.user.id, `${d.title || "פעולה"} (קיצור 10 דק')`.slice(0, 120), JSON.stringify(m), JSON.stringify(out), d.words, at, at);
    res.status(201).json({ id: Number(r.lastInsertRowid), stages: out.length });
  });
}
