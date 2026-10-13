import { nowIso } from "./db.js";

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
        status, tags_json, methods_json, stages_json, created_at, updated_at, owner_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    );
  return Number(res.lastInsertRowid);
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
  if (!includeArchived && r.status !== "PUBLISHED") return null;
  return rowToActivity(r);
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export function searchActivities(db, f = {}) {
  const where = [f.includeArchived ? "1=1" : "status = 'PUBLISHED'"];
  const p = [];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    where.push(
      "(title LIKE ? ESCAPE '\\' OR leading_value LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR stages_json LIKE ? ESCAPE '\\')",
    );
    p.push(like, like, like, like);
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
  if (f.minDuration) {
    where.push("duration_min >= ?");
    p.push(f.minDuration);
  }
  if (f.maxDuration) {
    where.push("duration_min <= ?");
    p.push(f.maxDuration);
  }
  const order =
    { duration: "duration_min ASC, id ASC", title: "title COLLATE NOCASE ASC", new: "created_at DESC, id DESC" }[f.sort] ||
    "created_at DESC, id DESC";
  const page = Math.max(1, f.page || 1);
  const pageSize = Math.min(50, Math.max(1, f.pageSize || 12));
  const w = where.join(" AND ");
  const total = db.prepare(`SELECT COUNT(*) AS c FROM activities WHERE ${w}`).get(...p).c;
  const rows = db
    .prepare(`SELECT * FROM activities WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...p, pageSize, (page - 1) * pageSize);
  return { items: rows.map(rowToActivity), total, page, pageSize };
}
