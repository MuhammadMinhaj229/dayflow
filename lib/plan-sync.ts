import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";

export const planImportSchema = z.object({
  externalKey: z.string().min(1).max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(160).default("Daily plan"),
  timezone: z.string().default("Asia/Kolkata"),
  tasks: z.array(z.object({
    key: z.string().min(1).max(160).optional(),
    title: z.string().trim().min(1).max(240),
    description: z.string().max(2000).optional(),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    project: z.string().trim().max(80).optional(),
    labels: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
    order: z.number().int().min(0).max(1000).optional(),
  })).max(100),
});
export type PlanImport = z.infer<typeof planImportSchema>;

function stableTaskId(externalKey: string, key: string) {
  return createHash("sha256").update(`${externalKey}|${key}`).digest("hex").slice(0, 48);
}

export async function syncFinalizedPlan(workspaceId: string, data: PlanImport) {
  const db = await getDb();
  const now = new Date();
  const plans = db.collection("plans");
  const payloadHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  let plan = await plans.findOne({ workspaceId, externalKey: data.externalKey });

  if (plan?.payloadHash === payloadHash) {
    return { planId: plan._id, revision: plan.revision ?? 1, importedTasks: data.tasks.length, unchanged: true };
  }

  if (plan) {
    const updated = await plans.updateOne(
      { _id: plan._id, revision: plan.revision ?? 1 },
      { $set: { title: data.title, planDate: data.date, timezone: data.timezone, status: "finalized", payloadHash, updatedAt: now }, $inc: { revision: 1 } },
    );
    if (!updated.matchedCount) throw Object.assign(new Error("Plan changed during synchronisation. Retry with the latest revision."), { statusCode: 409 });
    plan = await plans.findOne({ _id: plan._id });
  } else {
    const newPlan = { _id: randomUUID(), workspaceId, externalKey: data.externalKey, title: data.title, planDate: data.date, timezone: data.timezone, status: "finalized", payloadHash, revision: 1, createdAt: now, updatedAt: now };
    await plans.insertOne(newPlan);
    plan = newPlan;
  }
  if (!plan) throw new Error("Plan write could not be verified.");

  const operations = data.tasks.map((task, index) => {
    const stableKey = task.key ?? `${task.title}|${task.start ?? ""}|${index}`;
    const sourceTaskId = stableTaskId(data.externalKey, stableKey);
    return {
      updateOne: {
        filter: { workspaceId, source: "chat", sourceTaskId },
        update: {
          $set: {
            planId: plan!._id, planDate: data.date, title: task.title, description: task.description ?? "",
            priority: task.priority, scheduledStart: task.start ?? null, scheduledEnd: task.end ?? null,
            project: task.project ?? "General", labels: task.labels, order: task.order ?? index, updatedAt: now,
          },
          $setOnInsert: { _id: randomUUID(), workspaceId, source: "chat", sourceTaskId, status: "next", createdAt: now },
        },
        upsert: true,
      },
    };
  });
  if (operations.length) await db.collection("tasks").bulkWrite(operations, { ordered: false });

  const activeKeys = data.tasks.map((task, index) => stableTaskId(data.externalKey, task.key ?? `${task.title}|${task.start ?? ""}|${index}`));
  const obsoleteFilter: Record<string, unknown> = { workspaceId, planId: plan._id, source: "chat", status: { $ne: "done" } };
  if (activeKeys.length) obsoleteFilter.sourceTaskId = { $nin: activeKeys };
  await db.collection("tasks").updateMany(obsoleteFilter, { $set: { status: "cancelled", updatedAt: now } });

  return { planId: plan._id, revision: plan.revision ?? 1, importedTasks: operations.length, unchanged: false };
}
