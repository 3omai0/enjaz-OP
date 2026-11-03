import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { labels, projectMembers, projects, taskAssignees, tasks, users, type Project, type ProjectStatus, type SafeUser, type TaskStatus } from "@/db/schema";
import { canAssignOthers, isStaff } from "@/lib/permissions";
import { assignedTo, scopeProjectIds, taskVisibilityFilter, visibleTasksFilter } from "./access";

type Actor = Pick<SafeUser, "id" | "role">;

/** A person offered in a picker; `hint` is their job title, `outside` marks someone not yet in the project. */
export type PersonOption = { id: string; name: string; hint?: string | null; outside?: boolean };

export type ProjectCard = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  dueDate: string | null;
  startDate: string | null;
  updatedAt: Date;
  owner: { id: string; name: string };
  members: Array<{ id: string; name: string }>;
  /** Counts cover only the tasks the viewer is allowed to see. */
  totalTasks: number;
  doneTasks: number;
  myOpenTasks: number;
};

export type ProjectFilters = { q?: string; status?: ProjectStatus | "all"; includeArchived?: boolean; /** Only projects this person belongs to. */ memberId?: string };

/** Team projects visible to the user, with progress and member avatars (never personal spaces). Two queries in parallel. */
export async function listProjectsForUser(user: Actor, filters: ProjectFilters = {}): Promise<ProjectCard[]> {
  const db = await getDb();
  const conditions: SQL[] = [isNull(projects.personalOwnerId)];
  if (filters.status && filters.status !== "all") conditions.push(eq(projects.status, filters.status));
  else if (!filters.includeArchived) conditions.push(ne(projects.status, "archived"));
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    conditions.push(or(ilike(projects.name, term), ilike(projects.key, term)) as SQL);
  }
  if (!isStaff(user.role)) {
    conditions.push(inArray(projects.id, db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, user.id))));
  }
  if (filters.memberId) {
    conditions.push(inArray(projects.id, db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, filters.memberId))));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, counts] = await Promise.all([
    db.query.projects.findMany({
      where,
      orderBy: [desc(projects.updatedAt)],
      with: {
        owner: { columns: { id: true, name: true } },
        members: { with: { user: { columns: { id: true, name: true, isActive: true } } } },
      },
    }),
    db
      .select({
        projectId: tasks.projectId,
        total: count(),
        done: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.mapWith(Number),
        mineOpen: sql<number>`count(*) filter (where ${assignedTo(user.id)} and ${tasks.status} <> 'done')`.mapWith(Number),
      })
      .from(tasks)
      .where(and(inArray(tasks.projectId, db.select({ id: projects.id }).from(projects).where(where)), visibleTasksFilter(db, user, { includeArchived: true })))
      .groupBy(tasks.projectId),
  ]);
  const byProject = new Map(counts.map((c) => [c.projectId, c]));

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    key: p.key,
    description: p.description,
    status: p.status,
    color: p.color,
    dueDate: p.dueDate,
    startDate: p.startDate,
    updatedAt: p.updatedAt,
    owner: p.owner,
    members: p.members.filter((m) => m.user.isActive).map((m) => ({ id: m.user.id, name: m.user.name })),
    totalTasks: byProject.get(p.id)?.total ?? 0,
    doneTasks: byProject.get(p.id)?.done ?? 0,
    myOpenTasks: byProject.get(p.id)?.mineOpen ?? 0,
  }));
}

/** Members of a project with their profile basics. Cached per request, so a layout and its page share it. */
export const getProjectMembers = cache(async (projectId: string) => {
  const db = await getDb();
  return db.query.projectMembers.findMany({
    where: eq(projectMembers.projectId, projectId),
    with: { user: { columns: { id: true, name: true, email: true, role: true, jobTitle: true, department: true, isActive: true } } },
    orderBy: [asc(projectMembers.createdAt)],
  });
});

/** Open tasks per member (a task shared by several people counts for each). Only for viewers allowed to see every task of the project. */
export async function getMemberOpenCounts(projectId: string): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ userId: taskAssignees.userId, n: count() })
    .from(taskAssignees)
    .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
    .where(and(eq(tasks.projectId, projectId), ne(tasks.status, "done")))
    .groupBy(taskAssignees.userId);
  return new Map(rows.map((r) => [r.userId, r.n]));
}

export const getProjectLabels = cache(async (projectId: string) => {
  const db = await getDb();
  return db.query.labels.findMany({ where: eq(labels.projectId, projectId), orderBy: [asc(labels.name)] });
});

/** Status counts for the project sidebar, limited to the tasks the viewer can see. */
export async function getProjectStatusCounts(user: Actor, project: Pick<Project, "id" | "taskVisibility">): Promise<Record<TaskStatus, number>> {
  const db = await getDb();
  const rows = await db
    .select({ status: tasks.status, n: count() })
    .from(tasks)
    .where(and(eq(tasks.projectId, project.id), taskVisibilityFilter(user, project)))
    .groupBy(tasks.status);
  const result: Record<TaskStatus, number> = { backlog: 0, todo: 0, in_progress: 0, in_review: 0, done: 0 };
  for (const r of rows) result[r.status] = r.n;
  return result;
}

const listActiveUsers = cache(async () => {
  const db = await getDb();
  return db.select({ id: users.id, name: users.name, jobTitle: users.jobTitle }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name));
});

/** Everyone active in the workspace, for choosing who can see a new project. */
/** Projects the user works in (archived ones left out), by name, for picking one in a filter. */
export async function listProjectOptions(user: Actor): Promise<Array<{ id: string; name: string }>> {
  const db = await getDb();
  return db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, scopeProjectIds(db, user))).orderBy(asc(projects.name));
}

export async function listPeopleOptions(): Promise<PersonOption[]> {
  const everyone = await listActiveUsers();
  return everyone.map((u) => ({ id: u.id, name: u.name, hint: u.jobTitle }));
}

/**
 * People offered in the assignee picker. Staff see the project's active
 * members first and then everyone else in the workspace (picking one of those
 * adds them to the project); members only ever assign themselves.
 */
export async function getAssigneeOptions(user: Actor, projectId: string): Promise<PersonOption[]> {
  const [members, everyone] = await Promise.all([getProjectMembers(projectId), canAssignOthers(user) ? listActiveUsers() : Promise.resolve([])]);
  const inside = members.filter((m) => m.user.isActive).map((m) => ({ id: m.user.id, name: m.user.name, hint: m.user.jobTitle }));
  const insideIds = new Set(inside.map((m) => m.id));
  return [...inside, ...everyone.filter((u) => !insideIds.has(u.id)).map((u) => ({ id: u.id, name: u.name, hint: u.jobTitle, outside: true }))];
}

/** Active users not yet in the project, for the "add member" picker. */
export async function listAddableUsers(projectId: string) {
  const db = await getDb();
  return db
    .select({ id: users.id, name: users.name, email: users.email, jobTitle: users.jobTitle, role: users.role })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        sql`${users.id} not in (select ${projectMembers.userId} from ${projectMembers} where ${projectMembers.projectId} = ${projectId})`
      )
    )
    .orderBy(asc(users.name));
}

/** Upper-cased project keys that start with the prefix, in one query (keys only hold A-Z and 0-9). */
export async function takenProjectKeys(prefix: string, excludeId?: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db
    .select({ key: sql<string>`upper(${projects.key})` })
    .from(projects)
    .where(and(sql`upper(${projects.key}) like ${`${prefix.toUpperCase()}%`}`, excludeId ? ne(projects.id, excludeId) : undefined));
  return new Set(rows.map((r) => r.key));
}
