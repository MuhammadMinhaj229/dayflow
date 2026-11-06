import type { PGlite } from "@electric-sql/pglite";

const CURRENT_SCHEMA_VERSION = 1;

export async function applyMigrations(db: PGlite): Promise<void> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (" +
      "version INTEGER PRIMARY KEY, " +
      "applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" +
    ");"
  );

  const existing = await db.query<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version = $1",
    [CURRENT_SCHEMA_VERSION]
  );
  if (existing.rows.length > 0) return;

  await db.transaction(async (tx) => {
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS tasks (" +
        "id TEXT PRIMARY KEY, " +
        "title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240), " +
        "details TEXT, " +
        "module_key TEXT NOT NULL CHECK (module_key IN ('research','career','business','projects','systems')), " +
        "status TEXT NOT NULL CHECK (status IN ('next','in_progress','done','cancelled')), " +
        "priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')), " +
        "due_date DATE, " +
        "scheduled_start TIME, " +
        "next_action TEXT, " +
        "blocker TEXT, " +
        "progress DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100), " +
        "notes TEXT, " +
        "completed_at TIMESTAMPTZ, " +
        "archived_at TIMESTAMPTZ, " +
        "created_at TIMESTAMPTZ NOT NULL, " +
        "updated_at TIMESTAMPTZ NOT NULL" +
      ");" +
      "CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks (due_date) WHERE archived_at IS NULL;" +
      "CREATE INDEX IF NOT EXISTS tasks_module_status_idx ON tasks (module_key, status) WHERE archived_at IS NULL;" +
      "CREATE TABLE IF NOT EXISTS task_events (" +
        "id TEXT PRIMARY KEY, " +
        "task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, " +
        "event_type TEXT NOT NULL, " +
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb, " +
        "created_at TIMESTAMPTZ NOT NULL" +
      ");" +
      "CREATE INDEX IF NOT EXISTS task_events_task_created_idx ON task_events (task_id, created_at DESC);"
    );
    await tx.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [CURRENT_SCHEMA_VERSION]
    );
  });
}
