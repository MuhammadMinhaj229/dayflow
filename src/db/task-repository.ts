import { getDatabase } from "./client";
import { publishWorkspaceChange } from "./change-notifications";
import type { Transaction } from "@electric-sql/pglite";
import type { ModuleKey, Priority, Task, TaskDraft, TaskStatus } from "../domain/task";

interface TaskRow {
  id: string;
  title: string;
  details: string | null;
  module_key: ModuleKey;
  project_id: string | null;
  parent_task_id: string | null;
  order_index: number;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  scheduled_start: string | null;
  estimated_minutes: number | null;
  next_action: string | null;
  blocker: string | null;
  progress: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface EventRow {
  id: string;
  task_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const TASK_COLUMNS =
  "id, title, details, module_key, project_id, parent_task_id, order_index, status, priority, " +
  "due_date::text AS due_date, scheduled_start::text AS scheduled_start, estimated_minutes, " +
  "next_action, blocker, progress::float8 AS progress, notes, " +
  "created_at::text AS created_at, updated_at::text AS updated_at";

const DRAFT_FIELDS = [
  "title", "details", "moduleKey", "projectId", "parentTaskId", "orderIndex",
  "priority", "dueDate", "scheduledStart", "estimatedMinutes",
  "nextAction", "blocker", "progress", "notes"
] as const;

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    moduleKey: row.module_key,
    projectId: row.project_id,
    parentTaskId: row.parent_task_id,
    orderIndex: Number(row.order_index),
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    scheduledStart: row.scheduled_start,
    estimatedMinutes: row.estimated_minutes === null ? null : Number(row.estimated_minutes),
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

function normaliseDraft(draft: TaskDraft): TaskDraft {
  const title = draft.title.trim();
  if (!title) throw new Error("A task title is required.");
  if (title.length > 240) throw new Error("Task titles must be 240 characters or fewer.");

  const progress = Number(draft.progress);
  const estimate = draft.estimatedMinutes === null ? null : Number(draft.estimatedMinutes);
  if (estimate !== null && (!Number.isInteger(estimate) || estimate < 1 || estimate > 100000)) {
    throw new Error("Estimate must be a whole number between 1 and 100,000 minutes.");
  }
  if (!Number.isInteger(draft.orderIndex) || draft.orderIndex < 0) {
    throw new Error("Task order must be a non-negative integer.");
  }

  return {
    ...draft,
    title,
    details: nullable(draft.details),
    nextAction: nullable(draft.nextAction),
    blocker: nullable(draft.blocker),
    notes: nullable(draft.notes),
    projectId: nullable(draft.projectId),
    parentTaskId: nullable(draft.parentTaskId),
    dueDate: nullable(draft.dueDate),
    scheduledStart: nullable(draft.scheduledStart),
    estimatedMinutes: estimate,
    progress: Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0))
  };
}

async function validateReferences(
  tx: Transaction,
  draft: TaskDraft,
  currentTaskId?: string
): Promise<void> {
  if (draft.projectId) {
    const project = await tx.query<{ module_key: ModuleKey; archived_at: string | null }>(
      "SELECT module_key, archived_at FROM projects WHERE id = $1",
      [draft.projectId]
    );
    const projectRow = project.rows[0];
    if (!projectRow || projectRow.archived_at) throw new Error("Select an active project.");
    if (projectRow.module_key !== draft.moduleKey) {
      throw new Error("A task and its project must belong to the same module.");
    }
  }

  if (currentTaskId) {
    const incompatibleChild = await tx.query<{ id: string }>(
      "SELECT id FROM tasks WHERE parent_task_id=$1 " +
        "AND (module_key<>$2 OR project_id IS DISTINCT FROM $3) LIMIT 1",
      [currentTaskId, draft.moduleKey, draft.projectId]
    );
    if (incompatibleChild.rows[0]) {
      throw new Error("Move or detach this task's subtasks before changing its module or project.");
    }
  }

  if (!draft.parentTaskId) return;
  if (draft.parentTaskId === currentTaskId) throw new Error("A task cannot be its own parent.");

  const parent = await tx.query<{ module_key: ModuleKey; project_id: string | null; id: string }>(
    "SELECT id, module_key, project_id FROM tasks WHERE id = $1 AND archived_at IS NULL",
    [draft.parentTaskId]
  );
  const parentRow = parent.rows[0];
  if (!parentRow) throw new Error("Select an active parent task.");
  if (parentRow.module_key !== draft.moduleKey) {
    throw new Error("A subtask must belong to the same module as its parent.");
  }
  if ((parentRow.project_id ?? null) !== (draft.projectId ?? null)) {
    throw new Error("A subtask must belong to the same project as its parent.");
  }

  if (currentTaskId) {
    const cycle = await tx.query<{ creates_cycle: boolean }>(
      "WITH RECURSIVE ancestors(id, parent_task_id) AS (" +
        "SELECT id, parent_task_id FROM tasks WHERE id=$1 " +
        "UNION " +
        "SELECT parent.id, parent.parent_task_id FROM tasks parent " +
        "JOIN ancestors child ON parent.id=child.parent_task_id" +
      ") SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=$2) AS creates_cycle",
      [draft.parentTaskId, currentTaskId]
    );
    if (cycle.rows[0]?.creates_cycle) {
      throw new Error("This parent would create a circular subtask relationship.");
    }
  }
}

