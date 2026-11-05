import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { PROJECT_STATUSES, projects, TASK_PRIORITIES, TASK_STATUSES, tasks, users, type Project, type SafeUser, type TaskPriority, type TaskStatus } from "@/db/schema";
import { markAllReadAction } from "@/lib/actions/notifications";
import { addMembersAction, createProjectAction } from "@/lib/actions/projects";
import { addChecklistItemAction, addCommentAction, createTaskAction, deleteTaskAction, setTaskFieldAction, toggleChecklistItemAction, updateTaskAction } from "@/lib/actions/tasks";
import type { ActionState } from "@/lib/actions/types";
import { runAsUser } from "@/lib/auth/acting";
import { PRIORITY_META, TASK_STATUS_META } from "@/lib/constants";
import { APP_TIME_ZONE, todayISO } from "@/lib/format";
import { DUE_FILTERS, type DueFilter } from "@/lib/my-tasks";
import { getAccessibleProject, loadVisibleTask, scopeProjectIds } from "@/lib/queries/access";
import { listNotifications } from "@/lib/queries/notifications";
import { getPersonalProject } from "@/lib/queries/personal";
import { getProjectLabels, getProjectMembers, getProjectStatusCounts, listProjectsForUser } from "@/lib/queries/projects";
import { getTaskDetail, listProjectTasks, listVisibleTasks, type TaskCard } from "@/lib/queries/tasks";
import { personalHref, projectHref, taskLink } from "@/lib/routes";
import { isUuid } from "@/lib/utils";

/*
 * The Injaz MCP server: the tools Claude can use, built per request for the
 * person behind the access token. Every change goes through the same server
 * actions as the web app (run as that person, see lib/auth/acting.ts), so the
 * permissions, notifications, activity log and validation are identical.
 * Tool texts are in English for the model; results carry the user's own data.
 */

/** A problem to report back to Claude as the tool's result, in words it can relay. */
class ToolError extends Error {}

const ROLE_MEANING: Record<SafeUser["role"], string> = {
  admin: "Administrator: can do everything, including managing the team.",
  manager: "Project manager: can create projects, add members, assign anyone and approve work.",
  member: "Employee: works in the projects they belong to, can only assign themselves, and sends work to review when approval is required.",
};

/** Form field names used by the actions, as the tool parameters call them. */
const FIELD_NAMES: Record<string, string> = {
  assigneeIds: "assignees",
  labelIds: "labels",
  dueDate: "due_date",
  startDate: "start_date",
  estimateHours: "estimate_hours",
  memberIds: "members",
};

/* ------------------------------------------------------------------ */
/* Running tools                                                       */
/* ------------------------------------------------------------------ */

const text = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

/** Runs a tool body as the person, turning known problems into readable results. */
async function run(user: SafeUser, body: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return text(await runAsUser(user, body));
  } catch (err) {
    if (err instanceof ToolError) return { ...text(err.message), isError: true };
    console.error("[mcp] tool failed", err);
    return { ...text("Something went wrong in Injaz. Try again in a moment."), isError: true };
  }
}

/** Next.js signals a redirect by throwing; after a successful change that only means "go elsewhere". */
const isRedirect = (err: unknown) => {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
};

/** Calls a server action and turns its error message (in the user's language) into a tool error. */
async function act(call: () => Promise<ActionState>): Promise<NonNullable<ActionState>> {
  let state: ActionState;
  try {
    state = await call();
  } catch (err) {
    if (isRedirect(err)) return { ok: true };
    throw err;
  }
  if (!state) return { ok: true };
  if (state.error) throw new ToolError(state.error);
  if (state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
    throw new ToolError(
      Object.entries(state.fieldErrors)
        .map(([field, message]) => `${FIELD_NAMES[field] ?? field}: ${message}`)
        .join("; ")
    );
  }
  return state;
}

function form(values: Record<string, string | number | string[] | null | undefined>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const v of value) fd.append(key, v);
    else fd.append(key, String(value));
  }
  return fd;
}

/* ------------------------------------------------------------------ */
/* Finding things by what the user says                                */
/* ------------------------------------------------------------------ */

