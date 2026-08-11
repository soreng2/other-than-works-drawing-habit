import { PROFILE_MESSAGE_MIGRATION, SCHEMA_STATEMENTS } from "../../../db/schema";

export async function ensureDatabase(database: D1Database) {
  await database.batch(SCHEMA_STATEMENTS.map((statement) => database.prepare(statement)));
  try {
    await database.prepare(PROFILE_MESSAGE_MIGRATION).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) throw error;
  }
}
