import { nowIso } from "./db.js";
import { gearLoad } from "./gear.js";
import { notifyAdmins } from "./notify.js";

export function rowToActivity(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    durationMin: r.duration_min,
    author: r.author,
    instructor: r.instructor,
    instructorRole: r.instructor_role,
    tribe: r.tribe,
    battalion: r.battalion || "",
    ageGroup: r.age_group,
    groupSize: r.group_size,
    leadingValue: r.leading_value,
    equipment: r.equipment,
    safetyNotes: r.safety_notes,
    conclusionNote: r.conclusion_note,
    activeScouting: !!r.active_scouting,
    energeticMode: !!r.energetic_mode,
    isSeed: !!r.is_seed,
    ownerId: r.owner_id ?? null,
    kind: r.kind ?? null,
    status: r.status,
    tags: JSON.parse(r.tags_json),
    methods: JSON.parse(r.methods_json),
    stages: JSON.parse(r.stages_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const n = (v) => (v === undefined ? null : v);

export function insertActivity(db, a) {
  const t = nowIso();
  const res = db
    .prepare(
      `INSERT INTO activities (title, duration_min, author, instructor, instructor_role, tribe, battalion, age_group,
        group_size, leading_value, equipment, safety_notes, conclusion_note, active_scouting, energetic_mode, is_seed,
        status, tags_json, methods_json, stages_json, created_at, updated_at, owner_id, kind)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      a.title,
      a.durationMin,
      n(a.author),
      n(a.instructor),
      n(a.instructorRole),
      a.tribe || "שבט מעוז",
      n(a.battalion),
      a.ageGroup,
      a.groupSize ?? 20,
      a.leadingValue,
      a.equipment,
      a.safetyNotes,
      n(a.conclusionNote),
      a.activeScouting ? 1 : 0,
      a.energeticMode ? 1 : 0,
      a.isSeed ? 1 : 0,
      a.status || "PUBLISHED",
      JSON.stringify(a.tags || []),
      JSON.stringify(a.methods || []),
      JSON.stringify(a.stages),
      t,
      t,
      a.ownerId ?? null,
      a.kind ?? null,
    );
  const newId = Number(res.lastInsertRowid);
  if ((a.status || "PUBLISHED") === "PENDING") notifyAdmins(db, "pending", `פעולה חדשה ממתינה לאישור: ${a.title}`, "/admin");
  return newId;
}

export function updateActivity(db, id, a) {
  db.prepare(
    `UPDATE activities SET title=?, duration_min=?, author=?, instructor=?, instructor_role=?, tribe=?, battalion=?,
      age_group=?, group_size=?, leading_value=?, equipment=?, safety_notes=?, conclusion_note=?, tags_json=?,
      methods_json=?, stages_json=?, updated_at=? WHERE id=?`,
  ).run(
    a.title,
    a.durationMin,
    n(a.author),
    n(a.instructor),
    n(a.instructorRole),
    a.tribe,
    n(a.battalion),
    a.ageGroup,
    a.groupSize,
    a.leadingValue,
    a.equipment,
    a.safetyNotes,
    n(a.conclusionNote),
    JSON.stringify(a.tags || []),
    JSON.stringify(a.methods || []),
    JSON.stringify(a.stages),
    nowIso(),
    id,
  );
}

export function getActivity(db, id, { includeArchived = false } = {}) {
  const r = db.prepare("SELECT * FROM activities WHERE id = ?").get(id);
  if (!r) return null;
  // PENDING = waiting for approval: not in the shared library, but the direct link works
  if (!includeArchived && r.status !== "PUBLISHED" && r.status !== "PENDING") return null;
  return rowToActivity(r);
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/** The editable content of an activity, used for version history. */
export function snapshotOf(a) {
  const { title, author, instructor, instructorRole, tribe, battalion, ageGroup, groupSize, leadingValue, equipment, safetyNotes, conclusionNote, tags, methods, stages, durationMin } = a;
  return { title, author, instructor, instructorRole, tribe, battalion, ageGroup, groupSize, leadingValue, equipment, safetyNotes, conclusionNote, tags, methods, stages, durationMin };
}

const RATING_SQL = "(SELECT AVG(stars) FROM ratings r WHERE r.activity_id = activities.id)";
const RATING_COUNT_SQL = "(SELECT COUNT(*) FROM ratings r WHERE r.activity_id = activities.id)";
const RUN_COUNT_SQL = "(SELECT COUNT(*) FROM runs u WHERE u.activity_id = activities.id)";

function snippetFor(a, tokens) {
  const t = tokens[0];
  if (!t) return "";
  const pools = [...a.stages.map((s) => `${s.name}: ${s.content}`), a.equipment, a.safetyNotes, a.conclusionNote || ""];
  for (const text of pools) {
    const flat = text.replace(/\s+/g, " ");
    const i = flat.toLowerCase().indexOf(t.toLowerCase());
    if (i >= 0) {
      const from = Math.max(0, i - 50);
      return (from > 0 ? "…" : "") + flat.slice(from, i + t.length + 90) + (i + t.length + 90 < flat.length ? "…" : "");
    }
  }
  return "";
}

export function searchActivities(db, f = {}) {
  const where = [f.includeArchived ? "1=1" : "status = 'PUBLISHED'"];
  const p = [];
  const tokens = f.q ? f.q.split(/\s+/).filter(Boolean).slice(0, 6) : [];
  for (const tok of tokens) {
    const like = `%${escapeLike(tok)}%`;
    where.push(
      "(title LIKE ? ESCAPE '\\' OR leading_value LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR stages_json LIKE ? ESCAPE '\\' OR equipment LIKE ? ESCAPE '\\' OR safety_notes LIKE ? ESCAPE '\\' OR tags_json LIKE ? ESCAPE '\\' OR conclusion_note LIKE ? ESCAPE '\\')",
    );
    p.push(like, like, like, like, like, like, like, like);
  }
  if (f.minRating) {
    where.push(`${RATING_SQL} >= ?`);
    p.push(f.minRating);
  }
  if (f.age) {
    where.push("age_group = ?");
    p.push(f.age);
  }
  if (f.value) {
    where.push("leading_value LIKE ? ESCAPE '\\'");
    p.push(`%${escapeLike(f.value)}%`);
  }
  if (f.method) {
    where.push("methods_json LIKE ? ESCAPE '\\'");
    p.push(`%"${escapeLike(f.method)}"%`);
  }
  if (f.ids) {
    const ids = f.ids.split(",").map(Number);
    where.push(`id IN (${ids.map(() => "?").join(",")})`);
    p.push(...ids);
  }
  if (f.tag) {
    where.push("tags_json LIKE ? ESCAPE '\\'");
    p.push(`%"${escapeLike(f.tag)}"%`);
  }
  if (f.kind) {
    where.push("kind = ?");
    p.push(f.kind);
  }
  if (f.minDuration) {
    where.push("duration_min >= ?");
    p.push(f.minDuration);
  }
  if (f.maxDuration) {
    where.push("duration_min <= ?");
    p.push(f.maxDuration);
  }
  if (f.energetic) where.push("energetic_mode = 1");
  if (f.scouting) where.push("active_scouting = 1");
  if (f.minSize) {
    where.push("group_size >= ?");
    p.push(f.minSize);
  }
  if (f.maxSize) {
    where.push("group_size <= ?");
    p.push(f.maxSize);
  }
  if (f.author) {
    where.push("(author LIKE ? ESCAPE '\\' OR instructor LIKE ? ESCAPE '\\')");
    p.push(`%${escapeLike(f.author)}%`, `%${escapeLike(f.author)}%`);
  }
  const order =
    {
      duration: "duration_min ASC, id ASC",
      title: "title COLLATE NOCASE ASC",
      new: "created_at DESC, id DESC",
      rating: `COALESCE(${RATING_SQL}, 0) DESC, ${RATING_COUNT_SQL} DESC, id DESC`,
      popular: `(${RATING_COUNT_SQL} + ${RUN_COUNT_SQL}) DESC, COALESCE(${RATING_SQL}, 0) DESC, id DESC`,
    }[f.sort] || "created_at DESC, id DESC";
  const page = Math.max(1, f.page || 1);
  const pageSize = Math.min(50, Math.max(1, f.pageSize || 12));
  const w = where.join(" AND ");
  let total;
  let items;
  if (f.lightGear) {
    // "ציוד קל" נגזר מטקסט חופשי, ולכן מסננים בקוד ולא ב-SQL
    const all = db.prepare(`SELECT * FROM activities WHERE ${w} ORDER BY ${order}`).all(...p).map(rowToActivity).filter((a) => gearLoad(a.equipment) <= 1);
    total = all.length;
    items = all.slice((page - 1) * pageSize, page * pageSize);
  } else {
    total = db.prepare(`SELECT COUNT(*) AS c FROM activities WHERE ${w}`).get(...p).c;
    items = db
      .prepare(`SELECT * FROM activities WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...p, pageSize, (page - 1) * pageSize)
      .map(rowToActivity);
  }
  for (const a of items) {
    const r = db.prepare("SELECT COUNT(*) AS c, AVG(stars) AS avg FROM ratings WHERE activity_id = ?").get(a.id);
    a.rating = { count: r.c, average: r.c ? Math.round(r.avg * 10) / 10 : 0 };
    a.runCount = db.prepare("SELECT COUNT(*) AS c FROM runs WHERE activity_id = ?").get(a.id).c;
    if (tokens.length) a.snippet = snippetFor(a, tokens);
  }
  return { items, total, page, pageSize };
}

/** הצעות להשלמה אוטומטית בחיפוש: שמות פעולות, ערכים ותגיות מהמאגר המאושר. */
export function suggestTerms(db, q, limit = 8) {
  const needle = String(q || "").trim().toLowerCase();
  if (needle.length < 2) return [];
  const out = [];
  const seen = new Set();
  const add = (text, type) => {
    const k = text.toLowerCase();
    if (!seen.has(k) && k.includes(needle) && out.length < limit) {
      seen.add(k);
      out.push({ text, type });
    }
  };
  const rows = db.prepare("SELECT title, leading_value, tags_json FROM activities WHERE status = 'PUBLISHED'").all();
  for (const r of rows) add(r.title, "title");
  for (const r of rows) add(r.leading_value, "value");
  for (const r of rows) for (const t of JSON.parse(r.tags_json)) add(t, "tag");
  return out;
}
