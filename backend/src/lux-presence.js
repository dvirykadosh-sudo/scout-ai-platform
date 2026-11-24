// שלב 61 (רעיון 18): מי צופה עכשיו בטיוטה משותפת ומי מקליד. הכול בזיכרון השרת בלבד, בלי כתיבה למסד ובלי כתובות IP.
// זה סקר (heartbeat) כל כמה שניות ולא חיבור פתוח, כדי שיעבוד גם ב-Render החינמי. נתונים נמחקים אחרי TTL.
export const TTL_MS = 25_000;
const MAX_PER_DOC = 12;
const MAX_DOCS = 400;
const COLORS = ["#f97316", "#a78bfa", "#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#2dd4bf", "#fb7185"];

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
export const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24) || "אורח/ת";

export function createPresence(now = () => Date.now()) {
  const docs = new Map(); // key -> Map(cid -> {name, owner, typing, at})
  const prune = (key) => {
    const m = docs.get(key);
    if (!m) return null;
    const t = now();
    for (const [cid, p] of m) if (t - p.at > TTL_MS) m.delete(cid);
    if (!m.size) {
      docs.delete(key);
      return null;
    }
    return m;
  };
  return {
    /** מעדכן נוכחות ומחזיר את רשימת האנשים. cid: מזהה אקראי של הלשונית (לא נשמר מעבר ל-TTL). */
    beat(key, cid, { name, owner = false, typing = false }) {
      const id = String(cid ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
      if (id.length < 6) return null;
      if (!docs.has(key) && docs.size >= MAX_DOCS) {
        const oldest = docs.keys().next().value;
        docs.delete(oldest);
      }
      const m = prune(key) ?? new Map();
      docs.set(key, m);
      if (!m.has(id) && m.size >= MAX_PER_DOC) return this.list(key, id);
      m.set(id, { name: cleanName(name), owner: !!owner, typing: !!typing, at: now() });
      return this.list(key, id);
    },
    list(key, me) {
      const m = prune(key);
      if (!m) return [];
      return [...m.entries()]
        .map(([cid, p]) => ({ id: (hash(cid) % 1e8).toString(36), name: p.name, owner: p.owner, typing: p.typing, color: COLORS[hash(cid) % COLORS.length], you: cid === me }))
        .sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name, "he"));
    },
    leave(key, cid) {
      const m = docs.get(key);
      if (m) m.delete(String(cid ?? ""));
      prune(key);
    },
    size: () => docs.size,
  };
}

