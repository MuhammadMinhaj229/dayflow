import { describe, expect, it } from "vitest";
import {
  createEncryptedBackup,
  decryptBackupFile,
  encryptBackupPayload,
  restoreEncryptedBackup,
  validateBackupPayload
} from "./backup";

const validPayload = {
  schemaVersion: 3,
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
    archive_batch_id: null,
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
    archive_batch_id: null,
    created_at: "2026-11-07T00:00:00.000Z",
    updated_at: "2026-11-07T00:00:00.000Z"
  }],
  taskEvents: [{
    id: "event-a",
    task_id: "task-a",
    event_type: "task.created",
    metadata: {},
    created_at: "2026-11-07T00:00:00.000Z"
  }],
  projectEvents: [{
    id: "project-event-a",
    project_id: "project-a",
    event_type: "project.created",
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
  projectEvents: Array<Record<string, unknown>>;
};

function clonePayload(): MutablePayload {
  return structuredClone(validPayload) as MutablePayload;
}

describe("encrypted backup validation", () => {
  it("accepts a complete relational backup including project history", () => {
    const checked = validateBackupPayload(validPayload);
    expect(checked.tasks).toHaveLength(1);
    expect(checked.projectEvents).toHaveLength(1);
  });

  it("upgrades version 2 backup payloads without losing existing records", () => {
    const legacy = clonePayload();
    legacy.schemaVersion = 2;
    legacy.projectEvents = [];
    if (legacy.projects[0]) legacy.projects[0].archive_batch_id = undefined;
    if (legacy.tasks[0]) legacy.tasks[0].archive_batch_id = undefined;

    const checked = validateBackupPayload(legacy);
    expect(checked.schemaVersion).toBe(3);
    expect(checked.projectEvents).toEqual([]);
    expect(checked.projects[0]?.archive_batch_id).toBeNull();
    expect(checked.tasks[0]?.archive_batch_id).toBeNull();
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

  it("rejects project history that points to a missing project", () => {
    const corrupted = clonePayload();
    const event = corrupted.projectEvents[0];
    if (!event) throw new Error("Test fixture missing project event.");
    event.project_id = "missing";
    expect(() => validateBackupPayload(corrupted)).toThrow(/project history refers to a missing project/i);
  });

  it("rejects an archive batch attached to an active record", () => {
    const corrupted = clonePayload();
    const project = corrupted.projects[0];
    if (!project) throw new Error("Test fixture missing project.");
    project.archive_batch_id = "orphan-batch";
    expect(() => validateBackupPayload(corrupted)).toThrow(/invalid project record/i);
  });
});

describe("backup encryption contract", () => {
  it("requires a strong passphrase", async () => {
    await expect(createEncryptedBackup("short")).rejects.toThrow(/12 characters/i);
  });

  it("encrypts and decrypts a valid backup payload", async () => {
    const passphrase = "a secure long passphrase 2026";
    const blob = await encryptBackupPayload(validPayload, passphrase);
    const file = new File([await blob.arrayBuffer()], "dayflow.dayflow", {
      type: "application/vnd.dayflow.backup+json"
    });
    const restored = await decryptBackupFile(file, passphrase);
    expect(restored.projects).toHaveLength(1);
    expect(restored.tasks[0]?.title).toBe("Parent task");
    expect(restored.projectEvents[0]?.event_type).toBe("project.created");
  });

  it("rejects a wrong passphrase before a restore transaction can start", async () => {
    const blob = await encryptBackupPayload(validPayload, "a secure long passphrase 2026");
    const file = new File([await blob.arrayBuffer()], "dayflow.dayflow", {
      type: "application/vnd.dayflow.backup+json"
    });
    await expect(decryptBackupFile(file, "a different incorrect passphrase")).rejects.toThrow(/passphrase is incorrect/i);
  });

  it("rejects a file that is not an encrypted DayFlow backup", async () => {
    const fake = new File(["{}"], "fake.dayflow", { type: "application/json" });
    await expect(restoreEncryptedBackup(fake, "a sufficiently long passphrase")).rejects.toThrow(/supported DayFlow/i);
  });
});
