"use server";

import { and, eq, inArray } from "drizzle-orm";
import { atomic, getDb } from "@/db";
import { labels, recurringTasks, RECURRENCES, TASK_PRIORITIES, users, type Recurrence, type TaskPriority } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canAssignOthers } from "@/lib/permissions";
import { getAccessibleProject } from "@/lib/queries/access";
import { getPersonalProject } from "@/lib/queries/personal";
import { fireDueRecurringTasks } from "@/lib/queries/recurring";
import { clockToMinutes, nextOccurrence, validRule, type Rule } from "@/lib/recurrence";
import { clip, isUuid } from "@/lib/utils";
import { activityInsert, guard, revalidateAll } from "./helpers";
import { optStr, str, type ActionState } from "./types";

const isRecurrence = (v: string): v is Recurrence => (RECURRENCES as readonly string[]).includes(v);
const isPriority = (v: string): v is TaskPriority => (TASK_PRIORITIES as readonly string[]).includes(v);

/** The target project: "personal" means the user's own space, anything else a project they may open. */
async function targetProject(user: Awaited<ReturnType<typeof requireUser>>, raw: string) {
  if (raw === "personal") return getPersonalProject(user.id, user.locale);
  return getAccessibleProject(user, raw);
}

/**
 * Who may manage a project's schedules: in a personal space its owner; in a
 * team project anyone who can assign to others (administrators and project
 * managers), or the project owner.
 */
const canManageSchedules = (user: { id: string; role: "admin" | "manager" | "member" }, project: { ownerId: string; personalOwnerId: string | null }) =>
  project.personalOwnerId ? project.personalOwnerId === user.id : canAssignOthers(user) || project.ownerId === user.id;

/** Reads and checks the rule part of the form. */
function parseRule(formData: FormData): { ok: true; rule: Rule } | { ok: false; field: string } {
  const recurrence = str(formData, "recurrence");
  if (!isRecurrence(recurrence)) return { ok: false, field: "recurrence" };
  const minuteOfDay = clockToMinutes(str(formData, "time"));
  if (minuteOfDay === null) return { ok: false, field: "time" };
  const weekdays = [...new Set(formData.getAll("weekdays").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  const dayOfMonth = str(formData, "dayOfMonth") ? Number(str(formData, "dayOfMonth")) : null;
  const month = str(formData, "month") ? Number(str(formData, "month")) : null;
  const rule: Rule = {
    recurrence,
    minuteOfDay,
    weekdays: recurrence === "weekly" ? weekdays : [],
    dayOfMonth: recurrence === "monthly" || recurrence === "yearly" ? dayOfMonth : null,
    month: recurrence === "yearly" ? month : null,
  };
  if (!validRule(rule)) return { ok: false, field: recurrence === "weekly" ? "weekdays" : recurrence === "yearly" ? "month" : "dayOfMonth" };
  return { ok: true, rule };
}

export async function saveRecurringTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const id = str(formData, "id");
    const db = await getDb();
    const existing = id ? (isUuid(id) ? await db.query.recurringTasks.findFirst({ where: eq(recurringTasks.id, id) }) : null) : null;
    if (id && !existing) return { error: t(dict.common.notFound) };

    const project = await targetProject(user, existing ? existing.projectId : str(formData, "projectId"));
    if (!project) return { error: t(dict.common.notFound) };
    if (!canManageSchedules(user, project)) return { error: t(dict.common.forbidden) };

    const title = clip(str(formData, "title"), 300);
    const fieldErrors: Record<string, string> = {};
    if (title.length < 2) fieldErrors.title = t(dict.common.required);
    const rawPriority = str(formData, "priority") || "medium";
    const priority: TaskPriority = isPriority(rawPriority) ? rawPriority : "medium";
    if (!isPriority(rawPriority)) fieldErrors.priority = t(dict.common.required);
    const parsed = parseRule(formData);
    if (!parsed.ok) fieldErrors[parsed.field] = parsed.field === "weekdays" ? t(dict.recurring.weekdaysRequired) : t(dict.recurring.invalidRule);
    if (Object.keys(fieldErrors).length || !parsed.ok) return { fieldErrors };
    const { rule } = parsed;

    // People: only active members of the project (a personal space has nobody to pick).
    let assigneeIds: string[] = [];
    if (!project.personalOwnerId) {
      const requested = [...new Set(formData.getAll("assigneeIds").map(String).filter(isUuid))];
      if (requested.length > 0) {
        const members = await db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, requested), eq(users.isActive, true)));
        assigneeIds = members.map((m) => m.id);
        if (!canAssignOthers(user) && assigneeIds.some((a) => a !== user.id)) return { fieldErrors: { assigneeIds: t(dict.task.assignSelfOnly) } };
      }
    }
    const requestedLabels = [...new Set(formData.getAll("labelIds").map(String).filter(isUuid))];
    const labelIds = requestedLabels.length ? (await db.select({ id: labels.id }).from(labels).where(and(eq(labels.projectId, project.id), inArray(labels.id, requestedLabels)))).map((l) => l.id) : [];

    const now = new Date();
    const values = {
      title,
      description: optStr(formData, "description", 20_000),
      priority,
      assigneeIds,
      labelIds,
      recurrence: rule.recurrence,
      minuteOfDay: rule.minuteOfDay,
      weekdays: rule.weekdays,
      dayOfMonth: rule.dayOfMonth,
      month: rule.month,
      nextAt: nextOccurrence(rule, now),
      updatedAt: now,
    };
    const payload = { taskTitle: title };
    if (existing) {
      await atomic((q) => [
        q.update(recurringTasks).set(values).where(eq(recurringTasks.id, existing.id)),
        activityInsert(q, { projectId: project.id, actorId: user.id, type: "recurring_updated", payload }),
      ]);
    } else {
      const newId = crypto.randomUUID();
      await atomic((q) => [
        q.insert(recurringTasks).values({ id: newId, projectId: project.id, createdBy: user.id, enabled: true, ...values }),
        activityInsert(q, { projectId: project.id, actorId: user.id, type: "recurring_created", payload }),
      ]);
    }
    revalidateAll();
    return { ok: true, message: t(dict.recurring.saved) };
  });
}

