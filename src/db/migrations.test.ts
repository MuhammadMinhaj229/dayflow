import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "./migrations";

describe("PGlite schema migrations", () => {
  it("applies every schema version idempotently", async () => {
    const db = await PGlite.create("memory://");
    try {
      await applyMigrations(db);
      await applyMigrations(db);

      const versions = await db.query<{ version: number }>(
        "SELECT version FROM schema_migrations ORDER BY version"
      );
      const tables = await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables " +
          "WHERE table_schema = 'public' AND table_name IN ('projects','tasks','task_events','project_events') " +
          "ORDER BY table_name"
      );
      const taskColumns = await db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'"
      );

      expect(versions.rows.map((row) => row.version)).toEqual([1, 2, 3]);
      expect(tables.rows.map((row) => row.table_name)).toEqual(["project_events", "projects", "task_events", "tasks"]);
      expect(taskColumns.rows.map((row) => row.column_name)).toContain("project_id");
      expect(taskColumns.rows.map((row) => row.column_name)).toContain("parent_task_id");
      expect(taskColumns.rows.map((row) => row.column_name)).toContain("archive_batch_id");
      const projectColumns = await db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'projects'"
      );
      expect(projectColumns.rows.map((row) => row.column_name)).toContain("archive_batch_id");

      const timestamp = new Date().toISOString();
      await db.query(
        "INSERT INTO projects (id,name,module_key,status,priority,created_at,updated_at) " +
          "VALUES ($1,$2,'projects','active','medium',$3,$3)",
        ["project-a", "Database migration project", timestamp]
      );
      await db.query(
        "INSERT INTO tasks (id,title,module_key,project_id,parent_task_id,status,priority,created_at,updated_at) " +
          "VALUES ($1,$2,'projects','project-a',NULL,'next','medium',$3,$3)",
        ["task-a", "Parent task", timestamp]
      );
      await db.query(
        "INSERT INTO tasks (id,title,module_key,parent_task_id,status,priority,created_at,updated_at) " +
          "VALUES ($1,$2,'projects','task-a','next','medium',$3,$3)",
        ["task-b", "Child task", timestamp]
      );

      const child = await db.query<{ parent_task_id: string }>(
        "SELECT parent_task_id FROM tasks WHERE id = 'task-b'"
      );
      expect(child.rows[0]?.parent_task_id).toBe("task-a");
    } finally {
      await db.close();
    }
  });

  it("refuses to open a database created by a newer app version", async () => {
    const db = await PGlite.create("memory://");
    try {
      await db.exec(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"
      );
      await db.query("INSERT INTO schema_migrations (version) VALUES (999)");
      await expect(applyMigrations(db)).rejects.toThrow(/newer app version/i);
      const versions = await db.query<{ version: number }>("SELECT version FROM schema_migrations");
      expect(versions.rows.map((row) => row.version)).toEqual([999]);
      const tables = await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_name='tasks'"
      );
      expect(tables.rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});
