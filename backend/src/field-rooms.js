// שלב 69: חדרי סנכרון לצוות הדרכה במצב שטח (SSE).
// שלב 70: החדרים והטיימר נשמרים גם בטבלת SQLite קטנה (field_rooms), כך שחדר לא נעלם כש-Render נרדם ומתעורר.
// חיבורי ה-SSE עצמם נשארים בזיכרון (אי אפשר לשמור חיבור פתוח), והדפדפן מתחבר מחדש לבד עם אותו מזהה.
// בלי שמות ובלי שום נתון אישי: רק קוד, מספר פעולה, מי פתח (מזהה פנימי), שלב, מצב טיימר וזמנים.
import { randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // בלי 0/O/1/I/L שקל לבלבל ביניהם
export const CODE_RE = /^[A-Z0-9]{6}$/;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS field_rooms (
  code TEXT PRIMARY KEY,
  activity_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  touched_at INTEGER NOT NULL,
  idx INTEGER,
  running INTEGER,
  remaining INTEGER,
  state_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_field_rooms_touched ON field_rooms(touched_at);
`;

/**
 * @param {object} [o]
 * @param {object|null} [o.db] מסד node:sqlite. בלי מסד: הכול בזיכרון בלבד (כמו בשלב 69).
 * @param {number} [o.idleMs] חדר בלי מחוברים נשמר כל כך הרבה זמן (ברירת מחדל שעתיים: מספיק כדי לשרוד השכמה של Render)
 */
export function createRooms({ now = Date.now, maxRooms = 300, maxClients = 12, ttlMs = 6 * 3600_000, idleMs = 2 * 3600_000, pingMs = 20_000, timers = true, db = null } = {}) {
  const rooms = new Map(); // code -> room (עם חיבורי SSE חיים)
  const q = db
    ? (db.exec(SCHEMA),
      {
        insert: db.prepare("INSERT INTO field_rooms (code, activity_id, owner_id, created_at, touched_at) VALUES (?,?,?,?,?)"),
        row: db.prepare("SELECT * FROM field_rooms WHERE code = ?"),
        touch: db.prepare("UPDATE field_rooms SET touched_at = ? WHERE code = ?"),
        state: db.prepare("UPDATE field_rooms SET idx = ?, running = ?, remaining = ?, state_at = ?, touched_at = ? WHERE code = ?"),
        del: db.prepare("DELETE FROM field_rooms WHERE code = ?"),
        count: db.prepare("SELECT COUNT(*) AS c FROM field_rooms"),
        stale: db.prepare("SELECT code FROM field_rooms WHERE created_at < ? OR touched_at < ?"),
      })
    : null;

  const fromRow = (r) => ({
    code: r.code,
    activityId: r.activity_id,
    ownerId: r.owner_id,
    created: r.created_at,
    touched: r.touched_at,
    state: r.idx === null || r.idx === undefined ? null : { idx: r.idx, running: !!r.running, remaining: r.remaining, at: r.state_at ?? r.touched_at },
    clients: new Map(),
  });

  const expired = (room) => now() - room.created > ttlMs || (room.clients.size === 0 && now() - room.touched > idleMs);

  /** חדר מהזיכרון, ואם אין: מהמסד (למשל אחרי השכמה של השרת). חדר שפג תוקפו נמחק ולא חוזר. */
  const get = (code) => {
    let room = rooms.get(code);
    if (!room && q) {
      const r = q.row.get(code);
      if (r) {
        room = fromRow(r);
        if (expired(room)) {
          q.del.run(code);
          return null;
        }
        rooms.set(code, room);
      }
    }
    return room ?? null;
  };

  const newCode = () => {
    for (let t = 0; t < 20; t++) {
      let c = "";
      for (let i = 0; i < 6; i++) c += ALPHABET[randomInt(ALPHABET.length)];
      if (!rooms.has(c) && !(q && q.row.get(c))) return c;
    }
    throw Object.assign(new Error("no code"), { status: 503 });
  };

  /** מצב הטיימר כפי שהוא עכשיו: אם הוא רץ, מקטינים את הזמן שנותר בכמה ששעה מאז העדכון האחרון */
  const stateNow = (room) => {
    const s = room.state;
    if (!s) return null;
    const left = s.running ? s.remaining - Math.floor((now() - s.at) / 1000) : s.remaining;
    return { idx: s.idx, running: s.running, remaining: Math.max(-3600, left) };
  };

  const persistTouch = (room) => {
    room.touched = now();
    q?.touch.run(room.touched, room.code);
  };

  const write = (res, event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      res.flush?.();
      return true;
    } catch {
      return false;
    }
  };

  const broadcast = (room, event, data, exceptCid) => {
    for (const [cid, res] of [...room.clients]) {
      if (cid === exceptCid) continue;
      if (!write(res, event, { ...data, members: room.clients.size })) room.clients.delete(cid);
    }
  };

  const closeRoom = (code, reason = "closed") => {
    const room = rooms.get(code);
    if (room) {
      for (const res of room.clients.values()) {
        write(res, reason, { members: 0 });
        try {
          res.end();
        } catch {
          /* כבר סגור */
        }
      }
      room.clients.clear();
      rooms.delete(code);
    }
    const hadRow = q ? q.del.run(code).changes > 0 : false;
    return !!room || hadRow;
  };

  const sweep = () => {
    for (const [code, room] of [...rooms]) if (expired(room)) closeRoom(code);
    if (!q) return;
    // שורות במסד שאין להן חיבור חי בזיכרון: נמחקות כשפג תוקפן (חדר ישן, או חדר שננטש)
    const t = now();
    for (const { code } of q.stale.all(t - ttlMs, t - idleMs)) if (!rooms.get(code)?.clients.size) q.del.run(code);
  };

  let beat = null;
  if (timers) {
    beat = setInterval(() => {
      for (const room of rooms.values()) {
        for (const [cid, res] of [...room.clients]) {
          try {
            res.write(": ping\n\n");
            res.flush?.();
          } catch {
            room.clients.delete(cid);
          }
        }
        // חדר עם מחוברים נחשב פעיל גם כשאף אחד לא לוחץ: מרעננים את חותמת הזמן במסד פעם בכמה דקות
        if (room.clients.size && now() - room.touched > 5 * 60_000) persistTouch(room);
      }
      sweep();
    }, pingMs);
    beat.unref?.();
  }

  return {
    size: () => (q ? q.count.get().c : rooms.size),
    has: (code) => !!get(code),
    sweep,
    /** כיבוי (בבדיקות ובסגירת השרת): מנתק חיבורים וסוגר את הטיימר, אבל לא מוחק חדרים מהמסד, כדי שישרדו הפעלה מחדש */
    shutdown() {
      if (beat) clearInterval(beat);
      for (const room of rooms.values()) {
        for (const res of room.clients.values()) {
          try {
            res.end();
          } catch {
            /* כבר סגור */
          }
        }
        room.clients.clear();
      }
      rooms.clear();
    },
    create({ activityId, ownerId }) {
      sweep();
      if ((q ? q.count.get().c : rooms.size) >= maxRooms) throw Object.assign(new Error("full"), { status: 503 });
      const code = newCode();
      const t = now();
      rooms.set(code, { code, activityId, ownerId, created: t, touched: t, state: null, clients: new Map() });
      q?.insert.run(code, activityId, ownerId, t, t);
      return { code, activityId };
    },
    info(code) {
      const r = get(code);
      return r ? { code, activityId: r.activityId, members: r.clients.size, state: stateNow(r) } : null;
    },
    isOwner: (code, userId) => get(code)?.ownerId === userId,
    /** האם אפשר להצטרף: "ok" / "none" (אין חדר) / "full" */
    check(code, cid) {
      const room = get(code);
      if (!room) return "none";
      if (!room.clients.has(cid) && room.clients.size >= maxClients) return "full";
      return "ok";
    },
    /** מצרף חיבור SSE. מחזיר "full" / "none" או את הפונקציה שמנתקת. חיבור חוזר עם אותו מזהה (אחרי ניתוק רשת) מחליף את הישן. */
    join(code, cid, res) {
      const room = get(code);
      if (!room) return "none";
      const old = room.clients.get(cid);
      if (!old && room.clients.size >= maxClients) return "full";
      if (old) {
        room.clients.delete(cid);
        try {
          old.end();
        } catch {
          /* כבר סגור */
        }
      }
      room.clients.set(cid, res);
      persistTouch(room);
      write(res, "hello", { activityId: room.activityId, state: stateNow(room), members: room.clients.size });
      broadcast(room, "presence", {}, cid);
      return () => {
        if (room.clients.get(cid) === res) room.clients.delete(cid);
        if (rooms.get(code) === room) persistTouch(room);
        broadcast(room, "presence", {});
      };
    },
    /** עדכון מצב מחבר שמחובר כרגע. מחזיר false אם החדר או החיבור לא קיימים. */
    push(code, cid, s) {
      const room = get(code);
      if (!room || !room.clients.has(cid)) return false;
      const t = now();
      room.state = { idx: s.idx, running: !!s.running, remaining: s.remaining, at: t };
      room.touched = t;
      q?.state.run(s.idx, s.running ? 1 : 0, s.remaining, t, t, code);
      broadcast(room, "state", { idx: s.idx, running: !!s.running, remaining: s.remaining, by: cid }, cid);
      return room.clients.size;
    },
    close: closeRoom,
  };
}
