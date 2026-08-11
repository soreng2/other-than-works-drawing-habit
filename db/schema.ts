export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY NOT NULL,
    owner_token_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    character_key TEXT,
    message TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS presence (
    profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
    completed_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_work_sessions_profile_completed ON work_sessions(profile_id, completed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_work_sessions_completed ON work_sessions(completed_at DESC)`,
] as const;

export const PROFILE_MESSAGE_MIGRATION = "ALTER TABLE profiles ADD COLUMN message TEXT NOT NULL DEFAULT ''";

export type ProfileRow = {
  id: string;
  name: string;
  character_key: string | null;
  message: string;
};

export type PresenceRow = ProfileRow & {
  category: string;
  started_at: number;
};

export type SessionRow = {
  id: string;
  profile_id: string;
  seconds: number;
  category: string;
  artwork_key: string;
  note: string;
  completed_at: number;
  artist?: string;
  character_key?: string | null;
};
