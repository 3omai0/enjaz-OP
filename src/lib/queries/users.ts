import { and, asc, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { projectMembers, projects, pushSubscriptions, taskAssignees, tasks, users, type SafeUser } from "@/db/schema";
import { isUuid } from "@/lib/utils";

export const safeColumns = { passwordHash: false } as const;

export async function countUsers() {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

export async function findUserByEmail(email: string) {
  const db = await getDb();
  return db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email.trim().toLowerCase()}` });
}

/** Cached per request so a page title and the page share one lookup. */
export const getUserById = cache(async (id: string): Promise<SafeUser | undefined> => {
  if (!isUuid(id)) return undefined;
  const db = await getDb();
  return db.query.users.findFirst({ where: eq(users.id, id), columns: safeColumns });
});

/**
 * Everyone in the workspace, active first. Workload numbers (open tasks and
 * project count) and how many devices get notifications are only loaded for
 * staff; they would reveal work that employees are not allowed to see.
 */
export async function listTeam({ withWorkload }: { withWorkload: boolean }) {
  const db = await getDb();
  const [rows, openCounts, projectCounts, deviceCounts] = await Promise.all([
    db.query.users.findMany({ columns: safeColumns, orderBy: [desc(users.isActive), asc(users.name)] }),
    withWorkload
      ? db
          .select({ userId: taskAssignees.userId, n: count() })
          .from(taskAssignees)
          .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          // Personal tasks are nobody's workload but their owner's business.
          .where(and(ne(tasks.status, "done"), ne(projects.status, "archived"), isNull(projects.personalOwnerId)))
          .groupBy(taskAssignees.userId)
      : Promise.resolve([]),
    withWorkload
      ? db
          .select({ userId: projectMembers.userId, n: count() })
          .from(projectMembers)
          .innerJoin(projects, eq(projects.id, projectMembers.projectId))
          .where(and(ne(projects.status, "archived"), isNull(projects.personalOwnerId)))
          .groupBy(projectMembers.userId)
      : Promise.resolve([]),
    withWorkload ? db.select({ userId: pushSubscriptions.userId, n: count() }).from(pushSubscriptions).groupBy(pushSubscriptions.userId) : Promise.resolve([]),
  ]);
  const openMap = new Map(openCounts.map((r) => [r.userId, r.n]));
  const projMap = new Map(projectCounts.map((r) => [r.userId, r.n]));
  const deviceMap = new Map(deviceCounts.map((r) => [r.userId, r.n]));
  return rows.map((u) => ({
    ...u,
    openTasks: withWorkload ? (openMap.get(u.id) ?? 0) : null,
    projectCount: withWorkload ? (projMap.get(u.id) ?? 0) : null,
    pushDevices: withWorkload ? (deviceMap.get(u.id) ?? 0) : null,
  }));
}

/** How many devices (phones, computers) receive this person's notifications. */
export async function countPushDevices(userId: string) {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return row?.n ?? 0;
}

export async function countAdmins(excludeId?: string) {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true), ...(excludeId ? [ne(users.id, excludeId)] : [])));
  return row?.n ?? 0;
}
