"use server";

import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { atomic, getDb, type AtomicQuery, type Db } from "@/db";
import { checklistItems, comments, labels, projectMembers, projects, taskAssignees, taskLabels, tasks, users, TASK_PRIORITIES, TASK_STATUSES, type Project, type SafeUser, type TaskPriority, type TaskStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isValidDateOnly } from "@/lib/format";
import { fill, type Lang, type Pair } from "@/lib/i18n";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canAssignOthers, canDeleteTask, canEditTask, canManageMembers, canMoveTask, canSeeTask, canSetStatus } from "@/lib/permissions";
import { getAccessibleProject, loadVisibleTask, type VisibleTask } from "@/lib/queries/access";
import { projectHref, taskHref } from "@/lib/routes";
import { clip, isUuid } from "@/lib/utils";
import { activityInsert, compact, guard, notificationsInsert, revalidateAll, whoCanSee, type ActivityInput, type NotificationInput } from "./helpers";
import { optStr, str, type ActionState } from "./types";

type Actor = Pick<SafeUser, "id" | "role" | "name">;
type Translate = <V>(pair: Pair<V>) => V;
type Person = { id: string; name: string };

/** The most people one task can be assigned to. */
const MAX_ASSIGNEES = 30;

const isStatus = (v: string): v is TaskStatus => (TASK_STATUSES as readonly string[]).includes(v);
const isPriority = (v: string): v is TaskPriority => (TASK_PRIORITIES as readonly string[]).includes(v);

/** "" means no date; anything else must be a real calendar date (never a half-typed year such as 0002). */
function parseDate(raw: string | null): { ok: true; value: string | null } | { ok: false } {
  if (!raw) return { ok: true, value: null };
  return isValidDateOnly(raw) ? { ok: true, value: raw } : { ok: false };
}

/** Hours estimate: empty is null, anything else a sensible positive number; undefined means invalid. */
function parseEstimate(raw: string | null): number | null | undefined {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 10_000 ? n : undefined;
}

/** KEY-12 inside a team project; personal tasks are just #12. */
const taskKeyOf = (task: { number: number; project: { key: string; personalOwnerId: string | null } }) => (task.project.personalOwnerId ? `#${task.number}` : `${task.project.key}-${task.number}`);

/** Ids posted by a form or a client call: unique, in the order given. */
const uniqueIds = (values: unknown[]) => [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** "Sara and Fahad" in the reader's language. */
const joinNames = (names: string[], lang: Lang) => new Intl.ListFormat(lang === "ar" ? "ar" : "en", { style: "long", type: "conjunction" }).format(names);

type Assignment = {
  /** Everyone assigned after the change, in the order picked. */
  next: Person[];
  added: Person[];
  removed: Person[];
  /** People outside the project who join it with this change. */
  joining: Person[];
};

/**
 * Validate the people picked for a task. Employees can only add or remove
 * themselves; staff can pick anyone active, and someone outside the project
 * joins it in the same change. People who are already assigned stay valid
 * even if they have left since, so saving never drops them by surprise.
 */
async function resolveAssignees(user: Actor, project: Pick<Project, "id">, requested: string[], current: readonly string[], t: Translate): Promise<Assignment | { error: string }> {
  if (requested.some((id) => !isUuid(id))) return { error: t(dict.task.notMember) };
  if (requested.length > MAX_ASSIGNEES) return { error: fill(t(dict.task.tooManyAssignees), { n: MAX_ASSIGNEES }) };
  const others = (ids: readonly string[]) => ids.filter((id) => id !== user.id).sort().join(",");
  if (!canAssignOthers(user) && others(requested) !== others(current)) return { error: t(dict.task.assignSelfOnly) };

  const ids = [...new Set([...requested, ...current])];
  if (ids.length === 0) return { next: [], added: [], removed: [], joining: [] };
  const db = await getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      isActive: users.isActive,
      member: sql<boolean>`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${project.id} and ${projectMembers.userId} = ${users.id})`,
    })
    .from(users)
    .where(inArray(users.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const added: Person[] = [];
  const joining: Person[] = [];
  for (const id of requested) {
    if (current.includes(id)) continue;
    const row = byId.get(id);
    if (!row || !row.isActive) return { error: t(dict.task.notMember) };
    const picked = { id: row.id, name: row.name };
    if (!row.member) {
      if (!canManageMembers(user)) return { error: t(dict.task.notMember) };
      joining.push(picked);
    }
    added.push(picked);
  }
  const person = (id: string): Person => ({ id, name: byId.get(id)?.name ?? "" });
  return {
    next: requested.filter((id) => byId.has(id)).map(person),
    added,
    removed: current.filter((id) => !requested.includes(id)).map(person),
    joining,
  };
}

/** Statements that add someone to the project while a task is handed to them. */
function joinStatements(q: Db, actor: Actor, project: Pick<Project, "id" | "name" | "key">, person: Person): AtomicQuery[] {
  return compact([
    q.insert(projectMembers).values({ projectId: project.id, userId: person.id }).onConflictDoNothing(),
    activityInsert(q, { projectId: project.id, actorId: actor.id, type: "member_added", payload: { memberName: person.name, memberId: person.id, projectName: project.name } }),
    notificationsInsert(q, [{ userId: person.id, actorId: actor.id, type: "added_to_project", payload: { projectName: project.name, projectKey: project.key }, href: projectHref(project.id) }]),
  ]);
}

/** Rows for task_assignees, stamped a millisecond apart so they keep the order they were picked in. */
function assigneeRows(taskId: string, people: Person[]) {
  const at = Date.now();
  return people.map((p, i) => ({ taskId, userId: p.id, createdAt: new Date(at + i) }));
}

/** Writes that swap a task's assignees for the new set. */
function assigneeStatements(q: Db, taskId: string, change: Assignment): Array<AtomicQuery | false> {
  const removedIds = change.removed.map((p) => p.id);
  return [
    removedIds.length > 0 && q.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), inArray(taskAssignees.userId, removedIds))),
    change.added.length > 0 && q.insert(taskAssignees).values(assigneeRows(taskId, change.added)).onConflictDoNothing(),
  ];
}

