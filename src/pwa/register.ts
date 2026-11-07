type ServiceWorkerCallbacks = {
  onNeedRefresh: () => void;
  onOfflineReady: () => void;
  onRegistered: () => void;
};

type RegistrationHandle = {
  applyUpdate: () => Promise<void>;
  dispose: () => void;
};

export async function registerDayFlowServiceWorker(
  callbacks: ServiceWorkerCallbacks
): Promise<RegistrationHandle> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    throw new Error("Offline installation requires a secure browser context with service-worker support.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none"
  });
  callbacks.onRegistered();

  let disposed = false;
  let updateNotified = false;
  let updateTimer = 0;

  const notifyWaitingWorker = () => {
    if (!disposed && registration.waiting && navigator.serviceWorker.controller && !updateNotified) {
      updateNotified = true;
      callbacks.onNeedRefresh();
    }
  };

  const onInstallingStateChange = (event: Event) => {
    const worker = event.target as ServiceWorker | null;
    if (!worker || worker.state !== "installed" || disposed) return;
    if (navigator.serviceWorker.controller) notifyWaitingWorker();
    else callbacks.onOfflineReady();
  };

  const onUpdateFound = () => {
    registration.installing?.addEventListener("statechange", onInstallingStateChange);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      void registration.update().then(notifyWaitingWorker).catch(() => {
        // Network failure is expected while offline; the installed worker remains usable.
      });
    }
  };

  registration.addEventListener("updatefound", onUpdateFound);
  document.addEventListener("visibilitychange", onVisibilityChange);
  updateTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void registration.update().then(notifyWaitingWorker).catch(() => undefined);
    }
  }, 60 * 60 * 1000);

  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error("DayFlow's offline cache did not finish installing. Check available device storage and retry.")), 30_000);
    })
  ]);
  if (!disposed && !registration.waiting) callbacks.onOfflineReady();
  notifyWaitingWorker();

  void registration.update().then(notifyWaitingWorker).catch(() => undefined);

  return {
    async applyUpdate() {
      if (!registration.waiting) {
        await registration.update();
        notifyWaitingWorker();
      }
      const waiting = registration.waiting;
      if (!waiting) return;

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
          reject(new Error("The new app version did not take control. Your current workspace was not reloaded."));
        }, 20_000);

        const onControllerChange = () => {
          window.clearTimeout(timeout);
          resolve();
        };

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });
        waiting.postMessage({ type: "DAYFLOW_SKIP_WAITING" });
      });

      window.location.reload();
    },
    dispose() {
      disposed = true;
      window.clearInterval(updateTimer);
      registration.removeEventListener("updatefound", onUpdateFound);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
