import { History } from "lucide-react";

export interface HistoryItem {
  id: string;
  eventType: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

function eventDescription(item: HistoryItem): string {
  const metadata = item.metadata;
  if (item.eventType.endsWith("status_changed")) {
    const from = typeof metadata.from === "string" ? metadata.from.replaceAll("_", " ") : "previous";
    const to = typeof metadata.to === "string" ? metadata.to.replaceAll("_", " ") : "updated";
    return "Status: " + from + " → " + to;
  }
  if (item.eventType.endsWith(".updated") && metadata.changes && typeof metadata.changes === "object") {
    const fields = Object.keys(metadata.changes as Record<string, unknown>);
    return fields.length ? "Changed " + fields.join(", ") : "Details updated";
  }
  if (item.eventType.endsWith(".archived")) return "Moved to the archive";
  if (item.eventType.endsWith(".restored")) return "Restored from the archive";
  if (item.eventType.endsWith(".reordered")) return "Order changed";
  return item.eventType.split(".").at(-1)?.replaceAll("_", " ") ?? "Updated";
}

function eventTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

export function HistoryTimeline({
  subject,
  items,
  loading,
  error
}: {
  subject: "task" | "project";
  items: HistoryItem[];
  loading: boolean;
  error: string;
}) {
  return (
    <section className="history-panel" aria-label={subject + " activity history"}>
      <div className="history-heading">
        <strong><History size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />Recent activity</strong>
        <span className="eyebrow">LOCAL HISTORY</span>
      </div>
      {loading ? (
        <p className="history-empty">Loading activity…</p>
      ) : error ? (
        <p className="history-empty" role="status">History unavailable: {error}</p>
      ) : items.length === 0 ? (
        <p className="history-empty">Changes to this {subject} will appear here.</p>
      ) : (
        <ol className="history-list">
          {items.slice(0, 20).map((item) => (
            <li className="history-item" key={item.id}>
              <span className="history-dot" aria-hidden="true" />
              <span className="history-copy">
                <strong>{eventDescription(item)}</strong>
                <span>{eventTime(item.createdAt)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
