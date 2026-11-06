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
import { archiveTask, createTask, listTasks, setTaskStatus, updateTask } from "./db/task-repository";

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
  onSave
}: {
  task: Task | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (draft: TaskDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => task ? {
    title: task.title,
    details: task.details,
    moduleKey: task.moduleKey,
    priority: task.priority,
    dueDate: task.dueDate,
    scheduledStart: task.scheduledStart,
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
  const [selectedModule, setSelectedModule] = useState<ModuleKey | "all">("all");
  const [today] = useState(() => localDateISO());
  const [loading, setLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateWorker, setUpdateWorker] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const canApplyUpdate = !editorOpen && pendingWrites === 0 && !loading;
  const [pendingWrites, setPendingWrites] = useState(0);

  async function refreshTasks() {
    setDatabaseError("");
    setTasks(await listTasks());
  }

  useEffect(() => {
    let active = true;
    void listTasks().then((records) => {
      if (active) setTasks(records);
    }).catch((cause: unknown) => {
      if (active) setDatabaseError(cause instanceof Error ? cause.message : "Local storage could not be opened.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
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
      onOfflineReady() { setOfflineReady(true); }
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
    () => tasks.filter((task) => task.dueDate === today || task.dueDate === null),
    [tasks, today]
  );
  const visibleTasks = useMemo(() => {
    const selected = selectedModule === "all" ? todaysTasks : todaysTasks.filter((task) => task.moduleKey === selectedModule);
    const term = search.trim().toLocaleLowerCase();
    return selected.filter((task) => !term ||
      task.title.toLocaleLowerCase().includes(term) ||
      (task.details ?? "").toLocaleLowerCase().includes(term) ||
      (task.nextAction ?? "").toLocaleLowerCase().includes(term)
    );
  }, [search, selectedModule, todaysTasks]);

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
      await refreshTasks();
    });
    setEditorOpen(false);
    setEditingTask(null);
  }

  async function toggleTask(task: Task) {
    await withPendingWrite(async () => {
      await setTaskStatus(task.id, task.status === "done" ? "next" : "done");
      await refreshTasks();
    });
  }

  async function archive(task: Task) {
    await withPendingWrite(async () => {
      await archiveTask(task.id);
      await refreshTasks();
    });
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
          <button className={selectedModule === "all" ? "side-link active" : "side-link"} onClick={() => setSelectedModule("all")}>
            <LayoutDashboard size={17} /><span>Today</span><span className="nav-number">{activeTasks.length}</span>
          </button>
          <button className="side-link" onClick={() => { setSelectedModule("all"); setSearch(""); }}>
            <Inbox size={17} /><span>Inbox</span>
          </button>
          <button className="side-link" onClick={() => setSelectedModule("all")}>
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
          <div className="crumb"><span>MY WORKSPACE</span><ChevronRight size={13} /><strong>{selectedModule === "all" ? "Today" : moduleName(selectedModule)}</strong></div>
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
        {databaseError && (
          <div className="notice notice-error" role="alert">
            <CircleHelp size={16} /><span>Local database unavailable: {databaseError}</span>
            <button onClick={() => {
              setLoading(true);
              void refreshTasks().catch((cause: unknown) => setDatabaseError(cause instanceof Error ? cause.message : "Database unavailable."))
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

        <section className="task-panel">
          <div className="task-panel-header">
            <div>
              <span className="eyebrow">YOUR NEXT MOVES</span>
              <h2>{selectedModule === "all" ? "Today's plan" : moduleName(selectedModule)}</h2>
              <p>{selectedModule === "all" ? "A clear sequence, not another noisy checklist." : "Tasks and next actions in this area."}</p>
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
                  <button className="task-icon-action" aria-label={"Archive: " + task.title}
                    disabled={pendingWrites > 0} onClick={() => void archive(task).catch((cause: unknown) => setDatabaseError(cause instanceof Error ? cause.message : "Task archive failed."))}>
                    <Archive size={15} />
                  </button>
                </article>
              ))}
            </div>
          )}
          <div className="task-panel-footer">
            <span>{visibleTasks.length} shown · Changes save automatically to this device</span>
            <span className="local-save-indicator"><span /> Local database</span>
          </div>
        </section>

        <footer className="workspace-footer" id="storage-note">
          <div className="footer-brand"><Command size={15} /> DayFlow</div>
          <p>Private by default. Tasks are stored locally on this device. No account or cloud task database is connected.</p>
          <span><Clock3 size={13} /> Browser storage</span>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={selectedModule === "all" ? "mobile-nav-active" : ""} onClick={() => setSelectedModule("all")}><LayoutDashboard size={19} /><span>Today</span></button>
        <button onClick={() => document.querySelector(".module-section")?.scrollIntoView({ behavior: "smooth" })}><FolderKanban size={19} /><span>Modules</span></button>
        <button onClick={openNewTask}><Plus size={19} /><span>Capture</span></button>
        <button onClick={() => document.getElementById("storage-note")?.scrollIntoView({ behavior: "smooth" })}><Settings2 size={19} /><span>Settings</span></button>
      </nav>

      {editorOpen && (
        <TaskEditor key={editingTask?.id ?? "new-task"} task={editingTask} defaultDate={today}
          onClose={() => { setEditorOpen(false); setEditingTask(null); }}
          onSave={saveTask} />
      )}
    </div>
  );
}
