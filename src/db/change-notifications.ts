const CHANNEL_NAME = "dayflow-workspace-changes-v1";
const CHANGE_MESSAGE = Object.freeze({ type: "workspace-changed", version: 1 });

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** Notify other open DayFlow tabs after a committed local database transaction. */
export function publishWorkspaceChange(): void {
  getChannel()?.postMessage(CHANGE_MESSAGE);
}

/** Listen for workspace commits made by another tab. Messages contain no workspace data. */
export function subscribeToWorkspaceChanges(onChange: () => void): () => void {
  const listenerChannel = getChannel();
  if (!listenerChannel) return () => undefined;

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (
      typeof event.data === "object" &&
      event.data !== null &&
      "type" in event.data &&
      event.data.type === CHANGE_MESSAGE.type &&
      "version" in event.data &&
      event.data.version === CHANGE_MESSAGE.version
    ) {
      onChange();
    }
  };

  listenerChannel.addEventListener("message", handleMessage);
  return () => listenerChannel.removeEventListener("message", handleMessage);
}
