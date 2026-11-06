import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "./migrations";

describe("PGlite schema migrations", () => {
  it("creates the versioned task and event schema", async () => {
    const db = await PGlite.create("memory://");
    try {
      await applyMigrations(db);

      const version = await db.query<{ version: number }>(
        "SELECT version FROM schema_migrations WHERE version = 1"
      );
      const tables = await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables " +
          "WHERE table_schema = 'public' AND table_name IN ('tasks', 'task_events') " +
          "ORDER BY table_name"
      );

      expect(version.rows[0]?.version).toBe(1);
      expect(tables.rows.map((row) => row.table_name)).toEqual(["task_events", "tasks"]);

      const timestamp = new Date().toISOString();
      await db.query(
        "INSERT INTO tasks (id,title,module_key,status,priority,created_at,updated_at) " +
          "VALUES ($1,$2,'projects','next','medium',$3,$3)",
        ["integration-task", "Database migration smoke test", timestamp]
      );
      const task = await db.query<{ title: string }>(
        "SELECT title FROM tasks WHERE id = $1",
        ["integration-task"]
      );

      expect(task.rows[0]?.title).toBe("Database migration smoke test");
    } finally {
      await db.close();
    }
  });
});