/**
 * Everyone told about a general task: the project's active members, and
 * every active administrator and project manager, who follow all projects.
 */
async function generalAudience(projectId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        or(inArray(users.role, ["admin", "manager"]), sql`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${projectId} and ${projectMembers.userId} = ${users.id})`)
      )
    );
  return rows.map((r) => r.id);
}

async function validLabelIds(projectId: string, raw: string[]) {
  const ids = [...new Set(raw.filter(isUuid))];
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.select({ id: labels.id }).from(labels).where(and(eq(labels.projectId, projectId), inArray(labels.id, ids)));
  return rows.map((r) => r.id);
}

type Effects = { activities: ActivityInput[]; notes: NotificationInput[] };

/** Log entry and notifications for a status change. The project owner is asked to approve work sent to review. */
function statusEffects(actor: Actor, task: VisibleTask, title: string, to: TaskStatus): Effects {
  const base = { taskKey: taskKeyOf(task), taskTitle: title };
  const href = taskHref(task.projectId, task.id);
  const notes: NotificationInput[] = [];
  if (to === "in_review" && task.project.requireApproval) notes.push({ userId: task.project.ownerId, actorId: actor.id, type: "review_requested", payload: base, href });
  for (const userId of [...task.assigneeIds, task.creatorId]) notes.push({ userId, actorId: actor.id, type: "status_changed", payload: { ...base, to }, href });
  return {
    activities: [{ projectId: task.projectId, taskId: task.id, actorId: actor.id, type: "status_changed", payload: { ...base, from: task.status, to } }],
    notes,
  };
}

/**
 * Log entries and notifications when people join or leave a task. Removed
 * people always hear about it. A task left with nobody becomes general, so
 * the people in `generalIds` (see generalAudience) are told about it as well
 * (after the removal notices, so the people just taken off get only theirs).
 */
