import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  scheduledStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  scheduledEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  project: z.string().trim().max(80).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const date = request.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  try {
    const db = await getDb();
    const docs = await db.collection("tasks").find({ workspaceId: session.workspaceId, planDate: date, status: { $ne: "cancelled" } }).sort({ order: 1, scheduledStart: 1, createdAt: 1 }).toArray();
    return NextResponse.json({ tasks: docs.map((doc) => ({
      id: String(doc._id), title: doc.title, description: doc.description ?? "", status: doc.status,
      priority: doc.priority, planDate: doc.planDate, scheduledStart: doc.scheduledStart,
      scheduledEnd: doc.scheduledEnd, project: doc.project ?? "General", labels: doc.labels ?? [],
      order: doc.order ?? 0, completedAt: doc.completedAt?.toISOString?.() ?? null, source: doc.source ?? "web",
    })) });
  } catch (error) {
    console.error("DayFlow tasks GET failed", error);
    return NextResponse.json({ error: "Task storage is unavailable. Check MongoDB configuration." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task details.", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const db = await getDb();
    const collection = db.collection("tasks");
    const order = await collection.countDocuments({ workspaceId: session.workspaceId, planDate: parsed.data.planDate });
    const task = {
      _id: randomUUID(), workspaceId: session.workspaceId, ...parsed.data,
      status: "next", labels: [], order, source: "web", createdAt: new Date(), updatedAt: new Date(),
    };
    await collection.insertOne(task);
    return NextResponse.json({ task: { ...task, id: task._id } }, { status: 201 });
  } catch (error) {
    console.error("DayFlow task POST failed", error);
    return NextResponse.json({ error: "Unable to save task. Check MongoDB configuration." }, { status: 503 });
  }
}
