import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "./migrations";

let databasePromise: Promise<PGlite> | undefined;

export function getDatabase(): Promise<PGlite> {
  if (!databasePromise) {
    databasePromise = PGlite.create("idb://dayflow-v3", {
      relaxedDurability: false
    })
      .then(async (database) => {
        await applyMigrations(database);
        return database;
      })
      .catch((error: unknown) => {
        databasePromise = undefined;
        throw error;
      });
  }
  return databasePromise;
}
