"use client";

import { KanbanSquare, List, Lock, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Segmented } from "@/components/ui/tabs";
import type { TaskPriority, TaskStatus } from "@/db/schema";
import { PERSONAL_STATUS_ORDER, PRIORITY_META, PRIORITY_ORDER, TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import type { Pair } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { DUE_FILTERS, type DueFilter } from "@/lib/my-tasks";
import type { TaskFilters, TaskScopeCounts } from "@/lib/queries/tasks";
import { tasksSearch, type TaskView } from "@/lib/task-filters";
import { cn } from "@/lib/utils";

const DUE_LABELS: Record<DueFilter, Pair> = {
  overdue: dict.myTasks.dueOverdue,
  today: dict.myTasks.dueToday,
  week: dict.myTasks.dueWeek,
  month: dict.myTasks.dueMonth,
  none: dict.myTasks.dueNone,
};

type Scope = "all" | "me" | "general";
const SCOPES: string[] = ["all", "me", "general"];

/**
 * A project's Tasks page around its board or list: the view switch (board by
 * default), the quick switch between all tasks, mine and general ones with
 * their counts, search, and the filters (behind a button on phones).
 * Everything lives in the address, so any view can be shared or bookmarked;
 * the tasks dim while a change loads. With `personal` it is the person's own
 * space instead: its heading says only they can see it, colored category chips
 * take the place of the people switch, and there is no review status.
 */
export function ProjectTasksView({
  view,
  values,
  counts,
  people,
  labels,
  personal,
  children,
}: {
  view: TaskView;
  values: TaskFilters;
  counts: TaskScopeCounts;
  /** People to filter by; empty when the viewer only sees their own and general tasks. */
  people: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
  personal?: {
    /** Buttons beside the heading (new task, categories). */
    actions: React.ReactNode;
    /** Categories with how many tasks each holds under the other filters. */
    categories: Array<{ id: string; name: string; color: string; count: number }>;
    /** Tasks under the other filters, whatever their category. */
    total: number;
  };
  children: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const panelId = useId();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(values.q ?? "");

  const person = values.assignee && !SCOPES.includes(values.assignee) ? values.assignee : null;
  const scope = person ? null : ((values.assignee ?? "all") as Scope);
  // In a personal space the category chips are the quick switch, like the people switch of a project.
  const active = [values.priority !== "all" && values.priority, !personal && values.label !== "all" && values.label, values.due, person, view === "list" && values.status !== "all" && values.status].filter(Boolean).length;
  const [open, setOpen] = useState(active > 0);

  // Every change builds on what the server rendered last plus the changes still on their way,
  // so a search that waits for a pause never brings back filters changed since.
  const latest = useRef({ view, values });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    latest.current = { view, values };
  }, [view, values]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Switching the view adds a history entry; filters replace the current one. */
  const go = (next: { view?: TaskView; change?: Partial<TaskFilters> }) => {
    window.clearTimeout(timer.current);
    const nextView = next.view ?? latest.current.view;
    const nextValues = { ...latest.current.values, q, ...next.change };
    latest.current = { view: nextView, values: nextValues };
    const href = pathname + tasksSearch(nextView, nextValues);
    start(() => (next.view ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })));
  };

  const search = (value: string) => {
    setQ(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go({ change: { q: value } }), 300);
  };

  const clear = () => {
    setQ("");
    go({ change: { priority: "all", label: personal ? values.label : "all", due: undefined, status: "all", q: undefined, assignee: person ? "all" : values.assignee } });
  };

  // A chosen filter reads "Priority: Urgent" when closed; the other options keep their short names.
  const named = (name: string, value: string, selected: boolean) => (selected ? `${name}: ${value}` : value);
  const select = (on: boolean) => cn("field h-9 min-h-0 w-full min-w-0 bg-white py-0 text-sm sm:w-auto sm:min-w-[8.5rem]", on && "border-brand/40 text-brand");
  const priorityName = t(dict.project.filterPriority);
  const dueName = t(dict.myTasks.filterDue);
  const labelName = t(dict.project.filterLabel);
  const personName = t(dict.project.filterAssignee);
  const statusName = t(dict.common.status);
  const showLabels = !personal && labels.length > 0;
  const statusChoices = personal ? PERSONAL_STATUS_ORDER : TASK_STATUS_ORDER;
  const selects = 2 + (showLabels ? 1 : 0) + (people.length > 0 ? 1 : 0) + (view === "list" ? 1 : 0);
  const viewSwitch = (
    <Segmented
      label={t(dict.project.viewLabel)}
      className="inline-flex shrink-0"
      value={view}
      onChange={(v) => v !== view && go({ view: v })}
      options={[
        { value: "board", label: t(dict.project.tabs.board), icon: KanbanSquare },
        { value: "list", label: t(dict.project.tabs.list), icon: List },
      ]}
    />
  );
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
      on ? "border-brand/40 bg-brand/8 text-ink" : "border-line bg-white text-ink-soft hover:border-brand/30 hover:text-ink"
    );
  const category = values.label && values.label !== "all" ? values.label : null;

  return (
    <div>
      {personal ? (
        // Phones: title and view switch, then the description, then the buttons; wider: the buttons join the first row.
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-xl font-bold tracking-tight text-ink">{t(dict.personal.title)}</h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-brand/8 px-2 py-0.5 text-[11px] font-bold text-brand">
              <Lock className="h-3 w-3" aria-hidden />
              {t(dict.personal.onlyYou)}
            </span>
          </div>
          <div className="col-start-2 row-start-1 sm:col-start-3">{viewSwitch}</div>
          <p className="col-span-2 row-start-2 max-w-2xl text-sm font-medium text-ink-soft sm:col-span-3">{t(dict.personal.subtitle)}</p>
          <div className="col-span-2 row-start-3 flex items-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">{personal.actions}</div>
        </div>
      ) : (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold tracking-tight text-ink">{t(dict.project.tabs.tasks)}</h1>
            {viewSwitch}
          </div>
          <p className="mt-1 max-w-2xl text-sm font-medium text-ink-soft">{t(view === "board" ? dict.project.pages.boardDesc : dict.project.pages.listDesc)}</p>
        </div>
      )}

      <div className="mb-5 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {personal ? (
            <div role="group" aria-label={t(dict.personal.categories)} className="scrollbar-hide -mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <button type="button" aria-pressed={!category} onClick={() => category && go({ change: { label: "all" } })} className={chip(!category)}>
                {t(dict.personal.allCategories)}
                <span className={cn("font-grotesk text-xs", !category ? "text-brand" : "text-ink-soft")} dir="ltr">
                  {personal.total}
                </span>
              </button>
              {personal.categories.map((c) => (
                <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => category !== c.id && go({ change: { label: c.id } })} className={chip(category === c.id)}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.name}
                  <span className={cn("font-grotesk text-xs", category === c.id ? "text-brand" : "text-ink-soft")} dir="ltr">
                    {c.count}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Segmented
              label={t(dict.myTasks.scopeLabel)}
              value={scope}
              onChange={(s) => s !== scope && go({ change: { assignee: s } })}
              options={[
                { value: "all", label: t(dict.project.scopeAll), count: counts.all },
                { value: "me", label: t(dict.project.myTasks), count: counts.me },
                { value: "general", label: t(dict.myTasks.scopeGeneral), count: counts.general },
              ]}
            />
          )}
          <div className="flex items-center gap-2">
            <label className="relative block min-w-0 flex-1 sm:w-60 sm:flex-none">
              <span className="sr-only">{t(dict.common.search)}</span>
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-soft" />
              <input type="search" name="q" value={q} onChange={(e) => search(e.target.value)} placeholder={t(dict.common.search)} enterKeyHint="search" className="field h-9 min-h-0 w-full bg-white py-0 ps-9 text-sm" />
            </label>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm font-medium transition-colors sm:hidden", active > 0 ? "border-brand/40 text-brand" : "border-line text-ink-soft hover:text-ink")}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t(dict.project.filters)}
              {active > 0 && (
                <span className="rounded bg-brand px-1.5 font-grotesk text-[11px] font-bold leading-5 text-white" dir="ltr">
                  {active}
                </span>
              )}
            </button>
          </div>
        </div>

        <div id={panelId} className={cn("grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center", !open && "max-sm:hidden")}>
          <label className="relative min-w-0">
            <span className="sr-only">{priorityName}</span>
            <select name="priority" value={values.priority ?? "all"} onChange={(e) => go({ change: { priority: e.target.value as TaskPriority | "all" } })} className={select(values.priority !== "all")}>
              <option value="all">
                {priorityName}: {t(dict.common.all)}
              </option>
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {named(priorityName, t(PRIORITY_META[p].label), values.priority === p)}
                </option>
              ))}
            </select>
          </label>
          <label className="relative min-w-0">
            <span className="sr-only">{dueName}</span>
            <select name="due" value={values.due ?? ""} onChange={(e) => go({ change: { due: (e.target.value || undefined) as DueFilter | undefined } })} className={select(!!values.due)}>
              <option value="">
                {dueName}: {t(dict.common.all)}
              </option>
              {DUE_FILTERS.map((d) => (
                <option key={d} value={d}>
                  {named(dueName, t(DUE_LABELS[d]), values.due === d)}
                </option>
              ))}
            </select>
          </label>
          {showLabels && (
            <label className="relative min-w-0">
              <span className="sr-only">{labelName}</span>
              <select name="label" value={values.label ?? "all"} onChange={(e) => go({ change: { label: e.target.value } })} className={select(values.label !== "all")}>
                <option value="all">
                  {labelName}: {t(dict.common.all)}
                </option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {named(labelName, l.name, values.label === l.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {people.length > 0 && (
            <label className="relative min-w-0">
              <span className="sr-only">{personName}</span>
              <select name="assignee" value={person ?? ""} onChange={(e) => go({ change: { assignee: e.target.value || "all" } })} className={cn(select(!!person), "sm:max-w-[14rem]")}>
                <option value="">
                  {personName}: {t(dict.common.all)}
                </option>
                {people.map((m) => (
                  <option key={m.id} value={m.id}>
                    {named(personName, m.name, person === m.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {view === "list" && (
            <label className="relative min-w-0">
              <span className="sr-only">{statusName}</span>
              <select name="status" value={values.status ?? "all"} onChange={(e) => go({ change: { status: e.target.value as TaskStatus | "all" } })} className={select(values.status !== "all")}>
                <option value="all">
                  {statusName}: {t(dict.common.all)}
                </option>
                {statusChoices.map((s) => (
                  <option key={s} value={s}>
                    {named(statusName, t(TASK_STATUS_META[s].label), values.status === s)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(active > 0 || !!values.q) && (
            <button
              type="button"
              onClick={clear}
              className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink", selects % 2 === 0 && "col-span-2")}
            >
              <X className="h-4 w-4" />
              {t(dict.project.clearFilters)}
            </button>
          )}
        </div>
      </div>

      <div aria-busy={pending} className={cn("transition-opacity", pending && "opacity-60")}>
        {children}
      </div>
    </div>
  );
}
