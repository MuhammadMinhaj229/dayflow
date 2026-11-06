import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required. Load your environment before running db:indexes.");
  process.exit(1);
}
const dbName = process.env.MONGODB_DB || "dayflow";
const client = new MongoClient(uri, { appName: "dayflow-index-setup", serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const db = client.db(dbName);
  await Promise.all([
    db.collection("tasks").createIndex({ workspaceId: 1, planDate: 1, order: 1 }),
    db.collection("tasks").createIndex({ workspaceId: 1, source: 1, sourceTaskId: 1 }, { unique: true, sparse: true }),
    db.collection("plans").createIndex({ workspaceId: 1, externalKey: 1 }, { unique: true }),
    db.collection("plans").createIndex({ workspaceId: 1, planDate: 1 }),
    db.collection("login_attempts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("login_attempts").createIndex({ ipHash: 1 }, { unique: true }),
  ]);
  console.log(`DayFlow indexes verified in database: ${dbName}`);
} catch (error) {
  console.error("Unable to create DayFlow indexes:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
