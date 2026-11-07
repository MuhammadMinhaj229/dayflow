import { useState, type FormEvent } from "react";
import { MODULES, type Project, type ProjectDraft } from "../domain/task";

const priorities = ["low", "medium", "high", "urgent"] as const;
const statuses = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" }
] as const;

export function ProjectEditor({
  project,
  onClose,
  onSave
}: {
  project: Project | null;
  onClose: () => void;
  onSave: (draft: ProjectDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProjectDraft>(() => project ? {
    name: project.name,
    description: project.description,
    moduleKey: project.moduleKey,
    status: project.status,
    priority: project.priority,
    dueDate: project.dueDate
  } : {
    name: "",
    description: null,
    moduleKey: "projects",
    status: "active",
    priority: "medium",
    dueDate: null
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="task-editor" role="dialog" aria-modal="true" aria-labelledby="project-editor-title">
        <div className="editor-header">
          <div><span className="eyebrow">PROJECT DETAILS</span><h2 id="project-editor-title">{project ? "Edit project" : "Create a project"}</h2></div>
          <button className="icon-button soft" type="button" aria-label="Close project editor" onClick={onClose}>×</button>
        </div>
        <form onSubmit={(event) => void submit(event)} className="editor-form">
          <label className="field full">
            <span>Project name</span>
            <input autoFocus required maxLength={160} value={draft.name}
              onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
              placeholder="Give this project a clear name" />
          </label>
          <label className="field full">
            <span>Description</span>
            <textarea rows={3} value={draft.description ?? ""}
              onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value || null }))}
              placeholder="What outcome should this project deliver?" />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Module</span>
              <select value={draft.moduleKey} onChange={(event) => setDraft((value) => ({
                ...value, moduleKey: event.target.value as ProjectDraft["moduleKey"]
              }))}>
                {MODULES.map((module) => <option key={module.key} value={module.key}>{module.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={draft.status} onChange={(event) => setDraft((value) => ({
                ...value, status: event.target.value as ProjectDraft["status"]
              }))}>
                {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select value={draft.priority} onChange={(event) => setDraft((value) => ({
                ...value, priority: event.target.value as ProjectDraft["priority"]
              }))}>
                {priorities.map((priority) => <option key={priority} value={priority}>{priority[0]?.toUpperCase() + priority.slice(1)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Target date</span>
              <input type="date" value={draft.dueDate ?? ""}
                onChange={(event) => setDraft((value) => ({ ...value, dueDate: event.target.value || null }))} />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="editor-actions">
            <button className="button button-quiet" type="button" disabled={saving} onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving || !draft.name.trim()}>
              {saving ? "Saving…" : "Save project"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
