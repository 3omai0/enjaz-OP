import type { Project, SafeUser, Task, TaskStatus, UserRole } from "@/db/schema";

type Actor = Pick<SafeUser, "id" | "role">;
type Visibility = Pick<Project, "taskVisibility">;
/** The people a task is assigned to; none means a general task for every member of the project. */
type Assigned = { assigneeIds: readonly string[] };
type TaskRef = Assigned & Pick<Task, "creatorId">;

export const isAssignee = (u: Pick<Actor, "id">, task: Assigned) => task.assigneeIds.includes(u.id);
export const isGeneralTask = (task: Assigned) => task.assigneeIds.length === 0;

/** Admins and project managers run the workspace; members work inside their projects. */
export const isStaff = (role: UserRole) => role === "admin" || role === "manager";

export const canManageTeam = (u: Actor) => u.role === "admin";
export const canCreateProject = (u: Actor) => isStaff(u.role);
export const canEditProject = (u: Actor, project: Pick<Project, "ownerId">) => isStaff(u.role) || project.ownerId === u.id;
export const canDeleteProject = (u: Actor, project: Pick<Project, "ownerId">) => u.role === "admin" || project.ownerId === u.id;
/** Only an administrator or the current owner may hand a project to someone else. */
export const canTransferProject = (u: Actor, project: Pick<Project, "ownerId">) => u.role === "admin" || project.ownerId === u.id;
export const canManageMembers = (u: Actor) => isStaff(u.role);
export const canManageLabels = (u: Actor) => isStaff(u.role);
/** A team project's labels are managed by staff; the categories of a personal space by its owner only. */
export const canManageProjectLabels = (u: Actor, project: Pick<Project, "personalOwnerId">) => (project.personalOwnerId ? project.personalOwnerId === u.id : canManageLabels(u));

/** Whether the user sees every task of the project or only their own and the general ones. */
export const canSeeAllTasks = (u: Actor, project: Visibility) => isStaff(u.role) || project.taskVisibility === "all";

/**
 * The single visibility rule every read and write goes through (project
 * membership is checked separately): staff see everything, members see the
 * tasks assigned to them and general tasks, or every task when the project allows it.
 */
export const canSeeTask = (u: Actor, task: Assigned, project: Visibility) => canSeeAllTasks(u, project) || isGeneralTask(task) || isAssignee(u, task);

export const canAssignOthers = (u: Actor) => isStaff(u.role);

/** Edit title, details, dates, assignees and labels. Creators keep this right only while they can still see the task. */
export const canEditTask = (u: Actor, task: TaskRef, project: Visibility) =>
  isStaff(u.role) || isAssignee(u, task) || (task.creatorId === u.id && canSeeTask(u, task, project));

/** Change status and tick checklist items: tasks assigned to them, general tasks, and tasks they created and can still see. */
export const canMoveTask = (u: Actor, task: TaskRef, project: Visibility) =>
  isStaff(u.role) || isAssignee(u, task) || isGeneralTask(task) || (task.creatorId === u.id && canSeeTask(u, task, project));

export const canDeleteTask = (u: Actor, task: TaskRef, project: Visibility) => isStaff(u.role) || (task.creatorId === u.id && canSeeTask(u, task, project));

/**
 * Marking a task as done. When the project requires approval, employees send
 * their work to review and an administrator or project manager completes it.
 */
export const canCompleteTask = (u: Actor, project: Pick<Project, "requireApproval">) => isStaff(u.role) || !project.requireApproval;

/**
 * A status change that needs approval rights: moving a task into Done, or out
 * of it once approved. Personal tasks have nobody to review them, so they
 * never go into review.
 */
export const canSetStatus = (u: Actor, project: Pick<Project, "requireApproval"> & { personalOwnerId?: string | null }, from: TaskStatus, to: TaskStatus) =>
  from === to || (!(project.personalOwnerId && to === "in_review") && (canCompleteTask(u, project) || (from !== "done" && to !== "done")));
