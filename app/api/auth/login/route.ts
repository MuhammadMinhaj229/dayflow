import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { createSession } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });

export async function POST(request: NextRequest) {
  if (!env.MONGODB_URI || !env.DAYFLOW_ADMIN_EMAIL || !env.DAYFLOW_ADMIN_PASSWORD_HASH || !env.DAYFLOW_AUTH_SECRET) {
    return NextResponse.json({ error: "Authentication and database are not configured yet." }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });

  const forwarded = request.headers.get("x-real-ip")?.trim() ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(forwarded).digest("hex");
  const db = await getDb();
  const attempts = db.collection("login_attempts");
  const now = new Date();
  const previous = await attempts.findOne({ ipHash });
  if (previous && previous.expiresAt instanceof Date && previous.expiresAt > now && previous.count >= 8) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  if (!previous || !(previous.expiresAt instanceof Date) || previous.expiresAt <= now) {
    await attempts.updateOne({ ipHash }, { $set: { count: 1, expiresAt: new Date(now.getTime() + 15 * 60_000) } }, { upsert: true });
  } else {
    await attempts.updateOne({ ipHash }, { $inc: { count: 1 } });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const expected = env.DAYFLOW_ADMIN_EMAIL.toLowerCase();
  const passwordOkay = await bcrypt.compare(parsed.data.password, env.DAYFLOW_ADMIN_PASSWORD_HASH);
  if (email !== expected || !passwordOkay) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  await attempts.deleteOne({ ipHash });
  await createSession(email);
  return NextResponse.json({ success: true });
}
