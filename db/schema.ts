export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY NOT NULL,
    owner_token_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT NOT NULL DEFAULT '',
    character_preset TEXT NOT NULL DEFAULT 'sky',
    character_key TEXT,
    message TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS presence (
    profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'idle',
    category TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_presence_updated_at ON presence(updated_at)`,
  `CREATE TABLE IF NOT EXISTS work_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    seconds INTEGER NOT NULL,
    category TEXT NOT NULL,
    artwork_key TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    gallery_hidden INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_work_sessions_profile_completed ON work_sessions(profile_id, completed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_work_sessions_completed ON work_sessions(completed_at DESC)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    code_display TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY NOT NULL,
    legal_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    nickname TEXT NOT NULL DEFAULT '',
    auth_user_hash TEXT UNIQUE,
    auth_provider TEXT NOT NULL DEFAULT 'chatgpt',
    auth_email TEXT NOT NULL DEFAULT '',
    profile_id TEXT UNIQUE,
    class_id TEXT REFERENCES classes(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_students_normalized_name ON students(normalized_name)`,
] as const;

export const PROFILE_MESSAGE_MIGRATION = "ALTER TABLE profiles ADD COLUMN message TEXT NOT NULL DEFAULT ''";
export const PROFILE_NICKNAME_MIGRATION = "ALTER TABLE profiles ADD COLUMN nickname TEXT NOT NULL DEFAULT ''";
export const PRESENCE_MODE_MIGRATION = "ALTER TABLE presence ADD COLUMN mode TEXT NOT NULL DEFAULT 'idle'";
export const CHARACTER_PRESET_MIGRATION = "ALTER TABLE profiles ADD COLUMN character_preset TEXT NOT NULL DEFAULT 'sky'";
export const GALLERY_HIDDEN_MIGRATION = "ALTER TABLE work_sessions ADD COLUMN gallery_hidden INTEGER NOT NULL DEFAULT 0";
export const GALLERY_VISIBLE_INDEX = "CREATE INDEX IF NOT EXISTS idx_work_sessions_gallery_visible ON work_sessions(gallery_hidden, completed_at DESC)";
export const STUDENT_CLASS_MIGRATION = "ALTER TABLE students ADD COLUMN class_id TEXT REFERENCES classes(id)";
export const STUDENT_CLASS_INDEX = "CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id)";
export const STUDENT_AUTH_PROVIDER_MIGRATION = "ALTER TABLE students ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'chatgpt'";
export const STUDENT_AUTH_EMAIL_MIGRATION = "ALTER TABLE students ADD COLUMN auth_email TEXT NOT NULL DEFAULT ''";

export type ProfileRow = {
  id: string;
  name: string;
  nickname: string;
  character_preset: string;
  character_key: string | null;
  message: string;
};

export type PresenceRow = ProfileRow & {
  mode: string;
  category: string;
  started_at: number;
  class_name?: string | null;
};

export type StudentRow = {
  id: string;
  legal_name: string;
  nickname: string;
  auth_user_hash: string | null;
  auth_provider: string;
  auth_email: string;
  profile_id: string | null;
  class_id: string | null;
};

export type ClassRow = {
  id: string;
  name: string;
  code_hash: string;
  code_display: string;
  is_active: number;
};

export type SessionRow = {
  id: string;
  profile_id: string;
  seconds: number;
  category: string;
  artwork_key: string;
  note: string;
  gallery_hidden?: number;
  completed_at: number;
  artist?: string;
  character_key?: string | null;
};
