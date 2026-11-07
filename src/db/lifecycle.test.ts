import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { TaskDraft, ProjectDraft } from "../domain/task";
import { applyMigrations } from "./migrations";

const databaseState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("./client", () => ({
  getDatabase: async () => {
    if (!databaseState.current) throw new Error("Test database is not initialised.");
    return databaseState.current;
  }
}));

import {
  archiveTask,
  createTask,
  listArchivedTasks,
  listTasks,
  restoreTask,
  updateTask
} from "./task-repository";
import {
  archiveProject,
  createProject,
  getProjectEvents,
  listArchivedProjects,
  listProjects,
  restoreProject,
  updateProject
} from "./project-repository";

let db: PGlite;

const projectDraft: ProjectDraft = {
  name: "Field research workspace",
  description: "Project-level planning only",
  moduleKey: "research",
  status: "active",
  priority: "high",
  dueDate: null
};

function taskDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: "Prepare study materials",
    details: null,
    moduleKey: "research",
    projectId: null,
    parentTaskId: null,
    orderIndex: 0,
    priority: "medium",
    dueDate: null,
    scheduledStart: null,
    estimatedMinutes: 30,
    nextAction: "Review the checklist",
    blocker: null,
    progress: 0,
    notes: null,
    ...overrides
  };
}

beforeEach(async () => {
  db = await PGlite.create("memory://");
  databaseState.current = db;
  await applyMigrations(db);
});

afterEach(async () => {
  databaseState.current = null;
  await db.close();
});

describe("task hierarchy and archive batches", () => {
  it("archives and restores a complete active subtask tree without restoring older archived records", async () => {
    const parent = await createTask(taskDraft({ title: "Parent task" }));
    const child = await createTask(taskDraft({ title: "Child task", parentTaskId: parent.id }));
    const previouslyArchived = await createTask(taskDraft({ title: "Previously archived task" }));
    await archiveTask(previouslyArchived.id);

    await archiveTask(parent.id);

    const activeAfterArchive = await listTasks();
    expect(activeAfterArchive.map((task) => task.id)).toEqual([]);

    const archivedAfterArchive = await listArchivedTasks();
    expect(new Set(archivedAfterArchive.map((task) => task.id))).toEqual(
      new Set([parent.id, child.id, previouslyArchived.id])
    );

    await restoreTask(parent.id);

    const activeAfterRestore = await listTasks();
    expect(new Set(activeAfterRestore.map((task) => task.id))).toEqual(new Set([parent.id, child.id]));
    const archivedAfterRestore = await listArchivedTasks();
    expect(archivedAfterRestore.map((task) => task.id)).toEqual([previouslyArchived.id]);
  });

  it("rejects a parent reassignment that would create a cycle", async () => {
    const parent = await createTask(taskDraft({ title: "Parent" }));
    const child = await createTask(taskDraft({ title: "Child", parentTaskId: parent.id }));
    await expect(updateTask(parent.id, taskDraft({
      title: "Parent",
      parentTaskId: child.id
    }))).rejects.toThrow(/circular/i);
  });
});

describe("project lifecycle", () => {
  it("archives and restores linked tasks as a batch and records project history", async () => {
    const project = await createProject(projectDraft);
    const parent = await createTask(taskDraft({ title: "Project task", projectId: project.id }));
    const child = await createTask(taskDraft({
      title: "Project subtask",
      projectId: project.id,
      parentTaskId: parent.id
    }));
    const older = await createTask(taskDraft({ title: "Unrelated archived task" }));
    await archiveTask(older.id);

    await archiveProject(project.id);
    expect(await listProjects({ includeCompleted: true })).toHaveLength(0);
    expect((await listArchivedProjects()).map((item) => item.id)).toEqual([project.id]);
    expect((await listTasks()).map((task) => task.id)).toEqual([]);

    await restoreProject(project.id);
    expect(new Set((await listTasks()).map((task) => task.id))).toEqual(new Set([parent.id, child.id]));
    expect((await listArchivedTasks()).map((task) => task.id)).toEqual([older.id]);
    expect(await listArchivedProjects()).toHaveLength(0);

    const history = await getProjectEvents(project.id);
    expect(history.map((event) => event.eventType)).toEqual(["project.restored", "project.archived", "project.created"]);
  });

  it("prevents changing a project module while tasks are still linked", async () => {
    const project = await createProject(projectDraft);
    await createTask(taskDraft({ projectId: project.id }));
    await expect(updateProject(project.id, { ...projectDraft, moduleKey: "projects" }))
      .rejects.toThrow(/move the project's tasks/i);
  });
});
