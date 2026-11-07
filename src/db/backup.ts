import { getDatabase } from "./client";

const BACKUP_FORMAT_VERSION = 1;
const DATABASE_SCHEMA_VERSION = 2;
const PBKDF2_ITERATIONS = 310_000;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_PROJECTS = 10_000;
const MAX_TASKS = 100_000;
const MAX_EVENTS = 500_000;
const AAD = new TextEncoder().encode("dayflow-backup:v1:schema:2");

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

type ModuleKey = "research" | "career" | "business" | "projects" | "systems";
type TaskStatus = "next" | "in_progress" | "done" | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";
type ProjectStatus = "active" | "on_hold" | "completed";

type PlainRecord = Record<string, unknown>;

export interface BackupPayload {
  schemaVersion: 2;
  exportedAt: string;
  projects: PlainRecord[];
  tasks: PlainRecord[];
  taskEvents: PlainRecord[];
}

interface BackupEnvelope {
  formatVersion: 1;
  schemaVersion: 2;
  cipher: "AES-256-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasKeys(record: PlainRecord, keys: readonly string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function validateProject(value: unknown): value is PlainRecord {
  if (!isRecord(value)) return false;
  return hasKeys(value, [
    "id", "name", "description", "module_key", "status", "priority",
    "due_date", "archived_at", "created_at", "updated_at"
  ]) &&
    isString(value.id) && value.id.length > 0 &&
    isString(value.name) && value.name.trim().length > 0 && value.name.length <= 160 &&
    isNullableString(value.description) &&
    isOneOf<ModuleKey>(value.module_key, ["research", "career", "business", "projects", "systems"]) &&
    isOneOf<ProjectStatus>(value.status, ["active", "on_hold", "completed"]) &&
    isOneOf<Priority>(value.priority, ["low", "medium", "high", "urgent"]) &&
    isNullableString(value.due_date) &&
    isNullableString(value.archived_at) &&
    isString(value.created_at) && isString(value.updated_at);
}

function validateTask(value: unknown): value is PlainRecord {
  if (!isRecord(value)) return false;
  return hasKeys(value, [
    "id", "title", "details", "module_key", "project_id", "parent_task_id", "order_index",
    "status", "priority", "due_date", "scheduled_start", "estimated_minutes", "next_action",
    "blocker", "progress", "notes", "completed_at", "archived_at", "created_at", "updated_at"
  ]) &&
    isString(value.id) && value.id.length > 0 &&
    isString(value.title) && value.title.trim().length > 0 && value.title.length <= 240 &&
    isNullableString(value.details) &&
    isOneOf<ModuleKey>(value.module_key, ["research", "career", "business", "projects", "systems"]) &&
    isNullableString(value.project_id) &&
    isNullableString(value.parent_task_id) &&
    isFiniteNumber(value.order_index) && Number.isInteger(value.order_index) &&
    isOneOf<TaskStatus>(value.status, ["next", "in_progress", "done", "cancelled"]) &&
    isOneOf<Priority>(value.priority, ["low", "medium", "high", "urgent"]) &&
    isNullableString(value.due_date) &&
    isNullableString(value.scheduled_start) &&
    (value.estimated_minutes === null || (isFiniteNumber(value.estimated_minutes) && Number.isInteger(value.estimated_minutes) && value.estimated_minutes >= 1)) &&
    isNullableString(value.next_action) &&
    isNullableString(value.blocker) &&
    isFiniteNumber(value.progress) && value.progress >= 0 && value.progress <= 100 &&
    isNullableString(value.notes) &&
    isNullableString(value.completed_at) &&
    isNullableString(value.archived_at) &&
    isString(value.created_at) && isString(value.updated_at);
}

function validateEvent(value: unknown): value is PlainRecord {
  if (!isRecord(value)) return false;
  return hasKeys(value, ["id", "task_id", "event_type", "metadata", "created_at"]) &&
    isString(value.id) && value.id.length > 0 &&
    isString(value.task_id) && value.task_id.length > 0 &&
    isString(value.event_type) && value.event_type.length > 0 &&
    isRecord(value.metadata) &&
    isString(value.created_at);
}