function changedFields(previous: Task, next: TaskDraft): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of DRAFT_FIELDS) {
    if (previous[key] !== next[key]) {
      changes[key] = { from: previous[key], to: next[key] };
    }
  }
  return changes;
}

async function insertEvent(
  tx: Transaction,
  taskId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  timestamp: string
): Promise<void> {
  await tx.query(
    "INSERT INTO task_events (id, task_id, event_type, metadata, created_at) " +
      "VALUES ($1,$2,$3,$4::jsonb,$5)",
    [crypto.randomUUID(), taskId, eventType, JSON.stringify(metadata), timestamp]
  );
}

export async function listTasks(options: { includeArchived?: boolean; moduleKey?: ModuleKey } = {}): Promise<Task[]> {
  const db = await getDatabase();
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (!options.includeArchived) clauses.push("archived_at IS NULL");
  if (options.moduleKey) {
    values.push(options.moduleKey);
    clauses.push("module_key = $" + values.length);
  }
  const where = clauses.length > 0 ? " WHERE " + clauses.join(" AND ") : "";
  const result = await db.query<TaskRow>(
    "SELECT " + TASK_COLUMNS + " FROM tasks" + where +
      " ORDER BY order_index ASC, (due_date IS NULL), due_date ASC, " +
      "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, " +
      "created_at ASC",
    values
  );
  return result.rows.map(mapTask);
}

export async function listArchivedTasks(): Promise<Task[]> {
  const db = await getDatabase();
  const result = await db.query<TaskRow>(
    "SELECT " + TASK_COLUMNS + " FROM tasks WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, order_index ASC"
  );
  return result.rows.map(mapTask);
}

export async function createTask(input: TaskDraft): Promise<Task> {
  const draft = normaliseDraft(input);
  const db = await getDatabase();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const created = await db.transaction(async (tx) => {
    await validateReferences(tx, draft);
    const result = await tx.query<TaskRow>(
      "INSERT INTO tasks (" +
        "id, title, details, module_key, project_id, parent_task_id, order_index, status, priority, " +
        "due_date, scheduled_start, estimated_minutes, next_action, blocker, progress, notes, created_at, updated_at" +
      ") VALUES ($1,$2,$3,$4,$5,$6,$7,'next',$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING " +
      TASK_COLUMNS,
      [
        id, draft.title, draft.details, draft.moduleKey, draft.projectId, draft.parentTaskId,
        draft.orderIndex, draft.priority, draft.dueDate, draft.scheduledStart, draft.estimatedMinutes,
        draft.nextAction, draft.blocker, draft.progress, draft.notes, timestamp
      ]
    );

    await insertEvent(tx, id, "task.created", { title: draft.title, moduleKey: draft.moduleKey }, timestamp);
    const row = result.rows[0];
    if (!row) throw new Error("The task could not be created.");
    return mapTask(row);
  });
  publishWorkspaceChange();
  return created;
}

export async function updateTask(id: string, input: TaskDraft): Promise<Task> {
  const draft = normaliseDraft(input);
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  const updated = await db.transaction(async (tx) => {
    const current = await tx.query<TaskRow>(
      "SELECT " + TASK_COLUMNS + " FROM tasks WHERE id=$1 AND archived_at IS NULL FOR UPDATE",
      [id]
    );
    const existing = current.rows[0];
    if (!existing) throw new Error("This task no longer exists or has been archived.");

    await validateReferences(tx, draft, id);
    const previous = mapTask(existing);
    const changes = changedFields(previous, draft);
    if (Object.keys(changes).length === 0) return previous;

    const result = await tx.query<TaskRow>(
      "UPDATE tasks SET title=$2, details=$3, module_key=$4, project_id=$5, parent_task_id=$6, " +
        "order_index=$7, priority=$8, due_date=$9, scheduled_start=$10, estimated_minutes=$11, " +
        "next_action=$12, blocker=$13, progress=$14, notes=$15, updated_at=$16 " +
        "WHERE id=$1 AND archived_at IS NULL RETURNING " + TASK_COLUMNS,
      [
        id, draft.title, draft.details, draft.moduleKey, draft.projectId, draft.parentTaskId,
        draft.orderIndex, draft.priority, draft.dueDate, draft.scheduledStart, draft.estimatedMinutes,
        draft.nextAction, draft.blocker, draft.progress, draft.notes, timestamp
      ]
    );

    const row = result.rows[0];
    if (!row) throw new Error("The task could not be updated.");
    await insertEvent(tx, id, "task.updated", { changes }, timestamp);
    return mapTask(row);
  });
  publishWorkspaceChange();
  return updated;
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  await db.transaction(async (tx) => {
    const current = await tx.query<{ status: TaskStatus }>(
      "SELECT status FROM tasks WHERE id=$1 AND archived_at IS NULL FOR UPDATE",
      [id]
    );
    const previous = current.rows[0]?.status;
    if (!previous) throw new Error("The task could not be updated.");
    if (previous === status) return;

    const result = await tx.query<{ id: string }>(
      "UPDATE tasks SET status=$2, completed_at=$3, " +
        "progress=CASE WHEN $2='done' THEN 100 ELSE CASE WHEN progress=100 THEN 0 ELSE progress END END, " +
        "updated_at=$4 WHERE id=$1 AND archived_at IS NULL RETURNING id",
      [id, status, status === "done" ? timestamp : null, timestamp]
    );
    if (!result.rows[0]) throw new Error("The task could not be updated.");
    await insertEvent(tx, id, "task.status_changed", { from: previous, to: status }, timestamp);
  });
  publishWorkspaceChange();
}

