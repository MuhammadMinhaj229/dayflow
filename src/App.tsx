import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, Archive, ArrowUpRight, Briefcase, CalendarDays, Check,
  ChevronRight, CircleHelp, Clock3, Command, Database, FlaskConical,
  FolderKanban, Inbox, LayoutDashboard, Plus, RefreshCw, Search,
  Settings2, ShieldCheck, Sparkles, Target, Wifi, WifiOff, X, Building2
} from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import {
  MODULES, completionRate, createEmptyTaskDraft, formatDateLabel,
  localDateISO, moduleName, type ModuleKey, type Task, type TaskDraft
} from "./domain/task";
import { archiveTask, createTask, listArchivedTasks, listTasks, restoreTask, setTaskStatus, updateTask } from "./db/task-repository";
import { archiveProject, createProject, listArchivedProjects, listProjects, restoreProject, updateProject } from "./db/project-repository";
import { ProjectEditor } from "./components/ProjectEditor";
import { BackupPanel } from "./components/BackupPanel";
import { StorageStatus } from "./components/StorageStatus";
import type { Project, ProjectDraft } from "./domain/task";
import { initializeNativeWorkspace, isAndroidNative } from "./native/dayflow-native";

const moduleIcons = {
  research: FlaskConical,
  career: Briefcase,
  business: Building2,
  projects: FolderKanban,
  systems: ShieldCheck
} satisfies Record<ModuleKey, typeof FlaskConical>;

const priorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
} as const;

