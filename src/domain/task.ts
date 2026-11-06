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

export interface Task {
  id: string;
  title: string;
  details: string | null;
  moduleKey: ModuleKey;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  scheduledStart: string | null;
  nextAction: string | null;
  blocker: string | null;
  progress: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskDraft = Pick<Task,
  "title" | "details" | "moduleKey" | "priority" | "dueDate" |
  "scheduledStart" | "nextAction" | "blocker" | "progress" | "notes"
>;

export function createEmptyTaskDraft(defaultDate: string): TaskDraft {
  return {
    title: "",
    details: null,
    moduleKey: "projects",
    priority: "medium",
    dueDate: defaultDate,
    scheduledStart: null,
    nextAction: null,
    blocker: null,
    progress: 0,
    notes: null
  };
}

export function completionRate(tasks: readonly Pick<Task, "status">[]): number {
  const eligible = tasks.filter((task) => task.status !== "cancelled");
  if (eligible.length === 0) return 0;
  return Math.round((eligible.filter((task) => task.status === "done").length / eligible.length) * 100);
}

export function localDateISO(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function formatDateLabel(date: string): string {
  const parsed = new Date(date + "T12:00:00");
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(parsed);
}

export function moduleName(moduleKey: ModuleKey): string {
  return MODULES.find((module) => module.key === moduleKey)?.name ?? "Projects Lab";
}
