import { getDatabase } from "./client";
import type { Transaction } from "@electric-sql/pglite";
import type { ModuleKey, Priority, Project, ProjectDraft, ProjectStatus } from "../domain/task";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  module_key: ModuleKey;
  status: ProjectStatus;
  priority: Priority;
  due_date: string | null;
  task_count: number;
  completed_task_count: number;
  progress: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectEvent {
  id: string;
  projectId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const PROJECT_SELECT =
  "SELECT p.id, p.name, p.description, p.module_key, p.status, p.priority, " +
    "p.due_date::text AS due_date, " +
    "COUNT(t.id)::int AS task_count, " +
    "COUNT(t.id) FILTER (WHERE t.status='done')::int AS completed_task_count, " +
    "AVG(CASE WHEN t.status='done' THEN 100 WHEN t.status='cancelled' THEN NULL ELSE t.progress END)::float8 AS progress, " +
    "p.created_at::text AS created_at, p.updated_at::text AS updated_at " +
  "FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.archived_at IS NULL ";

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    moduleKey: row.module_key,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    taskCount: Number(row.task_count),
    completedTaskCount: Number(row.completed_task_count),
    progress: row.progress === null ? 0 : Math.round(Number(row.progress)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function clean(value: string | null): string | null {
  const result = value?.trim() ?? "";
  return result.length > 0 ? result : null;
}

function validate(input: ProjectDraft): ProjectDraft {
  const name = input.name.trim();
  if (!name) throw new Error("A project name is required.");
  if (name.length > 160) throw new Error("Project names must be 160 characters or fewer.");
  return {
    ...input,
    name,
    description: clean(input.description),
    dueDate: clean(input.dueDate)
  };
}

async function insertProjectEvent(
  tx: Transaction,
  projectId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  timestamp: string
): Promise<void> {
  await tx.query(
    "INSERT INTO project_events (id,project_id,event_type,metadata,created_at) VALUES ($1,$2,$3,$4::jsonb,$5)",
    [crypto.randomUUID(), projectId, eventType, JSON.stringify(metadata), timestamp]
  );
}

export async function listProjects(options: {
  moduleKey?: ModuleKey;
  includeCompleted?: boolean;
  includeArchived?: boolean;
  archivedOnly?: boolean;
} = {}): Promise<Project[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options.archivedOnly) {
    conditions.push("p.archived_at IS NOT NULL");
  } else if (!options.includeArchived) {
    conditions.push("p.archived_at IS NULL");
  }
  if (!options.includeCompleted) conditions.push("p.status <> 'completed'");
  if (options.moduleKey) {
    values.push(options.moduleKey);
    conditions.push("p.module_key=$" + values.length);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") + " " : "";
  const result = await db.query<ProjectRow>(
    PROJECT_SELECT + where + "GROUP BY p.id ORDER BY p.due_date NULLS LAST, p.updated_at DESC",
    values
  );
  return result.rows.map(mapProject);
}

export async function listArchivedProjects(): Promise<Project[]> {
  return listProjects({ includeCompleted: true, archivedOnly: true });
}

export async function createProject(input: ProjectDraft): Promise<Project> {
  const draft = validate(input);
  const db = await getDatabase();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  return db.transaction(async (tx) => {
    const result = await tx.query<ProjectRow>(
      "INSERT INTO projects (id,name,description,module_key,status,priority,due_date,created_at,updated_at) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING " +
        "id,name,description,module_key,status,priority,due_date::text AS due_date,0::int AS task_count," +
        "0::int AS completed_task_count,NULL::float8 AS progress,created_at::text AS created_at,updated_at::text AS updated_at",
      [id,draft.name,draft.description,draft.moduleKey,draft.status,draft.priority,draft.dueDate,timestamp]
    );
    const row = result.rows[0];
    if (!row) throw new Error("The project could not be created.");
    await insertProjectEvent(tx,id,"project.created",{name:draft.name,moduleKey:draft.moduleKey},timestamp);
    return mapProject(row);
  });
}

export async function updateProject(id: string, input: ProjectDraft): Promise<void> {
  const draft = validate(input);
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  await db.transaction(async (tx) => {
    const current = await tx.query<{ module_key: ModuleKey; name: string; description: string | null; status: ProjectStatus; priority: Priority; due_date: string | null }>(
      "SELECT module_key,name,description,status,priority,due_date::text AS due_date FROM projects WHERE id=$1 AND archived_at IS NULL FOR UPDATE",
      [id]
    );
    const existing = current.rows[0];
    if (!existing) throw new Error("The project could not be updated.");

    if (existing.module_key !== draft.moduleKey) {
      const linked = await tx.query<{ id: string }>(
        "SELECT id FROM tasks WHERE project_id=$1 LIMIT 1",
        [id]
      );
      if (linked.rows.length > 0) {
        throw new Error("Unassign the project's tasks before changing the project module, then reassign them afterward.");
      }
    }

    const result = await tx.query(
      "UPDATE projects SET name=$2,description=$3,module_key=$4,status=$5,priority=$6,due_date=$7,updated_at=$8 " +
        "WHERE id=$1 AND archived_at IS NULL",
      [id,draft.name,draft.description,draft.moduleKey,draft.status,draft.priority,draft.dueDate,timestamp]
    );
    if (result.affectedRows === 0) throw new Error("The project could not be updated.");

    const changes = {
      name: existing.name === draft.name ? undefined : {from:existing.name,to:draft.name},
      description: existing.description === draft.description ? undefined : {from:existing.description,to:draft.description},
      moduleKey: existing.module_key === draft.moduleKey ? undefined : {from:existing.module_key,to:draft.moduleKey},
      status: existing.status === draft.status ? undefined : {from:existing.status,to:draft.status},
      priority: existing.priority === draft.priority ? undefined : {from:existing.priority,to:draft.priority},
      dueDate: existing.due_date === draft.dueDate ? undefined : {from:existing.due_date,to:draft.dueDate}
    };
    await insertProjectEvent(tx,id,"project.updated",{changes},timestamp);
  });
}

export async function archiveProject(id: string): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();
  const batchId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    const activeDescendantOfArchivedTask = await tx.query<{ id: string }>(
      "WITH RECURSIVE descendants(id) AS (" +
        "SELECT id FROM tasks WHERE project_id=$1 AND archived_at IS NOT NULL " +
        "UNION " +
        "SELECT child.id FROM tasks child JOIN descendants parent ON child.parent_task_id=parent.id" +
      ") SELECT task.id FROM tasks task JOIN descendants descendant ON descendant.id=task.id " +
      "WHERE task.archived_at IS NULL LIMIT 1",
      [id]
    );
    if (activeDescendantOfArchivedTask.rows[0]) {
      throw new Error("Restore or archive the existing task hierarchy before archiving this project.");
    }

    const project = await tx.query<{ id: string }>(
      "UPDATE projects SET archived_at=$2,archive_batch_id=$3,updated_at=$2 " +
        "WHERE id=$1 AND archived_at IS NULL RETURNING id",
      [id,timestamp,batchId]
    );
    if (project.rows.length === 0) throw new Error("The project could not be archived.");

    const archivedTasks = await tx.query<{ id: string }>(
      "WITH RECURSIVE project_tasks(id) AS (" +
        "SELECT id FROM tasks WHERE project_id=$1 AND archived_at IS NULL " +
        "UNION " +
        "SELECT child.id FROM tasks child JOIN project_tasks parent ON child.parent_task_id=parent.id " +
        "WHERE child.archived_at IS NULL" +
      ") UPDATE tasks SET archived_at=$2,archive_batch_id=$3,updated_at=$2 " +
      "WHERE id IN (SELECT id FROM project_tasks) AND archived_at IS NULL RETURNING id",
      [id,timestamp,batchId]
    );

    for (const row of archivedTasks.rows) {
      await tx.query(
        "INSERT INTO task_events (id,task_id,event_type,metadata,created_at) VALUES ($1,$2,'task.archived',$3::jsonb,$4)",
        [crypto.randomUUID(),row.id,JSON.stringify({batchId,reason:"project.archived"}),timestamp]
      );
    }
    await insertProjectEvent(tx,id,"project.archived",{batchId,archivedTaskCount:archivedTasks.rows.length},timestamp);
  });
}

