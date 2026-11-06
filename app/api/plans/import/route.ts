import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { planImportSchema, syncFinalizedPlan } from "@/lib/plan-sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = planImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan payload.", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await syncFinalizedPlan(session.workspaceId, parsed.data);
    return NextResponse.json({ success: true, ...result, message: result.unchanged ? "This exact plan revision was already imported." : "Plan imported successfully." });
  } catch (error) {
    console.error("DayFlow manual import failed", error);
    const status = typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Plan import failed." }, { status });
  }
}
