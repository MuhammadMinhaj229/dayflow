export type TaskStatus = "next" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";

export interface DayflowTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  planDate: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  project?: string;
  labels: string[];
  order: number;
  completedAt?: string;
  source: "web" | "chat" | "widget" | "import";
}
