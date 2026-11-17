// שלב 69: חדרי סנכרון לצוות הדרכה במצב שטח (SSE).
// הכול בזיכרון בלבד (נעלם כשהשרת נרדם או מתאפס), בלי שמות ובלי שום נתון אישי: רק שלב, מצב טיימר וכמות מחוברים.
import { randomBytes, randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // בלי 0/O/1/I/L שקל לבלבל ביניהם
export const CODE_RE = /^[A-Z0-9]{6}$/;

export function createRooms({ now = Date.now, maxRooms = 300, maxClients = 12, ttlMs = 6 * 3600_000, idleMs = 10 * 60_000, pingMs = 20_000, timers = true } = {}) {
  const rooms = new Map();

  const newCode = () => {
    for (let t = 0; t < 20; t++) {
      let c = "";
      for (let i = 0; i < 6; i++) c += ALPHABET[randomInt(ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
    throw Object.assign(new Error("no code"), { status: 503 });
  };

  /** מצב הטיימר כפי שהוא עכשיו: אם הוא רץ, מקטינים את הזמן שנותר בכמה ששעה מאז העדכון האחרון */
  const stateNow = (room) => {
    const s = room.state;
    if (!s) return null;
    const left = s.running ? s.remaining - Math.floor((now() - s.at) / 1000) : s.remaining;
    return { idx: s.idx, running: s.running, remaining: left };
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
    if (!room) return false;
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
    return true;
  };

  const sweep = () => {
    const t = now();
    for (const [code, room] of [...rooms]) {
      if (t - room.created > ttlMs || (room.clients.size === 0 && t - room.touched > idleMs)) closeRoom(code);
    }
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
      }
      sweep();
    }, pingMs);
    beat.unref?.();
  }

  return {
    size: () => rooms.size,
    has: (code) => rooms.has(code),
    sweep,
    /** כיבוי מלא (בבדיקות ובסגירת השרת) */
    shutdown() {
      if (beat) clearInterval(beat);
      for (const code of [...rooms.keys()]) closeRoom(code);
    },
    create({ activityId, ownerId }) {
      sweep();
      if (rooms.size >= maxRooms) throw Object.assign(new Error("full"), { status: 503 });
      const code = newCode();
      rooms.set(code, { code, activityId, ownerId, created: now(), touched: now(), state: null, clients: new Map(), secret: randomBytes(4).toString("hex") });
      return { code, activityId };
    },
    info(code) {
      const r = rooms.get(code);
      return r ? { code, activityId: r.activityId, members: r.clients.size, state: stateNow(r) } : null;
    },
    isOwner: (code, userId) => rooms.get(code)?.ownerId === userId,
    /** האם אפשר להצטרף: "ok" / "none" (אין חדר) / "full" */
    check(code, cid) {
      const room = rooms.get(code);
      if (!room) return "none";
      if (!room.clients.has(cid) && room.clients.size >= maxClients) return "full";
      return "ok";
    },
    /** מצרף חיבור SSE. מחזיר "full" / "none" או את הפונקציה שמנתקת. חיבור חוזר עם אותו מזהה (אחרי ניתוק רשת) מחליף את הישן. */
    join(code, cid, res) {
      const room = rooms.get(code);
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
      room.touched = now();
      write(res, "hello", { activityId: room.activityId, state: stateNow(room), members: room.clients.size });
      broadcast(room, "presence", {}, cid);
      return () => {
        if (room.clients.get(cid) === res) room.clients.delete(cid);
        room.touched = now();
        broadcast(room, "presence", {});
      };
    },
    /** עדכון מצב מחבר שמחובר כרגע. מחזיר false אם החדר או החיבור לא קיימים. */
    push(code, cid, s) {
      const room = rooms.get(code);
      if (!room || !room.clients.has(cid)) return false;
      room.state = { idx: s.idx, running: !!s.running, remaining: s.remaining, at: now() };
      room.touched = now();
      broadcast(room, "state", { idx: s.idx, running: !!s.running, remaining: s.remaining, by: cid }, cid);
      return room.clients.size;
    },
    close: closeRoom,
  };
}
