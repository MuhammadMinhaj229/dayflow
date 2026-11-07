import { getDatabase } from "./client";
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

const PROJECT_QUERY =
  "SELECT p.id, p.name, p.description, p.module_key, p.status, p.priority, " +
    "p.due_date::text AS due_date, " +
    "COUNT(t.id)::int AS task_count, " +
    "COUNT(t.id) FILTER (WHERE t.status='done')::int AS completed_task_count, " +
    "AVG(CASE WHEN t.status='done' THEN 100 WHEN t.status='cancelled' THEN NULL ELSE t.progress END)::float8 AS progress, " +
    "p.created_at::text AS created_at, p.updated_at::text AS updated_at " +
  "FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.archived_at IS NULL " +
  "WHERE p.archived_at IS NULL ";

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

export async function listProjects(options: { moduleKey?: ModuleKey; includeCompleted?: boolean } = {}): Promise<Project[]> {
  const db = await getDatabase();
  const values: unknown[] = [];
  let where = PROJECT_QUERY;
  if (!options.includeCompleted) where += "AND p.status <> 'completed' ";
  if (options.moduleKey) {
    values.push(options.moduleKey);
    where += "AND p.module_key=$" + values.length + " ";
  }
  const result = await db.query<ProjectRow>(
    where + "GROUP BY p.id ORDER BY p.due_date NULLS LAST, p.updated_at DESC",
    values
  );
  return result.rows.map(mapProject);
}

export async function createProject(input: ProjectDraft): Promise<Project> {
  const draft = validate(input);
  const db = await getDatabase();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const result = await db.query<ProjectRow>(
    "INSERT INTO projects (id,name,description,module_key,status,priority,due_date,created_at,updated_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING " +
      "id,name,description,module_key,status,priority,due_date::text AS due_date,0::int AS task_count," +
      "0::int AS completed_task_count,NULL::float8 AS progress,created_at::text AS created_at,updated_at::text AS updated_at",
    [id,draft.name,draft.description,draft.moduleKey,draft.status,draft.priority,draft.dueDate,timestamp]
  );
  const row = result.rows[0];
  if (!row) throw new Error("The project could not be created.");
  return mapProject(row);
}

export async function updateProject(id: string, input: ProjectDraft): Promise<void> {
  const draft = validate(input);
  const db = await getDatabase();
  const timestamp = new Date().toISOString();
  const result = await db.query(
    "UPDATE projects SET name=$2,description=$3,module_key=$4,status=$5,priority=$6,due_date=$7,updated_at=$8 " +
      "WHERE id=$1 AND archived_at IS NULL",
    [id,draft.name,draft.description,draft.moduleKey,draft.status,draft.priority,draft.dueDate,timestamp]
  );
  if (result.affectedRows === 0) throw new Error("The project could not be updated.");
}

export async function archiveProject(id: string): Promise<void> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();
  const result = await db.query(
    "UPDATE projects SET archived_at=$2,updated_at=$2 WHERE id=$1 AND archived_at IS NULL",
    [id,timestamp]
  );
  if (result.affectedRows === 0) throw new Error("The project could not be archived.");
}
