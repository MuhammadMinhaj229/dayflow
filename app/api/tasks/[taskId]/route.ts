import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["next", "in_progress", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  scheduledEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { taskId } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return NextResponse.json({ error: "Invalid task update." }, { status: 400 });
  const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "done") update.completedAt = new Date();
  if (parsed.data.status && parsed.data.status !== "done") update.completedAt = null;
  try {
    const db = await getDb();
    const result = await db.collection("tasks").updateOne({ _id: taskId, workspaceId: session.workspaceId }, { $set: update });
    if (!result.matchedCount) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DayFlow task PATCH failed", error);
    return NextResponse.json({ error: "Unable to update task." }, { status: 503 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { taskId } = await context.params;
  try {
    const db = await getDb();
    const result = await db.collection("tasks").deleteOne({ _id: taskId, workspaceId: session.workspaceId });
    if (!result.deletedCount) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DayFlow task DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete task." }, { status: 503 });
  }
}
