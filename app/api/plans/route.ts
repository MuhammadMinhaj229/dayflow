import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const date = request.nextUrl.searchParams.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  try {
    const db = await getDb();
    const query: Record<string, unknown> = { workspaceId: session.workspaceId };
    if (date) query.planDate = date;
    const plans = await db.collection("plans").find(query).sort({ planDate: -1, updatedAt: -1 }).limit(90).toArray();
    return NextResponse.json({ plans: plans.map(p => ({ id: p._id, title: p.title, planDate: p.planDate, status: p.status, revision: p.revision, updatedAt: p.updatedAt })) });
  } catch (error) {
    console.error("DayFlow plans GET failed", error);
    return NextResponse.json({ error: "Unable to load plans." }, { status: 503 });
  }
}
