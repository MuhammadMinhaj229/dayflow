import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "./migrations";

const databaseState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("./client", () => ({
  getDatabase: async () => {
    if (!databaseState.current) throw new Error("Test database is not initialised.");
    return databaseState.current;
  }
}));

import { createEncryptedBackup, restoreEncryptedBackup } from "./backup";

let db: PGlite;

beforeEach(async () => {
  db = await PGlite.create("memory://");
  databaseState.current = db;
  await applyMigrations(db);
});

afterEach(async () => {
  databaseState.current = null;
  await db.close();
});

describe("encrypted database backup and restore", () => {
  it("round-trips projects, task hierarchy, archive state and both event histories", async () => {
    const now = new Date().toISOString();
    await db.query(
      "INSERT INTO projects (id,name,module_key,status,priority,created_at,updated_at) " +
        "VALUES ('project-a','DayFlow recovery test','projects','active','high',$1,$1)",
      [now]
    );
    await db.query(
      "INSERT INTO tasks (id,title,module_key,project_id,parent_task_id,order_index,status,priority," +
        "progress,created_at,updated_at) VALUES " +
        "('task-parent','Parent','projects','project-a',NULL,0,'next','high',0,$1,$1)," +
        "('task-child','Child','projects','project-a','task-parent',1,'in_progress','medium',35,$1,$1)," +
        "('task-archived','Archived','projects','project-a',NULL,2,'done','low',100,$1,$1)",
      [now]
    );
    await db.query(
      "UPDATE tasks SET archived_at=$1,archive_batch_id='archive-batch-1' WHERE id='task-archived'",
      [now]
    );
    await db.query(
      "INSERT INTO task_events (id,task_id,event_type,metadata,created_at) VALUES " +
        "('event-parent','task-parent','task.created','{}'::jsonb,$1)," +
        "('event-child','task-child','task.status_changed',jsonb_build_object('from','next','to','in_progress'),$1)",
      [now]
    );
    await db.query(
      "INSERT INTO project_events (id,project_id,event_type,metadata,created_at) " +
        "VALUES ('project-event-a','project-a','project.created','{}'::jsonb,$1)",
      [now]
    );

    const blob = await createEncryptedBackup("a secure DayFlow recovery passphrase 2026");
    const file = new File([await blob.arrayBuffer()], "dayflow-backup.dayflow", {
      type: "application/vnd.dayflow.backup+json"
    });

    await db.exec("DELETE FROM task_events; DELETE FROM project_events; DELETE FROM tasks; DELETE FROM projects;");
    expect((await db.query("SELECT id FROM tasks")).rows).toHaveLength(0);

    const result = await restoreEncryptedBackup(file, "a secure DayFlow recovery passphrase 2026");
    expect(result).toEqual({ projectCount: 1, taskCount: 3 });

    const parentChild = await db.query<{ id: string; parent_task_id: string | null; progress: number }>(
      "SELECT id,parent_task_id,progress FROM tasks WHERE id IN ('task-parent','task-child') ORDER BY id"
    );
    expect(parentChild.rows).toEqual([
      { id: "task-child", parent_task_id: "task-parent", progress: 35 },
      { id: "task-parent", parent_task_id: null, progress: 0 }
    ]);

    const archived = await db.query<{ archived: boolean; archive_batch_id: string | null }>(
      "SELECT (archived_at IS NOT NULL) AS archived,archive_batch_id FROM tasks WHERE id='task-archived'"
    );
    expect(archived.rows[0]).toEqual({ archived: true, archive_batch_id: "archive-batch-1" });

    const histories = await db.query<{ task_events: number; project_events: number }>(
      "SELECT (SELECT COUNT(*)::int FROM task_events) AS task_events, " +
        "(SELECT COUNT(*)::int FROM project_events) AS project_events"
    );
    expect(histories.rows[0]).toEqual({ task_events: 2, project_events: 1 });

    await expect(
      restoreEncryptedBackup(file, "a different incorrect passphrase 2026")
    ).rejects.toThrow(/passphrase is incorrect/i);

    const stillPresent = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM tasks"
    );
    expect(stillPresent.rows[0]?.count).toBe(3);
  });
});
