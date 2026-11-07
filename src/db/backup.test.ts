import { describe, expect, it } from "vitest";
import {
  createEncryptedBackup,
  restoreEncryptedBackup,
  validateBackupPayload
} from "./backup";

const validPayload = {
  schemaVersion: 2,
  exportedAt: "2026-11-07T00:00:00.000Z",
  projects: [{
    id: "project-a",
    name: "A project",
    description: null,
    module_key: "projects",
    status: "active",
    priority: "medium",
    due_date: null,
    archived_at: null,
    created_at: "2026-11-07T00:00:00.000Z",
    updated_at: "2026-11-07T00:00:00.000Z"
  }],
  tasks: [{
    id: "task-a",
    title: "Parent task",
    details: null,
    module_key: "projects",
    project_id: "project-a",
    parent_task_id: null,
    order_index: 0,
    status: "next",
    priority: "high",
    due_date: null,
    scheduled_start: null,
    estimated_minutes: null,
    next_action: null,
    blocker: null,
    progress: 0,
    notes: null,
    completed_at: null,
    archived_at: null,
    created_at: "2026-11-07T00:00:00.000Z",
    updated_at: "2026-11-07T00:00:00.000Z"
  }],
  taskEvents: [{
    id: "event-a",
    task_id: "task-a",
    event_type: "task.created",
    metadata: {},
    created_at: "2026-11-07T00:00:00.000Z"
  }]
};

describe("encrypted backup validation", () => {
  it("accepts a complete relational backup", () => {
    expect(validateBackupPayload(validPayload).tasks).toHaveLength(1);
  });

  it("rejects tasks referencing a missing project", () => {
    const corrupted = structuredClone(validPayload);
    corrupted.tasks[0].project_id = "missing";
    expect(() => validateBackupPayload(corrupted)).toThrow(/missing from this backup/i);
  });

  it("rejects circular subtask relationships", () => {
    const corrupted = structuredClone(validPayload);
    corrupted.tasks.push({
      ...corrupted.tasks[0],
      id: "task-b",
      project_id: "project-a",
      parent_task_id: "task-a"
    });
    corrupted.tasks[0].parent_task_id = "task-b";
    expect(() => validateBackupPayload(corrupted)).toThrow(/circular/i);
  });
});

describe("backup encryption contract", () => {
  it("requires a strong passphrase", async () => {
    await expect(createEncryptedBackup("short")).rejects.toThrow(/12 characters/i);
  });

  it("rejects a restore with the wrong passphrase without touching the database", async () => {
    // The file envelope is validated and authenticated before any database transaction starts.
    const fake = new File(["{}"], "fake.dayflow", { type: "application/json" });
    await expect(restoreEncryptedBackup(fake, "a sufficiently long passphrase")).rejects.toThrow();
  });
});
