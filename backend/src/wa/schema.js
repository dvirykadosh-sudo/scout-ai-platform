// שלב 58 – מנוע הוואטסאפ: הגדרת הטבלאות. כאן רק מבנה נתונים, בלי לוגיקה.
// הערה על פרטיות: טלפונים הם מידע אישי. כל הטבלאות כאן נגישות לאדמין ראשי בלבד,
// והודעות נכנסות נשמרות 14 יום בלבד, רק ממי שמוגדר כאיש קשר.

export const WA_SCHEMA = `
-- גשרים: שירותים על המחשב שמחוברים לוואטסאפ ושולחים בפועל. נשמר רק hash של האסימון.
CREATE TABLE IF NOT EXISTS wa_bridges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  last_state TEXT,
  phone_hint TEXT,
  version TEXT,
  revoked_at TEXT
);

-- אנשי קשר וקבוצות. wa_id בפורמט 972501234567@c.us (אדם) או 1203...@g.us (קבוצה).
CREATE TABLE IF NOT EXISTS wa_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'person',
  name TEXT NOT NULL,
  wa_id TEXT NOT NULL UNIQUE,
  battalion TEXT,
  role TEXT,
  audience TEXT NOT NULL DEFAULT 'guides',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opted_out INTEGER NOT NULL DEFAULT 0,
  bot_allowed INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- תור ההודעות. status: queued / leased / sent / failed / cancelled / skipped
CREATE TABLE IF NOT EXISTS wa_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES wa_contacts(id) ON DELETE SET NULL,
  wa_id TEXT NOT NULL,
  contact_name TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 5,
  run_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  lease_until TEXT,
  bridge_id INTEGER,
  error TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  rule_id INTEGER,
  event_key TEXT,
  event_title TEXT,
  expects_rsvp INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT UNIQUE,
  created_by TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_wa_jobs_due ON wa_jobs(status, run_at, priority);
CREATE INDEX IF NOT EXISTS idx_wa_jobs_contact ON wa_jobs(contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_jobs_event ON wa_jobs(event_key);

-- יומן שליחות מלא: שורה לכל ניסיון, בלי תוכן ההודעה (התוכן נשמר רק בתור, ל-30 יום).
CREATE TABLE IF NOT EXISTS wa_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  job_id INTEGER,
  contact_name TEXT,
  wa_hint TEXT,
  status TEXT NOT NULL,
  detail TEXT,
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_wa_log_at ON wa_log(at);

-- כללי אוטומציה: weekly (שבועי קבוע) / before_activity (תזכורת לפני פעולה מלוח השנה)
CREATE TABLE IF NOT EXISTS wa_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL,
  last_run_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

-- אישורי הגעה: תשובה אחת לכל איש קשר בכל אירוע
CREATE TABLE IF NOT EXISTS wa_rsvp (
  event_key TEXT NOT NULL,
  contact_id INTEGER NOT NULL REFERENCES wa_contacts(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (event_key, contact_id)
);

-- הודעות נכנסות (מאנשי קשר מוכרים בלבד, 14 יום)
CREATE TABLE IF NOT EXISTS wa_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  msg_id TEXT UNIQUE,
  at TEXT NOT NULL,
  contact_id INTEGER REFERENCES wa_contacts(id) ON DELETE CASCADE,
  is_group INTEGER NOT NULL DEFAULT 0,
  text TEXT,
  handled TEXT
);
CREATE INDEX IF NOT EXISTS idx_wa_inbox_contact ON wa_inbox(contact_id, at);

CREATE TABLE IF NOT EXISTS wa_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