function assignmentEffects(actor: Actor, task: VisibleTask, title: string, change: Assignment, audience: Set<string>, generalIds: readonly string[] = []): Effects {
  const base = { taskKey: taskKeyOf(task), taskTitle: title };
  const withProject = { ...base, projectName: task.project.name };
  const href = taskHref(task.projectId, task.id);
  const entry = (type: string, payload: ActivityInput["payload"]): ActivityInput => ({ projectId: task.projectId, taskId: task.id, actorId: actor.id, type, payload });
  const effects: Effects = { activities: [], notes: [] };
  for (const p of change.added) {
    effects.activities.push(entry("task_assigned", { ...base, memberName: p.name, memberId: p.id }));
    effects.notes.push({ userId: p.id, actorId: actor.id, type: "task_assigned", payload: withProject, href });
  }
  if (change.next.length === 0) {
    if (change.removed.length > 0) effects.activities.push(entry("task_unassigned", base));
  } else {
    for (const p of change.removed) effects.activities.push(entry("task_assignee_removed", { ...base, memberName: p.name, memberId: p.id }));
  }
  for (const p of change.removed) {
    // They may no longer be allowed to open the task, so link to the project instead.
    effects.notes.push({ userId: p.id, actorId: actor.id, type: "task_unassigned", payload: withProject, href: audience.has(p.id) ? href : projectHref(task.projectId) });
  }
  if (change.next.length === 0 && change.removed.length > 0) {
    for (const userId of generalIds) effects.notes.push({ userId, actorId: actor.id, type: "general_task", payload: withProject, href });
  }
  return effects;
}

/** Keep only notifications for people who can still see the task (removal notices always go out). */
const forAudience = (notes: NotificationInput[], audience: Set<string>) => notes.filter((n) => n.type === "task_unassigned" || (!!n.userId && audience.has(n.userId)));

/** Message after a save that also brought people into the project. */
function joinedMessage(joining: Person[], lang: Lang, t: Translate, fallback: string) {
  return joining.length > 0 ? fill(t(dict.task.addedToProjectToast), { name: joinNames(joining.map((p) => p.name), lang) }) : fallback;
}

/* ------------------------------------------------------------------ */
/* Create and edit                                                     */
/* ------------------------------------------------------------------ */
export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t, lang } = await getT();
    const project = await getAccessibleProject(user, str(formData, "projectId"));
    if (!project) return { error: t(dict.common.notFound) };

    const title = clip(str(formData, "title"), 300);
    if (title.length < 2) return { fieldErrors: { title: t(dict.common.required) } };
    const status = str(formData, "status") || "todo";
    const priority = str(formData, "priority") || "medium";
    if (!isStatus(status) || !isPriority(priority)) return { error: t(dict.common.error) };
    if (!canSetStatus(user, project, "todo", status)) return { fieldErrors: { status: t(dict.task.completeLocked) } };
    const due = parseDate(optStr(formData, "dueDate"));
    if (!due.ok) return { fieldErrors: { dueDate: t(dict.common.invalidDate) } };
    const start = parseDate(optStr(formData, "startDate"));
    if (!start.ok) return { fieldErrors: { startDate: t(dict.common.invalidDate) } };
    const estimateHours = parseEstimate(optStr(formData, "estimateHours"));
    if (estimateHours === undefined) return { fieldErrors: { estimateHours: t(dict.common.error) } };

    // A personal task is always its owner's. Otherwise, with nobody picked the task is general,
    // for every member of the project, so they and the managers hear about it (one that is already finished stays quiet).
    const requested = project.personalOwnerId ? [project.personalOwnerId] : uniqueIds(formData.getAll("assigneeIds"));
    const [resolved, labelIds, generalIds] = await Promise.all([
      resolveAssignees(user, project, requested, [], t),
      validLabelIds(project.id, formData.getAll("labelIds").map(String)),
      requested.length === 0 && status !== "done" ? generalAudience(project.id) : Promise.resolve([]),
    ]);
    if ("error" in resolved) return { fieldErrors: { assigneeIds: resolved.error } };

    // The task number comes from the project's counter inside the same
    // transaction, so two people adding tasks at once never get the same number.
    const id = crypto.randomUUID();
    const numberSql = sql`(select ${projects.taskCounter} from ${projects} where ${projects.id} = ${project.id})`;
    const keySql = project.personalOwnerId ? sql`'#' || ${numberSql}::text` : sql`${project.key}::text || '-' || ${numberSql}::text`;
    const description = optStr(formData, "description", 20_000);
    const newTaskPayload = () => sql`jsonb_build_object('taskKey', ${keySql}, 'taskTitle', ${title}::text, 'projectName', ${project.name}::text)`;

    await atomic((q) =>
      compact([
        ...resolved.joining.flatMap((p) => joinStatements(q, user, project, p)),
        q.update(projects).set({ taskCounter: sql`${projects.taskCounter} + 1`, updatedAt: new Date() }).where(eq(projects.id, project.id)),
        q.insert(tasks).values({
          id,
          projectId: project.id,
          number: numberSql,
          title,
          description,
          status,
          priority,
          creatorId: user.id,
          dueDate: due.value,
          startDate: start.value,
          estimateHours,
          position: sql`(select coalesce(max(${tasks.position}), 0) + 1 from ${tasks} where ${tasks.projectId} = ${project.id} and ${tasks.status} = ${status})`,
          completedAt: status === "done" ? new Date() : null,
        }),
        resolved.next.length > 0 && q.insert(taskAssignees).values(assigneeRows(id, resolved.next)),
        labelIds.length > 0 && q.insert(taskLabels).values(labelIds.map((labelId) => ({ taskId: id, labelId }))),
        activityInsert(q, {
          projectId: project.id,
          taskId: id,
          actorId: user.id,
          type: "task_created",
          payload: sql`jsonb_build_object('taskKey', ${keySql}, 'taskTitle', ${title}::text, 'general', ${resolved.next.length === 0}::boolean)`,
        }),
        notificationsInsert(q, [
          ...resolved.next.map((p) => ({ userId: p.id, actorId: user.id, type: "task_assigned", payload: newTaskPayload(), href: taskHref(project.id, id) })),
          ...generalIds.map((userId) => ({ userId, actorId: user.id, type: "general_task", payload: newTaskPayload(), href: taskHref(project.id, id) })),
        ]),
      ])
    );

    revalidateAll();
    return { ok: true, id, message: joinedMessage(resolved.joining, lang, t, t(dict.task.created)) };
  });
}

