"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { atomic, getDb } from "@/db";
import { projectMembers, projects, pushSubscriptions, users, USER_ROLES, type UserRole } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { fill } from "@/lib/i18n";
import { createSession, requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canManageTeam } from "@/lib/permissions";
import { countAdmins, findUserByEmail } from "@/lib/queries/users";
import { clip, isUuid } from "@/lib/utils";
import { guard, isUniqueViolation, revalidateAll } from "./helpers";
import { optStr, str, type ActionState } from "./types";

const isRole = (v: string): v is UserRole => (USER_ROLES as readonly string[]).includes(v);

export async function createEmployeeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t, lang } = await getT();
    if (!canManageTeam(user)) return { error: t(dict.common.forbidden) };

    const name = clip(str(formData, "name"), 80);
    const email = str(formData, "email").toLowerCase();
    const password = String(formData.get("password") ?? "");
    const role = str(formData, "role") || "member";
    const fieldErrors: Record<string, string> = {};
    if (name.length < 2) fieldErrors.name = t(dict.common.required);
    if (!z.email().safeParse(email).success) fieldErrors.email = t(dict.common.invalidEmail);
    if (password.length < 8) fieldErrors.password = t(dict.common.passwordMin);
    else if (password.length > 128) fieldErrors.password = t(dict.common.passwordMax);
    if (!isRole(role)) fieldErrors.role = t(dict.common.required);
    if (Object.keys(fieldErrors).length) return { fieldErrors };
    if (await findUserByEmail(email)) return { fieldErrors: { email: t(dict.team.emailExists) } };

    const db = await getDb();
    try {
      const [created] = await db
        .insert(users)
        .values({
          name,
          email,
          passwordHash: await hashPassword(password),
          role: role as UserRole,
          jobTitle: optStr(formData, "jobTitle", 80),
          department: optStr(formData, "department", 80),
          phone: optStr(formData, "phone", 30),
          locale: lang,
        })
        .returning({ id: users.id });
      revalidateAll();
      return { ok: true, id: created.id, message: t(dict.team.created) };
    } catch (err) {
      if (isUniqueViolation(err)) return { fieldErrors: { email: t(dict.team.emailExists) } };
      throw err;
    }
  });
}

export async function updateEmployeeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    if (!canManageTeam(user)) return { error: t(dict.common.forbidden) };
    const id = str(formData, "userId");
    if (!isUuid(id)) return { error: t(dict.common.notFound) };
    const db = await getDb();
    const target = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) return { error: t(dict.common.notFound) };

    const name = clip(str(formData, "name"), 80);
    const email = str(formData, "email").toLowerCase();
    const role = str(formData, "role") || target.role;
    const fieldErrors: Record<string, string> = {};
    if (name.length < 2) fieldErrors.name = t(dict.common.required);
    if (!z.email().safeParse(email).success) fieldErrors.email = t(dict.common.invalidEmail);
    if (!isRole(role)) fieldErrors.role = t(dict.common.required);
    if (Object.keys(fieldErrors).length) return { fieldErrors };
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== id) return { fieldErrors: { email: t(dict.team.emailExists) } };
    if (target.role === "admin" && role !== "admin" && (await countAdmins(id)) === 0) return { fieldErrors: { role: t(dict.team.lastAdmin) } };

    try {
      await db
        .update(users)
        .set({ name, email, role: role as UserRole, jobTitle: optStr(formData, "jobTitle", 80), department: optStr(formData, "department", 80), phone: optStr(formData, "phone", 30), updatedAt: new Date() })
        .where(eq(users.id, id));
    } catch (err) {
      if (isUniqueViolation(err)) return { fieldErrors: { email: t(dict.team.emailExists) } };
      throw err;
    }
    revalidateAll();
    return { ok: true, message: t(dict.team.updated) };
  });
}

export async function setEmployeeActiveAction(userId: string, active: boolean): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    if (!canManageTeam(user)) return { error: t(dict.common.forbidden) };
    if (!isUuid(userId)) return { error: t(dict.common.notFound) };
    if (userId === user.id && !active) return { error: t(dict.team.cannotDeactivateSelf) };
    const db = await getDb();
    const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, role: true } });
    if (!target) return { error: t(dict.common.notFound) };
    if (!active && target.role === "admin" && (await countAdmins(userId)) === 0) return { error: t(dict.team.lastAdmin) };
    // Deactivating also ends every open session of the account and stops its device notifications.
    await atomic((q) => [
      q
        .update(users)
        .set({ isActive: !!active, ...(active ? {} : { sessionVersion: sql`${users.sessionVersion} + 1` }), updatedAt: new Date() })
        .where(eq(users.id, userId)),
      ...(active ? [] : [q.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))]),
    ]);
    revalidateAll();
    return { ok: true, message: t(dict.team.updated) };
  });
}

/**
 * Deletes an account for good (administrators only; never your own, never
 * the last administrator). Their personal space goes with them, unseen. The
 * team work stays: projects the person owns are handed to the administrator
 * deleting them (who joins each as a lead), tasks they
 * created and their comments remain as from a former member (the database
 * clears the link), and tasks assigned only to them become general. Their
 * memberships, notifications and devices go with the account, their sessions
 * stop working, and the email can be used again.
 */
export async function deleteEmployeeAction(userId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    if (!canManageTeam(user)) return { error: t(dict.common.forbidden) };
    if (!isUuid(userId)) return { error: t(dict.common.notFound) };
    if (userId === user.id) return { error: t(dict.team.cannotDeleteSelf) };
    const db = await getDb();
    const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, name: true, role: true } });
    if (!target) return { error: t(dict.common.notFound) };
    if (target.role === "admin" && (await countAdmins(userId)) === 0) return { error: t(dict.team.lastAdmin) };
    const teamOwned = and(eq(projects.ownerId, userId), isNull(projects.personalOwnerId));
    const owned = await db.select({ id: projects.id }).from(projects).where(teamOwned);
    await atomic((q) => [
      q.delete(projects).where(eq(projects.personalOwnerId, userId)),
      ...(owned.length > 0 ? [q.insert(projectMembers).values(owned.map((p) => ({ projectId: p.id, userId: user.id, role: "lead" }))).onConflictDoNothing()] : []),
      q.update(projects).set({ ownerId: user.id, updatedAt: new Date() }).where(teamOwned),
      q.delete(users).where(eq(users.id, userId)),
    ]);
    revalidateAll();
    return { ok: true, message: fill(t(dict.team.deleted), { name: target.name }) };
  });
}

export async function resetEmployeePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    if (!canManageTeam(user)) return { error: t(dict.common.forbidden) };
    const id = str(formData, "userId");
    if (!isUuid(id)) return { error: t(dict.common.notFound) };
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) return { fieldErrors: { password: t(dict.common.passwordMin) } };
    if (password.length > 128) return { fieldErrors: { password: t(dict.common.passwordMax) } };
    const db = await getDb();
    // The employee is signed out on every device and signs in again with the new password.
    const [updated] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ sessionVersion: users.sessionVersion });
    if (!updated) return { error: t(dict.common.notFound) };
    // A reset often means a lost phone: its notifications stop until the employee signs in on it again.
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
    if (id === user.id) await createSession({ ...user, sessionVersion: updated.sessionVersion });
    return { ok: true, message: t(dict.team.passwordReset) };
  });
}
