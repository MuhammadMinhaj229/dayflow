import { getDatabase } from "./client";
import type { ModuleKey, Priority, Task, TaskDraft, TaskStatus } from "../domain/task";

interface TaskRow {
  id: string;
  title: string;
  details: string | null;
  module_key: ModuleKey;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  scheduled_start: string | null;
  next_action: string | null;
  blocker: string | null;
  progress: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const TASK_COLUMNS =
  "id, title, details, module_key, status, priority, " +
  "due_date::text AS due_date, scheduled_start::text AS scheduled_start, " +
  "next_action, blocker, progress::float8 AS progress, notes, " +
  "created_at::text AS created_at, updated_at::text AS updated_at";

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    moduleKey: row.module_key,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    scheduledStart: row.scheduled_start,
    nextAction: row.next_action,
    blocker: row.blocker,
    progress: Number(row.progress),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function nullable(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function listTasks(): Promise<Task[]> {
  const db = await getDatabase();
  const result = await db.query<TaskRow>(
    "SELECT " + TASK_COLUMNS +
      " FROM tasks WHERE archived_at IS NULL " +
      "ORDER BY (due_date IS NULL), due_date ASC, " +
      "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, " +
      "created_at ASC"
  );
  return result.rows.map(mapTask);
}

export async function createTask(draft: TaskDraft): Promise<Task> {
  const title = draft.title.trim();
  if (!title) throw new Error("A task title is required.");
  if (title.length > 240) throw new Error("Task titles must be 240 characters or fewer.");

  const db = await getDatabase();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  return db.transaction(async (tx) => {
    const result = await tx.query<TaskRow>(
      "INSERT INTO tasks (" +
        "id, title, details, module_key, status, priority, due_date, scheduled_start, " +
        "next_action, blocker, progress, notes, created_at, updated_at" +
      ") VALUES ($1,$2,$3,$4,'next',$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING " +
      TASK_COLUMNS,
      [
        id, title, nullable(draft.details), draft.moduleKey, draft.priority,
        nullable(draft.dueDate), nullable(draft.scheduledStart),
        nullable(draft.nextAction), nullable(draft.blocker),
        Math.min(100, Math.max(0, Number(draft.progress) || 0)),
        nullable(draft.notes), timestamp
      ]
    );

    await tx.query(
      "INSERT INTO task_events (id, task_id, event_type, metadata, created_at) " +
        "VALUES ($1,$2,'task.created','{}'::jsonb,$3)",
      [crypto.randomUUID(), id, timestamp]
    );

    const row = result.rows[0];
    if (!row) throw new Error("The task could not be created.");
    return mapTask(row);
  });
}

export async function updateTask(id: string, draft: TaskDraft): Promise<Task> {
  const title = draft.title.trim();
  if (!title) throw new Error("A task title is required.");
  if (title.length > 240) throw new Error("Task titles must be 240 characters or fewer.");

  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  return db.transaction(async (tx) => {
    const result = await tx.query<TaskRow>(
      "UPDATE tasks SET title=$2, details=$3, module_key=$4, priority=$5, due_date=$6, " +
        "scheduled_start=$7, next_action=$8, blocker=$9, progress=$10, notes=$11, updated_at=$12 " +
        "WHERE id=$1 AND archived_at IS NULL RETURNING " + TASK_COLUMNS,
      [
        id, title, nullable(draft.details), draft.moduleKey, draft.priority,
        nullable(draft.dueDate), nullable(draft.scheduledStart),
        nullable(draft.nextAction), nullable(draft.blocker),
        Math.min(100, Math.max(0, Number(draft.progress) || 0)),
        nullable(draft.notes), timestamp
      ]
    );

    const row = result.rows[0];
    if (!row) throw new Error("This task no longer exists or has been archived.");

    await tx.query(
      "INSERT INTO task_events (id, task_id, event_type, metadata, created_at) " +
        "VALUES ($1,$2,'task.updated','{}'::jsonb,$3)",
      [crypto.randomUUID(), id, timestamp]
    );
    return mapTask(row);
  });
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  await db.transaction(async (tx) => {
    const result = await tx.query<{ id: string }>(
      "UPDATE tasks SET status=$2, completed_at=$3, " +
        "progress=CASE WHEN $2='done' THEN 100 ELSE CASE WHEN progress=100 THEN 0 ELSE progress END END, " +
        "updated_at=$3 WHERE id=$1 AND archived_at IS NULL RETURNING id",
      [id, status, status === "done" ? timestamp : null]
    );
    if (result.rows.length === 0) throw new Error("The task could not be updated.");

    await tx.query(
      "INSERT INTO task_events (id, task_id, event_type, metadata, created_at) " +
        "VALUES ($1,$2,'task.status_changed',$3::jsonb,$4)",
      [crypto.randomUUID(), id, JSON.stringify({ status }), timestamp]
    );
  });
}

export async function archiveTask(id: string): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  await db.transaction(async (tx) => {
    const result = await tx.query<{ id: string }>(
      "UPDATE tasks SET archived_at=$2, updated_at=$2 " +
        "WHERE id=$1 AND archived_at IS NULL RETURNING id",
      [id, timestamp]
    );
    if (result.rows.length === 0) throw new Error("The task could not be archived.");

    await tx.query(
      "INSERT INTO task_events (id, task_id, event_type, metadata, created_at) " +
        "VALUES ($1,$2,'task.archived','{}'::jsonb,$3)",
      [crypto.randomUUID(), id, timestamp]
    );
  });
}