export async function updateTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t, lang } = await getT();
    const task = await loadVisibleTask(user, str(formData, "taskId"));
    if (!task) return { error: t(dict.common.notFound) };
    if (!canEditTask(user, task, task.project)) return { error: t(dict.common.forbidden) };

    const title = clip(str(formData, "title"), 300);
    if (title.length < 2) return { fieldErrors: { title: t(dict.common.required) } };
    const status = str(formData, "status") || task.status;
    const priority = str(formData, "priority") || task.priority;
    if (!isStatus(status) || !isPriority(priority)) return { error: t(dict.common.error) };
    if (!canSetStatus(user, task.project, task.status, status)) return { fieldErrors: { status: t(dict.task.completeLocked) } };
    const due = parseDate(optStr(formData, "dueDate"));
    if (!due.ok) return { fieldErrors: { dueDate: t(dict.common.invalidDate) } };
    const start = parseDate(optStr(formData, "startDate"));
    if (!start.ok) return { fieldErrors: { startDate: t(dict.common.invalidDate) } };
    const estimateHours = parseEstimate(optStr(formData, "estimateHours"));
    if (estimateHours === undefined) return { fieldErrors: { estimateHours: t(dict.common.error) } };

    // The people on a personal task never change: it is its owner's.
    const requested = task.project.personalOwnerId ? task.assigneeIds : uniqueIds(formData.getAll("assigneeIds"));
    const [resolved, labelIds] = await Promise.all([
      sameSet(requested, task.assigneeIds) ? Promise.resolve(null) : resolveAssignees(user, task.project, requested, task.assigneeIds, t),
      validLabelIds(task.projectId, formData.getAll("labelIds").map(String)),
    ]);
    if (resolved && "error" in resolved) return { fieldErrors: { assigneeIds: resolved.error } };
    const nextIds = resolved ? resolved.next.map((p) => p.id) : task.assigneeIds;
    const joining = resolved?.joining ?? [];

    // Taking everyone off an open task makes it general, which the members and managers hear about.
    const generalIds = resolved && resolved.next.length === 0 && status !== "done" ? await generalAudience(task.projectId) : [];
    const audience = await whoCanSee(task.project, nextIds, [...task.assigneeIds, ...nextIds, task.creatorId, task.project.ownerId, ...generalIds], joining.map((p) => p.id));
    const effects: Effects = { activities: [], notes: [] };
    if (resolved) {
      const e = assignmentEffects(user, task, title, resolved, audience, generalIds);
      effects.activities.push(...e.activities);
      effects.notes.push(...e.notes);
    }
    if (status !== task.status) {
      const e = statusEffects(user, { ...task, assigneeIds: nextIds }, title, status);
      effects.activities.push(...e.activities);
      effects.notes.push(...e.notes);
    }

    await atomic((q) =>
      compact([
        ...joining.flatMap((p) => joinStatements(q, user, task.project, p)),
        q
          .update(tasks)
          .set({
            title,
            description: optStr(formData, "description", 20_000),
            status,
            priority,
            dueDate: due.value,
            startDate: start.value,
            estimateHours,
            completedAt: status === "done" ? (task.completedAt ?? new Date()) : null,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, task.id)),
        ...(resolved ? assigneeStatements(q, task.id, resolved) : []),
        q.delete(taskLabels).where(eq(taskLabels.taskId, task.id)),
        labelIds.length > 0 && q.insert(taskLabels).values(labelIds.map((labelId) => ({ taskId: task.id, labelId }))),
        activityInsert(q, { projectId: task.projectId, taskId: task.id, actorId: user.id, type: "task_updated", payload: { taskKey: taskKeyOf(task), taskTitle: title } }),
        ...effects.activities.map((a) => activityInsert(q, a)),
        notificationsInsert(q, forAudience(effects.notes, audience)),
      ])
    );
    revalidateAll();
    // An employee who stepped out of a task that is no longer theirs to see goes back to the project.
    if (!canSeeTask(user, { assigneeIds: nextIds }, task.project)) redirect(projectHref(task.projectId));
    return { ok: true, message: joinedMessage(joining, lang, t, t(dict.task.updated)) };
  });
}