// ───────── שלב 70: נוכחות חיה בעורך (SSE) ─────────
// מי מחובר למסמך עכשיו, באיזה שלב הוא נמצא, והאם הוא מקליד. בנוסף: הודעת "נשמר" לשאר המחוברים, כדי שישלפו את הנוסח העדכני.
// הכול בזיכרון בלבד (נעלם כשהשרת נרדם; הדפדפנים מתחברים מחדש לבד), ואף כתובת IP לא נשמרת.
// בפרוטוקול משתמשים במזהה אטום (hash) ולא במזהה החיבור, כדי שאי אפשר יהיה לזייף מיקום של מישהו אחר.
export const LOCK_MS = 20_000;
export function createLiveDocs({ maxPerDoc = 6, maxDocs = 300, pingMs = 20_000, timers = true, now = () => Date.now() } = {}) {
  const docs = new Map(); // docId -> Map(cid -> {res, userId, name, owner, block, editing, lock})
  const pid = (cid) => (hash(cid) % 1e8).toString(36);
  const list = (m) =>
    [...m]
      .map(([cid, p]) => ({ id: pid(cid), name: p.name, owner: p.owner, block: p.block, editing: p.editing, lock: p.lock && p.lock.until > now() ? p.lock.block : null, color: COLORS[hash(cid) % COLORS.length] }))
      .sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name, "he") || a.id.localeCompare(b.id));
  const send = (res, event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      res.flush?.();
      return true;
    } catch {
      return false;
    }
  };
  const broadcast = (docId, event, data, exceptCid) => {
    const m = docs.get(docId);
    if (!m) return 0;
    let n = 0;
    for (const [cid, p] of [...m]) {
      if (cid === exceptCid) continue;
      if (send(p.res, event, data)) n++;
      else m.delete(cid);
    }
    return n;
  };
  const tidy = (docId) => {
    if (docs.get(docId)?.size === 0) docs.delete(docId);
  };
  /** מנקה נעילות שפג תוקפן ומודיע לשאר המחוברים. מחזיר כמה נעילות שוחררו. */
  const sweep = () => {
    let n = 0;
    for (const [docId, m] of [...docs]) {
      let changed = false;
      for (const p of m.values()) {
        if (p.lock && p.lock.until <= now()) {
          p.lock = null;
          changed = true;
          n++;
        }
      }
      if (changed) broadcast(docId, "presence", { people: list(m) });
    }
    return n;
  };
  let beat = null;
  if (timers) {
    beat = setInterval(() => {
      sweep();
      for (const [docId, m] of [...docs]) {
        for (const [cid, p] of [...m]) {
          try {
            p.res.write(": ping\n\n");
            p.res.flush?.();
          } catch {
            m.delete(cid);
          }
        }
        tidy(docId);
      }
    }, pingMs);
    beat.unref?.();
  }
  return {
    /** "ok" / "full" (לפני שליחת כותרות) */
    check(docId, cid) {
      const m = docs.get(docId);
      if (!m && docs.size >= maxDocs) return "full";
      return m && !m.has(cid) && m.size >= maxPerDoc ? "full" : "ok";
    },
    /** מצרף חיבור. חיבור חוזר עם אותו cid מחליף את הישן. מחזיר פונקציית ניתוק. */
    join(docId, cid, res, { userId, name, owner = false }) {
      let m = docs.get(docId);
      if (!m) docs.set(docId, (m = new Map()));
      const old = m.get(cid);
      if (old) {
        m.delete(cid);
        try {
          old.res.end();
        } catch {
          /* כבר סגור */
        }
      }
      m.set(cid, { res, userId, name: cleanName(name), owner: !!owner, block: null, editing: false, lock: null });
      send(res, "hello", { me: pid(cid), people: list(m) });
      broadcast(docId, "presence", { people: list(m) }, cid);
      return () => {
        const cur = docs.get(docId);
        if (!cur || cur.get(cid)?.res !== res) return;
        cur.delete(cid);
        broadcast(docId, "presence", { people: list(cur) });
        tidy(docId);
      };
    },
    /** עדכון מיקום/הקלדה. מחזיר false אם אין חיבור פעיל של אותו משתמש. */
    focus(docId, cid, userId, { block, editing }) {
      const p = docs.get(docId)?.get(cid);
      if (!p || p.userId !== userId) return false;
      const b = block == null ? null : String(block).slice(0, 24);
      const e = !!editing && b !== null;
      if (p.block === b && p.editing === e) return true;
      p.block = b;
      p.editing = e;
      broadcast(docId, "presence", { people: list(docs.get(docId)) });
      return true;
    },
    /**
     * שלב 75: נעילת שלב קצרה. מי שמקליד בשלב מחזיק בו 20 שניות (ומחדש בהקלדה); אחרים רואים אותו לקריאה בלבד ומי עורך אותו.
     * הנעילה מייעצת: היא מונעת התנגשות בהקלדה, ובכל מקרה השמירה ממזגת ברמת שלב. בלי block משחררים. נעילה אחת לכל חיבור.
     */
    lock(docId, cid, userId, block) {
      const m = docs.get(docId);
      const p = m?.get(cid);
      if (!p || p.userId !== userId) return { ok: false, reason: "NOT_CONNECTED" };
      if (block == null) {
        if (p.lock) {
          p.lock = null;
          broadcast(docId, "presence", { people: list(m) });
        }
        return { ok: true };
      }
      const b = String(block).slice(0, 24);
      const t = now();
      for (const [other, q] of m) if (other !== cid && q.lock && q.lock.until > t && q.lock.block === b) return { ok: false, reason: "LOCKED", by: q.name };
      const changed = !p.lock || p.lock.block !== b || p.lock.until <= t;
      p.lock = { block: b, until: t + LOCK_MS };
      if (changed) broadcast(docId, "presence", { people: list(m) });
      return { ok: true, until: p.lock.until };
    },
    sweep,
    /** הודעה לכולם: המסמך נשמר (rev חדש). by = מזהה אטום של השומר, כדי שהוא יתעלם מההודעה על עצמו. */
    saved(docId, { rev, cid, changed = [], title = false, meta = false, conflicts = [] }) {
      return broadcast(docId, "saved", { rev, by: cid ? pid(cid) : null, changed: changed.slice(0, 60), title: !!title, meta: !!meta, conflicts: conflicts.slice(0, 60) }, cid);
    },
    /** מנתק את כל החיבורים של משתמש במסמך (הוסר מרשימת העורכים) */
    kickUser(docId, userId) {
      const m = docs.get(docId);
      if (!m) return 0;
      let n = 0;
      for (const [cid, p] of [...m]) {
        if (p.userId !== userId) continue;
        send(p.res, "kicked", {});
        try {
          p.res.end();
        } catch {
          /* כבר סגור */
        }
        m.delete(cid);
        n++;
      }
      if (n) broadcast(docId, "presence", { people: list(m) });
      tidy(docId);
      return n;
    },
    people: (docId) => (docs.has(docId) ? list(docs.get(docId)) : []),
    size: () => docs.size,
    shutdown() {
      if (beat) clearInterval(beat);
      for (const m of docs.values()) for (const p of m.values()) {
        try {
          p.res.end();
        } catch {
          /* כבר סגור */
        }
      }
      docs.clear();
    },
  };
}
