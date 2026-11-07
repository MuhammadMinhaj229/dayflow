import { useState } from "react";
import { createEncryptedBackup, restoreEncryptedBackup } from "../db/backup";

export function BackupPanel({ onRestored }: { onRestored: () => Promise<void> }) {
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"export" | "restore" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function exportBackup() {
    setError("");
    setMessage("");
    if (exportPassphrase !== confirmPassphrase) {
      setError("The two backup passphrases do not match.");
      return;
    }
    setBusy("export");
    try {
      const blob = await createEncryptedBackup(exportPassphrase);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dayflow-backup-" + new Date().toISOString().slice(0, 10) + ".dayflow";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Encrypted backup created. Keep the file and passphrase in separate safe places.");
      setExportPassphrase("");
      setConfirmPassphrase("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The backup could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function restoreBackup() {
    setError("");
    setMessage("");
    if (!selectedFile) {
      setError("Choose a DayFlow backup file first.");
      return;
    }
    if (!window.confirm("Restore this backup? It will replace all current DayFlow projects, tasks and task history on this device. Export a backup of the current workspace first if you may need it.")) {
      return;
    }
    setBusy("restore");
    try {
      const counts = await restoreEncryptedBackup(selectedFile, restorePassphrase);
      await onRestored();
      setMessage("Restore completed: " + counts.projectCount + " projects and " + counts.taskCount + " tasks are now in this workspace.");
      setSelectedFile(null);
      setRestorePassphrase("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The backup could not be restored.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="backup-title">
      <div className="settings-heading">
        <div><span className="eyebrow">DATA PORTABILITY</span><h2 id="backup-title">Encrypted backup & restore</h2></div>
      </div>
      <p className="settings-description">
        Your workspace stays on this device. Create a password-protected backup regularly and store it somewhere separate from this device.
        DayFlow never receives your backup or passphrase.
      </p>
      <div className="backup-grid">
        <div className="backup-card">
          <h3>Create encrypted backup</h3>
          <p>Uses AES-256-GCM encryption with a password-derived key. Your passphrase is not saved.</p>
          <label className="field">
            <span>Backup passphrase (12+ characters)</span>
            <input type="password" autoComplete="new-password" value={exportPassphrase}
              onChange={(event) => setExportPassphrase(event.target.value)} />
          </label>
          <label className="field">
            <span>Confirm passphrase</span>
            <input type="password" autoComplete="new-password" value={confirmPassphrase}
              onChange={(event) => setConfirmPassphrase(event.target.value)} />
          </label>
          <button className="button button-primary" type="button" disabled={busy !== null || exportPassphrase.length < 12 || !confirmPassphrase}
            onClick={() => void exportBackup()}>
            {busy === "export" ? "Encrypting…" : "Download backup"}
          </button>
        </div>
        <div className="backup-card">
          <h3>Restore from backup</h3>
          <p>Restore validates the file, decrypts it and checks relational integrity before replacing local records.</p>
          <label className="field">
            <span>DayFlow backup file</span>
            <input type="file" accept=".dayflow,application/vnd.dayflow.backup+json,application/json"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="field">
            <span>Backup passphrase</span>
            <input type="password" autoComplete="current-password" value={restorePassphrase}
              onChange={(event) => setRestorePassphrase(event.target.value)} />
          </label>
          <button className="button button-outline" type="button" disabled={busy !== null || !selectedFile || restorePassphrase.length < 12}
            onClick={() => void restoreBackup()}>
            {busy === "restore" ? "Validating and restoring…" : "Restore workspace"}
          </button>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="settings-success" role="status">{message}</p>}
    </section>
  );
}
