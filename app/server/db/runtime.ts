import { SCHEMA_STATEMENTS } from "../../../db/schema";

export async function ensureDatabase(database: D1Database) {
  await database.batch(SCHEMA_STATEMENTS.map((statement) => database.prepare(statement)));
}
