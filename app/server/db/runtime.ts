import {
  CHARACTER_PRESET_MIGRATION,
  GALLERY_HIDDEN_MIGRATION,
  GALLERY_VISIBLE_INDEX,
  PRESENCE_MODE_MIGRATION,
  PROFILE_MESSAGE_MIGRATION,
  PROFILE_NICKNAME_MIGRATION,
  SCHEMA_STATEMENTS,
  STUDENT_CLASS_INDEX,
  STUDENT_CLASS_MIGRATION,
} from "../../../db/schema";

const DEFAULT_CLASS_ID = "00000000-0000-5000-8000-000000000001";

export async function ensureDatabase(database: D1Database) {
  await database.batch(SCHEMA_STATEMENTS.map((statement) => database.prepare(statement)));
  for (const migration of [PROFILE_MESSAGE_MIGRATION, PROFILE_NICKNAME_MIGRATION, PRESENCE_MODE_MIGRATION, CHARACTER_PRESET_MIGRATION, GALLERY_HIDDEN_MIGRATION]) {
    try {
      await database.prepare(migration).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("duplicate column")) throw error;
    }
  }
  try {
    await database.prepare(STUDENT_CLASS_MIGRATION).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) throw error;
  }
  await database.prepare(GALLERY_VISIBLE_INDEX).run();
  await database.prepare(STUDENT_CLASS_INDEX).run();

  const classCount = await database.prepare("SELECT COUNT(*) AS count FROM classes").first<{ count: number }>();
  if ((classCount?.count ?? 0) === 0) {
    const [codeHash, codeDisplay, studentCount] = await Promise.all([
      database.prepare("SELECT value FROM app_settings WHERE key = 'class_code_hash'").first<{ value: string }>(),
      database.prepare("SELECT value FROM app_settings WHERE key = 'class_code_display'").first<{ value: string }>(),
      database.prepare("SELECT COUNT(*) AS count FROM students WHERE normalized_name != '__host__'").first<{ count: number }>(),
    ]);
    if (codeHash?.value || (studentCount?.count ?? 0) > 0) {
      const now = Date.now();
      await database.prepare(`INSERT OR IGNORE INTO classes
        (id, name, code_hash, code_display, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .bind(DEFAULT_CLASS_ID, "아더댄웍스", codeHash?.value ?? "", codeDisplay?.value ?? "", now, now).run();
    }
  }
  await database.prepare("UPDATE students SET class_id = ? WHERE class_id IS NULL AND normalized_name != '__host__'")
    .bind(DEFAULT_CLASS_ID).run();
}
