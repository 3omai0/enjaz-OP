import { and, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { getDb, type Db } from "@/db";
import { activities, projectMembers, projects, tasks, type Project, type SafeUser } from "@/db/schema";
import { canSeeAllTasks, canSeeTask, isStaff } from "@/lib/permissions";
import { isUuid } from "@/lib/utils";

type Actor = Pick<SafeUser, "id" | "role">;

/*
 * The assignee checks below name task_assignees through their own alias (ta)
 * on purpose: in relational queries (db.query.tasks) the ORM rewrites every
 * column object in a filter to the tasks alias, which would break a column
 * object from another table. Only tasks.id is passed as a column.
 */

/** SQL: the task is assigned to this person (one of possibly several assignees). */
export const assignedTo = (userId: string): SQL => sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.user_id = ${userId})`;

/** SQL: the task has no assignee, so it is a general task for every member of the project. */
export const generalTask = (): SQL => sql`not exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id})`;

/** SQL: ids of the task's assignees as a JSON array, in the order they were added (empty for a general task). */
export const assigneeIdsJson = () =>
  sql<string[]>`coalesce((select json_agg(ta.user_id order by ta.created_at) from task_assignees ta where ta.task_id = ${tasks.id}), '[]'::json)`;

/** A JSON id list from the database as plain strings, whichever way the driver hands it over. */
export function idList(raw: unknown): string[] {
  const list = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  return Array.isArray(list) ? list.map(String) : [];
}

/**
 * Whether the user may open this project at all before role rules apply: a
 * personal space opens for its owner only, never for anyone else, whatever
 * their role. Null means the usual rules decide (it is a team project).
 */
const personalAccess = (user: Actor, project: Pick<Project, "personalOwnerId">): boolean | null => (project.personalOwnerId ? project.personalOwnerId === user.id : null);

/**
 * Load a project the user may open: staff can open any team project, members
 * only the projects they belong to, and a personal space only its owner.
 * Returns null when it does not exist, is off limits, or the id is malformed.
 * One round trip.
 */
export async function getAccessibleProject(user: Actor, projectId: string): Promise<Project | null> {
  if (!isUuid(projectId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      project: projects,
      member: sql<boolean>`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.userId} = ${user.id})`,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!row) return null;
  const personal = personalAccess(user, row.project);
  if (personal !== null) return personal ? row.project : null;
  return isStaff(user.role) || row.member ? row.project : null;
}

/** Per-request cached variant so a layout and its pages share one lookup. */
export const loadProject = cache(async (user: Actor, projectId: string) => getAccessibleProject(user, projectId));

/**
 * A task together with its project and assignees, only when the user may see
 * it: the project is open to them and the task passes the visibility rule.
 * Every task action and the task page start here. One round trip.
 */
export async function loadVisibleTask(user: Actor, taskId: string) {
  if (!isUuid(taskId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      task: tasks,
      project: projects,
      assigneeIds: assigneeIdsJson(),
      member: sql<boolean>`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${tasks.projectId} and ${projectMembers.userId} = ${user.id})`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.id, taskId));
  if (!row) return null;
  const assigneeIds = idList(row.assigneeIds);
  const personal = personalAccess(user, row.project);
  if (personal === false) return null;
  if (personal === null && !isStaff(user.role) && (!row.member || !canSeeTask(user, { assigneeIds }, row.project))) return null;
  return { ...row.task, assigneeIds, project: row.project };
}

export type VisibleTask = NonNullable<Awaited<ReturnType<typeof loadVisibleTask>>>;

/** SQL filter that hides other people's tasks from members when the project says so. */
export function taskVisibilityFilter(user: Actor, project: Pick<Project, "taskVisibility">): SQL | undefined {
  if (canSeeAllTasks(user, project)) return undefined;
  return or(assignedTo(user.id), generalTask());
}

/*
 * The builders below return sub-queries, not results, so they stay plain
 * (non-async) functions: an async function would run the query builder
 * instead of embedding it.
 */

/**
 * Team projects the user works in: every one for staff, memberships for
 * everyone else. Personal spaces are never part of it, not even the user's
 * own: they have their own page and stay out of every team list and count.
 */
export function scopeProjectIds(db: Db, user: Actor, opts: { includeArchived?: boolean } = {}) {
  const where = and(isNull(projects.personalOwnerId), opts.includeArchived ? undefined : ne(projects.status, "archived"));
  if (isStaff(user.role)) return db.select({ id: projects.id }).from(projects).where(where);
  return db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, user.id)))
    .where(where);
}

/** Member projects that show every task to their members. */
function openProjectIds(db: Db, user: Actor) {
  return db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, user.id)))
    .where(and(eq(projects.taskVisibility, "all"), isNull(projects.personalOwnerId)));
}

/**
 * Cross-project filter on tasks: everything in the user's projects for staff;
 * for members, the tasks assigned to them and general tasks, plus every task
 * of projects that show all tasks to members.
 */
export function visibleTasksFilter(db: Db, user: Actor, opts: { includeArchived?: boolean } = {}): SQL {
  const inScope = inArray(tasks.projectId, scopeProjectIds(db, user, opts));
  if (isStaff(user.role)) return inScope;
  return and(inScope, or(inArray(tasks.projectId, openProjectIds(db, user)), assignedTo(user.id), generalTask())) as SQL;
}

/**
 * SQL: a "task deleted" entry this member may read, because the task was
 * general or assigned to them. The entry records that audience: "general",
 * or the ids of the people it was assigned to (older entries hold one id).
 */
export const deletionVisibleTo = (userId: string): SQL =>
  sql`(${activities.payload}->>'audience' in ('general', ${userId}) or coalesce(${activities.payload}->'audienceIds', '[]'::jsonb) @> jsonb_build_array(${userId}::text))`;

/**
 * Activity rows a member may read in projects that hide other people's work:
 * project-level entries, entries about tasks they can see, and deletions of
 * tasks that were theirs or general.
 */
function memberActivityCondition(db: Db, user: Actor, taskScope: SQL): SQL {
  const visibleTaskIds = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(taskScope, or(generalTask(), assignedTo(user.id))));
  return or(and(isNull(activities.taskId), or(ne(activities.type, "task_deleted"), deletionVisibleTo(user.id))), inArray(activities.taskId, visibleTaskIds)) as SQL;
}

/** Filter for one project's activity feed, or undefined when the user may read all of it. */
export function projectActivityFilter(db: Db, user: Actor, project: Pick<Project, "id" | "taskVisibility">): SQL | undefined {
  if (canSeeAllTasks(user, project)) return undefined;
  return memberActivityCondition(db, user, eq(tasks.projectId, project.id));
}

/** Filter for the cross-project activity feed on the dashboard. */
export function dashboardActivityFilter(db: Db, user: Actor): SQL {
  const scope = scopeProjectIds(db, user);
  const inScope = inArray(activities.projectId, scope);
  if (isStaff(user.role)) return inScope;
  return and(inScope, or(inArray(activities.projectId, openProjectIds(db, user)), memberActivityCondition(db, user, inArray(tasks.projectId, scope)))) as SQL;
}
