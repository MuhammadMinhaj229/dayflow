import { getDatabase } from "./client";

const BACKUP_FORMAT_VERSION = 2;
const DATABASE_SCHEMA_VERSION = 3;
const LEGACY_PBKDF2_ITERATIONS = 310_000;
const PBKDF2_ITERATIONS = 600_000;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_BACKUP_FILE_BYTES = Math.ceil(MAX_BACKUP_BYTES * 4 / 3) + 128 * 1024;
const MAX_PROJECTS = 10_000;
const MAX_TASKS = 100_000;
const MAX_EVENTS = 500_000;
const LEGACY_AAD = new TextEncoder().encode("dayflow-backup:v1:schema:2");
const CURRENT_AAD = new TextEncoder().encode("dayflow-backup:v2:schema:3");

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
  schemaVersion: 3;
  exportedAt: string;
  projects: PlainRecord[];
  tasks: PlainRecord[];
  taskEvents: PlainRecord[];
  projectEvents: PlainRecord[];
}

interface BackupEnvelope {
  formatVersion: 1 | 2;
  schemaVersion: 2 | 3;
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

function isIsoTimestamp(value: unknown): value is string {
  return isString(value) && Number.isFinite(Date.parse(value));
}

function validateProject(value: unknown): value is PlainRecord {
  if (!isRecord(value)) return false;
  return hasKeys(value, [
    "id", "name", "description", "module_key", "status", "priority",
    "due_date", "archived_at", "archive_batch_id", "created_at", "updated_at"
  ]) &&
    isString(value.id) && value.id.length > 0 &&
    isString(value.name) && value.name.trim().length > 0 && value.name.length <= 160 &&
    isNullableString(value.description) &&
    isOneOf<ModuleKey>(value.module_key, ["research", "career", "business", "projects", "systems"]) &&
    isOneOf<ProjectStatus>(value.status, ["active", "on_hold", "completed"]) &&
    isOneOf<Priority>(value.priority, ["low", "medium", "high", "urgent"]) &&
    isNullableString(value.due_date) &&
    isNullableString(value.archived_at) &&
    isNullableString(value.archive_batch_id) &&
    (value.archived_at !== null || value.archive_batch_id === null) &&
    isIsoTimestamp(value.created_at) && isIsoTimestamp(value.updated_at);
}

function validateTask(value: unknown): value is PlainRecord {
  if (!isRecord(value)) return false;
  return hasKeys(value, [
    "id", "title", "details", "module_key", "project_id", "parent_task_id", "order_index",
    "status", "priority", "due_date", "scheduled_start", "estimated_minutes", "next_action",
    "blocker", "progress", "notes", "completed_at", "archived_at", "archive_batch_id",
    "created_at", "updated_at"
  ]) &&
    isString(value.id) && value.id.length > 0 &&
    isString(value.title) && value.title.trim().length > 0 && value.title.length <= 240 &&
    isNullableString(value.details) &&
    isOneOf<ModuleKey>(value.module_key, ["research", "career", "business", "projects", "systems"]) &&
    isNullableString(value.project_id) &&
    isNullableString(value.parent_task_id) &&
    isFiniteNumber(value.order_index) && Number.isInteger(value.order_index) && value.order_index >= 0 &&
    isOneOf<TaskStatus>(value.status, ["next", "in_progress", "done", "cancelled"]) &&
    isOneOf<Priority>(value.priority, ["low", "medium", "high", "urgent"]) &&
    isNullableString(value.due_date) &&
    isNullableString(value.scheduled_start) &&
    (value.estimated_minutes === null ||
      (isFiniteNumber(value.estimated_minutes) && Number.isInteger(value.estimated_minutes) &&
        value.estimated_minutes >= 1 && value.estimated_minutes <= 100000)) &&
    isNullableString(value.next_action) &&
    isNullableString(value.blocker) &&
    isFiniteNumber(value.progress) && value.progress >= 0 && value.progress <= 100 &&
    isNullableString(value.notes) &&
    isNullableString(value.completed_at) &&
    isNullableString(value.archived_at) &&
    isNullableString(value.archive_batch_id) &&
    (value.archived_at !== null || value.archive_batch_id === null) &&
    isIsoTimestamp(value.created_at) && isIsoTimestamp(value.updated_at);
}

function validateTaskEvent(value: unknown): value is PlainRecord {
  if (!isRecord(value)) return false;
  return hasKeys(value, ["id", "task_id", "event_type", "metadata", "created_at"]) &&
    isString(value.id) && value.id.length > 0 &&
    isString(value.task_id) && value.task_id.length > 0 &&
    isString(value.event_type) && value.event_type.length > 0 &&
    isRecord(value.metadata) &&
    isIsoTimestamp(value.created_at);
}

function validateProjectEvent(value: unknown): value is PlainRecord {
  if (!isRecord(value)) return false;
  return hasKeys(value, ["id", "project_id", "event_type", "metadata", "created_at"]) &&
    isString(value.id) && value.id.length > 0 &&
    isString(value.project_id) && value.project_id.length > 0 &&
    isString(value.event_type) && value.event_type.length > 0 &&
    isRecord(value.metadata) &&
    isIsoTimestamp(value.created_at);
}

function upgradeLegacyPayload(value: unknown): unknown {
  if (!isRecord(value) || value.schemaVersion !== 2) return value;
  if (!Array.isArray(value.projects) || !Array.isArray(value.tasks) || !Array.isArray(value.taskEvents)) return value;

  return {
    ...value,
    schemaVersion: 3,
    projects: value.projects.map((row) => isRecord(row) ? { ...row, archive_batch_id: null } : row),
    tasks: value.tasks.map((row) => isRecord(row) ? { ...row, archive_batch_id: null } : row),
    projectEvents: []
  };
}

export function validateBackupPayload(value: unknown): BackupPayload {
  const upgraded = upgradeLegacyPayload(value);
  if (!isRecord(upgraded) || upgraded.schemaVersion !== DATABASE_SCHEMA_VERSION ||
    !isIsoTimestamp(upgraded.exportedAt)) {
    throw new Error("This backup version is not supported by the installed DayFlow database.");
  }
  if (!Array.isArray(upgraded.projects) || !Array.isArray(upgraded.tasks) ||
    !Array.isArray(upgraded.taskEvents) || !Array.isArray(upgraded.projectEvents)) {
    throw new Error("The backup is incomplete or malformed.");
  }
  if (
    upgraded.projects.length > MAX_PROJECTS ||
    upgraded.tasks.length > MAX_TASKS ||
    upgraded.taskEvents.length > MAX_EVENTS ||
    upgraded.projectEvents.length > MAX_EVENTS
  ) {
    throw new Error("The backup contains more records than DayFlow can safely restore.");
  }
  if (!upgraded.projects.every(validateProject)) throw new Error("The backup contains an invalid project record.");
  if (!upgraded.tasks.every(validateTask)) throw new Error("The backup contains an invalid task record.");
  if (!upgraded.taskEvents.every(validateTaskEvent)) throw new Error("The backup contains an invalid task history record.");
  if (!upgraded.projectEvents.every(validateProjectEvent)) throw new Error("The backup contains an invalid project history record.");

  const projectMap = new Map(upgraded.projects.map((row) => [row.id as string, row]));
  const taskMap = new Map(upgraded.tasks.map((row) => [row.id as string, row]));
  const taskEventIds = new Set<string>();
  const projectEventIds = new Set<string>();

  if (projectMap.size !== upgraded.projects.length) throw new Error("The backup contains duplicate project IDs.");
  if (taskMap.size !== upgraded.tasks.length) throw new Error("The backup contains duplicate task IDs.");

  for (const task of upgraded.tasks) {
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

  const state = new Map<string, "visiting" | "visited">();
  for (const startId of taskMap.keys()) {
    if (state.get(startId) === "visited") continue;
    const path: string[] = [];
    let currentId: string | null = startId;

    while (currentId) {
      const currentState = state.get(currentId);
      if (currentState === "visiting") {
        throw new Error("The backup contains a circular subtask relationship.");
      }
      if (currentState === "visited") break;

      state.set(currentId, "visiting");
      path.push(currentId);
      const task = taskMap.get(currentId);
      currentId = (task?.parent_task_id as string | null | undefined) ?? null;
    }

    for (const id of path) state.set(id, "visited");
  }

  for (const event of upgraded.taskEvents) {
    const taskId = event.task_id as string;
    const eventId = event.id as string;
    if (!taskMap.has(taskId)) throw new Error("Task history refers to a missing task.");
    if (taskEventIds.has(eventId)) throw new Error("The backup contains duplicate task history IDs.");
    taskEventIds.add(eventId);
  }

  for (const event of upgraded.projectEvents) {
    const projectId = event.project_id as string;
    const eventId = event.id as string;
    if (!projectMap.has(projectId)) throw new Error("Project history refers to a missing project.");
    if (projectEventIds.has(eventId)) throw new Error("The backup contains duplicate project history IDs.");
    projectEventIds.add(eventId);
  }

  return upgraded as unknown as BackupPayload;
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
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error("The backup contains invalid binary data.");
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(passphrase.normalize("NFC"))),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations, hash: "SHA-256" },
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