/** Loose comparison for names typed in Arabic or English (hamza forms, taa marbuta, case, spaces). */
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");

/** The one item whose name matches: exact first, then partial. Several or none is reported back so Claude can ask. */
function pickOne<T>(list: T[], ref: string, names: (x: T) => string[], describe: (x: T) => string, what: string): T {
  const q = norm(ref);
  const exact = list.filter((x) => names(x).some((n) => norm(n) === q));
  if (exact.length === 1) return exact[0];
  const pool = exact.length > 1 ? exact : list.filter((x) => names(x).some((n) => norm(n).includes(q)));
  if (pool.length === 1) return pool[0];
  if (pool.length > 1) throw new ToolError(`More than one ${what} matches "${ref}": ${pool.slice(0, 10).map(describe).join("; ")}. Ask the user which one, or pass its id.`);
  const known = list.length > 0 ? ` Known: ${list.slice(0, 40).map(describe).join("; ")}.` : "";
  throw new ToolError(`No ${what} matches "${ref}".${known}`);
}

const PERSONAL = /^(personal|personal space|my personal (space|tasks)|شخصي|الشخصي|شخصية|مهامي الشخصية|المهام الشخصية|المساحة الشخصية|مساحتي)$/i;
const ME = /^(me|myself|أنا|انا|نفسي)$/i;

async function resolveProject(user: SafeUser, ref: string): Promise<Project> {
  const r = ref.trim();
  if (PERSONAL.test(r)) return getPersonalProject(user.id, user.locale);
  let id = r;
  const byId = isUuid(r as unknown);
  if (!byId) {
    const db = await getDb();
    const list = await db
      .select({ id: projects.id, name: projects.name, key: projects.key })
      .from(projects)
      .where(inArray(projects.id, scopeProjectIds(db, user, { includeArchived: true })))
      .orderBy(asc(projects.name));
    const byKey = list.find((p) => p.key.toUpperCase() === r.toUpperCase());
    id = (byKey ?? pickOne(list, r, (p) => [p.name], (p) => `${p.name} (${p.key})`, "project")).id;
  }
  const project = await getAccessibleProject(user, id);
  if (!project) throw new ToolError(`Project "${ref}" was not found or is not available to you.`);
  return project;
}

async function resolveTask(user: SafeUser, ref: string) {
  const r = ref.trim();
  let id: string | undefined;
  if (isUuid(r)) {
    id = r;
  } else {
    const db = await getDb();
    const personal = /^#(\d{1,9})$/.exec(r);
    const keyed = /^([A-Za-z0-9]{2,8})-(\d{1,9})$/.exec(r);
    if (personal) {
      const space = await db.query.projects.findFirst({ where: eq(projects.personalOwnerId, user.id), columns: { id: true } });
      if (space) id = (await db.query.tasks.findFirst({ where: and(eq(tasks.projectId, space.id), eq(tasks.number, Number(personal[1]))), columns: { id: true } }))?.id;
    } else if (keyed) {
      const [row] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(and(sql`upper(${projects.key}) = ${keyed[1].toUpperCase()}`, isNull(projects.personalOwnerId), eq(tasks.number, Number(keyed[2]))));
      id = row?.id;
    } else {
      throw new ToolError(`"${ref}" is not a task reference. Use the task key (for example OP-12, or #12 for a personal task) or the id from list_tasks.`);
    }
  }
  const task = id ? await loadVisibleTask(user, id) : null;
  if (!task) throw new ToolError(`Task "${ref}" was not found or is not visible to you.`);
  return task;
}

async function activePeople() {
  const db = await getDb();
  return db
    .select({ id: users.id, name: users.name, email: users.email, jobTitle: users.jobTitle, department: users.department, role: users.role })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.name));
}

