"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, Bell, CalendarDays, Check, ChevronRight, CircleHelp,
  Command, FolderKanban, Inbox, LayoutDashboard, ListTodo, LogOut, Plus,
  Search, Settings2, Sparkles, Target, Timer, Trash2, Zap,
} from "lucide-react";
import type { DayflowTask, TaskStatus } from "@/types/task";

const storageKey = (date: string) => `dayflow-preview:${date}`;
function localDateInIndia() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function prettyDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00+05:30`));
}
function sampleTasks(date: string): DayflowTask[] {
  return [
    { id: "demo-1", title: "Build the Noman Brothers website foundation", status: "in_progress", priority: "high", planDate: date, scheduledStart: "09:00", scheduledEnd: "11:00", project: "Client work", labels: ["Delivery"], order: 0, source: "import" },
    { id: "demo-2", title: "Prepare the PHFI Data Programmer presentation", status: "next", priority: "high", planDate: date, scheduledStart: "11:15", scheduledEnd: "12:15", project: "PHFI", labels: ["Career"], order: 1, source: "import" },
    { id: "demo-3", title: "Audit the PHFI Flutter application", status: "next", priority: "medium", planDate: date, scheduledStart: "14:00", scheduledEnd: "15:00", project: "PHFI", labels: ["Development"], order: 2, source: "import" },
    { id: "demo-4", title: "Restart local and global job outreach", status: "next", priority: "medium", planDate: date, scheduledStart: "16:00", scheduledEnd: "17:00", project: "Career", labels: ["Outreach"], order: 3, source: "import" },
  ];
}

export default function TodayDashboard({ demoMode, email }: { demoMode: boolean; email: string }) {
  const [date, setDate] = useState("");
  const [tasks, setTasks] = useState<DayflowTask[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [localOnly, setLocalOnly] = useState(demoMode);
  const [notice, setNotice] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => { setDate(localDateInIndia()); }, []);

  useEffect(() => {
    if (!date) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      if (demoMode) {
        const stored = window.localStorage.getItem(storageKey(date));
        setTasks(stored ? JSON.parse(stored) as DayflowTask[] : sampleTasks(date));
        setLocalOnly(true);
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/tasks?date=${date}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Task API unavailable");
        const payload = await response.json();
        if (!active) return;
        setTasks(payload.tasks ?? []);
        setLocalOnly(false);
      } catch {
        if (!active) return;
        const stored = window.localStorage.getItem(storageKey(date));
        setTasks(stored ? JSON.parse(stored) as DayflowTask[] : sampleTasks(date));
        setLocalOnly(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [date, demoMode]);

  const completedCount = tasks.filter(task => task.status === "done").length;
  const activeCount = tasks.filter(task => task.status !== "done" && task.status !== "cancelled").length;
  const percent = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => (a.scheduledStart ?? "99:99").localeCompare(b.scheduledStart ?? "99:99") || a.order - b.order), [tasks]);
  const firstUpcoming = sortedTasks.find(task => task.status !== "done" && task.status !== "cancelled");
  const priorities = tasks.filter(task => task.priority === "high" && task.status !== "done").length;

  function persistPreview(next: DayflowTask[]) {
    setTasks(next);
    if (date) window.localStorage.setItem(storageKey(date), JSON.stringify(next));
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || !date) return;
    const optimistic: DayflowTask = {
      id: `local-${crypto.randomUUID()}`, title, status: "next", priority: "medium", planDate: date,
      scheduledStart: newTime || undefined, project: "Personal", labels: [], order: tasks.length, source: "web",
    };
    setNewTitle(""); setNewTime(""); setNotice("");
    if (localOnly) { persistPreview([...tasks, optimistic]); return; }
    try {
      const response = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, planDate: date, priority: optimistic.priority, scheduledStart: optimistic.scheduledStart, project: optimistic.project }) });
      if (!response.ok) throw new Error("save failed");
      const payload = await response.json();
      setTasks(current => [...current, { ...optimistic, id: payload.task.id }]);
    } catch {
      setLocalOnly(true); persistPreview([...tasks, optimistic]);
      setNotice("Database connection unavailable. This task is saved only in this browser until MongoDB is configured.");
    }
  }

  async function importFinalizedPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportMessage("");
    if (localOnly) {
      setImportMessage("Connect MongoDB and sign in to import plans. Preview mode is browser-only.");
      return;
    }
    let payload: unknown;
    try { payload = JSON.parse(importJson); }
    catch { setImportMessage("This is not valid JSON. Check the braces, commas and quotation marks."); return; }
    setImportBusy(true);
    try {
      const response = await fetch("/api/plans/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to import plan.");
      setImportMessage(`${result.message} ${result.importedTasks} tasks · revision ${result.revision}.`);
      const importedDate = (payload as { date?: string }).date ?? date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(importedDate)) setDate(importedDate);
      const refreshed = await fetch(`/api/tasks?date=${importedDate}`, { cache: "no-store" });
      if (refreshed.ok) setTasks((await refreshed.json()).tasks ?? []);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Plan import failed.");
    } finally { setImportBusy(false); }
  }

  async function deleteTask(task: DayflowTask) {
    const next = tasks.filter(item => item.id !== task.id);
    if (localOnly || task.id.startsWith("local-") || task.id.startsWith("demo-")) { persistPreview(next); return; }
    setTasks(next);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
    } catch {
      setLocalOnly(true); persistPreview(next);
      setNotice("Task was removed in this browser, but the change did not reach MongoDB. Check your connection.");
    }
  }

  async function toggleTask(task: DayflowTask) {
    const status: TaskStatus = task.status === "done" ? "next" : "done";
    const next = tasks.map(item => item.id === task.id ? { ...item, status, completedAt: status === "done" ? new Date().toISOString() : undefined } : item);
    if (localOnly || task.id.startsWith("local-") || task.id.startsWith("demo-")) { persistPreview(next); return; }
    setTasks(next);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error("sync failed");
    } catch {
      setLocalOnly(true); persistPreview(next);
      setNotice("Change is visible locally but did not reach MongoDB. Check your connection before relying on it across devices.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const greeting = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date());
  const greetingText = Number(greeting) < 12 ? "Good morning" : Number(greeting) < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Command size={19} strokeWidth={2.8} /></div><div><div className="brand-name">dayflow</div><div className="brand-sub">personal command</div></div></div>
        <div className="nav-group">
          <div className="nav-label">Workspace</div>
          <a className="nav-link active" href="#today"><LayoutDashboard size={17}/>Today<span className="nav-count">{activeCount}</span></a>
          <a className="nav-link" href="#task-list"><Inbox size={17}/>Inbox</a>
          <a className="nav-link" href="#agenda"><CalendarDays size={17}/>Upcoming</a>
        </div>
        <div className="nav-group">
          <div className="nav-label">Manage</div>
          <a className="nav-link" href="#projects"><FolderKanban size={17}/>Projects</a>
          <a className="nav-link" href="#agenda"><CalendarDays size={17}/>Calendar</a>
          <a className="nav-link" href="#review"><Activity size={17}/>Review</a>
        </div>
        <div className="sidebar-bottom"><div style={{display:"flex",alignItems:"center",gap:8,color:"#dfe5f4",fontSize:12,fontWeight:700}}><Sparkles size={15} color="#aebcff"/> Make space for focus</div><p>Capture everything. Choose what matters. Move one meaningful thing forward.</p></div>
      </aside>

      <main className="main" id="today">
        <header className="topbar">
          <div><div className="eyebrow">Your personal workspace</div><h1 className="page-title">Today, in flow.</h1></div>
          <div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={17}/></button><button className="icon-button" aria-label="Notifications"><Bell size={17}/></button><div className="avatar" title={email}>{email.slice(0,2).toUpperCase()}</div>{!demoMode && <button className="icon-button" aria-label="Sign out" onClick={logout}><LogOut size={16}/></button>}</div>
        </header>

        {(demoMode || localOnly) && <div className="demo-banner"><CircleHelp size={15}/><span><strong>Preview mode.</strong> Tasks are stored in this browser only. Configure MongoDB and authentication before using this as your live planner.</span></div>}
        {notice && <div className="demo-banner" role="status">{notice}</div>}

        <div className="content-grid">
          <section style={{display:"grid",gap:15,minWidth:0}}>
            <div className="panel hero">
              <div className="hero-kicker">{date ? prettyDate(date) : "Loading your day"}</div>
              <h2>{greetingText}. Ready for a focused day?</h2>
              <p>You have {activeCount} active {activeCount === 1 ? "task" : "tasks"}. Keep your attention on the next meaningful step.</p>
              <div className="progress-wrap"><div className="progress-track"><div className="progress-fill" style={{width:`${percent}%`}}/></div><div className="progress-label">{completedCount}/{tasks.length} completed · {percent}%</div></div>
            </div>

            <div className="panel" id="task-list">
              <div className="section-head"><div><div className="section-title">Your plan</div><div className="section-sub">A clear sequence, not another noisy checklist.</div></div><span className="eyebrow" style={{letterSpacing:1,fontSize:9}}>TODAY</span></div>
              {loading ? <div className="empty-state">Loading your tasks…</div> : sortedTasks.length === 0 ? <div className="empty-state">Your day is open. Add the first task below.</div> : <div className="task-list">
                {sortedTasks.map(task => <div key={task.id} className={`task-row ${task.status === "done" ? "completed" : ""}`}>
                  <button className={`task-check ${task.status === "done" ? "done" : ""}`} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => void toggleTask(task)}>{task.status === "done" && <Check size={13} strokeWidth={3}/>}</button>
                  <div className="task-main"><div className="task-title">{task.title}</div><div className="task-meta"><span><i className="project-dot"/> {task.project || "Personal"}</span>{task.labels?.slice(0,2).map(label => <span key={label}>· {label}</span>)}</div></div>
                  <span className={`priority ${task.priority}`}>{task.priority}</span>
                  <div className="time">{task.scheduledStart ?? "Anytime"}</div>
                  <button className="task-delete" aria-label={`Delete ${task.title}`} onClick={() => void deleteTask(task)}><Trash2 size={13}/></button>
                </div>)}
              </div>}
              <form className="add-task" onSubmit={addTask}><input aria-label="New task title" placeholder="Add a task to your day…" value={newTitle} onChange={e => setNewTitle(e.target.value)} maxLength={240}/><input aria-label="Optional start time" type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{maxWidth:112}}/><button className="primary-button" type="submit"><Plus size={15}/> Add</button></form>
              <details style={{margin:"0 16px 16px",borderTop:"1px solid var(--line)",paddingTop:12}}>
                <summary style={{cursor:"pointer",color:"#aebcff",fontSize:11,fontWeight:700}}>Import a finalized plan</summary>
                <p style={{fontSize:10,color:"#8592a4",lineHeight:1.6}}>Paste the structured plan JSON from ChatGPT. Tasks will be mapped into this workspace; repeated imports of the same revision will not create duplicates.</p>
                <form onSubmit={importFinalizedPlan} style={{display:"grid",gap:8}}>
                  <textarea aria-label="Finalized plan JSON" value={importJson} onChange={e=>setImportJson(e.target.value)} rows={7} placeholder={`{
  "externalKey": "plan-2026-11-06-v1",
  "date": "2026-11-06",
  "title": "Friday plan",
  "timezone": "Asia/Kolkata",
  "tasks": [{ "key": "phfi-deck", "title": "Prepare PHFI presentation", "priority": "high", "start": "09:00", "project": "PHFI" }]
}`} style={{width:"100%",resize:"vertical",background:"#0d1118",border:"1px solid var(--line)",borderRadius:12,padding:12,color:"#e7ebf4",fontSize:10,lineHeight:1.5,outline:"none"}}/>
                  <button className="primary-button" type="submit" disabled={importBusy || localOnly} style={{justifySelf:"start"}}>{importBusy?"Importing…":"Import into planner"}</button>
                </form>
                {importMessage && <p role="status" style={{color:"#aebcff",fontSize:10,lineHeight:1.5}}>{importMessage}</p>}
              </details>
            </div>

            <div className="panel" id="review">
              <div className="section-head"><div><div className="section-title">A small daily check-in</div><div className="section-sub">Make the plan realistic before you start.</div></div><Target size={18} color="#a9b8ff"/></div>
              <div style={{padding:"0 22px 20px",display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:9}}>
                <div className="stat-card"><div className="stat-number">{activeCount}</div><div className="stat-label">Active tasks</div></div>
                <div className="stat-card"><div className="stat-number">{priorities}</div><div className="stat-label">High priority</div></div>
                <div className="stat-card"><div className="stat-number">{completedCount}</div><div className="stat-label">Completed</div></div>
              </div>
            </div>
          </section>

          <aside className="right-stack">
            <div className="quick-widget">
              <div className="widget-top"><span>Glance view</span><Zap size={15}/></div>
              <div className="widget-date">{date ? new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata",day:"numeric",month:"short"}).format(new Date(`${date}T12:00:00+05:30`)) : "Today"}</div>
              {(sortedTasks.filter(task => task.status !== "done").slice(0,3)).map(task => <div className="widget-task" key={task.id}><span/>{task.title}</div>)}
              {activeCount === 0 && <div className="widget-task"><span/>A little space for what matters</div>}
              <div className="widget-foot"><span>{activeCount} left to do</span><span>DayFlow preview</span></div>
            </div>

            <div className="panel" id="agenda">
              <div className="section-head"><div><div className="section-title">Up next</div><div className="section-sub">Your next planned action</div></div><Timer size={17} color="#a9b8ff"/></div>
              <div className="agenda">
                {firstUpcoming ? <div className="agenda-item"><div className="agenda-time">{firstUpcoming.scheduledStart ?? "Next"}</div><div className="agenda-line"><div className="agenda-name">{firstUpcoming.title}</div><div className="agenda-note">{firstUpcoming.project || "Personal"} · {firstUpcoming.priority} priority</div></div></div> : <div className="empty-state" style={{padding:"5px 0 12px"}}>Nothing waiting. Take a breath.</div>}
                <div className="agenda-item"><div className="agenda-time">Anytime</div><div className="agenda-line" style={{borderColor:"#658d82"}}><div className="agenda-name">Leave room for the unexpected</div><div className="agenda-note">A good plan has space in it.</div></div></div>
              </div>
            </div>

            <div className="panel" id="projects">
              <div className="section-head"><div><div className="section-title">Focus areas</div><div className="section-sub">Where your energy is going</div></div><FolderKanban size={17} color="#a9b8ff"/></div>
              <div style={{padding:"0 16px 16px",display:"grid",gap:11}}>
                {["Client work","PHFI","Career","Personal growth"].map((name,index)=><div key={name} style={{display:"flex",alignItems:"center",gap:10,fontSize:11,color:"#cbd3e0"}}><span style={{width:7,height:7,borderRadius:20,background:["#a8b7ff","#9ddbc2","#efc77d","#c4a6f4"][index]}}/>{name}<span style={{marginLeft:"auto",color:"#7e8a9b"}}>{tasks.filter(t=>t.project===name).length}</span></div>)}
              </div>
            </div>
          </aside>
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation"><a className="active" href="#today"><LayoutDashboard size={17}/>Today</a><a href="#task-list"><ListTodo size={17}/>Tasks</a><a href="#agenda"><CalendarDays size={17}/>Agenda</a><a href="#projects"><FolderKanban size={17}/>Projects</a><a href="#review"><Settings2 size={17}/>Review</a></nav>
    </div>
  );
}