  const payload = await db.transaction(async (tx) => {
    const projects = await tx.query<PlainRecord>(
      "SELECT id,name,description,module_key,status,priority,due_date::text AS due_date," +
        "archived_at::text AS archived_at,archive_batch_id,created_at::text AS created_at," +
        "updated_at::text AS updated_at FROM projects ORDER BY id"
    );
    const tasks = await tx.query<PlainRecord>(
      "SELECT id,title,details,module_key,project_id,parent_task_id,order_index,status,priority," +
        "due_date::text AS due_date,scheduled_start::text AS scheduled_start,estimated_minutes,next_action," +
        "blocker,progress,notes,completed_at::text AS completed_at,archived_at::text AS archived_at," +
        "archive_batch_id,created_at::text AS created_at,updated_at::text AS updated_at FROM tasks ORDER BY id"
    );
    const taskEvents = await tx.query<PlainRecord>(
      "SELECT id,task_id,event_type,metadata,created_at::text AS created_at FROM task_events ORDER BY id"
    );
    const projectEvents = await tx.query<PlainRecord>(
      "SELECT id,project_id,event_type,metadata,created_at::text AS created_at FROM project_events ORDER BY id"
    );
    return {
      schemaVersion: DATABASE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      projects: projects.rows,
      tasks: tasks.rows,
      taskEvents: taskEvents.rows,
      projectEvents: projectEvents.rows
    };
  });