/** Loads a schedule the user may manage, or null. */
async function manageable(user: Awaited<ReturnType<typeof requireUser>>, id: string) {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const schedule = await db.query.recurringTasks.findFirst({ where: eq(recurringTasks.id, id) });
  if (!schedule) return null;
  const project = await getAccessibleProject(user, schedule.projectId);
  if (!project || !canManageSchedules(user, project)) return null;
  return { schedule, project };
}

export async function setRecurringEnabledAction(id: string, enabled: boolean): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const found = await manageable(user, id);
    if (!found) return { error: t(dict.common.notFound) };
    const { schedule } = found;
    const now = new Date();
    const rule: Rule = { recurrence: schedule.recurrence, minuteOfDay: schedule.minuteOfDay, weekdays: schedule.weekdays, dayOfMonth: schedule.dayOfMonth, month: schedule.month };
    const db = await getDb();
    // Resuming restarts from the next future time, so a long pause never fires a stale one.
    await db
      .update(recurringTasks)
      .set({ enabled: !!enabled, updatedAt: now, ...(enabled ? { nextAt: nextOccurrence(rule, now) } : {}) })
      .where(eq(recurringTasks.id, schedule.id));
    revalidateAll();
    return { ok: true };
  });
}

export async function deleteRecurringTaskAction(id: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const found = await manageable(user, id);
    if (!found) return { error: t(dict.common.notFound) };
    await atomic((q) => [
      q.delete(recurringTasks).where(eq(recurringTasks.id, found.schedule.id)),
      activityInsert(q, { projectId: found.project.id, actorId: user.id, type: "recurring_deleted", payload: { taskTitle: found.schedule.title } }),
    ]);
    revalidateAll();
    return { ok: true, message: t(dict.recurring.deleted) };
  });
}

/** Creates the schedule's task right now (its next time stays as it is). */
export async function runRecurringNowAction(id: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const found = await manageable(user, id);
    if (!found) return { error: t(dict.common.notFound) };
    const db = await getDb();
    // Bring the schedule due, fire it, then put its real next time back.
    const { schedule } = found;
    const keep = schedule.nextAt;
    await db.update(recurringTasks).set({ nextAt: new Date(Date.now() - 1000), enabled: true }).where(eq(recurringTasks.id, schedule.id));
    const result = await fireDueRecurringTasks();
    await db.update(recurringTasks).set({ nextAt: keep, enabled: schedule.enabled }).where(eq(recurringTasks.id, schedule.id));
    revalidateAll();
    return result.created > 0 ? { ok: true, message: t(dict.recurring.created) } : { error: t(dict.common.error) };
  });
}

