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

type MutablePayload = {
  schemaVersion: number;
  exportedAt: string;
  projects: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  taskEvents: Array<Record<string, unknown>>;
};

function clonePayload(): MutablePayload {
  return structuredClone(validPayload) as MutablePayload;
}

describe("encrypted backup validation", () => {
  it("accepts a complete relational backup", () => {
    expect(validateBackupPayload(validPayload).tasks).toHaveLength(1);
  });

  it("rejects tasks referencing a missing project", () => {
    const corrupted = clonePayload();
    const task = corrupted.tasks[0];
    if (!task) throw new Error("Test fixture missing task.");
    task.project_id = "missing";
    expect(() => validateBackupPayload(corrupted)).toThrow(/missing from this backup/i);
  });

  it("rejects circular subtask relationships", () => {
    const corrupted = clonePayload();
    const first = corrupted.tasks[0];
    if (!first) throw new Error("Test fixture missing task.");
    const second = { ...first, id: "task-b", parent_task_id: "task-a" };
    first.parent_task_id = "task-b";
    corrupted.tasks.push(second);
    expect(() => validateBackupPayload(corrupted)).toThrow(/circular/i);
  });
});

describe("backup encryption contract", () => {
  it("requires a strong passphrase", async () => {
    await expect(createEncryptedBackup("short")).rejects.toThrow(/12 characters/i);
  });

  it("rejects a file that is not an encrypted DayFlow backup", async () => {
    const fake = new File(["{}"], "fake.dayflow", { type: "application/json" });
    await expect(restoreEncryptedBackup(fake, "a sufficiently long passphrase")).rejects.toThrow(/supported DayFlow/i);
  });
});
