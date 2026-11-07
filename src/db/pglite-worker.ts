import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { applyMigrations } from "./migrations";

worker({
  async init() {
    const database = await PGlite.create("idb://dayflow-v3", {
      relaxedDurability: false
    });
    await applyMigrations(database);
    return database;
  }
});
