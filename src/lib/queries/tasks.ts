import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { activities, checklistItems, comments, projects, taskAssignees, taskLabels, tasks, users, type Project, type ProjectStatus, type SafeUser, type TaskPriority, type TaskStatus } from "@/db/schema";
import { startOfMonthInZone, todayISO } from "@/lib/format";
import { RECENT_DONE_DAYS, type DueFilter, type MyTasksFilters, type MyTasksScope } from "@/lib/my-tasks";
import { isStaff } from "@/lib/permissions";
import { isUuid } from "@/lib/utils";
import { assignedTo, generalTask, loadVisibleTask, scopeProjectIds, taskVisibilityFilter, visibleTasksFilter } from "./access";
import { listRecentActivity } from "./activity";

type Actor = Pick<SafeUser, "id" | "role">;

/** `personalOwnerId` is set on tasks of a personal space (see projects.personalOwnerId). */
export type TaskCardProject = Pick<Project, "id" | "name" | "key" | "color" | "requireApproval" | "taskVisibility" | "personalOwnerId">;

export type TaskCard = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  /** Everyone the task is assigned to, in the order they were added; empty for a general task. */
  assignees: Array<{ id: string; name: string }>;
  /** Null when the person who created it has been deleted. */
  creatorId: string | null;
  labels: Array<{ id: string; name: string; color: string }>;
  checklistTotal: number;
  checklistDone: number;
  commentCount: number;
  project: TaskCardProject;
};

export type TaskFilters = {
  assignee?: string | "me" | "general" | "all";
  priority?: TaskPriority | "all";
  label?: string | "all";
  status?: TaskStatus | "all";
  due?: DueFilter;
  q?: string;
};

/** Assignees in the order they were added. A plain SQL[] (not part of the const object) so the query builder accepts it. */
const byAssignedAt: SQL[] = [asc(taskAssignees.createdAt)];

const cardWith = {
  assignees: { columns: { userId: true }, orderBy: byAssignedAt, with: { user: { columns: { id: true, name: true } } } },
  taskLabels: { with: { label: { columns: { id: true, name: true, color: true } } } },
  project: { columns: { id: true, name: true, key: true, color: true, requireApproval: true, taskVisibility: true, personalOwnerId: true } },
} as const;

type RawTask = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  creatorId: string | null;
  assignees: Array<{ user: { id: string; name: string } }>;
  taskLabels: Array<{ label: { id: string; name: string; color: string } }>;
  project: TaskCardProject;
};

/** Adds checklist and comment counts to raw rows (two queries, run together). */
async function decorate(rows: RawTask[]): Promise<TaskCard[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const ids = [...new Set(rows.map((r) => r.id))];
  const [checklist, commentRows] = await Promise.all([
    db
      .select({ taskId: checklistItems.taskId, total: count(), done: sql<number>`count(*) filter (where ${checklistItems.done})`.mapWith(Number) })
      .from(checklistItems)
      .where(inArray(checklistItems.taskId, ids))
      .groupBy(checklistItems.taskId),
    db.select({ taskId: comments.taskId, n: count() }).from(comments).where(inArray(comments.taskId, ids)).groupBy(comments.taskId),
  ]);
  const clMap = new Map(checklist.map((c) => [c.taskId, c]));
  const cmMap = new Map(commentRows.map((c) => [c.taskId, c.n]));
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    number: r.number,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate,
    position: r.position,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    creatorId: r.creatorId,
    assignees: r.assignees.map((a) => a.user),
    labels: r.taskLabels.map((tl) => tl.label),
    checklistTotal: clMap.get(r.id)?.total ?? 0,
    checklistDone: clMap.get(r.id)?.done ?? 0,
    commentCount: cmMap.get(r.id) ?? 0,
    project: r.project,
  }));
}

/** SQL: the due date falls in the chosen window (overdue never includes finished work). */
function dueCondition(due: DueFilter): SQL[] {
  const today = todayISO();
  if (due === "overdue") return [lt(tasks.dueDate, today), ne(tasks.status, "done")];
  if (due === "today") return [eq(tasks.dueDate, today)];
  if (due === "week") return [gte(tasks.dueDate, today), lte(tasks.dueDate, todayISO(7))];
  if (due === "month") return [gte(tasks.dueDate, today), lte(tasks.dueDate, todayISO(30))];
  return [isNull(tasks.dueDate)];
}

/** SQL: the title or the reference (ORD-12) contains the text. The project is named through its own alias, see access.ts. */
function searchCondition(q: string): SQL {
  const term = `%${q}%`;
  return sql`(${tasks.title} ilike ${term} or exists (select 1 from projects p where p.id = ${tasks.projectId} and (p.key || '-' || ${tasks.number}) ilike ${term}))`;
}

