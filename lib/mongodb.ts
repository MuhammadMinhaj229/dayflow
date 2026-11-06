import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var dayflowMongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | undefined;

function getClientPromise() {
  if (!env.MONGODB_URI) {
    throw new Error("MongoDB is not configured. Set MONGODB_URI in the deployment environment.");
  }
  if (!clientPromise) {
    clientPromise = global.dayflowMongoClientPromise ?? new MongoClient(env.MONGODB_URI, {
      appName: "dayflow",
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 10_000,
    }).connect();
    global.dayflowMongoClientPromise = clientPromise;
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(env.MONGODB_DB);
}
