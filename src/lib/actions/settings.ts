"use server";

import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { mcpConnections, pushSubscriptions, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { isMyTasksScope, MY_TASKS_SCOPE_COOKIE } from "@/lib/my-tasks";
import { clip, isUuid } from "@/lib/utils";
import { guard, revalidateAll } from "./helpers";
import { optStr, str, type ActionState } from "./types";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const name = clip(str(formData, "name"), 80);
    if (name.length < 2) return { fieldErrors: { name: t(dict.common.required) } };
    const db = await getDb();
    await db
      .update(users)
      .set({ name, jobTitle: optStr(formData, "jobTitle", 80), department: optStr(formData, "department", 80), phone: optStr(formData, "phone", 30), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    // Refresh the session cookie so the name it carries is current.
    await createSession({ ...user, name });
    revalidateAll();
    return { ok: true, message: t(dict.settings.profileSaved) };
  });
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const fieldErrors: Record<string, string> = {};
    if (next.length < 8) fieldErrors.next = t(dict.common.passwordMin);
    else if (next.length > 128) fieldErrors.next = t(dict.common.passwordMax);
    if (next !== confirm) fieldErrors.confirm = t(dict.auth.passwordsMismatch);
    if (Object.keys(fieldErrors).length) return { fieldErrors };

    const db = await getDb();
    const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    if (!row || !(await verifyPassword(current, row.passwordHash))) return { fieldErrors: { current: t(dict.settings.wrongPassword) } };
    // A new session version signs the account out everywhere; this device gets a fresh cookie right away.
    // The version check refuses the change if an administrator reset the password a moment earlier.
    const [updated] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(next), sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.sessionVersion, user.sessionVersion)))
      .returning({ sessionVersion: users.sessionVersion });
    if (!updated) return { error: t(dict.common.error) };
    // The signed-out devices also stop receiving notifications; this one saves itself again with the new session.
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
    await createSession({ ...user, sessionVersion: updated.sessionVersion });
    return { ok: true, message: t(dict.settings.passwordChanged) };
  });
}

/**
 * Remembers which tasks My tasks shows on this device (see lib/my-tasks).
 * Setting the cookie makes Next.js render the page again, sidebar count included.
 */
export async function setMyTasksScopeAction(scope: string) {
  await requireUser();
  if (!isMyTasksScope(scope)) return;
  const store = await cookies();
  store.set(MY_TASKS_SCOPE_COOKIE, scope, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

/** Disconnect an app (such as Claude) from the person's own account. It loses access with its next request. */
export async function disconnectMcpAction(connectionId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    if (!isUuid(connectionId)) return { error: t(dict.common.notFound) };
    const db = await getDb();
    await db.delete(mcpConnections).where(and(eq(mcpConnections.id, connectionId), eq(mcpConnections.userId, user.id)));
    revalidateAll();
    return { ok: true, message: t(dict.mcp.disconnected) };
  });
}
