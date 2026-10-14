import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN',
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  author TEXT,
  instructor TEXT,
  instructor_role TEXT,
  tribe TEXT NOT NULL DEFAULT 'שבט מעוז',
  battalion TEXT,
  age_group TEXT NOT NULL,
  group_size INTEGER NOT NULL DEFAULT 20,
  leading_value TEXT NOT NULL,
  equipment TEXT NOT NULL,
  safety_notes TEXT NOT NULL,
  conclusion_note TEXT,
  active_scouting INTEGER NOT NULL DEFAULT 0,
  energetic_mode INTEGER NOT NULL DEFAULT 0,
  is_seed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PUBLISHED',
  tags_json TEXT NOT NULL DEFAULT '[]',
  methods_json TEXT NOT NULL DEFAULT '[]',
  stages_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL,
  comment TEXT,
  author TEXT,
  age_used TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ratings_activity ON ratings(activity_id);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  ran_on TEXT NOT NULL,
  group_label TEXT,
  worked TEXT,
  change_next TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, activity_id);
CREATE TABLE IF NOT EXISTS activity_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL,
  editor TEXT,
  note TEXT,
  saved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_activity ON activity_versions(activity_id, id);
CREATE TABLE IF NOT EXISTS sessions (
  key TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  user_agent TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  username TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT
);
CREATE TABLE IF NOT EXISTS email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_try_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_activity ON activity_notes(activity_id, id);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, activity_id)
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  liked TEXT NOT NULL DEFAULT '',
  more TEXT NOT NULL DEFAULT 'maybe',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_activity ON feedback(activity_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_at TEXT NOT NULL
);
`;

export function openDb(file = config.dbPath) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

const columnsOf = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

/** Adds columns introduced after the first release, so existing databases keep working. */
function migrate(db) {
  const add = (table, col, ddl) => {
    if (!columnsOf(db, table).includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
  };
  add("users", "display_name", "TEXT");
  add("users", "style_json", "TEXT");
  add("users", "disabled", "INTEGER NOT NULL DEFAULT 0");
  add("activities", "owner_id", "INTEGER");
  db.exec("CREATE INDEX IF NOT EXISTS idx_activities_owner ON activities(owner_id)");
}

export const nowIso = () => new Date().toISOString();

export function audit(db, actor, action, details) {
  db.prepare("INSERT INTO audit_log (at, actor, action, details) VALUES (?, ?, ?, ?)").run(
    nowIso(),
    actor || "anonymous",
    action,
    details === undefined ? null : JSON.stringify(details),
  );
}
