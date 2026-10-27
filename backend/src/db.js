import crypto from "node:crypto";
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
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  device TEXT,
  method TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id INTEGER,
  username TEXT,
  ip TEXT,
  ip_hash TEXT,
  country TEXT,
  user_agent TEXT,
  device TEXT,
  page TEXT,
  flag TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_at ON access_log(at);
CREATE INDEX IF NOT EXISTS idx_access_kind_at ON access_log(kind, at);
CREATE INDEX IF NOT EXISTS idx_access_user ON access_log(user_id, kind);
CREATE TABLE IF NOT EXISTS write_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  blocks_json TEXT NOT NULL DEFAULT '[]',
  rev INTEGER NOT NULL DEFAULT 1,
  words INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_write_docs_owner ON write_docs(owner_id, updated_at);
CREATE TABLE IF NOT EXISTS write_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES write_docs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  words INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  saved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_write_versions_doc ON write_versions(doc_id, id);
CREATE TABLE IF NOT EXISTS write_method_prefs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  weight INTEGER NOT NULL,
  PRIMARY KEY (user_id, method)
);
CREATE TABLE IF NOT EXISTS write_snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_write_snippets_owner ON write_snippets(owner_id);
CREATE TABLE IF NOT EXISTS write_shares (
  token TEXT PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES write_docs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS write_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES write_docs(id) ON DELETE CASCADE,
  block_id TEXT,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_write_comments_doc ON write_comments(doc_id, id);
CREATE TABLE IF NOT EXISTS write_tribe_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS write_attendance (
  doc_id INTEGER PRIMARY KEY REFERENCES write_docs(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  names_json TEXT NOT NULL,
  present_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS write_trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  words INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS write_tribe_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  line TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feature_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature TEXT NOT NULL,
  vote INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  username TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feature_feedback ON feature_feedback(feature);
CREATE TABLE IF NOT EXISTS ip_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL UNIQUE,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS verify_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target TEXT,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verify_codes_user ON verify_codes(user_id, kind);
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
CREATE TABLE IF NOT EXISTS system_samples (
  day TEXT PRIMARY KEY,
  db_bytes INTEGER,
  users INTEGER,
  activities INTEGER,
  write_docs INTEGER
);
CREATE TABLE IF NOT EXISTS team_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leader TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  age_group TEXT NOT NULL DEFAULT '',
  doc_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_date ON team_events(date);
CREATE TABLE IF NOT EXISTS page_counts (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page)
);
CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  page TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pilot_surveys (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ease INTEGER NOT NULL,
  missing TEXT NOT NULL DEFAULT '',
  would_use INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feature_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feature_votes (
  request_id INTEGER NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, user_id)
);
CREATE TABLE IF NOT EXISTS write_question_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, text)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  title TEXT,
  date TEXT NOT NULL,
  time TEXT,
  duration_min INTEGER,
  group_label TEXT,
  note TEXT,
  remind_days INTEGER,
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedule_user ON schedule(user_id, date);
CREATE TABLE IF NOT EXISTS activity_collaborators (
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by TEXT,
  added_at TEXT NOT NULL,
  PRIMARY KEY (activity_id, user_id)
);
CREATE TABLE IF NOT EXISTS flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  note TEXT,
  reporter_id INTEGER,
  status TEXT NOT NULL DEFAULT 'OPEN',
  resolution TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flags_status ON flags(status, created_at);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, id);
CREATE TABLE IF NOT EXISTS activity_tags (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (user_id, activity_id, tag)
);
CREATE TABLE IF NOT EXISTS topic_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  activity_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topic_votes (
  request_id INTEGER NOT NULL REFERENCES topic_requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, user_id)
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  author TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assist_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  age_group TEXT,
  share_token TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assist_drafts_owner ON assist_drafts(owner_id, updated_at);
CREATE TABLE IF NOT EXISTS assist_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL REFERENCES assist_drafts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  quote TEXT,
  body TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assist_comments_draft ON assist_comments(draft_id, id);
CREATE TABLE IF NOT EXISTS assist_reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_id INTEGER REFERENCES assist_drafts(id) ON DELETE SET NULL,
  activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  ran_on TEXT NOT NULL,
  group_label TEXT,
  body TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assist_refl_user ON assist_reflections(user_id, id);
CREATE TABLE IF NOT EXISTS assist_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  size INTEGER,
  traits_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assist_groups_user ON assist_groups(user_id);
CREATE TABLE IF NOT EXISTS assist_draft_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL REFERENCES assist_drafts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT,
  saved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assist_versions_draft ON assist_draft_versions(draft_id, id);
CREATE TABLE IF NOT EXISTS assist_board (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  week TEXT NOT NULL,
  title TEXT NOT NULL,
  value TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  note TEXT,
  draft_id INTEGER REFERENCES assist_drafts(id) ON DELETE SET NULL,
  activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, grade, week)
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
  add("users", "email", "TEXT");
  add("users", "phone", "TEXT");
  add("users", "email_verified_at", "TEXT");
  add("users", "phone_verified_at", "TEXT");
  add("users", "totp_secret", "TEXT");
  add("users", "totp_enabled", "INTEGER NOT NULL DEFAULT 0");
  add("users", "totp_last_step", "INTEGER");
  add("users", "backup_codes", "TEXT");
  add("users", "staff_role", "TEXT");
  add("users", "last_login_at", "TEXT");
  add("users", "terms_accepted_at", "TEXT");
  add("users", "terms_version", "TEXT");
  add("users", "password_changed_at", "TEXT");
  add("audit_log", "prev_hash", "TEXT");
  add("audit_log", "hash", "TEXT");
  // כתובת מייל או טלפון מזוהים רק כשהם מאומתים, ולכן הייחודיות נבדקת רק עליהם
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_verified ON users(lower(email)) WHERE email_verified_at IS NOT NULL");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_verified ON users(phone) WHERE phone_verified_at IS NOT NULL");
  // יומן הפעולות הוא להוספה בלבד
  db.exec("CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END");
  add("activities", "owner_id", "INTEGER");
  add("activities", "kind", "TEXT");
  add("runs", "engagement", "INTEGER");
  add("runs", "timing", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_activities_owner ON activities(owner_id)");
}

export const nowIso = () => new Date().toISOString();

/** שרשרת גיבוב: כל שורה כוללת את הגיבוב של קודמתה, ולכן שינוי בדיעבד מתגלה בבדיקה. */
export const auditHash = (prev, at, actor, action, details) => crypto.createHash("sha256").update([prev, at, actor, action, details ?? ""].join("\u001f")).digest("hex");

export function audit(db, actor, action, details) {
  const prev = db.prepare("SELECT hash FROM audit_log WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 1").get()?.hash || "";
  const at = nowIso();
  const who = actor || "anonymous";
  const dj = details === undefined ? null : JSON.stringify(details);
  db.prepare("INSERT INTO audit_log (at, actor, action, details, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)").run(at, who, action, dj, prev, auditHash(prev, at, who, action, dj));
}
