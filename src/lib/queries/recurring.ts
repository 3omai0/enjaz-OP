import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { atomic, getDb } from "@/db";
import { activities, notifications, projects, recurringTasks, taskAssignees, taskLabels, tasks, users, type RecurringTask, type SafeUser } from "@/db/schema";
import { pushNotifications } from "@/lib/push";
import { scopeProjectIds } from "@/lib/queries/access";
import { FIRE_GRACE_MS, nextOccurrence } from "@/lib/recurrence";
import { taskLink } from "@/lib/routes";

type Actor = Pick<SafeUser, "id" | "role">;

export type RecurringCard = RecurringTask & {
  project: { id: string; name: string; key: string; color: string; personalOwnerId: string | null };
  assignees: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
};

/**
 * Schedules the user may see: those of the team projects they work in plus
 * those of their own personal space. Soonest first.
 */
export async function listRecurringForUser(user: Actor): Promise<RecurringCard[]> {
  const db = await getDb();
  const rows = await db.query.recurringTasks.findMany({
    where: inArray(recurringTasks.projectId, visibleProjectIds(db, user)),
    orderBy: [desc(recurringTasks.enabled), asc(recurringTasks.nextAt)],
    with: { project: { columns: { id: true, name: true, key: true, color: true, personalOwnerId: true } } },
  });
  return decorate(rows);
}

/** Schedules of one project (the caller has checked access). */
export async function listRecurringForProject(projectId: string): Promise<RecurringCard[]> {
  const db = await getDb();
  const rows = await db.query.recurringTasks.findMany({
    where: eq(recurringTasks.projectId, projectId),
    orderBy: [desc(recurringTasks.enabled), asc(recurringTasks.nextAt)],
    with: { project: { columns: { id: true, name: true, key: true, color: true, personalOwnerId: true } } },
  });
  return decorate(rows);
}

function visibleProjectIds(db: Awaited<ReturnType<typeof getDb>>, user: Actor) {
  // Team scope (never personal spaces) plus the user's own personal space.
  return db
    .select({ id: projects.id })
    .from(projects)
    .where(sql`${projects.id} in ${scopeProjectIds(db, user)} or ${projects.personalOwnerId} = ${user.id}`);
}

async function decorate(rows: Array<RecurringTask & { project: RecurringCard["project"] }>): Promise<RecurringCard[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const userIds = [...new Set(rows.flatMap((r) => r.assigneeIds))];
  const labelIds = [...new Set(rows.flatMap((r) => r.labelIds))];
  const [people, labelRows] = await Promise.all([
    userIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
    labelIds.length ? db.query.labels.findMany({ where: (l, { inArray: inArr }) => inArr(l.id, labelIds), columns: { id: true, name: true, color: true } }) : Promise.resolve([]),
  ]);
  const byUser = new Map(people.map((p) => [p.id, p]));
  const byLabel = new Map(labelRows.map((l) => [l.id, l]));
  return rows.map((r) => ({
    ...r,
    assignees: r.assigneeIds.map((id) => byUser.get(id)).filter((p): p is { id: string; name: string } => !!p),
    labels: r.labelIds.map((id) => byLabel.get(id)).filter((l): l is { id: string; name: string; color: string } => !!l),
  }));
}

export type FireResult = { created: number; skipped: number; schedules: number };

/**
 * Create the task of every enabled schedule whose time has come, notify the
 * people it is for (in the app and on their devices), and move each schedule
 * to its next time. A schedule more than a day overdue (the cron was down)
 * is moved forward without creating a task, so an outage never floods a
 * board. Safe to call often and from several places: each schedule is
 * advanced with a guard on its previous `nextAt`, so a second caller that
 * races on the same row changes nothing and creates nothing.
 */