/**
 * The people on a task, changed from the task page in one step. Everyone
 * added is notified, and so is everyone removed.
 */
export async function setTaskAssigneesAction(taskId: string, assigneeIds: string[]): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t, lang } = await getT();
    const task = await loadVisibleTask(user, taskId);
    if (!task) return { error: t(dict.common.notFound) };
    if (!canEditTask(user, task, task.project)) return { error: t(dict.common.forbidden) };
    if (!Array.isArray(assigneeIds)) return { error: t(dict.common.error) };
    if (task.project.personalOwnerId) return { error: t(dict.common.forbidden) };
    const requested = uniqueIds(assigneeIds);
    if (sameSet(requested, task.assigneeIds)) return { ok: true };

    const resolved = await resolveAssignees(user, task.project, requested, task.assigneeIds, t);
    if ("error" in resolved) return { error: resolved.error };
    const nextIds = resolved.next.map((p) => p.id);
    // Taking everyone off an open task makes it general, which the members and managers hear about.
    const generalIds = nextIds.length === 0 && task.status !== "done" ? await generalAudience(task.projectId) : [];
    const audience = await whoCanSee(task.project, nextIds, [...task.assigneeIds, ...nextIds, ...generalIds], resolved.joining.map((p) => p.id));
    const effects = assignmentEffects(user, task, task.title, resolved, audience, generalIds);
    await atomic((q) =>
      compact([
        ...resolved.joining.flatMap((p) => joinStatements(q, user, task.project, p)),
        q.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, task.id)),
        ...assigneeStatements(q, task.id, resolved),
        ...effects.activities.map((a) => activityInsert(q, a)),
        notificationsInsert(q, forAudience(effects.notes, audience)),
      ])
    );
    revalidateAll();
    if (!canSeeTask(user, { assigneeIds: nextIds }, task.project)) redirect(projectHref(task.projectId));
    return { ok: true, message: joinedMessage(resolved.joining, lang, t, t(dict.task.saved)) };
  });
}