export async function restoreProject(id: string): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  await db.transaction(async (tx) => {
    const selected = await tx.query<{ archive_batch_id: string | null }>(
      "SELECT archive_batch_id FROM projects WHERE id=$1 AND archived_at IS NOT NULL FOR UPDATE",
      [id]
    );
    const row = selected.rows[0];
    if (!row) throw new Error("This archived project could not be restored.");

    const batchId = row.archive_batch_id;
    if (batchId) {
      const restoredTasks = await tx.query<{ id: string }>(
        "UPDATE tasks SET archived_at=NULL,archive_batch_id=NULL,updated_at=$2 " +
          "WHERE archive_batch_id=$1 AND archived_at IS NOT NULL RETURNING id",
        [batchId,timestamp]
      );
      for (const task of restoredTasks.rows) {
        await tx.query(
          "INSERT INTO task_events (id,task_id,event_type,metadata,created_at) VALUES ($1,$2,'task.restored',$3::jsonb,$4)",
          [crypto.randomUUID(),task.id,JSON.stringify({batchId,reason:"project.restored"}),timestamp]
        );
      }
    }

    await tx.query(
      "UPDATE projects SET archived_at=NULL,archive_batch_id=NULL,updated_at=$2 WHERE id=$1",
      [id,timestamp]
    );
    await insertProjectEvent(tx,id,"project.restored",{batchId},timestamp);
  });
}

export async function getProjectEvents(projectId: string): Promise<ProjectEvent[]> {
  const db = await getDatabase();
  const result = await db.query<{
    id: string;
    project_id: string;
    event_type: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>(
    "SELECT id,project_id,event_type,metadata,created_at::text AS created_at " +
      "FROM project_events WHERE project_id=$1 ORDER BY created_at DESC",
    [projectId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    eventType: row.event_type,
    metadata: row.metadata,
    createdAt: row.created_at
  }));
}
