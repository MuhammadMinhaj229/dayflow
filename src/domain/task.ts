export const MODULES = [
  { key: "research", name: "PHFI Research", description: "Research delivery, FieldTrack and language tools", accent: "sage" },
  { key: "career", name: "Career Operations", description: "Opportunities, preparation and professional outreach", accent: "blue" },
  { key: "business", name: "AGM Studio", description: "Noman Brothers, client work and business development", accent: "gold" },
  { key: "projects", name: "Projects Lab", description: "Technical builds, experiments and personal projects", accent: "lilac" },
  { key: "systems", name: "Systems & Access", description: "Subscriptions, integrations and access inventory", accent: "slate" }
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export type TaskStatus = "next" | "in_progress" | "done" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "active" | "on_hold" | "completed";

export interface Task {
  id: string;
  title: string;
  details: string | null;
  moduleKey: ModuleKey;
  projectId: string | null;
  parentTaskId: string | null;
  orderIndex: number;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  scheduledStart: string | null;
  estimatedMinutes: number | null;
  nextAction: string | null;
  blocker: string | null;
  progress: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskDraft = Pick<
  Task,
  | "title"
  | "details"
  | "moduleKey"
  | "projectId"
  | "parentTaskId"
  | "orderIndex"
  | "priority"
  | "dueDate"
  | "scheduledStart"
  | "estimatedMinutes"
  | "nextAction"
  | "blocker"
  | "progress"
  | "notes"
>;

export interface Project {
  id: string;
  name: string;
  description: string | null;
  moduleKey: ModuleKey;
  status: ProjectStatus;
  priority: Priority;
  dueDate: string | null;
  progress: number;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectDraft = Pick<Project, "name" | "description" | "moduleKey" | "status" | "priority" | "dueDate">;

export function createEmptyTaskDraft(defaultDate: string): TaskDraft {
  return {
    title: "",
    details: null,
    moduleKey: "projects",
    projectId: null,
    parentTaskId: null,
    orderIndex: 0,
    priority: "medium",
    dueDate: defaultDate,
    scheduledStart: null,
    estimatedMinutes: null,
    nextAction: null,
    blocker: null,
    progress: 0,
    notes: null
  };
}

export function createEmptyProjectDraft(): ProjectDraft {
  return {
    name: "",
    description: null,
    moduleKey: "projects",
    status: "active",
    priority: "medium",
    dueDate: null
  };
}

export function completionRate(tasks: readonly Pick<Task, "status">[]): number {
  const eligible = tasks.filter((task) => task.status !== "cancelled");
  if (eligible.length === 0) return 0;
  return Math.round((eligible.filter((task) => task.status === "done").length / eligible.length) * 100);
}

export function projectProgress(tasks: readonly Pick<Task, "status" | "progress">[]): number {
  const eligible = tasks.filter((task) => task.status !== "cancelled");
  if (eligible.length === 0) return 0;
  const total = eligible.reduce((sum, task) => sum + (task.status === "done" ? 100 : task.progress), 0);
  return Math.round(total / eligible.length);
}

export function localDateISO(date = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

export function formatDateLabel(
  date: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
): string {
  const parsed = new Date(date + "T12:00:00");
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone
  }).format(parsed);
}

export function moduleName(moduleKey: ModuleKey): string {
  return MODULES.find((module) => module.key === moduleKey)?.name ?? "Projects Lab";
}
