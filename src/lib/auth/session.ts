import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { users, type SafeUser, type UserRole } from "@/db/schema";
import { actingUser } from "./acting";
import { SESSION_COOKIE, SESSION_DAYS, signSessionToken, verifySessionToken, type SessionPayload } from "./jwt";

export async function createSession(user: Pick<SafeUser, "id" | "role" | "name" | "email" | "sessionVersion">) {
  const token = await signSessionToken({ sub: user.id, role: user.role, name: user.name, email: user.email, sv: user.sessionVersion });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Decoded session cookie (no database round trip). */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
});

/**
 * Fresh user row for the session, or null when logged out, deactivated, or
 * signed out everywhere (password changed or reset since the cookie was issued).
 */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  // A call from Claude: the access token was checked and the person loaded already (see lib/auth/acting.ts).
  const acting = actingUser();
  if (acting) return acting;
  const session = await getSession();
  if (!session) return null;
  const db = await getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.sub),
    columns: { passwordHash: false },
  });
  if (!user || !user.isActive || user.sessionVersion !== session.sv) return null;
  return user;
});

export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    // A signed cookie whose user is gone, deactivated or signed out must be
    // cleared first, otherwise the proxy would keep bouncing /login back to /dashboard.
    const session = await getSession();
    redirect(session ? "/api/auth/clear" : "/login");
  }
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SafeUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
