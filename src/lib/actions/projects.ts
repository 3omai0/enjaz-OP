"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { atomic, getDb } from "@/db";
import { labels, projectMembers, projects, taskAssignees, tasks, users, PROJECT_STATUSES, type ProjectStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { LABEL_COLORS, PROJECT_COLORS } from "@/lib/constants";
import { isValidDateOnly } from "@/lib/format";
import { fill, type Lang } from "@/lib/i18n";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canCreateProject, canDeleteProject, canEditProject, canManageMembers, canManageProjectLabels, canTransferProject } from "@/lib/permissions";
import { assignedTo, getAccessibleProject } from "@/lib/queries/access";
import { takenProjectKeys } from "@/lib/queries/projects";
import { projectHref } from "@/lib/routes";
import { clip, isUuid, suggestProjectKey, wellFormed } from "@/lib/utils";
import { activityInsert, compact, guard, isUniqueViolation, notificationsInsert, revalidateAll } from "./helpers";
import { optStr, str, type ActionState } from "./types";

const keySchema = z.string().regex(/^[A-Z0-9]{2,6}$/);

/** The most people added to a project in one step. */
const MAX_NEW_MEMBERS = 200;

/** Ids posted by a form or a client call: unique, in the order given. */
const uniqueIds = (values: unknown[]) => [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];

/** "Sara and Fahad" in the reader's language. */
const joinNames = (names: string[], lang: Lang) => new Intl.ListFormat(lang === "ar" ? "ar" : "en", { style: "long", type: "conjunction" }).format(names);

/**
 * Active people among the given ids, in the order given. Returns null when an
 * id is malformed or the list is too long.
 */
async function activePeople(ids: string[]): Promise<Array<{ id: string; name: string }> | null> {
  if (ids.length > MAX_NEW_MEMBERS || ids.some((id) => !isUuid(id))) return null;
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(and(inArray(users.id, ids), eq(users.isActive, true)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is { id: string; name: string } => !!r);
}
const isProjectStatus = (v: string): v is ProjectStatus => (PROJECT_STATUSES as readonly string[]).includes(v);

/** "" means no date; anything else must be a real calendar date. */
function parseDate(raw: string | null): { ok: true; value: string | null } | { ok: false } {
  if (!raw) return { ok: true, value: null };
  return isValidDateOnly(raw) ? { ok: true, value: raw } : { ok: false };
}

/** Candidate keys for a base: QA, QA2 to QA9, then QA10 to QA99. All share the first four letters. */
function keyCandidates(base: string) {
  const list = [base];
  for (let i = 2; i <= 9; i++) list.push(`${base.slice(0, 5)}${i}`);
  for (let i = 10; i <= 99; i++) list.push(`${base.slice(0, 4)}${i}`);
  return list;
}

/** First free key for a base, found with a single query. */
async function freeKey(base: string, skip: Set<string> = new Set()) {
  const taken = await takenProjectKeys(base.slice(0, 4));
  return keyCandidates(base).find((k) => !taken.has(k) && !skip.has(k)) ?? null;
}

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    if (!canCreateProject(user)) return { error: t(dict.common.forbidden) };

    const name = clip(str(formData, "name"), 120);
    if (name.length < 2) return { fieldErrors: { name: t(dict.common.required) } };
    const rawKey = str(formData, "key").toUpperCase();
    if (rawKey && !keySchema.safeParse(rawKey).success) return { fieldErrors: { key: t(dict.projects.keyFormat) } };

    const color = str(formData, "color");
    const status = str(formData, "status");
    const start = parseDate(optStr(formData, "startDate"));
    if (!start.ok) return { fieldErrors: { startDate: t(dict.common.invalidDate) } };
    const due = parseDate(optStr(formData, "dueDate"));
    if (!due.ok) return { fieldErrors: { dueDate: t(dict.common.invalidDate) } };

    // Who can see the project besides its creator (administrators and project managers see every project).
    const people = await activePeople(uniqueIds(formData.getAll("memberIds")).filter((id) => id !== user.id));
    if (!people) return { fieldErrors: { memberIds: t(dict.common.error) } };

    if (rawKey && (await takenProjectKeys(rawKey)).has(rawKey)) return { fieldErrors: { key: t(dict.projects.keyExists) } };
    const base = suggestProjectKey(name);
    const tried = new Set<string>();
    // A typed key must be free; a suggested one moves on to the next free
    // variant, also when someone takes it between the check and the insert.
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = rawKey || (await freeKey(base, tried));
      if (!key) return { fieldErrors: { key: t(dict.projects.keyExists) } };
      tried.add(key);

      const id = crypto.randomUUID();
      try {
        await atomic((q) =>
          compact([
            q.insert(projects).values({
              id,
              name,
              key,
              description: optStr(formData, "description", 2000),
              color: PROJECT_COLORS.includes(color) ? color : PROJECT_COLORS[0],
              status: isProjectStatus(status) ? status : "active",
              startDate: start.value,
              dueDate: due.value,
              ownerId: user.id,
            }),
            // The creator is always a member (as lead) so the project shows up for them.
            q.insert(projectMembers).values([{ projectId: id, userId: user.id, role: "lead" }, ...people.map((p) => ({ projectId: id, userId: p.id }))]),
            activityInsert(q, { projectId: id, actorId: user.id, type: "project_created", payload: { projectName: name, projectKey: key } }),
            ...people.map((p) => activityInsert(q, { projectId: id, actorId: user.id, type: "member_added", payload: { memberName: p.name, memberId: p.id, projectName: name } })),
            notificationsInsert(
              q,
              people.map((p) => ({ userId: p.id, actorId: user.id, type: "added_to_project", payload: { projectName: name, projectKey: key }, href: projectHref(id) }))
            ),
          ])
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          if (rawKey) return { fieldErrors: { key: t(dict.projects.keyExists) } };
          continue;
        }
        throw err;
      }
      revalidateAll();
      return { ok: true, id, message: t(dict.projects.created) };
    }
    return { fieldErrors: { key: t(dict.projects.keyExists) } };
  });
}

