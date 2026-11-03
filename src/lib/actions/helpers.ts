import { inArray, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { afterCommit, getDb, type AtomicQuery, type Db } from "@/db";
import { activities, notifications, projectMembers, users, type ActivityPayload, type Project } from "@/db/schema";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { isStaff } from "@/lib/permissions";
import { pushNotifications } from "@/lib/push";
import type { ActionState } from "./types";

/**
 * Runs an action body and turns unexpected failures (a dropped connection, a
 * constraint the checks did not foresee) into a friendly message instead of a
 * crashed page. Redirects and not-found signals from Next.js pass through.
 */
export async function guard(run: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await run();
  } catch (err) {
    unstable_rethrow(err);
    console.error(err);
    const { t } = await getT();
    return { error: t(dict.common.error) };
  }
}

/** Postgres unique violation (for example a project key or email taken a moment ago). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Drop the empty slots of a conditional batch. */
export const compact = <T>(items: Array<T | null | undefined | false>): T[] => items.filter(Boolean) as T[];

type Payload = ActivityPayload | SQL;

export type ActivityInput = { projectId: string; taskId?: string | null; actorId: string; type: string; payload?: Payload };

/** Activity log entry, built as part of an atomic batch. */
export function activityInsert(q: Db, input: ActivityInput): AtomicQuery {
  return q.insert(activities).values({
    projectId: input.projectId,
    taskId: input.taskId ?? null,
    actorId: input.actorId,
    type: input.type,
    payload: input.payload ?? {},
  });
}

export type NotificationInput = { userId: string | null | undefined; actorId: string; type: string; payload?: Payload; href?: string | null };

/**
 * One insert for any number of in-app notifications. Nobody is notified about
 * their own action, and each person gets one notification per change: the
 * first entry for them wins, so list the most specific ones first. Once the
 * change commits, the same notifications go to the recipients' devices.
 * Returns null when no recipient is left, so it can go straight into compact([...]).
 */
export function notificationsInsert(q: Db, list: NotificationInput[]): AtomicQuery | null {
  const seen = new Set<string>();
  const rows = list.filter((n) => {
    if (!n.userId || n.userId === n.actorId || seen.has(n.userId)) return false;
    seen.add(n.userId);
    return true;
  });
  if (rows.length === 0) return null;
  const values = rows.map((n) => ({ id: crypto.randomUUID(), userId: n.userId as string, actorId: n.actorId, type: n.type, payload: n.payload ?? {}, href: n.href ?? null }));
  return afterCommit(q.insert(notifications).values(values), () => pushNotifications(values.map((v) => v.id)));
}

/**
 * Of the given people, those who can see a task right now: active accounts
 * that are staff, or project members allowed to see it under the project's
 * visibility rule (`assigneeIds` are the task's assignees after the change).
 * `joining` lists people being added to the project in the same change.
 * Used so notifications never reach someone who lost access.
 */
export async function whoCanSee(project: Pick<Project, "id" | "taskVisibility">, assigneeIds: readonly string[], userIds: Array<string | null | undefined>, joining: string[] = []): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Set();
  const db = await getDb();
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      isActive: users.isActive,
      member: sql<boolean>`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${project.id} and ${projectMembers.userId} = ${users.id})`,
    })
    .from(users)
    .where(inArray(users.id, ids));
  const visible = new Set<string>();
  for (const r of rows) {
    if (!r.isActive) continue;
    const member = r.member || joining.includes(r.id);
    if (isStaff(r.role) || (member && (project.taskVisibility === "all" || assigneeIds.length === 0 || assigneeIds.includes(r.id)))) visible.add(r.id);
  }
  return visible;
}

/**
 * Refresh every page after a change. Called inside a server action, Next.js
 * sends the re-rendered current page back in the same response, so client
 * components must not call router.refresh() on top of it.
 */
export function revalidateAll() {
  revalidatePath("/", "layout");
}