export function validateBackupPayload(value: unknown): BackupPayload {
  if (!isRecord(value) || value.schemaVersion !== DATABASE_SCHEMA_VERSION || !isString(value.exportedAt)) {
    throw new Error("This backup version is not supported by the installed DayFlow database.");
  }
  if (!Array.isArray(value.projects) || !Array.isArray(value.tasks) || !Array.isArray(value.taskEvents)) {
    throw new Error("The backup is incomplete or malformed.");
  }
  if (
    value.projects.length > MAX_PROJECTS ||
    value.tasks.length > MAX_TASKS ||
    value.taskEvents.length > MAX_EVENTS
  ) {
    throw new Error("The backup contains more records than DayFlow can safely restore.");
  }
  if (!value.projects.every(validateProject)) throw new Error("The backup contains an invalid project record.");
  if (!value.tasks.every(validateTask)) throw new Error("The backup contains an invalid task record.");
  if (!value.taskEvents.every(validateEvent)) throw new Error("The backup contains an invalid task history record.");

  const projectMap = new Map(value.projects.map((row) => [row.id as string, row]));
  const taskMap = new Map(value.tasks.map((row) => [row.id as string, row]));
  const eventIds = new Set<string>();

  if (projectMap.size !== value.projects.length) throw new Error("The backup contains duplicate project IDs.");
  if (taskMap.size !== value.tasks.length) throw new Error("The backup contains duplicate task IDs.");

  for (const task of value.tasks) {
    const projectId = task.project_id as string | null;
    const parentId = task.parent_task_id as string | null;

    if (projectId) {
      const project = projectMap.get(projectId);
      if (!project) throw new Error("A task refers to a project that is missing from this backup.");
      if (project.module_key !== task.module_key) throw new Error("A task and its project have mismatched modules.");
    }

    if (parentId) {
      const parent = taskMap.get(parentId);
      if (!parent || parentId === task.id) throw new Error("A subtask refers to an invalid parent task.");
      if (parent.module_key !== task.module_key || (parent.project_id ?? null) !== projectId) {
        throw new Error("A subtask must belong to the same module and project as its parent.");
      }
    }
  }

  const visitState = new Map<string, "visiting" | "visited">();
  function visit(id: string): void {
    const state = visitState.get(id);
    if (state === "visiting") throw new Error("The backup contains a circular subtask relationship.");
    if (state === "visited") return;
    visitState.set(id, "visiting");
    const task = taskMap.get(id);
    const parentId = task?.parent_task_id as string | null | undefined;
    if (parentId) visit(parentId);
    visitState.set(id, "visited");
  }
  for (const id of taskMap.keys()) visit(id);

  for (const event of value.taskEvents) {
    const taskId = event.task_id as string;
    const eventId = event.id as string;
    if (!taskMap.has(taskId)) throw new Error("Task history refers to a missing task.");
    if (eventIds.has(eventId)) throw new Error("The backup contains duplicate task history IDs.");
    eventIds.add(eventId);
  }

  return value as unknown as BackupPayload;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("The backup contains invalid binary data.");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(passphrase.normalize("NFC"))),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function validatePassphrase(passphrase: string): void {
  if (passphrase.length < 12) throw new Error("Use a backup passphrase with at least 12 characters.");
  if (passphrase.length > 1024) throw new Error("The backup passphrase is too long.");
}

export async function createEncryptedBackup(passphrase: string): Promise<Blob> {
  validatePassphrase(passphrase);
  const db = await getDatabase();
  const [projects, tasks, events] = await Promise.all([
    db.query<PlainRecord>("SELECT id,name,description,module_key,status,priority,due_date::text AS due_date,archived_at::text AS archived_at,created_at::text AS created_at,updated_at::text AS updated_at FROM projects ORDER BY id"),
    db.query<PlainRecord>("SELECT id,title,details,module_key,project_id,parent_task_id,order_index,status,priority,due_date::text AS due_date,scheduled_start::text AS scheduled_start,estimated_minutes,next_action,blocker,progress,notes,completed_at::text AS completed_at,archived_at::text AS archived_at,created_at::text AS created_at,updated_at::text AS updated_at FROM tasks ORDER BY id"),
    db.query<PlainRecord>("SELECT id,task_id,event_type,metadata,created_at::text AS created_at FROM task_events ORDER BY id")
  ]);

  const payload = validateBackupPayload({
    schemaVersion: DATABASE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projects: projects.rows,
    tasks: tasks.rows,
    taskEvents: events.rows
  });
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_BACKUP_BYTES) throw new Error("This workspace is too large for a single browser backup.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(AAD), tagLength: 128 },
    key,
    plaintext
  );

  const envelope: BackupEnvelope = {
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: DATABASE_SCHEMA_VERSION,
    cipher: "AES-256-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted))
  };

  return new Blob([JSON.stringify(envelope)], { type: "application/vnd.dayflow.backup+json" });
}

