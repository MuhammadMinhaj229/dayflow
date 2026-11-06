import { NextResponse } from "next/server";
import { env, isDemoMode } from "@/lib/env";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export async function GET() {
  if (isDemoMode) return NextResponse.json({ status: "demo", database: "not-connected" });
  if (!env.MONGODB_URI) return NextResponse.json({ status: "degraded", database: "not-configured" }, { status: 503 });
  try {
    await (await getDb()).command({ ping: 1 });
    return NextResponse.json({ status: "ok", database: "connected" });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