export async function updateProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const project = await getAccessibleProject(user, str(formData, "projectId"));
    if (!project || project.personalOwnerId) return { error: t(dict.common.notFound) };
    if (!canEditProject(user, project)) return { error: t(dict.common.forbidden) };

    const name = clip(str(formData, "name"), 120);
    if (name.length < 2) return { fieldErrors: { name: t(dict.common.required) } };
    const key = str(formData, "key").toUpperCase();
    if (!keySchema.safeParse(key).success) return { fieldErrors: { key: t(dict.projects.keyFormat) } };
    if (key !== project.key.toUpperCase() && (await takenProjectKeys(key, project.id)).has(key)) return { fieldErrors: { key: t(dict.projects.keyExists) } };

    const color = str(formData, "color");
    const status = str(formData, "status");
    const start = parseDate(optStr(formData, "startDate"));
    if (!start.ok) return { fieldErrors: { startDate: t(dict.common.invalidDate) } };
    const due = parseDate(optStr(formData, "dueDate"));
    if (!due.ok) return { fieldErrors: { dueDate: t(dict.common.invalidDate) } };
    const visibility = str(formData, "taskVisibility") === "all" ? "all" : "assigned";
    const approvalRaw = str(formData, "requireApproval");
    const requireApproval = approvalRaw ? approvalRaw === "true" : project.requireApproval;

    // Ownership only moves when an administrator or the current owner asks,
    // and only to an active member of the project.
    const ownerRaw = str(formData, "ownerId");
    let newOwner: { id: string; name: string } | null = null;
    if (ownerRaw && ownerRaw !== project.ownerId) {
      if (!canTransferProject(user, project)) return { fieldErrors: { ownerId: t(dict.projects.ownerLocked) } };
      const db = await getDb();
      const [candidate] = isUuid(ownerRaw)
        ? await db
            .select({ id: users.id, name: users.name })
            .from(projectMembers)
            .innerJoin(users, eq(users.id, projectMembers.userId))
            .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, ownerRaw), eq(users.isActive, true)))
        : [];
      if (!candidate) return { fieldErrors: { ownerId: t(dict.projects.ownerMustBeMember) } };
      newOwner = candidate;
    }

    const nextStatus = isProjectStatus(status) ? status : project.status;
    try {
      await atomic((q) =>
        compact([
          q
            .update(projects)
            .set({
              name,
              key,
              description: optStr(formData, "description", 2000),
              color: PROJECT_COLORS.includes(color) ? color : project.color,
              status: nextStatus,
              startDate: start.value,
              dueDate: due.value,
              taskVisibility: visibility,
              requireApproval,
              ownerId: newOwner?.id ?? project.ownerId,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, project.id)),
          activityInsert(q, { projectId: project.id, actorId: user.id, type: nextStatus === "archived" && project.status !== "archived" ? "project_archived" : "project_updated", payload: { projectName: name, projectKey: key } }),
          newOwner && activityInsert(q, { projectId: project.id, actorId: user.id, type: "owner_changed", payload: { memberName: newOwner.name, memberId: newOwner.id, projectName: name } }),
        ])
      );
    } catch (err) {
      if (isUniqueViolation(err)) return { fieldErrors: { key: t(dict.projects.keyExists) } };
      throw err;
    }
    revalidateAll();
    return { ok: true, message: t(dict.projects.updated) };
  });
}

export async function setProjectStatusAction(projectId: string, status: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const project = await getAccessibleProject(user, projectId);
    if (!project || project.personalOwnerId) return { error: t(dict.common.notFound) };
    if (!canEditProject(user, project)) return { error: t(dict.common.forbidden) };
    if (!isProjectStatus(status)) return { error: t(dict.common.error) };
    await atomic((q) => [
      q.update(projects).set({ status, updatedAt: new Date() }).where(eq(projects.id, project.id)),
      activityInsert(q, { projectId: project.id, actorId: user.id, type: status === "archived" ? "project_archived" : "project_updated", payload: { projectName: project.name, projectKey: project.key, status } }),
    ]);
    revalidateAll();
    return { ok: true, message: t(dict.projects.updated) };
  });
}