/** Tasks of one project, respecting the member visibility rule and optional filters. */
export async function listProjectTasks(user: Actor, project: Project, filters: TaskFilters = {}): Promise<TaskCard[]> {
  const db = await getDb();
  const conditions: SQL[] = [eq(tasks.projectId, project.id)];
  const visibility = taskVisibilityFilter(user, project);
  if (visibility) conditions.push(visibility);
  if (filters.assignee === "me") conditions.push(assignedTo(user.id));
  else if (filters.assignee === "general") conditions.push(generalTask());
  else if (filters.assignee && filters.assignee !== "all") conditions.push(assignedTo(filters.assignee));
  if (filters.priority && filters.priority !== "all") conditions.push(eq(tasks.priority, filters.priority));
  if (filters.status && filters.status !== "all") conditions.push(eq(tasks.status, filters.status));
  if (filters.label && filters.label !== "all") {
    conditions.push(inArray(tasks.id, db.select({ id: taskLabels.taskId }).from(taskLabels).where(eq(taskLabels.labelId, filters.label))));
  }
  if (filters.due) conditions.push(...dueCondition(filters.due));
  if (filters.q?.trim()) conditions.push(searchCondition(filters.q.trim()));

  const rows = await db.query.tasks.findMany({
    where: and(...conditions),
    orderBy: [asc(tasks.position), asc(tasks.number)],
    with: cardWith,
  });
  return decorate(rows);
}

export type TaskScopeCounts = { all: number; me: number; general: number };

/**
 * A project's Tasks page: the tasks under the filters, plus how many of them
 * are the viewer's own and how many are general, so the quick switch (all
 * tasks, mine, general) shows what each choice holds. One query: the
 * assignee filter is applied to the same rows.
 */
export async function listProjectTaskPage(user: Actor, project: Project, filters: TaskFilters): Promise<{ tasks: TaskCard[]; counts: TaskScopeCounts }> {
  const rows = await listProjectTasks(user, project, { ...filters, assignee: "all" });
  const isMine = (task: TaskCard) => task.assignees.some((a) => a.id === user.id);
  const isGeneral = (task: TaskCard) => task.assignees.length === 0;
  const counts = { all: rows.length, me: rows.filter(isMine).length, general: rows.filter(isGeneral).length };
  const who = filters.assignee ?? "all";
  const shown = who === "me" ? rows.filter(isMine) : who === "general" ? rows.filter(isGeneral) : who === "all" ? rows : rows.filter((task) => task.assignees.some((a) => a.id === who));
  return { tasks: shown, counts };
}

/**
 * Full task for the detail page, or null if it does not exist or is hidden from the user. One round trip.
 * Cached per request so the page title and the page share it.
 */
export const getTaskDetail = cache(async (user: Actor, taskId: string) => {
  const db = await getDb();
  const [visible, task, history] = await Promise.all([
    loadVisibleTask(user, taskId),
    visibleOrNothing(taskId, () =>
      db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
        with: {
          assignees: { columns: { userId: true }, orderBy: byAssignedAt, with: { user: { columns: { id: true, name: true, jobTitle: true } } } },
          creator: { columns: { id: true, name: true } },
          taskLabels: { with: { label: true } },
          checklist: { orderBy: [asc(checklistItems.position), asc(checklistItems.createdAt)] },
          comments: { orderBy: [asc(comments.createdAt)], with: { author: { columns: { id: true, name: true } } } },
        },
      })
    ),
    visibleOrNothing(taskId, () =>
      db.query.activities.findMany({
        where: eq(activities.taskId, taskId),
        orderBy: [desc(activities.createdAt)],
        limit: 30,
        with: { actor: { columns: { id: true, name: true } } },
      })
    ),
  ]);
  if (!visible || !task) return null;
  return { ...task, assigneeIds: visible.assigneeIds, project: visible.project, history: history ?? [] };
});

/** Skips the query for malformed ids (loadVisibleTask already returns null for them). */
async function visibleOrNothing<T>(taskId: string, run: () => Promise<T>): Promise<T | null> {
  return isUuid(taskId) ? run() : null;
}

/**
 * Tasks the user may see across their team projects (archived ones and
 * personal spaces left out), for Claude's connector. Open work by default,
 * soonest due first, then the most urgent.
 */
