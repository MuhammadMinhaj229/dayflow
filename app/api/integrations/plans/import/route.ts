import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { planImportSchema, syncFinalizedPlan } from "@/lib/plan-sync";

export const runtime = "nodejs";

function validToken(candidate: string | null) {
  if (!candidate || !env.DAYFLOW_SYNC_TOKEN) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(env.DAYFLOW_SYNC_TOKEN).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!validToken(token)) return NextResponse.json({ error: "Invalid integration credentials." }, { status: 401 });
  const parsed = planImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan payload.", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await syncFinalizedPlan("personal", parsed.data);
    return NextResponse.json({ success: true, ...result, message: result.unchanged ? "This exact plan revision was already synchronised." : "Plan synchronised. Existing completion states are preserved." });
  } catch (error) {
    console.error("DayFlow integration import failed", error);
    const status = typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Plan synchronisation failed." }, { status });
  }
}