export async function deleteProjectAction(projectId: string, confirmKey: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const project = await getAccessibleProject(user, projectId);
    if (!project || project.personalOwnerId) return { error: t(dict.common.notFound) };
    if (!canDeleteProject(user, project)) return { error: t(dict.common.forbidden) };
    if (confirmKey.trim().toUpperCase() !== project.key.toUpperCase()) return { error: t(dict.project.deleteTyped) };
    const db = await getDb();
    await db.delete(projects).where(eq(projects.id, project.id));
    revalidateAll();
    redirect("/projects");
  });
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */
/** Add one or more people to a project; everyone added is notified. */
export async function addMembersAction(projectId: string, userIds: string[]): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t, lang } = await getT();
    const project = await getAccessibleProject(user, projectId);
    if (!project || project.personalOwnerId) return { error: t(dict.common.notFound) };
    if (!canManageMembers(user)) return { error: t(dict.common.forbidden) };
    if (!Array.isArray(userIds)) return { error: t(dict.common.error) };
    const people = await activePeople(uniqueIds(userIds));
    if (!people || people.length === 0) return { error: t(dict.common.notFound) };

    const db = await getDb();
    const existing = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, project.id),
          inArray(
            projectMembers.userId,
            people.map((p) => p.id)
          )
        )
      );
    const already = new Set(existing.map((r) => r.userId));
    // People who are already members (a double click, or two managers at once) are not logged or announced again.
    const fresh = people.filter((p) => !already.has(p.id));
    if (fresh.length > 0) {
      await atomic((q) =>
        compact([
          q
            .insert(projectMembers)
            .values(fresh.map((p) => ({ projectId: project.id, userId: p.id })))
            .onConflictDoNothing(),
          ...fresh.map((p) => activityInsert(q, { projectId: project.id, actorId: user.id, type: "member_added", payload: { memberName: p.name, memberId: p.id, projectName: project.name } })),
          notificationsInsert(
            q,
            fresh.map((p) => ({ userId: p.id, actorId: user.id, type: "added_to_project", payload: { projectName: project.name, projectKey: project.key }, href: projectHref(project.id) }))
          ),
        ])
      );
      revalidateAll();
    }
    return { ok: true, message: fill(t(dict.project.membersAdded), { names: joinNames(people.map((p) => p.name), lang) }) };
  });
}

export async function removeMemberAction(projectId: string, userId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const project = await getAccessibleProject(user, projectId);
    if (!project || project.personalOwnerId) return { error: t(dict.common.notFound) };
    if (!canManageMembers(user)) return { error: t(dict.common.forbidden) };
    if (!isUuid(userId)) return { error: t(dict.common.notFound) };
    if (userId === project.ownerId) return { error: t(dict.common.forbidden) };

    const db = await getDb();
    const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, name: true } });
    if (!target) return { error: t(dict.common.notFound) };
    await atomic((q) =>
      compact([
        q.delete(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, target.id))),
        // They come off every task here; a task that was theirs alone becomes general, so nothing is lost.
        q.update(tasks).set({ updatedAt: new Date() }).where(and(eq(tasks.projectId, project.id), assignedTo(target.id))),
        q.delete(taskAssignees).where(and(eq(taskAssignees.userId, target.id), inArray(taskAssignees.taskId, q.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, project.id))))),
        activityInsert(q, { projectId: project.id, actorId: user.id, type: "member_removed", payload: { memberName: target.name, memberId: target.id, projectName: project.name } }),
        notificationsInsert(q, [{ userId: target.id, actorId: user.id, type: "removed_from_project", payload: { projectName: project.name, projectKey: project.key }, href: "/projects" }]),
      ])
    );
    revalidateAll();
    return { ok: true, message: t(dict.project.memberRemoved) };
  });
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */
export async function createLabelAction(projectId: string, name: string, color: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    const project = await getAccessibleProject(user, projectId);
    if (!project) return { error: t(dict.common.notFound) };
    if (!canManageProjectLabels(user, project)) return { error: t(dict.common.forbidden) };
    const clean = wellFormed(name).trim();
    if (clean.length < 1 || clean.length > 30) return { error: t(dict.common.required) };
    const id = crypto.randomUUID();
    await atomic((q) => [
      q.insert(labels).values({ id, projectId: project.id, name: clean, color: LABEL_COLORS.includes(color) ? color : LABEL_COLORS[0] }),
      activityInsert(q, { projectId: project.id, actorId: user.id, type: "label_created", payload: { labelName: clean } }),
    ]);
    revalidateAll();
    return { ok: true, id };
  });
}

export async function deleteLabelAction(labelId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const { t } = await getT();
    if (!isUuid(labelId)) return { error: t(dict.common.notFound) };
    const db = await getDb();
    const label = await db.query.labels.findFirst({ where: eq(labels.id, labelId) });
    // Only labels of a project the user may open, which keeps personal categories to their owner.
    const project = label ? await getAccessibleProject(user, label.projectId) : null;
    if (!label || !project) return { error: t(dict.common.notFound) };
    if (!canManageProjectLabels(user, project)) return { error: t(dict.common.forbidden) };
    await db.delete(labels).where(eq(labels.id, labelId));
    revalidateAll();
    return { ok: true };
  });
}