export async function listVisibleTasks(
  user: Actor,
  filters: { statuses?: TaskStatus[]; openOnly?: boolean; assignee?: TaskFilters["assignee"]; priority?: TaskPriority; due?: DueFilter; q?: string },
  limit: number
): Promise<TaskCard[]> {
  const db = await getDb();
  const conditions: SQL[] = [visibleTasksFilter(db, user)];
  if (filters.statuses?.length) conditions.push(inArray(tasks.status, filters.statuses));
  else if (filters.openOnly) conditions.push(ne(tasks.status, "done"));
  if (filters.assignee === "me") conditions.push(assignedTo(user.id));
  else if (filters.assignee === "general") conditions.push(generalTask());
  else if (filters.assignee && filters.assignee !== "all") conditions.push(assignedTo(filters.assignee));
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
  if (filters.due) conditions.push(...dueCondition(filters.due));
  if (filters.q?.trim()) conditions.push(searchCondition(filters.q.trim()));
  const rows = await db.query.tasks.findMany({
    where: and(...conditions),
    orderBy: [sql`${tasks.dueDate} asc nulls last`, desc(tasks.priority), desc(tasks.updatedAt)],
    limit,
    with: cardWith,
  });
  return decorate(rows);
}

/** Everything assigned to the person across team projects that are not archived (never their personal tasks). */
export async function listMyTasks(userId: string, includeDone = false): Promise<TaskCard[]> {
  const db = await getDb();
  const teamProjects = db.select({ id: projects.id }).from(projects).where(and(ne(projects.status, "archived"), isNull(projects.personalOwnerId)));
  const rows = await db.query.tasks.findMany({
    where: and(assignedTo(userId), includeDone ? undefined : ne(tasks.status, "done"), inArray(tasks.projectId, teamProjects)),
    orderBy: [sql`${tasks.dueDate} asc nulls last`, desc(tasks.priority), asc(tasks.createdAt)],
    with: cardWith,
  });
  return decorate(rows);
}

/**
 * My tasks: tasks assigned to the user and general tasks, in the projects
 * they work in (archived ones left out), narrowed by the filters. Open work
 * comes first by due date, then what was completed in the last
 * RECENT_DONE_DAYS days. The counts per scope come from the same rows, so the
 * scope switch shows what each view holds.
 */
export async function listMyTasksPage(user: Actor, filters: MyTasksFilters): Promise<{ tasks: TaskCard[]; counts: Record<MyTasksScope, number> }> {
  const db = await getDb();
  const doneSince = new Date(Date.now() - RECENT_DONE_DAYS * 86_400_000).toISOString();
  const recentlyDone = sql`(${tasks.status} = 'done' and coalesce(${tasks.completedAt}, ${tasks.updatedAt}) >= ${doneSince}::timestamptz)`;
  const conditions: SQL[] = [visibleTasksFilter(db, user), or(assignedTo(user.id), generalTask()) as SQL];

  if (filters.status === "open") conditions.push(ne(tasks.status, "done"));
  else if (filters.status === "all") conditions.push(or(ne(tasks.status, "done"), recentlyDone) as SQL);
  else if (filters.status === "done") conditions.push(recentlyDone);
  else conditions.push(eq(tasks.status, filters.status));

  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
  if (filters.project) conditions.push(eq(tasks.projectId, filters.project));
  if (filters.due) conditions.push(...dueCondition(filters.due));
  if (filters.q) conditions.push(searchCondition(filters.q));

  const rows = await db.query.tasks.findMany({
    where: and(...conditions),
    orderBy: [
      sql`${tasks.status} = 'done'`,
      sql`case when ${tasks.status} = 'done' then coalesce(${tasks.completedAt}, ${tasks.updatedAt}) end desc nulls last`,
      sql`${tasks.dueDate} asc nulls last`,
      desc(tasks.priority),
      asc(tasks.createdAt),
    ],
    with: cardWith,
  });
  const mine = rows.filter((r) => r.assignees.some((a) => a.user.id === user.id));
  const general = rows.filter((r) => r.assignees.length === 0);
  const shown = filters.scope === "mine" ? mine : filters.scope === "general" ? general : rows;
  return { tasks: await decorate(shown), counts: { all: rows.length, mine: mine.length, general: general.length } };
}

export type DashboardData = {
  /** Staff: the whole workspace. Members: only the tasks assigned to them. */
  stats: { open: number; dueWeek: number; overdue: number; doneMonth: number; review: number };
  focus: TaskCard[];
  upcoming: TaskCard[];
  /** Work sent to review, oldest first (staff only). */
  review: TaskCard[];
  projects: Array<{ id: string; name: string; key: string; color: string; status: ProjectStatus; dueDate: string | null; total: number; done: number; members: Array<{ id: string; name: string }> }>;
  workload: Array<{ id: string; name: string; open: number; overdue: number }>;
  activity: Awaited<ReturnType<typeof listRecentActivity>>;
};