  return encryptBackupPayload(payload, passphrase);
}

export async function encryptBackupPayload(value: unknown, passphrase: string): Promise<Blob> {
  validatePassphrase(passphrase);
  const payload = validateBackupPayload(value);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_BACKUP_BYTES) throw new Error("This workspace is too large for a single browser backup.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(CURRENT_AAD), tagLength: 128 },
    key,
    toArrayBuffer(plaintext)
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
    (value.formatVersion !== 1 && value.formatVersion !== 2) ||
    (value.schemaVersion !== 2 && value.schemaVersion !== 3) ||
    value.cipher !== "AES-256-GCM" ||
    value.kdf !== "PBKDF2-SHA-256" ||
    !isFiniteNumber(value.iterations) ||
    !isString(value.salt) || !isString(value.iv) || !isString(value.ciphertext)) {
    throw new Error("This file is not a supported DayFlow encrypted backup.");
  }

  const isLegacy = value.formatVersion === 1 && value.schemaVersion === 2 &&
    value.iterations === LEGACY_PBKDF2_ITERATIONS;
  const isCurrent = value.formatVersion === 2 && value.schemaVersion === 3 &&
    value.iterations === PBKDF2_ITERATIONS;
  if (!isLegacy && !isCurrent) throw new Error("This backup uses an unsupported encryption or schema version.");

  const salt = fromBase64(value.salt);
  const iv = fromBase64(value.iv);
  const ciphertext = fromBase64(value.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 ||
    ciphertext.length > MAX_BACKUP_BYTES + 16) {
    throw new Error("The backup file is damaged or exceeds the allowed size.");
  }
  return value as unknown as BackupEnvelope;
}

export async function decryptBackupFile(file: File, passphrase: string): Promise<BackupPayload> {
  validatePassphrase(passphrase);
  if (file.size <= 0 || file.size > MAX_BACKUP_FILE_BYTES) {
    throw new Error("The selected backup is empty or larger than the 50 MB workspace limit.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("The selected file is not a valid DayFlow backup.");
  }

  const envelope = validateEnvelope(raw);
  const iterations = envelope.iterations;
  const aad = envelope.formatVersion === 1 ? LEGACY_AAD : CURRENT_AAD;
  const key = await deriveKey(passphrase, fromBase64(envelope.salt), iterations);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(fromBase64(envelope.iv)),
        additionalData: toArrayBuffer(aad),
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
  return validateBackupPayload(payloadUnknown);
}

export async function restoreEncryptedBackup(file: File, passphrase: string): Promise<{
  projectCount: number;
  taskCount: number;
}> {
  const payload = await decryptBackupFile(file, passphrase);
  const db = await getDatabase();

  await db.transaction(async (tx) => {
    await tx.exec("DELETE FROM task_events; DELETE FROM project_events; DELETE FROM tasks; DELETE FROM projects;");

    for (const project of payload.projects) {
      await tx.query(
        "INSERT INTO projects (id,name,description,module_key,status,priority,due_date,archived_at,archive_batch_id,created_at,updated_at) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          project.id, project.name, project.description, project.module_key, project.status,
          project.priority, project.due_date, project.archived_at, project.archive_batch_id,
          project.created_at, project.updated_at
        ]
      );
    }

    for (const task of payload.tasks) {
      await tx.query(
        "INSERT INTO tasks (" +
          "id,title,details,module_key,project_id,parent_task_id,order_index,status,priority,due_date," +
          "scheduled_start,estimated_minutes,next_action,blocker,progress,notes,completed_at,archived_at," +
          "archive_batch_id,created_at,updated_at" +
        ") VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",
        [
          task.id, task.title, task.details, task.module_key, task.project_id,
          task.order_index, task.status, task.priority, task.due_date, task.scheduled_start,
          task.estimated_minutes, task.next_action, task.blocker, task.progress, task.notes,
          task.completed_at, task.archived_at, task.archive_batch_id, task.created_at, task.updated_at
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

    for (const event of payload.projectEvents) {
      await tx.query(
        "INSERT INTO project_events (id,project_id,event_type,metadata,created_at) VALUES ($1,$2,$3,$4::jsonb,$5)",
        [event.id, event.project_id, event.event_type, JSON.stringify(event.metadata), event.created_at]
      );
    }
  });

  return { projectCount: payload.projects.length, taskCount: payload.tasks.length };
}