export async function archiveTask(id: string): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();
  const batchId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    const alreadyArchivedDescendant = await tx.query<{ id: string }>(
      "WITH RECURSIVE descendants(id) AS (" +
        "SELECT id FROM tasks WHERE id=$1 " +
        "UNION " +
        "SELECT child.id FROM tasks child JOIN descendants parent ON child.parent_task_id=parent.id" +
      ") SELECT task.id FROM tasks task JOIN descendants descendant ON descendant.id=task.id " +
      "WHERE task.id<>$1 AND task.archived_at IS NOT NULL LIMIT 1",
      [id]
    );
    if (alreadyArchivedDescendant.rows[0]) {
      throw new Error("Restore archived subtasks before archiving this parent so the entire task tree stays recoverable.");
    }

    const result = await tx.query<{ id: string }>(
      "WITH RECURSIVE descendants(id) AS (" +
        "SELECT id FROM tasks WHERE id=$1 AND archived_at IS NULL " +
        "UNION " +
        "SELECT child.id FROM tasks child JOIN descendants parent ON child.parent_task_id=parent.id " +
        "WHERE child.archived_at IS NULL" +
      ") UPDATE tasks SET archived_at=$2, archive_batch_id=$3, updated_at=$2 " +
      "WHERE id IN (SELECT id FROM descendants) RETURNING id",
      [id, timestamp, batchId]
    );
    if (result.rows.length === 0) throw new Error("The task could not be archived.");

    for (const row of result.rows) {
      await insertEvent(tx, row.id, "task.archived", { batchId }, timestamp);
    }
  });
  publishWorkspaceChange();
}

export async function restoreTask(id: string): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  await db.transaction(async (tx) => {
    const anchor = await tx.query<{ archive_batch_id: string | null }>(
      "SELECT archive_batch_id FROM tasks WHERE id=$1 AND archived_at IS NOT NULL FOR UPDATE",
      [id]
    );
    if (!anchor.rows[0]) throw new Error("This archived task could not be restored.");
    const batchId = anchor.rows[0].archive_batch_id;
    if (batchId) {
      const projectBatch = await tx.query<{ id: string }>(
        "SELECT id FROM projects WHERE archive_batch_id=$1 AND archived_at IS NOT NULL LIMIT 1",
        [batchId]
      );
      if (projectBatch.rows[0]) {
        throw new Error("This task was archived with its project. Restore the project from the archive to recover the complete task group.");
      }
    }
    const restored = batchId
      ? await tx.query<{ id: string }>(
          "UPDATE tasks SET archived_at=NULL, archive_batch_id=NULL, updated_at=$2 " +
            "WHERE archive_batch_id=$1 AND archived_at IS NOT NULL RETURNING id",
          [batchId, timestamp]
        )
      : await tx.query<{ id: string }>(
          "UPDATE tasks SET archived_at=NULL, updated_at=$2 WHERE id=$1 AND archived_at IS NOT NULL RETURNING id",
          [id, timestamp]
        );

    for (const row of restored.rows) {
      await insertEvent(tx, row.id, "task.restored", { batchId }, timestamp);
    }
  });
  publishWorkspaceChange();
}

export async function reorderTask(id: string, orderIndex: number): Promise<void> {
  if (!Number.isInteger(orderIndex) || orderIndex < 0) {
    throw new Error("Task order must be a non-negative integer.");
  }
  const db = await getDatabase();
  const timestamp = new Date().toISOString();
  await db.transaction(async (tx) => {
    const result = await tx.query<{ id: string }>(
      "UPDATE tasks SET order_index=$2, updated_at=$3 WHERE id=$1 AND archived_at IS NULL RETURNING id",
      [id, orderIndex, timestamp]
    );
    if (!result.rows[0]) throw new Error("The task could not be reordered.");
    await insertEvent(tx, id, "task.reordered", { orderIndex }, timestamp);
  });
  publishWorkspaceChange();
}

export async function getTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const db = await getDatabase();
  const result = await db.query<EventRow>(
    "SELECT id, task_id, event_type, metadata, created_at::text AS created_at " +
      "FROM task_events WHERE task_id=$1 ORDER BY created_at DESC LIMIT 50",
    [taskId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    metadata: row.metadata,
    createdAt: row.created_at
  }));
}