/** People named by id, email, name (Arabic or English, partial is fine when unique) or "me". */
async function resolvePeople(user: SafeUser, refs: string[]): Promise<string[]> {
  if (refs.length === 0) return [];
  const everyone = await activePeople();
  const ids = refs.map((ref) => {
    const r = ref.trim();
    if (ME.test(r)) return user.id;
    const byId = isUuid(r as unknown);
    if (byId) {
      if (everyone.some((u) => u.id === r)) return r;
      throw new ToolError(`No active person has the id ${r}.`);
    }
    if (r.includes("@")) {
      const hit = everyone.find((u) => u.email.toLowerCase() === r.toLowerCase());
      if (hit) return hit.id;
      throw new ToolError(`No active person has the email ${r}.`);
    }
    return pickOne(everyone, r, (u) => [u.name], (u) => `${u.name} <${u.email}>`, "person").id;
  });
  return [...new Set(ids)];
}

async function resolveLabels(projectId: string, refs: string[]): Promise<string[]> {
  if (refs.length === 0) return [];
  const list = await getProjectLabels(projectId);
  if (list.length === 0) throw new ToolError("This project has no labels yet.");
  return [...new Set(refs.map((r) => (isUuid(r) && list.some((l) => l.id === r) ? r : pickOne(list, r, (l) => [l.name], (l) => l.name, "label").id)))];
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

const keyOf = (number: number, project: { key: string; personalOwnerId: string | null }) => (project.personalOwnerId ? `#${number}` : `${project.key}-${number}`);

const projectLabel = (project: { name: string; key: string; personalOwnerId: string | null }) => (project.personalOwnerId ? "Personal space" : `${project.name} (${project.key})`);

function cardOut(origin: string, t: TaskCard) {
  return {
    key: keyOf(t.number, t.project),
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_date: t.dueDate,
    assignees: t.assignees.length > 0 ? t.assignees.map((a) => a.name) : "general (everyone in the project)",
    labels: t.labels.length > 0 ? t.labels.map((l) => l.name) : undefined,
    project: projectLabel(t.project),
    checklist: t.checklistTotal > 0 ? `${t.checklistDone}/${t.checklistTotal}` : undefined,
    comments: t.commentCount > 0 ? t.commentCount : undefined,
    url: `${origin}${taskLink(t)}`,
  };
}

async function taskOut(user: SafeUser, origin: string, taskId: string) {
  const task = await getTaskDetail(user, taskId);
  if (!task) return null;
  return {
    key: keyOf(task.number, task.project),
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    start_date: task.startDate,
    due_date: task.dueDate,
    estimate_hours: task.estimateHours,
    completed_at: task.completedAt,
    project: { id: task.project.id, name: task.project.personalOwnerId ? "Personal space" : task.project.name, key: task.project.key, requires_approval: task.project.requireApproval },
    assignees: task.assignees.length > 0 ? task.assignees.map((a) => ({ id: a.user.id, name: a.user.name })) : "general (everyone in the project)",
    created_by: task.creator?.name ?? null,
    labels: task.taskLabels.map((tl) => tl.label.name),
    checklist: task.checklist.map((c) => ({ item_id: c.id, title: c.title, done: c.done })),
    comments: task.comments.slice(-20).map((c) => ({ by: c.author?.name ?? "former member", at: c.createdAt, text: c.body })),
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    url: `${origin}${taskLink(task)}`,
  };
}

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const statusEnum = z.enum(TASK_STATUSES as unknown as [TaskStatus, ...TaskStatus[]]);
const priorityEnum = z.enum(TASK_PRIORITIES as unknown as [TaskPriority, ...TaskPriority[]]);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const taskRef = z.string().min(1).describe("Task key such as OP-12 (personal tasks: #12), or the task id.");
const projectRef = z.string().min(1).describe('Project key (e.g. OP), name, id, or "personal" for the user\'s private space.');
const peopleRefs = z.array(z.string().min(1)).max(30);

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

export function buildMcpServer(user: SafeUser, origin: string): McpServer {
  const today = todayISO();
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: APP_TIME_ZONE }).format(new Date());
  const statusNames = TASK_STATUSES.map((s) => `${s} (${TASK_STATUS_META[s].label.ar})`).join(", ");
  const priorityNames = TASK_PRIORITIES.map((p) => `${p} (${PRIORITY_META[p].label.ar})`).join(", ");

  const server = new McpServer(
    { name: "injaz", title: "Injaz | إنجاز", version: "1.0.0", websiteUrl: origin },
    {
      instructions: [
        `Injaz (إنجاز) is the team's project and task management app. You act as ${user.name} (${user.role}) with exactly their permissions.`,
        `Today is ${weekday} ${today} in the team's time zone (${APP_TIME_ZONE}). Dates are YYYY-MM-DD; turn words like "tomorrow" or "next Thursday" into dates yourself.`,
        `Statuses: ${statusNames}. Priorities: ${priorityNames}.`,
        "Tasks are referred to by key (OP-12; personal tasks #12). Projects by key, name or id; \"personal\" is the user's private space for their own tasks.",
        "A task without assignees is a general task for everyone in its project.",
        "If the project for a new task is not clear, call list_projects and ask the user instead of guessing. Names of people may be given in Arabic or English; the tools match them and report when several people match.",
        "Employees can only assign themselves. When a project requires approval, only administrators and project managers mark tasks done; employees move them to in_review.",
        "After creating or changing something, tell the user the task key and share its link.",
      ].join("\n"),
    }
  );

  /* ---------------------------- Reading ---------------------------- */

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "The signed-in Injaz user (name, role and what it allows), today's date in the team's time zone, and the app's address.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      run(user, async () => ({
        name: user.name,
        email: user.email,
        role: user.role,
        role_meaning: ROLE_MEANING[user.role],
        job_title: user.jobTitle,
        department: user.department,
        language: user.locale,
        today,
        weekday,
        time_zone: APP_TIME_ZONE,
        app_url: origin,
        personal_space_url: `${origin}${personalHref}`,
      }))
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Team projects the user can open, with key, status, owner, members and task progress. The user's personal space is not listed; refer to it as \"personal\".",
      inputSchema: {
        query: z.string().optional().describe("Filter by project name or key."),
        include_archived: z.boolean().optional().describe("Also list archived projects. Default false."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ query, include_archived }) =>
      run(user, async () => {
        const list = await listProjectsForUser(user, { q: query, includeArchived: !!include_archived });
        return {
          projects: list.map((p) => ({
            id: p.id,
            key: p.key,
            name: p.name,
            status: p.status,
            owner: p.owner.name,
            due_date: p.dueDate,
            members: p.members.map((m) => m.name),
            tasks: { total: p.totalTasks, done: p.doneTasks, mine_open: p.myOpenTasks },
            url: `${origin}${projectHref(p.id)}`,
          })),
        };
      })
  );

  server.registerTool(
    "get_project",
    {
      title: "Project details",
      description: "One project's details: description, settings, members (for assigning), labels and task counts by status.",
      inputSchema: { project: projectRef },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ project }) =>
      run(user, async () => {
        const p = await resolveProject(user, project);
        const [members, labelRows, counts] = await Promise.all([getProjectMembers(p.id), getProjectLabels(p.id), getProjectStatusCounts(user, p)]);
        return {
          id: p.id,
          key: p.personalOwnerId ? null : p.key,
          name: p.personalOwnerId ? "Personal space" : p.name,
          description: p.description,
          status: p.status,
          start_date: p.startDate,
          due_date: p.dueDate,
          requires_approval: p.requireApproval,
          members_see: p.taskVisibility === "all" ? "every task" : "their own and general tasks",
          members: members.filter((m) => m.user.isActive).map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, job_title: m.user.jobTitle, project_role: m.role })),
          labels: labelRows.map((l) => l.name),
          tasks_by_status: counts,
          url: `${origin}${p.personalOwnerId ? personalHref : projectHref(p.id)}`,
        };
      })
  );

  server.registerTool(
    "list_people",
    {
      title: "List people",
      description: "Active people in the workspace (name, email, job title, role), to find who to assign or add to a project.",
      inputSchema: { query: z.string().optional().describe("Filter by name, email, job title or department.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ query }) =>
      run(user, async () => {
        const everyone = await activePeople();
        const q = query ? norm(query) : "";
        const shown = q ? everyone.filter((u) => [u.name, u.email, u.jobTitle ?? "", u.department ?? ""].some((v) => norm(v).includes(q))) : everyone;
        return { people: shown.map((u) => ({ id: u.id, name: u.name, email: u.email, job_title: u.jobTitle, department: u.department, role: u.role })) };
      })
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "Find tasks the user can see. Without a project it searches every team project (not the personal space; pass project \"personal\" for that). Defaults to open tasks. Use assignee \"me\" for the user's own tasks.",
      inputSchema: {
        project: projectRef.optional(),
        status: z.array(statusEnum).optional().describe("Only these statuses. Default: every status except done."),
        include_done: z.boolean().optional().describe("Include finished tasks when no status is given. Default false."),
        assignee: z.string().optional().describe('"me", "general" (no assignee), or a person\'s name, email or id.'),
        priority: priorityEnum.optional(),
        due: z.enum(DUE_FILTERS as unknown as [DueFilter, ...DueFilter[]]).optional().describe("overdue, today, week (next 7 days), month (next 30 days) or none (no due date)."),
        query: z.string().optional().describe("Text in the title, or a task key."),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      run(user, async () => {
        const limit = args.limit ?? 50;
        let assignee: string | undefined;
        if (args.assignee) {
          const a = args.assignee.trim();
          assignee = /^(general|عام|عامة)$/i.test(a) ? "general" : ME.test(a) ? "me" : (await resolvePeople(user, [a]))[0];
        }
        const openOnly = !args.status?.length && !args.include_done;
        let rows: TaskCard[];
        if (args.project) {
          const p = await resolveProject(user, args.project);
          rows = await listProjectTasks(user, p, { assignee, priority: args.priority, due: args.due, q: args.query });
          if (args.status?.length) rows = rows.filter((t) => args.status?.includes(t.status));
          else if (openOnly) rows = rows.filter((t) => t.status !== "done");
        } else {
          rows = await listVisibleTasks(user, { statuses: args.status, openOnly, assignee, priority: args.priority, due: args.due, q: args.query }, limit + 1);
        }
        return { count: Math.min(rows.length, limit), more: rows.length > limit, tasks: rows.slice(0, limit).map((t) => cardOut(origin, t)) };
      })
  );

  server.registerTool(
    "get_task",
    {
      title: "Task details",
      description: "Everything about one task: description, people, dates, labels, checklist (with item ids), latest comments and link.",
      inputSchema: { task: taskRef },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ task }) =>
      run(user, async () => {
        const found = await resolveTask(user, task);
        return taskOut(user, origin, found.id);
      })
  );

  server.registerTool(
    "list_notifications",
    {
      title: "Notifications",
      description: "The user's latest Injaz notifications (assignments, comments, status changes, review requests).",
      inputSchema: {
        unread_only: z.boolean().optional().describe("Default true."),
        limit: z.number().int().min(1).max(50).optional().describe("Default 20."),
        mark_all_read: z.boolean().optional().describe("Mark every notification as read after listing. Default false."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ unread_only, limit, mark_all_read }) =>
      run(user, async () => {
        const rows = await listNotifications(user.id, 50);
        const shown = (unread_only === false ? rows : rows.filter((n) => !n.readAt)).slice(0, limit ?? 20);
        if (mark_all_read) await markAllReadAction();
        return {
          notifications: shown.map((n) => ({ type: n.type, from: n.actor?.name ?? null, details: n.payload, at: n.createdAt, read: !!n.readAt, url: n.href ? `${origin}${n.href}` : null })),
          marked_read: !!mark_all_read,
        };
      })
  );

  /* ---------------------------- Tasks ---------------------------- */

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: `Create a task in a project (or in the personal space). Today is ${weekday} ${today}. With no assignees it becomes a general task for everyone in the project; assigned people are notified.`,
      inputSchema: {
        project: projectRef,
        title: z.string().min(2).max(300),
        description: z.string().max(20000).optional(),
        status: statusEnum.optional().describe("Default todo."),
        priority: priorityEnum.optional().describe("Default medium."),
        due_date: dateString.optional(),
        start_date: dateString.optional(),
        estimate_hours: z.number().min(0).max(10000).optional(),
        assignees: peopleRefs.optional().describe('People by name, email, id or "me". Ignored in the personal space.'),
        labels: z.array(z.string().min(1)).max(20).optional().describe("Label names of the project (see get_project)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      run(user, async () => {
        const project = await resolveProject(user, args.project);
        const [assigneeIds, labelIds] = await Promise.all([
          project.personalOwnerId ? Promise.resolve([]) : resolvePeople(user, args.assignees ?? []),
          resolveLabels(project.id, args.labels ?? []),
        ]);
        const state = await act(() =>
          createTaskAction(
            null,
            form({
              projectId: project.id,
              title: args.title,
              description: args.description,
              status: args.status ?? "todo",
              priority: args.priority ?? "medium",
              dueDate: args.due_date,
              startDate: args.start_date,
              estimateHours: args.estimate_hours,
              assigneeIds,
              labelIds,
            })
          )
        );
        const created = state.id ? await taskOut(user, origin, state.id) : null;
        return { created: true, message: state.message, task: created };
      })
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description:
        "Change a task: title, description, status, priority, dates, estimate, assignees or labels. Only the fields given change. Use status to move it (e.g. in_progress, in_review, done). An empty string clears description or dates.",
      inputSchema: {
        task: taskRef,
        title: z.string().min(2).max(300).optional(),
        description: z.string().max(20000).optional(),
        status: statusEnum.optional(),
        priority: priorityEnum.optional(),
        due_date: z.union([dateString, z.literal("")]).optional(),
        start_date: z.union([dateString, z.literal("")]).optional(),
        estimate_hours: z.number().min(0).max(10000).nullable().optional().describe("null clears it."),
        assignees: peopleRefs.optional().describe("Replace everyone assigned with these people. An empty list makes it a general task."),
        add_assignees: peopleRefs.optional(),
        remove_assignees: peopleRefs.optional(),
        labels: z.array(z.string().min(1)).max(20).optional().describe("Replace the labels with these."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) =>
      run(user, async () => {
        const task = await resolveTask(user, args.task);
        const quickOnly =
          args.title === undefined &&
          args.description === undefined &&
          args.start_date === undefined &&
          args.estimate_hours === undefined &&
          args.assignees === undefined &&
          args.add_assignees === undefined &&
          args.remove_assignees === undefined &&
          args.labels === undefined;

        if (quickOnly) {
          // Status, priority and due date use the quick path, which also lets employees move general tasks.
          if (args.priority !== undefined) await act(() => setTaskFieldAction(task.id, "priority", args.priority as string));
          if (args.due_date !== undefined) await act(() => setTaskFieldAction(task.id, "dueDate", args.due_date as string));
          if (args.status !== undefined) await act(() => setTaskFieldAction(task.id, "status", args.status as string));
        } else {
          const detail = await getTaskDetail(user, task.id);
          if (!detail) throw new ToolError(`Task "${args.task}" is not visible to you.`);
          let assigneeIds = task.assigneeIds;
          if (args.assignees !== undefined) assigneeIds = await resolvePeople(user, args.assignees);
          if (args.add_assignees?.length) assigneeIds = [...new Set([...assigneeIds, ...(await resolvePeople(user, args.add_assignees))])];
          if (args.remove_assignees?.length) {
            const removed = await resolvePeople(user, args.remove_assignees);
            assigneeIds = assigneeIds.filter((id) => !removed.includes(id));
          }
          const labelIds = args.labels !== undefined ? await resolveLabels(task.projectId, args.labels) : detail.taskLabels.map((tl) => tl.label.id);
          const estimate = args.estimate_hours === undefined ? detail.estimateHours : args.estimate_hours;
          await act(() =>
            updateTaskAction(
              null,
              form({
                taskId: task.id,
                title: args.title ?? detail.title,
                description: args.description ?? detail.description ?? "",
                status: args.status ?? detail.status,
                priority: args.priority ?? detail.priority,
                dueDate: args.due_date ?? detail.dueDate ?? "",
                startDate: args.start_date ?? detail.startDate ?? "",
                estimateHours: estimate ?? "",
                assigneeIds,
                labelIds,
              })
            )
          );
        }
        const after = await taskOut(user, origin, task.id);
        return after ? { updated: true, task: after } : { updated: true, note: "The task is no longer visible to you after this change." };
      })
  );

  server.registerTool(
    "add_comment",
    {
      title: "Comment on task",
      description: "Add a comment to a task as the user. The people on the task are notified.",
      inputSchema: { task: taskRef, text: z.string().min(1).max(5000) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ task, text: body }) =>
      run(user, async () => {
        const found = await resolveTask(user, task);
        await act(() => addCommentAction(found.id, body));
        return { commented: true, task: keyOf(found.number, found.project), url: `${origin}${taskLink(found)}` };
      })
  );

  server.registerTool(
    "add_checklist_items",
    {
      title: "Add checklist items",
      description: "Add one or more checklist items (sub-steps) to a task.",
      inputSchema: { task: taskRef, items: z.array(z.string().min(1).max(200)).min(1).max(30) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ task, items }) =>
      run(user, async () => {
        const found = await resolveTask(user, task);
        for (const item of items) await act(() => addChecklistItemAction(found.id, item));
        const after = await taskOut(user, origin, found.id);
        return { added: items.length, checklist: after?.checklist };
      })
  );

  server.registerTool(
    "set_checklist_item",
    {
      title: "Tick checklist item",
      description: "Mark a checklist item done or not done. Get item ids from get_task.",
      inputSchema: { item_id: z.string().uuid(), done: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ item_id, done }) =>
      run(user, async () => {
        await act(() => toggleChecklistItemAction(item_id, done));
        return { item_id, done };
      })
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete task",
      description: "Permanently delete a task with its comments and checklist. Confirm with the user first.",
      inputSchema: { task: taskRef },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ task }) =>
      run(user, async () => {
        const found = await resolveTask(user, task);
        const key = keyOf(found.number, found.project);
        await act(() => deleteTaskAction(found.id));
        return { deleted: true, task: key, title: found.title };
      })
  );

  /* ---------------------------- Projects ---------------------------- */

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "Create a team project (administrators and project managers only). The user becomes its owner; members listed are added and notified.",
      inputSchema: {
        name: z.string().min(2).max(120),
        key: z
          .string()
          .regex(/^[A-Za-z0-9]{2,6}$/)
          .optional()
          .describe("2 to 6 letters or digits, e.g. OP. Suggested from the name when left out."),
        description: z.string().max(2000).optional(),
        status: z.enum(PROJECT_STATUSES as unknown as [string, ...string[]]).optional().describe("Default active."),
        start_date: dateString.optional(),
        due_date: dateString.optional(),
        members: peopleRefs.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      run(user, async () => {
        const memberIds = await resolvePeople(user, args.members ?? []);
        const state = await act(() =>
          createProjectAction(
            null,
            form({ name: args.name, key: args.key?.toUpperCase(), description: args.description, status: args.status ?? "active", startDate: args.start_date, dueDate: args.due_date, memberIds })
          )
        );
        const project = state.id ? await getAccessibleProject(user, state.id) : null;
        return { created: true, message: state.message, project: project ? { id: project.id, key: project.key, name: project.name, url: `${origin}${projectHref(project.id)}` } : null };
      })
  );

  server.registerTool(
    "add_project_members",
    {
      title: "Add project members",
      description: "Add people to a team project (administrators and project managers only). They are notified.",
      inputSchema: { project: projectRef, people: peopleRefs.min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ project, people }) =>
      run(user, async () => {
        const p = await resolveProject(user, project);
        if (p.personalOwnerId) throw new ToolError("The personal space cannot have other members.");
        const ids = await resolvePeople(user, people);
        const state = await act(() => addMembersAction(p.id, ids));
        return { added: true, message: state.message, project: `${p.name} (${p.key})` };
      })
  );

  return server;
}
