import type { TaskPriority, TaskStatus } from "@/db/schema";
import { PRIORITY_ORDER, TASK_STATUS_ORDER } from "@/lib/constants";
import { isUuid } from "@/lib/utils";

/*
 * What the My tasks page shows and how it can be narrowed down. Shared by the
 * page, its filter bar and the sidebar count, so all three agree. The due
 * date filter is shared with the Tasks page of each project.
 */

/** Everything that is yours or general, only the tasks assigned to you, or only general tasks. */
export type MyTasksScope = "all" | "mine" | "general";
export const MY_TASKS_SCOPES: MyTasksScope[] = ["all", "mine", "general"];
export const isMyTasksScope = (value: unknown): value is MyTasksScope => MY_TASKS_SCOPES.includes(value as MyTasksScope);

/** Remembers the chosen scope on this device, for the page and the sidebar count. */
export const MY_TASKS_SCOPE_COOKIE = "injaz_my_tasks";

export type DueFilter = "overdue" | "today" | "week" | "month" | "none";
export const DUE_FILTERS: DueFilter[] = ["overdue", "today", "week", "month", "none"];

/** Open work by default; "all" adds what was completed recently. */
export type MyTasksStatus = "open" | "all" | TaskStatus;

/** Completed tasks stay on the page for this many days. */
export const RECENT_DONE_DAYS = 30;

export type MyTasksFilters = {
  scope: MyTasksScope;
  status: MyTasksStatus;
  priority?: TaskPriority;
  due?: DueFilter;
  project?: string;
  q?: string;
};

type Params = Record<string, string | string[] | undefined>;

/** Filters from the page's search params. The scope is a remembered preference, not part of the address. */
export function parseMyTasksFilters(params: Params, scope: MyTasksScope): MyTasksFilters {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  const status = one("status");
  const priority = one("priority");
  const due = one("due");
  const project = one("project");
  const q = one("q")?.trim().slice(0, 100);
  return {
    scope,
    status: status === "all" || TASK_STATUS_ORDER.includes(status as TaskStatus) ? (status as MyTasksStatus) : "open",
    priority: PRIORITY_ORDER.includes(priority as TaskPriority) ? (priority as TaskPriority) : undefined,
    due: DUE_FILTERS.includes(due as DueFilter) ? (due as DueFilter) : undefined,
    project: isUuid(project) ? project : undefined,
    q: q || undefined,
  };
}

/** The query string for a set of filters, "" when none is set (the scope is left out, see above). */
export function myTasksSearch(filters: Omit<MyTasksFilters, "scope">) {
  const params = new URLSearchParams();
  if (filters.status !== "open") params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.due) params.set("due", filters.due);
  if (filters.project) params.set("project", filters.project);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** True when anything besides the scope narrows the list. */
export const isFiltered = (filters: MyTasksFilters) => filters.status !== "open" || !!(filters.priority || filters.due || filters.project || filters.q);