/** Quick single-field change from the task page (status, priority, due date). */
export async function setTaskFieldAction(taskId: string, field: "status" | "priority" | "dueDate", value: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const task = await loadVisibleTask(user, taskId);
    if (!task) return { error: t(dict.common.notFound) };
    const allowed = field === "status" ? canMoveTask(user, task, task.project) : canEditTask(user, task, task.project);
    if (!allowed) return { error: t(dict.common.forbidden) };
    const key = taskKeyOf(task);

    if (field === "status") {
      if (!isStatus(value)) return { error: t(dict.common.error) };
      if (value === task.status) return { ok: true };
      if (!canSetStatus(user, task.project, task.status, value)) return { error: t(dict.task.completeLocked) };
      const effects = statusEffects(user, task, task.title, value);
      const audience = await whoCanSee(task.project, task.assigneeIds, effects.notes.map((n) => n.userId));
      await atomic((q) =>
        compact([
          q.update(tasks).set({ status: value, completedAt: value === "done" ? new Date() : null, updatedAt: new Date() }).where(eq(tasks.id, task.id)),
          ...effects.activities.map((a) => activityInsert(q, a)),
          notificationsInsert(q, forAudience(effects.notes, audience)),
        ])
      );
    } else if (field === "priority") {
      if (!isPriority(value)) return { error: t(dict.common.error) };
      if (value === task.priority) return { ok: true };
      await atomic((q) => [
        q.update(tasks).set({ priority: value, updatedAt: new Date() }).where(eq(tasks.id, task.id)),
        activityInsert(q, { projectId: task.projectId, taskId: task.id, actorId: user.id, type: "task_updated", payload: { taskKey: key, taskTitle: task.title, field: "priority", to: value } }),
      ]);
    } else if (field === "dueDate") {
      const due = parseDate(value || null);
      if (!due.ok) return { error: t(dict.common.invalidDate) };
      if (due.value === task.dueDate) return { ok: true };
      await atomic((q) => [
        q.update(tasks).set({ dueDate: due.value, updatedAt: new Date() }).where(eq(tasks.id, task.id)),
        activityInsert(q, { projectId: task.projectId, taskId: task.id, actorId: user.id, type: "task_updated", payload: { taskKey: key, taskTitle: task.title, field: "dueDate", to: due.value } }),
      ]);
    } else {
      return { error: t(dict.common.error) };
    }

    revalidateAll();
    return { ok: true, message: t(dict.task.saved) };
  });
}

/** Board drag and drop: new column and position. */
export async function moveTaskAction(taskId: string, status: string, position: number): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const task = await loadVisibleTask(user, taskId);
    if (!task) return { error: t(dict.common.notFound) };
    if (!canMoveTask(user, task, task.project)) return { error: t(dict.common.forbidden) };
    if (!isStatus(status) || !Number.isFinite(position)) return { error: t(dict.common.error) };
    if (!canSetStatus(user, task.project, task.status, status)) return { error: t(dict.task.completeLocked) };

    const changed = status !== task.status;
    const effects = changed ? statusEffects(user, task, task.title, status) : { activities: [], notes: [] };
    const audience = changed ? await whoCanSee(task.project, task.assigneeIds, effects.notes.map((n) => n.userId)) : new Set<string>();
    await atomic((q) =>
      compact([
        q
          .update(tasks)
          .set({ status, position, completedAt: status === "done" ? (task.completedAt ?? new Date()) : null, updatedAt: new Date() })
          .where(eq(tasks.id, task.id)),
        ...effects.activities.map((a) => activityInsert(q, a)),
        notificationsInsert(q, forAudience(effects.notes, audience)),
      ])
    );
    revalidateAll();
    return { ok: true };
  });
}

export async function deleteTaskAction(taskId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const task = await loadVisibleTask(user, taskId);
    if (!task) return { error: t(dict.common.notFound) };
    if (!canDeleteTask(user, task, task.project)) return { error: t(dict.common.forbidden) };
    // The audience keeps the entry hidden from employees who could not see the task.
    const audience = task.assigneeIds.length > 0 ? { audienceIds: task.assigneeIds } : { audience: "general" };
    await atomic((q) => [
      activityInsert(q, { projectId: task.projectId, taskId: null, actorId: user.id, type: "task_deleted", payload: { taskKey: taskKeyOf(task), taskTitle: task.title, ...audience } }),
      q.delete(tasks).where(eq(tasks.id, task.id)),
    ]);
    revalidateAll();
    return { ok: true, id: task.projectId, message: t(dict.task.deleted) };
  });
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */
async function loadChecklistItem(itemId: string) {
  if (!isUuid(itemId)) return null;
  const db = await getDb();
  return db.query.checklistItems.findFirst({ where: eq(checklistItems.id, itemId) });
}