function validateEnvelope(value: unknown): BackupEnvelope {
  if (!isRecord(value) ||
    value.formatVersion !== BACKUP_FORMAT_VERSION ||
    value.schemaVersion !== DATABASE_SCHEMA_VERSION ||
    value.cipher !== "AES-256-GCM" ||
    value.kdf !== "PBKDF2-SHA-256" ||
    value.iterations !== PBKDF2_ITERATIONS ||
    !isString(value.salt) || !isString(value.iv) || !isString(value.ciphertext)) {
    throw new Error("This file is not a supported DayFlow encrypted backup.");
  }
  const salt = fromBase64(value.salt);
  const iv = fromBase64(value.iv);
  const ciphertext = fromBase64(value.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > MAX_BACKUP_BYTES + 16) {
    throw new Error("The backup file is damaged or exceeds the allowed size.");
  }
  return value as unknown as BackupEnvelope;
}

export async function restoreEncryptedBackup(file: File, passphrase: string): Promise<{
  projectCount: number;
  taskCount: number;
}> {
  validatePassphrase(passphrase);
  if (file.size <= 0 || file.size > MAX_BACKUP_BYTES + 64 * 1024) {
    throw new Error("The selected backup is empty or larger than 50 MB.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("The selected file is not a valid DayFlow backup.");
  }

  const envelope = validateEnvelope(raw);
  const key = await deriveKey(passphrase, fromBase64(envelope.salt));
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(fromBase64(envelope.iv)),
        additionalData: toArrayBuffer(AAD),
        tagLength: 128
      },
      key,
      toArrayBuffer(fromBase64(envelope.ciphertext))
    );
  } catch {
    throw new Error("The passphrase is incorrect or the backup has been modified.");
  }

  let payloadUnknown: unknown;
  try {
    payloadUnknown = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  } catch {
    throw new Error("The decrypted backup contents are invalid.");
  }
  const payload = validateBackupPayload(payloadUnknown);
  const db = await getDatabase();

  await db.transaction(async (tx) => {
    await tx.exec("DELETE FROM task_events; DELETE FROM tasks; DELETE FROM projects;");

    for (const project of payload.projects) {
      await tx.query(
        "INSERT INTO projects (id,name,description,module_key,status,priority,due_date,archived_at,created_at,updated_at) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          project.id, project.name, project.description, project.module_key, project.status,
          project.priority, project.due_date, project.archived_at, project.created_at, project.updated_at
        ]
      );
    }

    for (const task of payload.tasks) {
      await tx.query(
        "INSERT INTO tasks (" +
          "id,title,details,module_key,project_id,parent_task_id,order_index,status,priority,due_date," +
          "scheduled_start,estimated_minutes,next_action,blocker,progress,notes,completed_at,archived_at,created_at,updated_at" +
        ") VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
        [
          task.id, task.title, task.details, task.module_key, task.project_id,
          task.order_index, task.status, task.priority, task.due_date, task.scheduled_start,
          task.estimated_minutes, task.next_action, task.blocker, task.progress, task.notes,
          task.completed_at, task.archived_at, task.created_at, task.updated_at
        ]
      );
    }

    for (const task of payload.tasks) {
      if (task.parent_task_id) {
        await tx.query("UPDATE tasks SET parent_task_id=$2 WHERE id=$1", [task.id, task.parent_task_id]);
      }
    }

    for (const event of payload.taskEvents) {
      await tx.query(
        "INSERT INTO task_events (id,task_id,event_type,metadata,created_at) VALUES ($1,$2,$3,$4::jsonb,$5)",
        [event.id, event.task_id, event.event_type, JSON.stringify(event.metadata), event.created_at]
      );
    }
  });

  return { projectCount: payload.projects.length, taskCount: payload.tasks.length };
}
