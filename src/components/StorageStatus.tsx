import { useCallback, useEffect, useState } from "react";
import { Database, HardDrive, ShieldCheck } from "lucide-react";

type StorageSnapshot = {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
  supported: boolean;
};

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return "Unavailable";
  if (value < 1024) return value + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return amount.toFixed(amount >= 100 ? 0 : 1) + " " + units[index];
}

export function StorageStatus() {
  const [snapshot, setSnapshot] = useState<StorageSnapshot>({
    usage: null,
    quota: null,
    persisted: null,
    supported: false
  });
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const storage = navigator.storage;
    if (!storage) {
      setSnapshot({ usage: null, quota: null, persisted: null, supported: false });
      setLoading(false);
      return;
    }

    setSnapshot((current) => ({ ...current, supported: true }));
    setLoading(true);
    try {
      const [estimate, persisted] = await Promise.all([
        storage.estimate(),
        typeof storage.persisted === "function" ? storage.persisted() : Promise.resolve(null)
      ]);
      setSnapshot({
        usage: typeof estimate.usage === "number" ? estimate.usage : null,
        quota: typeof estimate.quota === "number" ? estimate.quota : null,
        persisted,
        supported: true
      });
    } catch {
      setSnapshot((current) => ({
        ...current,
        usage: null,
        quota: null,
        persisted: current.persisted,
        supported: true
      }));
      setMessage("The browser storage API is available, but an estimate could not be read.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function requestPersistence() {
    if (!navigator.storage || typeof navigator.storage.persist !== "function") {
      setMessage("Persistent storage requests are not supported by this browser.");
      return;
    }
    setRequesting(true);
    setMessage("");
    try {
      const granted = await navigator.storage.persist();
      await refresh();
      setMessage(granted
        ? "The browser granted persistent storage for this site."
        : "The browser did not grant persistent storage. Keep regular encrypted backups.");
    } catch {
      setMessage("The persistent storage request could not be completed.");
    } finally {
      setRequesting(false);
    }
  }

  const usagePercent = snapshot.usage !== null && snapshot.quota && snapshot.quota > 0
    ? Math.min(100, Math.round((snapshot.usage / snapshot.quota) * 100))
    : null;

  return (
    <section className="settings-panel storage-health" aria-labelledby="storage-health-title">
      <div className="settings-heading">
        <div><span className="eyebrow">LOCAL DATA HEALTH</span><h2 id="storage-health-title">Device storage</h2></div>
        <Database size={19} color="#6c8b70" />
      </div>
      {!snapshot.supported ? (
        <p className="settings-description">This browser does not expose storage health information. Your database still uses browser-origin storage; keep encrypted backups.</p>
      ) : (
        <>
          <div className="storage-metrics">
            <div><span>Estimated usage</span><strong>{loading ? "Checking…" : formatBytes(snapshot.usage)}</strong></div>
            <div><span>Estimated browser quota</span><strong>{loading ? "Checking…" : formatBytes(snapshot.quota)}</strong></div>
            <div><span>Persistence</span><strong>{snapshot.persisted === null ? "Not reported" : snapshot.persisted ? "Granted" : "Browser-managed"}</strong></div>
          </div>
          {usagePercent !== null && (
            <div className="storage-meter" role="img" aria-label={"Estimated browser storage usage " + usagePercent + " percent"}>
              <span style={{ width: usagePercent + "%" }} />
            </div>
          )}
          <div className="storage-actions">
            {snapshot.persisted !== true && (
              <button className="button button-outline" type="button" disabled={requesting} onClick={() => void requestPersistence()}>
                <ShieldCheck size={14} /> {requesting ? "Requesting…" : "Request persistent storage"}
              </button>
            )}
            <button className="button button-quiet" type="button" onClick={() => { setLoading(true); void refresh(); }}>
              <HardDrive size={14} /> Refresh status
            </button>
          </div>
          <p className="settings-description">A persistent-storage grant can reduce automatic browser eviction, but users and device-management tools can still clear site data. This is not encryption and does not replace an external backup.</p>
        </>
      )}
      {message && <p className="settings-success" role="status">{message}</p>}
    </section>
  );
}