export async function fireDueRecurringTasks(now = new Date()): Promise<FireResult> {
  const db = await getDb();
  const due = await db.query.recurringTasks.findMany({
    where: and(eq(recurringTasks.enabled, true), lte(recurringTasks.nextAt, now)),
    with: { project: { columns: { id: true, name: true, key: true, status: true, personalOwnerId: true } } },
    orderBy: [asc(recurringTasks.nextAt)],
    limit: 200,
  });
  let created = 0;
  let skipped = 0;
  for (const schedule of due) {
    const rule = { recurrence: schedule.recurrence, minuteOfDay: schedule.minuteOfDay, weekdays: schedule.weekdays, dayOfMonth: schedule.dayOfMonth, month: schedule.month };
    const nextAt = nextOccurrence(rule, now);
    const tooLate = now.getTime() - schedule.nextAt.getTime() > FIRE_GRACE_MS;
    const archived = schedule.project.status === "archived";
    if (tooLate || archived) {
      // Catch up quietly: nothing is created for a time that has long passed or for an archived project.
      await db
        .update(recurringTasks)
        .set({ nextAt, updatedAt: now })
        .where(and(eq(recurringTasks.id, schedule.id), eq(recurringTasks.nextAt, schedule.nextAt)));
      skipped++;
      continue;
    }

    // Who is on the task: the people listed who are still active (a personal task is always its owner's).
    const wanted = schedule.project.personalOwnerId ? [schedule.project.personalOwnerId] : schedule.assigneeIds;
    const active = wanted.length ? (await db.select({ id: users.id }).from(users).where(and(inArray(users.id, wanted), eq(users.isActive, true)))).map((u) => u.id) : [];
    const audience = active.length > 0 ? active : await generalAudience(schedule.project.id, schedule.project.personalOwnerId);
    const taskId = crypto.randomUUID();
    const notes = audience.map((userId) => ({ id: crypto.randomUUID(), userId }));
    const numberSql = sql`(select ${projects.taskCounter} from ${projects} where ${projects.id} = ${schedule.project.id})`;
    const keySql = schedule.project.personalOwnerId ? sql`'#' || ${numberSql}::text` : sql`${schedule.project.key}::text || '-' || ${numberSql}::text`;
    const payload = sql`jsonb_build_object('taskKey', ${keySql}, 'taskTitle', ${schedule.title}::text, 'projectName', ${schedule.project.name}::text, 'recurring', true, 'personal', ${!!schedule.project.personalOwnerId}::boolean)`;
    const href = taskLink({ id: taskId, projectId: schedule.project.id, project: { personalOwnerId: schedule.project.personalOwnerId } });
    // The guard on nextAt: if someone else fired this schedule first, the update matches nothing and we stop here.
    const [claimed] = await db
      .update(recurringTasks)
      .set({ nextAt, lastFiredAt: now, fireCount: sql`${recurringTasks.fireCount} + 1`, updatedAt: now })
      .where(and(eq(recurringTasks.id, schedule.id), eq(recurringTasks.nextAt, schedule.nextAt)))
      .returning({ id: recurringTasks.id });
    if (!claimed) {
      skipped++;
      continue;
    }
    const at = Date.now();
    await atomic((q) => [
      q.update(projects).set({ taskCounter: sql`${projects.taskCounter} + 1`, updatedAt: now }).where(eq(projects.id, schedule.project.id)),
      q.insert(tasks).values({
        id: taskId,
        projectId: schedule.project.id,
        number: numberSql,
        title: schedule.title,
        description: schedule.description,
        status: "todo",
        priority: schedule.priority,
        creatorId: schedule.createdBy,
        dueDate: null,
        position: sql`(select coalesce(max(${tasks.position}), 0) + 1 from ${tasks} where ${tasks.projectId} = ${schedule.project.id} and ${tasks.status} = 'todo')`,
      }),
      ...(active.length > 0 ? [q.insert(taskAssignees).values(active.map((userId, i) => ({ taskId, userId, createdAt: new Date(at + i) })))] : []),
      ...(schedule.labelIds.length > 0 ? [q.insert(taskLabels).values(schedule.labelIds.map((labelId) => ({ taskId, labelId }))).onConflictDoNothing()] : []),
      q.insert(activities).values({ projectId: schedule.project.id, taskId, actorId: schedule.createdBy, type: "task_created", payload: sql`jsonb_build_object('taskKey', ${keySql}, 'taskTitle', ${schedule.title}::text, 'general', ${active.length === 0}::boolean, 'recurring', true)` }),
      ...(notes.length > 0 ? [q.insert(notifications).values(notes.map((n) => ({ id: n.id, userId: n.userId, actorId: null, type: "recurring_task", payload, href })))] : []),
    ]);
    if (notes.length > 0) pushNotifications(notes.map((n) => n.id));
    created++;
  }
  return { created, skipped, schedules: due.length };
}

/** Everyone told about a general task of the project (its active members plus administrators and managers); a personal space has only its owner. */
async function generalAudience(projectId: string, personalOwnerId: string | null): Promise<string[]> {
  const db = await getDb();
  if (personalOwnerId) return [personalOwnerId];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), sql`(${users.role} in ('admin', 'manager') or exists (select 1 from project_members pm where pm.project_id = ${projectId} and pm.user_id = ${users.id}))`));
  return rows.map((r) => r.id);
}
