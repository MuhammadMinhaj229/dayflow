import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env, isDemoMode } from "@/lib/env";

export interface SessionClaims { sub: string; workspaceId: string; email: string }
const encoder = new TextEncoder();

function secretKey() {
  if (!env.DAYFLOW_AUTH_SECRET) throw new Error("DAYFLOW_AUTH_SECRET is not configured.");
  return encoder.encode(env.DAYFLOW_AUTH_SECRET);
}

export async function createSession(email: string) {
  const workspaceId = "personal";
  const token = await new SignJWT({ workspaceId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${env.DAYFLOW_SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
  const store = await cookies();
  store.set(env.DAYFLOW_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.DAYFLOW_SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.set(env.DAYFLOW_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getSession(): Promise<SessionClaims | null> {
  if (isDemoMode) return { sub: "demo@dayflow.local", workspaceId: "demo", email: "demo@dayflow.local" };
  const store = await cookies();
  const token = store.get(env.DAYFLOW_SESSION_COOKIE)?.value;
  if (!token || !env.DAYFLOW_AUTH_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.workspaceId !== "string" || typeof payload.email !== "string") return null;
    return { sub: payload.sub, workspaceId: payload.workspaceId, email: payload.email };
  } catch {
    return null;
  }
}
