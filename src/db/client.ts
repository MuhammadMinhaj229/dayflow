import { PGliteWorker } from "@electric-sql/pglite/worker";

let databasePromise: Promise<PGliteWorker> | undefined;

export function getDatabase(): Promise<PGliteWorker> {
  if (!databasePromise) {
    const databaseWorker = new Worker(
      new URL("./pglite-worker.ts", import.meta.url),
      { type: "module", name: "dayflow-database" }
    );

    databasePromise = PGliteWorker.create(databaseWorker, {
      id: "dayflow-v3"
    }).catch((error: unknown) => {
      databaseWorker.terminate();
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}
