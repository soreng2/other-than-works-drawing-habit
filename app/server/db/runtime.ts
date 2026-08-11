import {
  CHARACTER_PRESET_MIGRATION,
  PRESENCE_MODE_MIGRATION,
  PROFILE_MESSAGE_MIGRATION,
  PROFILE_NICKNAME_MIGRATION,
  SCHEMA_STATEMENTS,
} from "../../../db/schema";

export async function ensureDatabase(database: D1Database) {
  await database.batch(SCHEMA_STATEMENTS.map((statement) => database.prepare(statement)));
  for (const migration of [PROFILE_MESSAGE_MIGRATION, PROFILE_NICKNAME_MIGRATION, PRESENCE_MODE_MIGRATION, CHARACTER_PRESET_MIGRATION]) {
    try {
      await database.prepare(migration).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("duplicate column")) throw error;
    }
  }
}
