"use client";

// שלב 36 (201–220): הקרוב אליי, ציוד לשבוע, כלים נוספים לעורך (זמנים, קריאות, נוכחות, קיצור ל-10 דקות).
import type { V50Tool } from "./WriteV50";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Modal } from "./ui";
import { sumMinutes, type Snap } from "./WriteParts";

interface Upcoming {
  items: { id: number; title: string; date: string; daysLeft: number; minutes: number; equipment: string[]; stages: number }[];
  tomorrow: { id: number; title: string }[];
  equipmentWeek: { name: string; forDocs: string[] }[];
}
const when = (n: number) => (n === 0 ? "היום" : n === 1 ? "מחר" : `בעוד ${n} ימים`);

/** 209 + 201: הפעולה הבאה, וציוד לכל הפעולות של השבוע. */
export function UpcomingCard() {
  const { token } = useAuth();
  const [u, setU] = useState<Upcoming | null>(null);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!token) return;
    api<Upcoming>("/api/write/upcoming", { token }).then(setU).catch(() => {});
  }, [token]);
  if (!token || !u || !u.items.length) return null;
  const next = u.items[0];
  return (
    <section className="card" aria-labelledby="upc-h" style={{ marginBottom: 16 }}>
      <h2 id="upc-h">הפעולה הבאה שלי</h2>
      <p>
        <strong>{next.title}</strong> · {when(next.daysLeft)} ({next.date}) · {next.minutes} דקות · {next.stages} שלבים
      </p>
      {u.tomorrow.length > 0 && <p role="status">מחר יש לך פעולה. כדאי להכין ציוד היום.</p>}
      <div className="actions">
        <Link className="btn btn-primary" href={`/write/${next.id}`}>
          פתיחת הפעולה
        </Link>
        {u.equipmentWeek.length > 0 && (
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            ציוד לשבוע ({u.equipmentWeek.length})
          </button>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="ציוד לכל הפעולות של השבוע" footer={<button type="button" className="btn" onClick={() => setOpen(false)}>סגירה</button>}>
        <ul className="plain-list">
          {u.equipmentWeek.map((e) => (
            <li key={e.name}>
              <label className="check">
                <input type="checkbox" checked={!!checked[e.name]} onChange={(ev) => setChecked({ ...checked, [e.name]: ev.target.checked })} />
                <span>
                  {e.name} <small>({e.forDocs.join(", ")})</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-small" onClick={() => void navigator.clipboard.writeText(u.equipmentWeek.map((e) => `☐ ${e.name}`).join("\n"))}>
          העתקת הרשימה
        </button>
      </Modal>
    </section>
  );
}

interface Cheer {
  mood: string;
  title: string;
  call: string;
  reply: string;
}
interface Att {
  names: string[];
  present: string[];
}

/** 206, 212, 214, 220: כלים נוספים לעורך. */
export function MoreToolsModal({ open, onClose, snap, docId, token, onInsert, onOpened, onTool }: { open: boolean; onClose: () => void; snap: Snap; docId: number; token: string | null; onInsert: (t: string) => void; onOpened: (id: number) => void; onTool: (t: "voice" | "safety" | "age" | "questions" | "map" | "read" | "practice" | "story" | "print" | "stage" | V50Tool) => void }) {
  const toast = useToast();
  const [cheers, setCheers] = useState<Cheer[]>([]);
  const [mood, setMood] = useState("הכול");
  const [att, setAtt] = useState<Att>({ names: [], present: [] });
  const [namesText, setNamesText] = useState("");
  const [stats, setStats] = useState<{ sessions: number; people: { name: string; came: number; total: number }[] } | null>(null);
  const planned = sumMinutes(snap.blocks);
  const target = snap.meta.minutes ?? 0;
  const diff = target ? planned - target : 0;

  const load = useCallback(() => {
    if (!token) return;
    api<Cheer[]>("/api/write/cheers", { token }).then(setCheers).catch(() => {});
    api<Att>(`/api/write/docs/${docId}/attendance`, { token }).then((a) => { setAtt(a); setNamesText(a.names.join("\n")); }).catch(() => {});
  }, [token, docId]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const saveAtt = async (names: string[], present: string[]) => {
    setAtt({ names, present });
    try {
      const r = await api<Att>(`/api/write/docs/${docId}/attendance`, { method: "PUT", token, body: { names, present } });
      setAtt(r);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const moods = useMemo(() => ["הכול", ...new Set(cheers.map((c) => c.mood))], [cheers]);
  const short10 = async () => {
    try {
      const r = await api<{ id: number }>(`/api/write/docs/${docId}/short10`, { method: "POST", token, body: {} });
      toast("נוצר עותק מקוצר. המקור לא השתנה.", { kind: "success" });
      onOpened(r.id);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const loadStats = () => api<NonNullable<typeof stats>>("/api/write/attendance/stats", { token }).then(setStats).catch((e) => toast(errorMessage(e), { kind: "error" }));

  return (
    <Modal open={open} onClose={onClose} title="כלים נוספים" wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <section aria-labelledby="mt-checks">
        <h3 id="mt-checks">בדיקות והתאמות</h3>
        <div className="actions">
          <button type="button" className="btn" onClick={() => onTool("voice")}>בדיקת קול</button>
          <button type="button" className="btn" onClick={() => onTool("safety")}>בדיקת בטיחות</button>
          <button type="button" className="btn" onClick={() => onTool("age")}>התאמה לגיל</button>
          <button type="button" className="btn" onClick={() => onTool("questions")}>שאלות לדיון לשלב</button>
        </div>
      </section>
      <section aria-labelledby="mt-create">
        <h3 id="mt-create">יצירה והדפסה</h3>
        <div className="actions">
          <button type="button" className="btn" onClick={() => onTool("map")}>מפת תחנות</button>
          <button type="button" className="btn" onClick={() => onTool("read")}>הקראה בקול</button>
          <button type="button" className="btn" onClick={() => onTool("practice")}>תרגול קולי</button>
          <button type="button" className="btn" onClick={() => onTool("story")}>פתיחה וחידון</button>
          <button type="button" className="btn" onClick={() => onTool("print")}>הדפסות ומשחקים</button>
          <button type="button" className="btn" onClick={() => onTool("stage")}>מצב במה</button>
          <button type="button" className="btn" onClick={() => onTool("illus")}>ספריית איורים</button>
          <button type="button" className="btn" onClick={() => onTool("holiday")}>תבניות לחגים</button>
          <button type="button" className="btn" onClick={() => onTool("hooks")}>שאלות פתיחה</button>
          <button type="button" className="btn" onClick={() => onTool("rules")}>כללי משחק</button>
          <button type="button" className="btn" onClick={() => onTool("translate")}>דף עזר באנגלית/רוסית</button>
          <button type="button" className="btn" onClick={() => onTool("series")}>הפעולה הבאה בסדרה</button>
          <button type="button" className="btn" onClick={() => onTool("merge")}>מיזוג שתי גרסאות</button>
          <button type="button" className="btn" onClick={() => onTool("vnotes")}>הקלטה קולית לשלב</button>
          <button type="button" className="btn" onClick={() => onTool("meter")}>מד השתתפות</button>
          <button type="button" className="btn" onClick={() => onTool("viewers")}>מי צופה עכשיו</button>
          <button type="button" className="btn btn-primary" onClick={() => onTool("box51")}>ארגז כלים (21 כלים)</button>
        </div>
      </section>
      <section aria-labelledby="mt-time">
        <h3 id="mt-time">בדיקת זמנים</h3>
        <p role="status">
          סכום השלבים: {planned} דקות{target ? `, משך מתוכנן: ${target} דקות. ` : ". "}
          {!target ? "לא הוגדר משך כולל." : diff === 0 ? "מתאים בדיוק ✓" : diff > 0 ? `חריגה של ${diff} דקות. כדאי לקצר.` : `נשארו ${-diff} דקות פנויות.`}
        </p>
      </section>
      <section aria-labelledby="mt-short">
        <h3 id="mt-short">גרסה קצרה</h3>
        <p className="hint">יוצר מסמך חדש של 10 דקות: פתיחה, שיא וסיכום, עם קיצור הטקסט. המקור נשאר כמו שהוא.</p>
        <button type="button" className="btn" onClick={short10}>
          יצירת קיצור ל-10 דקות
        </button>
      </section>
      <section aria-labelledby="mt-att">
        <h3 id="mt-att">נוכחות</h3>
        <label htmlFor="mt-names">שמות החניכים (שם בכל שורה)</label>
        <textarea id="mt-names" rows={4} value={namesText} onChange={(e) => setNamesText(e.target.value)} />
        <button type="button" className="btn btn-small" onClick={() => void saveAtt(namesText.split("\n").map((s) => s.trim()).filter(Boolean), att.present)}>
          שמירת הרשימה
        </button>
        {att.names.length > 0 && (
          <fieldset>
            <legend>מי הגיע ({att.present.length} מתוך {att.names.length})</legend>
            {att.names.map((n) => (
              <label key={n} className="check">
                <input type="checkbox" checked={att.present.includes(n)} onChange={(e) => void saveAtt(att.names, e.target.checked ? [...att.present, n] : att.present.filter((x) => x !== n))} />
                <span>{n}</span>
              </label>
            ))}
          </fieldset>
        )}
        <button type="button" className="btn btn-small" onClick={loadStats}>
          סטטיסטיקת נוכחות
        </button>
        {stats && (
          <ul className="plain-list" aria-label="נוכחות לפי חניך">
            {stats.people.map((p) => (
              <li key={p.name}>
                {p.name}: {p.came} מתוך {p.total}
              </li>
            ))}
            {!stats.people.length && <li>עוד אין נתונים</li>}
          </ul>
        )}
      </section>
      <section aria-labelledby="mt-cheer">
        <h3 id="mt-cheer">קריאות ופעילויות קול</h3>
        <label htmlFor="mt-mood">אווירה </label>
        <select id="mt-mood" value={mood} onChange={(e) => setMood(e.target.value)}>
          {moods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <ul className="plain-list">
          {cheers.filter((c) => mood === "הכול" || c.mood === mood).map((c) => (
            <li key={c.title}>
              <span>
                <strong>{c.title}</strong> ({c.mood})<br />
                {c.call} ← {c.reply}
              </span>
              <button type="button" className="btn btn-small" onClick={() => { onInsert(`**${c.title}:** ${c.call} (${c.reply})`); toast("נוסף לשלב", { kind: "success" }); }}>
                הוספה לשלב
              </button>
            </li>
          ))}
        </ul>
      </section>
    </Modal>
  );
}

const OUTDOOR = /(בחוץ|בשטח|מגרש|חורשה|פארק|טיול|יער|חצר|גינה|מסלול)/;
/** 205: פעולה בחוץ בלי תוכנית גשם. */
export function OutdoorHint({ snap, onOpen }: { snap: Snap; onOpen: () => void }) {
  const text = snap.title + " " + snap.blocks.map((b) => `${b.title} ${b.text}`).join(" ");
  const hasBackup = snap.blocks.some((b) => /(גיבוי|גשם)/.test(`${b.title} ${b.text}`));
  if (!OUTDOOR.test(text) || hasBackup) return null;
  return (
    <p className="hint" role="note">
      נראה שזו פעולה בחוץ ואין בה תוכנית לגשם.{" "}
      <button type="button" className="btn btn-small" onClick={onOpen}>
        הוספת גיבוי לגשם
      </button>
    </p>
  );
}