export async function addChecklistItemAction(taskId: string, title: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const task = await loadVisibleTask(user, taskId);
    if (!task) return { error: t(dict.common.notFound) };
    if (!canEditTask(user, task, task.project)) return { error: t(dict.common.forbidden) };
    const clean = clip(title.trim(), 200);
    if (!clean) return { error: t(dict.common.required) };
    await atomic((q) => [
      q.insert(checklistItems).values({
        taskId: task.id,
        title: clean,
        position: sql`(select coalesce(max(${checklistItems.position}), 0) + 1 from ${checklistItems} where ${checklistItems.taskId} = ${task.id})`,
      }),
      q.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, task.id)),
    ]);
    revalidateAll();
    return { ok: true };
  });
}

export async function toggleChecklistItemAction(itemId: string, done: boolean): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const item = await loadChecklistItem(itemId);
    if (!item) return { error: t(dict.common.notFound) };
    const db = await getDb();
    const [task, open] = await Promise.all([
      loadVisibleTask(user, item.taskId),
      db.select({ id: checklistItems.id }).from(checklistItems).where(and(eq(checklistItems.taskId, item.taskId), eq(checklistItems.done, false), ne(checklistItems.id, item.id))),
    ]);
    if (!task) return { error: t(dict.common.notFound) };
    if (!canMoveTask(user, task, task.project)) return { error: t(dict.common.forbidden) };
    const completesList = done && !item.done && open.length === 0;
    await atomic((q) =>
      compact([
        q.update(checklistItems).set({ done: !!done }).where(eq(checklistItems.id, item.id)),
        q.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, task.id)),
        completesList && activityInsert(q, { projectId: task.projectId, taskId: task.id, actorId: user.id, type: "checklist_completed", payload: { taskKey: taskKeyOf(task), taskTitle: task.title } }),
      ])
    );
    revalidateAll();
    return { ok: true };
  });
}

export async function deleteChecklistItemAction(itemId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const item = await loadChecklistItem(itemId);
    if (!item) return { error: t(dict.common.notFound) };
    const task = await loadVisibleTask(user, item.taskId);
    if (!task) return { error: t(dict.common.notFound) };
    if (!canEditTask(user, task, task.project)) return { error: t(dict.common.forbidden) };
    await atomic((q) => [q.delete(checklistItems).where(eq(checklistItems.id, item.id)), q.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, task.id))]);
    revalidateAll();
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */
export async function addCommentAction(taskId: string, body: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const task = await loadVisibleTask(user, taskId);
    if (!task) return { error: t(dict.common.notFound) };
    const clean = clip(body.trim(), 5000);
    if (!clean) return { error: t(dict.common.required) };

    // Everyone in the thread, the creator and the assignees hear about it, as long as they can still open the task.
    const db = await getDb();
    const participants = await db.selectDistinct({ id: comments.authorId }).from(comments).where(eq(comments.taskId, task.id));
    const candidates = [...task.assigneeIds, task.creatorId, ...participants.map((p) => p.id)];
    const audience = await whoCanSee(task.project, task.assigneeIds, candidates);
    const payload = { taskKey: taskKeyOf(task), taskTitle: task.title };
    const href = taskHref(task.projectId, task.id);

    await atomic((q) =>
      compact([
        q.insert(comments).values({ taskId: task.id, authorId: user.id, body: clean }),
        activityInsert(q, { projectId: task.projectId, taskId: task.id, actorId: user.id, type: "comment_added", payload }),
        notificationsInsert(
          q,
          candidates.filter((id): id is string => !!id && audience.has(id)).map((id) => ({ userId: id, actorId: user.id, type: "comment_added", payload: { ...payload, excerpt: clip(clean, 120) }, href }))
        ),
      ])
    );
    revalidateAll();
    return { ok: true };
  });
}

export async function deleteCommentAction(commentId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    if (!isUuid(commentId)) return { error: t(dict.common.notFound) };
    const db = await getDb();
    const comment = await db.query.comments.findFirst({ where: eq(comments.id, commentId) });
    if (!comment) return { error: t(dict.common.notFound) };
    const task = await loadVisibleTask(user, comment.taskId);
    if (!task) return { error: t(dict.common.notFound) };
    if (comment.authorId !== user.id && user.role !== "admin") return { error: t(dict.common.forbidden) };
    await db.delete(comments).where(eq(comments.id, comment.id));
    revalidateAll();
    return { ok: true };
  });
}
