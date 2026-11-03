/** Central place for app URLs so navigation stays consistent everywhere. */
export const projectHref = (projectId: string) => `/projects/${projectId}`;

/** Tasks always open inside their project so the project navigation stays visible. */
export const taskHref = (projectId: string, taskId: string) => `/projects/${projectId}/tasks/${taskId}`;

/** A project's Tasks page (the board unless the list is asked for), optionally with filters such as { assignee: "me" }. */
export const projectTasksHref = (projectId: string, query?: Record<string, string>) => `/projects/${projectId}/tasks${query ? `?${new URLSearchParams(query)}` : ""}`;

/** The person's own tasks, visible to nobody else. */
export const personalHref = "/personal";
export const personalTaskHref = (taskId: string) => `/personal/tasks/${taskId}`;

/** Where a task opens: its personal page, or its page inside its project. */
export const taskLink = (task: { id: string; projectId: string; project?: { personalOwnerId?: string | null } | null }) =>
  task.project?.personalOwnerId ? personalTaskHref(task.id) : taskHref(task.projectId, task.id);