function TaskEditor({
  task,
  defaultDate,
  onClose,
  onSave,
  projects,
  tasks
}: {
  task: Task | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (draft: TaskDraft) => Promise<void>;
  projects: Project[];
  tasks: Task[];
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => task ? {
    title: task.title,
    details: task.details,
    moduleKey: task.moduleKey,
    projectId: task.projectId,
    parentTaskId: task.parentTaskId,
    orderIndex: task.orderIndex,
    priority: task.priority,
    dueDate: task.dueDate,
    scheduledStart: task.scheduledStart,
    estimatedMinutes: task.estimatedMinutes,
    nextAction: task.nextAction,
    blocker: task.blocker,
    progress: task.progress,
    notes: task.notes
  } : createEmptyTaskDraft(defaultDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="task-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="editor-header">
          <div><span className="eyebrow">TASK DETAILS</span><h2 id="editor-title">{task ? "Edit task" : "Create a task"}</h2></div>
          <button className="icon-button soft" type="button" aria-label="Close editor" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="editor-form">
          <label className="field full">
            <span>Title</span>
            <input autoFocus required maxLength={240} value={draft.title}
              onChange={(event) => update("title", event.target.value)} placeholder="What needs your attention?" />
          </label>
          <label className="field full">
            <span>Details</span>
            <textarea rows={2} value={draft.details ?? ""}
              onChange={(event) => update("details", event.target.value || null)} placeholder="Add useful context" />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Area</span>
              <select value={draft.moduleKey} onChange={(event) => update("moduleKey", event.target.value as ModuleKey)}>
                {MODULES.map((module) => <option value={module.key} key={module.key}>{module.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select value={draft.priority} onChange={(event) => update("priority", event.target.value as TaskDraft["priority"])}>
                {Object.entries(priorityLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Due date</span>
              <input type="date" value={draft.dueDate ?? ""} onChange={(event) => update("dueDate", event.target.value || null)} />
            </label>
            <label className="field">
              <span>Start time</span>
              <input type="time" value={draft.scheduledStart ?? ""} onChange={(event) => update("scheduledStart", event.target.value || null)} />
            </label>
            <label className="field">
              <span>Progress (%)</span>
              <input type="number" min="0" max="100" step="5" value={draft.progress}
                onChange={(event) => update("progress", Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Next action</span>
              <input value={draft.nextAction ?? ""} onChange={(event) => update("nextAction", event.target.value || null)}
                placeholder="The next concrete step" />
            </label>
            <label className="field full">
          <div className="field-grid">
            <label className="field">
              <span>Project</span>
              <select value={draft.projectId ?? ""} onChange={(event) => {
                update("projectId", event.target.value || null);
                update("parentTaskId", null);
              }}>
                <option value="">No project</option>
                {projects.filter((project) => project.moduleKey === draft.moduleKey && project.status !== "completed").map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Parent task</span>
              <select value={draft.parentTaskId ?? ""} onChange={(event) => update("parentTaskId", event.target.value || null)}>
                <option value="">No parent (top-level task)</option>
                {tasks.filter((item) => item.id !== task?.id && item.moduleKey === draft.moduleKey &&
                  (item.projectId ?? null) === (draft.projectId ?? null) && item.status !== "cancelled").map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estimated minutes</span>
              <input type="number" min="1" max="100000" step="5" value={draft.estimatedMinutes ?? ""}
                onChange={(event) => update("estimatedMinutes", event.target.value ? Number(event.target.value) : null)} />
            </label>
          </div>
              <span>Blocker</span>
              <input value={draft.blocker ?? ""} onChange={(event) => update("blocker", event.target.value || null)}
                placeholder="What is holding this up?" />
            </label>
            <label className="field full">
              <span>Notes</span>
              <textarea rows={3} value={draft.notes ?? ""} onChange={(event) => update("notes", event.target.value || null)}
                placeholder="Private notes stored on this device" />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="editor-actions">
            <button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving || !draft.title.trim()}>
              {saving ? "Saving…" : "Save task"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [view, setView] = useState<"today" | "inbox" | "upcoming" | "archived">("today");
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedModule, setSelectedModule] = useState<ModuleKey | "all">("all");
  const [today, setToday] = useState(() => localDateISO());
  const [loading, setLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [nativeWorkspaceReady, setNativeWorkspaceReady] = useState(!isAndroidNative());
  const [nativeWorkspaceError, setNativeWorkspaceError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [serviceWorkerError, setServiceWorkerError] = useState("");
  const [updateWorker, setUpdateWorker] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const canApplyUpdate = !editorOpen && pendingWrites === 0 && !loading;

  async function refreshWorkspace() {
    setDatabaseError("");
    const [taskRows, projectRows, archivedRows, archivedProjectRows] = await Promise.all([
      listTasks(),
      listProjects({ includeCompleted: true }),
      listArchivedTasks(),
      listArchivedProjects()
    ]);
    setTasks(taskRows);
    setProjects(projectRows);
    setArchivedTasks(archivedRows);
    setArchivedProjects(archivedProjectRows);
  }

  useEffect(() => {
    let active = true;
    void Promise.all([listTasks(), listProjects({ includeCompleted: true }), listArchivedTasks(), listArchivedProjects()])
      .then(([taskRows, projectRows, archivedRows, archivedProjectRows]) => {
        if (!active) return;
        setTasks(taskRows);
        setProjects(projectRows);
        setArchivedTasks(archivedRows);
        setArchivedProjects(archivedProjectRows);
      })
      .catch((cause: unknown) => {
        if (active) setDatabaseError(cause instanceof Error ? cause.message : "Local storage could not be opened.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isAndroidNative()) return;
    let active = true;
    void initializeNativeWorkspace()
      .then(() => {
        if (active) {
          setNativeWorkspaceReady(true);
          setNativeWorkspaceError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setNativeWorkspaceReady(false);
          setNativeWorkspaceError(cause instanceof Error ? cause.message : "Android private workspace could not be created.");
        }
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const refreshLocalDate = () => setToday(localDateISO());
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshLocalDate();
    };
    window.addEventListener("focus", refreshLocalDate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(refreshLocalDate, 60_000);
    return () => {
      window.removeEventListener("focus", refreshLocalDate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() { setUpdateAvailable(true); },
      onOfflineReady() { setOfflineReady(true); },
      onRegisteredSW() { setServiceWorkerError(""); },
      onRegisterError(error: unknown) {
        setServiceWorkerError(error instanceof Error ? error.message : "Service worker registration failed.");
      }
    });
    setUpdateWorker(() => update);
  }, []);

  useEffect(() => {
    if (!updateAvailable || !updateWorker || !canApplyUpdate) return;
    void updateWorker(true).catch((cause: unknown) => {
      setDatabaseError(cause instanceof Error ? cause.message : "The app update could not be applied.");
    });
  }, [canApplyUpdate, updateAvailable, updateWorker]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done" && task.status !== "cancelled"),
    [tasks]
  );
  const todaysTasks = useMemo(
    () => tasks.filter((task) => (task.dueDate === today || task.dueDate === null) && task.parentTaskId === null),
    [tasks, today]
  );
  const viewTasks = useMemo(() => {
    if (view === "archived") return archivedTasks;
    if (view === "inbox") return tasks.filter((task) => task.dueDate === null && task.projectId === null && task.parentTaskId === null);
    if (view === "upcoming") return tasks.filter((task) => task.dueDate !== null && task.dueDate > today);
    return tasks.filter((task) => task.dueDate === today || task.dueDate === null);
  }, [archivedTasks, tasks, today, view]);
  const visibleTasks = useMemo(() => {
    const selected = selectedModule === "all" ? viewTasks : viewTasks.filter((task) => task.moduleKey === selectedModule);
    const term = search.trim().toLocaleLowerCase();
    return selected.filter((task) => !term ||
      task.title.toLocaleLowerCase().includes(term) ||
      (task.details ?? "").toLocaleLowerCase().includes(term) ||
      (task.nextAction ?? "").toLocaleLowerCase().includes(term)
    );
  }, [search, selectedModule, viewTasks]);
  const visibleProjects = useMemo(() => {
    const source = view === "archived" ? archivedProjects : projects;
    return selectedModule === "all" ? source : source.filter((project) => project.moduleKey === selectedModule);
  }, [archivedProjects, projects, selectedModule, view]);

  const todayRate = completionRate(todaysTasks);
  const urgentCount = activeTasks.filter((task) => task.priority === "urgent" || task.priority === "high").length;
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  async function withPendingWrite<T>(operation: () => Promise<T>): Promise<T> {
    setPendingWrites((count) => count + 1);
    try {
      return await operation();
    } finally {
      setPendingWrites((count) => Math.max(0, count - 1));
    }
  }

  async function saveTask(draft: TaskDraft) {
    await withPendingWrite(async () => {
      if (editingTask) await updateTask(editingTask.id, draft);
      else await createTask(draft);
      await refreshWorkspace();
    });
    setEditorOpen(false);
    setEditingTask(null);
  }

  async function toggleTask(task: Task) {
    await withPendingWrite(async () => {
      await setTaskStatus(task.id, task.status === "done" ? "next" : "done");
      await refreshWorkspace();
    });
  }

  async function archive(task: Task) {
    await withPendingWrite(async () => {
      await archiveTask(task.id);
      await refreshWorkspace();
    });
  }

  async function restore(task: Task) {
    await withPendingWrite(async () => {
      await restoreTask(task.id);
      await refreshWorkspace();
    });
  }

  async function saveProject(draft: ProjectDraft) {
    await withPendingWrite(async () => {
      if (editingProject) await updateProject(editingProject.id, draft);
      else await createProject(draft);
      await refreshWorkspace();
    });
    setProjectEditorOpen(false);
    setEditingProject(null);
  }

  async function archiveProjectRecord(project: Project) {
    if (!window.confirm("Archive " + project.name + "? Its tasks will remain available in the task archive.")) return;
    await withPendingWrite(async () => {
      await archiveProject(project.id);
      await refreshWorkspace();
    });
  }

  async function restoreProjectRecord(project: Project) {
    await withPendingWrite(async () => {
      await restoreProject(project.id);
      await refreshWorkspace();
    });
  }

  function openNewProject() {
    setEditingProject(null);
    setProjectEditorOpen(true);
  }

  function openProjectEditor(project: Project) {
    setEditingProject(project);
    setProjectEditorOpen(true);
  }

  function openNewTask() {
    setEditingTask(null);
    setEditorOpen(true);
  }

  function openEditor(task: Task) {
    setEditingTask(task);
    setEditorOpen(true);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#today" aria-label="DayFlow home">
          <span className="brand-mark"><Command size={19} strokeWidth={2.6} /></span>
          <span className="brand-copy"><strong>dayflow</strong><small>PERSONAL OPERATIONS</small></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={view === "today" && selectedModule === "all" ? "side-link active" : "side-link"} onClick={() => { setView("today"); setSelectedModule("all"); setSearch(""); }}>
            <LayoutDashboard size={17} /><span>Today</span><span className="nav-number">{activeTasks.length}</span>
          </button>
          <button className={view === "inbox" ? "side-link active" : "side-link"} onClick={() => { setView("inbox"); setSelectedModule("all"); setSearch(""); }}>
            <Inbox size={17} /><span>Inbox</span>
          </button>
          <button className={view === "upcoming" ? "side-link active" : "side-link"} onClick={() => { setView("upcoming"); setSelectedModule("all"); setSearch(""); }}>
            <CalendarDays size={17} /><span>Upcoming</span>
          </button>
        </nav>
        <div className="sidebar-label module-label">YOUR MODULES</div>
        <nav className="side-nav module-nav" aria-label="DayFlow modules">
          {MODULES.map((module) => {
            const Icon = moduleIcons[module.key];
            const count = tasks.filter((task) => task.moduleKey === module.key && task.status !== "done" && task.status !== "cancelled").length;
            return (
              <button key={module.key}
                className={selectedModule === module.key ? "side-link active" : "side-link"}
                onClick={() => setSelectedModule(module.key)}>
                <Icon size={17} /><span>{module.name}</span><span className="nav-number">{count}</span>
              </button>
            );
          })}
        </nav>
        <button className={view === "archived" ? "side-link active" : "side-link"} onClick={() => { setView("archived"); setSelectedModule("all"); setSearch(""); }}>
          <Archive size={17} /><span>Archive</span><span className="nav-number">{archivedTasks.length}</span>
        </button>
        <div className="sidebar-spacer" />
        <div className="privacy-card">
          <span className="privacy-icon"><Database size={15} /></span>
          <div><strong>Stored on this device</strong><small>Local database · no cloud task sync</small></div>
        </div>
        <button className="side-link settings-link" onClick={() => document.getElementById("storage-note")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          <Settings2 size={17} /><span>Settings & storage</span>
        </button>
        <div className="sidebar-footer">DAYFLOW V3 · LOCAL-FIRST</div>
      </aside>

      <main className="main-content" id="today">
        <header className="topbar">
          <div className="crumb"><span>MY WORKSPACE</span><ChevronRight size={13} /><strong>{view === "today" ? (selectedModule === "all" ? "Today" : moduleName(selectedModule)) : view === "inbox" ? "Inbox" : view === "upcoming" ? "Upcoming" : "Archive"}</strong></div>
          <div className="topbar-actions">
            <div className={online ? "connection-pill" : "connection-pill offline"}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{online ? "Online" : "Offline"}</span>
            </div>
            <button className="button button-primary new-task-button" onClick={openNewTask}><Plus size={16} /> New task</button>
          </div>
        </header>

        {updateAvailable && (
          <div className="notice notice-update" role="status">
            <RefreshCw size={16} /><span>{canApplyUpdate ? "A DayFlow update is ready and will apply automatically." : "An update is ready and will apply after the current edit or save is complete."}</span>
          </div>
        )}
        {offlineReady && !updateAvailable && <div className="notice" role="status"><WifiOff size={15} /> DayFlow is ready for offline use on this device.</div>}
        {serviceWorkerError && <div className="notice notice-error" role="alert"><CircleHelp size={16} /> Offline support could not be activated: {serviceWorkerError}</div>}
        {nativeWorkspaceError && (
          <div className="notice notice-error" role="alert">
            <CircleHelp size={16} /><span>Android private workspace unavailable: {nativeWorkspaceError}</span>
          </div>
        )}
        {isAndroidNative() && nativeWorkspaceReady && (
          <div className="notice" role="status"><ShieldCheck size={15} /> Android private DayFlow workspace is ready.</div>
        )}
        {databaseError && (
          <div className="notice notice-error" role="alert">
            <CircleHelp size={16} /><span>Local database unavailable: {databaseError}</span>
            <button onClick={() => {
              setLoading(true);
              void refreshWorkspace().catch((cause: unknown) => setDatabaseError(cause instanceof Error ? cause.message : "Database unavailable."))
                .finally(() => setLoading(false));
            }}>Retry</button>
          </div>
        )}

        <div className="page-heading">
          <div>
            <div className="date-label">{formatDateLabel(today)}</div>
            <h1>{greeting}. <span>Make room for what matters.</span></h1>
            <p>Your personal workspace, organised around meaningful progress.</p>
          </div>
          <button className="icon-button search-toggle" aria-label="Focus search" onClick={() => document.getElementById("task-search")?.focus()}>
            <Search size={18} />
          </button>
        </div>

        <section className="overview-grid" aria-label="Today's overview">
          <article className="overview-card overview-primary">
            <div className="overview-card-top"><span>DAILY PROGRESS</span><Target size={17} /></div>
            <div className="overview-main-number">{todayRate}<small>%</small></div>
            <div className="progress-track"><span style={{ width: todayRate + "%" }} /></div>
            <div className="overview-foot">
              <span>{todaysTasks.filter((task) => task.status === "done").length} completed</span>
              <span>{todaysTasks.length} planned</span>
            </div>
          </article>
          <article className="overview-card">
            <div className="overview-card-top"><span>ACTIVE TASKS</span><Activity size={17} /></div>
            <div className="overview-number">{activeTasks.length}</div><p>Across all five modules</p>
          </article>
          <article className="overview-card">
            <div className="overview-card-top"><span>HIGH PRIORITY</span><Sparkles size={17} /></div>
            <div className="overview-number">{urgentCount}</div><p>Needs deliberate attention</p>
          </article>
        </section>

        <section className="module-section">
          <div className="section-heading">
            <div><span className="eyebrow">THE BIG PICTURE</span><h2>Your modules</h2></div>
            <span className="section-aside">Five areas. One workspace.</span>
          </div>
          <div className="module-deck">
            {MODULES.map((module, index) => {
              const Icon = moduleIcons[module.key];
              const count = tasks.filter((task) => task.moduleKey === module.key && task.status !== "done" && task.status !== "cancelled").length;
              const isSelected = selectedModule === module.key;
              return (
                <button className={"module-card module-" + module.accent + (isSelected ? " selected" : "")}
                  key={module.key} onClick={() => setSelectedModule(isSelected ? "all" : module.key)} aria-pressed={isSelected}>
                  <span className="module-index">0{index + 1}</span>
                  <span className="module-icon"><Icon size={20} /></span>
                  <span className="module-title">{module.name}</span>
                  <span className="module-description">{module.description}</span>
                  <span className="module-card-bottom"><strong>{count} active</strong><ArrowUpRight size={16} /></span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="project-section">
          <div className="section-heading">
            <div><span className="eyebrow">{view === "archived" ? "RECOVERABLE RECORDS" : "OUTCOME TRACKING"}</span><h2>{view === "archived" ? "Archived projects" : "Projects"}</h2></div>
            {view !== "archived" && <button className="button button-outline" onClick={openNewProject}><Plus size={15} /> New project</button>}
          </div>
          {visibleProjects.length === 0 ? (
            <div className="project-empty">{view === "archived" ? "No archived projects." : "No projects in this area yet. Create one to group tasks around a meaningful outcome."}</div>
          ) : (
            <div className="project-grid">
              {visibleProjects.map((project) => (
                <article className="project-card" key={project.id}>
                  <div className="project-card-top">
                    <span className={"priority-tag priority-" + project.priority}>{project.priority}</span>
                    <span className="project-status">{project.status.replace("_", " ")}</span>
                  </div>
                  <button className="project-card-title" onClick={() => {
                    setSelectedModule(project.moduleKey);
                    setView("today");
                    setSearch("");
                  }}>{project.name}</button>
                  <p>{project.description || moduleName(project.moduleKey)}</p>
                  <div className="project-progress"><span style={{ width: project.progress + "%" }} /></div>
                  <div className="project-card-meta">
                    <span>{project.progress}% complete</span>
                    <span>{project.completedTaskCount}/{project.taskCount} tasks</span>
                  </div>
                  <div className="project-card-actions">
                    {view === "archived" ? (
                      <button type="button" disabled={pendingWrites > 0}
                        onClick={() => void restoreProjectRecord(project).catch((cause: unknown) => setDatabaseError(cause instanceof Error ? cause.message : "Project restore failed."))}>
                        Restore project and tasks
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => openProjectEditor(project)}>Edit</button>
                        <button type="button" disabled={pendingWrites > 0}
                          onClick={() => void archiveProjectRecord(project).catch((cause: unknown) => setDatabaseError(cause instanceof Error ? cause.message : "Project archive failed."))}>Archive</button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="task-panel">
          <div className="task-panel-header">
            <div>
              <span className="eyebrow">YOUR NEXT MOVES</span>
              <h2>{view === "today" ? (selectedModule === "all" ? "Today's plan" : moduleName(selectedModule)) : view === "inbox" ? "Inbox" : view === "upcoming" ? "Upcoming tasks" : "Archived tasks"}</h2>
              <p>{view === "today" ? "A clear sequence, not another noisy checklist." : view === "inbox" ? "Unscheduled tasks waiting for a clear next step." : view === "upcoming" ? "Work with a future target date." : "Archived records stay recoverable until you choose otherwise."}</p>
            </div>
            <div className="task-panel-tools">
              <label className="search-box"><Search size={15} />
                <input id="task-search" value={search} onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a task" aria-label="Find a task" />
              </label>
              <button className="button button-outline" onClick={openNewTask}><Plus size={15} /> Add</button>
            </div>
          </div>

          {loading ? (
            <div className="empty-state"><div className="loading-dot" />Opening your private workspace…</div>
          ) : visibleTasks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon"><Inbox size={22} /></span>
              <strong>{search ? "No matching tasks" : "A little room to think."}</strong>
              <p>{search ? "Try a different search phrase." : "Capture your first task and give it a clear next action."}</p>
              {!search && <button className="button button-primary" onClick={openNewTask}><Plus size={15} /> Create your first task</button>}
            </div>
          ) : (
            <div className="task-list">
              {visibleTasks.map((task) => (
                <article className={"task-row" + (task.status === "done" ? " task-complete" : "")} key={task.id}>
                  <button className={"task-complete-button" + (task.status === "done" ? " checked" : "")}
                    aria-label={(task.status === "done" ? "Reopen: " : "Complete: ") + task.title}
                    disabled={pendingWrites > 0} onClick={() => void toggleTask(task).catch((cause: unknown) => setDatabaseError(cause instanceof Error ? cause.message : "Task update failed."))}>
                    {task.status === "done" && <Check size={13} />}
                  </button>
                  <button className="task-content" onClick={() => openEditor(task)}>
                    <strong>{task.title}</strong>
                    <span>{moduleName(task.moduleKey)}{task.nextAction ? " · Next: " + task.nextAction : ""}</span>
                  </button>
                  <span className={"priority-tag priority-" + task.priority}>{priorityLabels[task.priority]}</span>
                  <span className="task-time">{task.scheduledStart ? task.scheduledStart.slice(0, 5) : task.dueDate ?? "Flexible"}</span>
                  {view === "archived" ? (
                    <button className="task-icon-action" aria-label={"Restore: " + task.title}
                      disabled={pendingWrites > 0} onClick={() => void restore(task).catch((cause: unknown) => setDatabaseError(cause instanceof Error ? cause.message : "Task restore failed."))}>
                      <RefreshCw size={15} />
                    </button>
                  ) : (
                    <button className="task-icon-action" aria-label={"Archive: " + task.title}
                      disabled={pendingWrites > 0} onClick={() => void archive(task).catch((cause: unknown) => setDatabaseError(cause instanceof Error ? cause.message : "Task archive failed."))}>
                      <Archive size={15} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="task-panel-footer">
            <span>{visibleTasks.length} shown · Changes save automatically to this device</span>
            <span className="local-save-indicator"><span /> Local database</span>
          </div>
        </section>

        <section className="storage-section" id="storage-note">
          <StorageStatus />
          <BackupPanel onRestored={refreshWorkspace} />
          <p className="storage-boundary-note">Browser storage is private to this site and can be cleared by browser settings or device resets. Keep encrypted backups outside this device. The current PWA database is not transparently encrypted at rest.</p>
        </section>

        <footer className="workspace-footer" id="workspace-footer">
          <div className="footer-brand"><Command size={15} /> DayFlow</div>
          <p>Private by default. Tasks are stored locally on this device. No account or cloud task database is connected.</p>
          <span><Clock3 size={13} /> Browser storage</span>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={selectedModule === "all" ? "mobile-nav-active" : ""} onClick={() => setSelectedModule("all")}><LayoutDashboard size={19} /><span>Today</span></button>
        <button onClick={() => document.querySelector(".project-section")?.scrollIntoView({ behavior: "smooth" })}><FolderKanban size={19} /><span>Projects</span></button>
        <button onClick={openNewTask}><Plus size={19} /><span>Capture</span></button>
        <button onClick={() => document.querySelector(".storage-section")?.scrollIntoView({ behavior: "smooth" })}><Settings2 size={19} /><span>Settings</span></button>
      </nav>

      {editorOpen && (
        <TaskEditor key={editingTask?.id ?? "new-task"} task={editingTask} defaultDate={today}
          projects={projects} tasks={tasks}
          onClose={() => { setEditorOpen(false); setEditingTask(null); }}
          onSave={saveTask} />
      )}
      {projectEditorOpen && (
        <ProjectEditor
          project={editingProject}
          onClose={() => { setProjectEditorOpen(false); setEditingProject(null); }}
          onSave={saveProject}
        />
      )}
    </div>
  );
}
