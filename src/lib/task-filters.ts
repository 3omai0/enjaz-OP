import type { TaskPriority, TaskStatus } from "@/db/schema";
import { PRIORITY_ORDER, TASK_STATUS_ORDER } from "@/lib/constants";
import { DUE_FILTERS, type DueFilter } from "@/lib/my-tasks";
import type { TaskFilters } from "@/lib/queries/tasks";
import { clip, isUuid } from "@/lib/utils";

export type SearchInput = Record<string, string | string[] | undefined>;

/** How a project's Tasks page shows its tasks: the board (the default) or the list. */
export type TaskView = "board" | "list";

const one = (sp: SearchInput, k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? undefined;

/** Turn URL search params into validated task filters; anything unexpected falls back to "all". */
export function parseTaskFilters(sp: SearchInput): TaskFilters {
  const priority = one(sp, "priority");
  const status = one(sp, "status");
  const assignee = one(sp, "assignee");
  const label = one(sp, "label");
  const due = one(sp, "due");
  return {
    assignee: assignee === "me" || assignee === "general" || isUuid(assignee) ? assignee : "all",
    priority: priority && (PRIORITY_ORDER as string[]).includes(priority) ? (priority as TaskPriority) : "all",
    status: status && (TASK_STATUS_ORDER as string[]).includes(status) ? (status as TaskStatus) : "all",
    label: isUuid(label) ? label : "all",
    due: DUE_FILTERS.includes(due as DueFilter) ? (due as DueFilter) : undefined,
    q: clip((one(sp, "q") ?? "").trim(), 100) || undefined,
  };
}

export const parseTaskView = (sp: SearchInput): TaskView => (one(sp, "view") === "list" ? "list" : "board");

/**
 * The query string for a view and its filters, "" for the plain board. The
 * status filter belongs to the list: the board shows every status as a column.
 */
export function tasksSearch(view: TaskView, filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (view === "list") params.set("view", "list");
  for (const key of ["assignee", "priority", "label"] as const) {
    const value = filters[key];
    if (value && value !== "all") params.set(key, value);
  }
  if (view === "list" && filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.due) params.set("due", filters.due);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}