/** Home page data in two parallel waves: every list and count at once, then the checklist and comment counts. */
export async function getDashboard(user: Actor): Promise<DashboardData> {
  const db = await getDb();
  const staff = isStaff(user.role);
  const today = todayISO();
  const weekEnd = todayISO(7);
  const monthStart = startOfMonthInZone().toISOString();
  const visible = visibleTasksFilter(db, user);
  const statsScope = staff ? visible : and(visible, assignedTo(user.id));
  const open = ne(tasks.status, "done");

  const [[stats], focusRows, upcomingRows, reviewRows, projectRows, projectCounts, workload, activity] = await Promise.all([
    db
      .select({
        open: sql<number>`count(*) filter (where ${tasks.status} <> 'done')`.mapWith(Number),
        dueWeek: sql<number>`count(*) filter (where ${tasks.status} <> 'done' and ${tasks.dueDate} >= ${today} and ${tasks.dueDate} <= ${weekEnd})`.mapWith(Number),
        overdue: sql<number>`count(*) filter (where ${tasks.status} <> 'done' and ${tasks.dueDate} < ${today})`.mapWith(Number),
        doneMonth: sql<number>`count(*) filter (where ${tasks.status} = 'done' and ${tasks.completedAt} >= ${monthStart}::timestamptz)`.mapWith(Number),
        review: sql<number>`count(*) filter (where ${tasks.status} = 'in_review')`.mapWith(Number),
      })
      .from(tasks)
      .where(statsScope),
    db.query.tasks.findMany({
      where: and(visible, assignedTo(user.id), open),
      orderBy: [sql`${tasks.dueDate} asc nulls last`, desc(tasks.priority)],
      limit: 8,
      with: cardWith,
    }),
    db.query.tasks.findMany({
      where: and(visible, open, sql`${tasks.dueDate} >= ${today}`, sql`${tasks.dueDate} <= ${weekEnd}`),
      orderBy: [asc(tasks.dueDate), desc(tasks.priority)],
      limit: 6,
      with: cardWith,
    }),
    staff
      ? db.query.tasks.findMany({ where: and(visible, eq(tasks.status, "in_review")), orderBy: [asc(tasks.updatedAt)], limit: 6, with: cardWith })
      : Promise.resolve([]),
    db.query.projects.findMany({
      where: inArray(projects.id, scopeProjectIds(db, user)),
      orderBy: [desc(projects.updatedAt)],
      limit: 6,
      with: { members: { with: { user: { columns: { id: true, name: true, isActive: true } } } } },
    }),
    db
      .select({ projectId: tasks.projectId, total: count(), done: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.mapWith(Number) })
      .from(tasks)
      .where(visible)
      .groupBy(tasks.projectId),
    staff
      ? db
          .select({ id: users.id, name: users.name, open: count(), overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today})`.mapWith(Number) })
          .from(tasks)
          .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
          .innerJoin(users, eq(users.id, taskAssignees.userId))
          .where(and(visible, open))
          .groupBy(users.id, users.name)
          .orderBy(desc(count()))
          .limit(8)
      : Promise.resolve([]),
    listRecentActivity(user, 10),
  ]);

  const cards = await decorate([...focusRows, ...upcomingRows, ...reviewRows]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const pick = (rows: Array<{ id: string }>) => rows.map((r) => byId.get(r.id)).filter((c): c is TaskCard => !!c);
  const counts = new Map(projectCounts.map((c) => [c.projectId, c]));

  return {
    stats: stats ?? { open: 0, dueWeek: 0, overdue: 0, doneMonth: 0, review: 0 },
    focus: pick(focusRows),
    upcoming: pick(upcomingRows),
    review: pick(reviewRows),
    projects: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      key: p.key,
      color: p.color,
      status: p.status,
      dueDate: p.dueDate,
      total: counts.get(p.id)?.total ?? 0,
      done: counts.get(p.id)?.done ?? 0,
      members: p.members.filter((m) => m.user.isActive).map((m) => ({ id: m.user.id, name: m.user.name })),
    })),
    workload,
    activity,
  };
}

/** Task search by title or reference (e.g. ORD-12), limited to what the user can see. */
export async function searchTasks(user: Actor, q: string): Promise<TaskCard[]> {
  const db = await getDb();
  const term = `%${q.trim()}%`;
  const ids = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(visibleTasksFilter(db, user, { includeArchived: true }), sql`(${tasks.title} ilike ${term} or (${projects.key} || '-' || ${tasks.number}) ilike ${term})`))
    .orderBy(desc(tasks.updatedAt))
    .limit(20);
  if (ids.length === 0) return [];
  const rows = await db.query.tasks.findMany({ where: inArray(tasks.id, ids.map((t) => t.id)), with: cardWith, orderBy: [desc(tasks.updatedAt)] });
  return decorate(rows);
}
