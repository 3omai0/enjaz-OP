"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Segmented } from "@/components/ui/tabs";
import type { TaskPriority } from "@/db/schema";
import { setMyTasksScopeAction } from "@/lib/actions/settings";
import { PRIORITY_META, PRIORITY_ORDER, TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import type { Pair } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { DUE_FILTERS, isFiltered, myTasksSearch, type DueFilter, type MyTasksFilters, type MyTasksScope, type MyTasksStatus } from "@/lib/my-tasks";
import { cn } from "@/lib/utils";

const DUE_LABELS: Record<DueFilter, Pair> = {
  overdue: dict.myTasks.dueOverdue,
  today: dict.myTasks.dueToday,
  week: dict.myTasks.dueWeek,
  month: dict.myTasks.dueMonth,
  none: dict.myTasks.dueNone,
};

/**
 * The scope switch and filters of My tasks (for all projects, or inside one),
 * around the list they control. The scope is remembered on this device (a
 * cookie set by a server action, which also refreshes the menu counts); the
 * filters live in the address of the current page. The list dims while a
 * change loads. The project filter shows when there is more than one project
 * to pick from.
 */
export function MyTasksView({
  values,
  counts,
  projects = [],
  children,
}: {
  values: MyTasksFilters;
  counts: Record<MyTasksScope, number>;
  projects?: Array<{ id: string; name: string }>;
  children: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [scope, setScope] = useOptimistic(values.scope);
  const [q, setQ] = useState(values.q ?? "");
  const filtered = isFiltered(values);

  // The filters every change builds on: what the server rendered last plus the changes still on
  // their way, so a search that waits for a pause never brings back filters changed since.
  const latest = useRef(values);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    latest.current = values;
  }, [values]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const apply = (change: Partial<MyTasksFilters>) => {
    window.clearTimeout(timer.current);
    latest.current = { ...latest.current, q, ...change };
    const href = pathname + myTasksSearch(latest.current);
    start(() => router.replace(href, { scroll: false }));
  };

  /** Typing reloads the list after a short pause. */
  const search = (value: string) => {
    setQ(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => apply({ q: value }), 300);
  };

  const chooseScope = (next: MyTasksScope) => {
    if (next === scope) return;
    start(async () => {
      setScope(next);
      await setMyTasksScopeAction(next);
    });
  };

  // A chosen filter reads "Priority: Urgent" when closed; the other options keep their short names.
  const named = (name: string, value: string, selected: boolean) => (selected ? `${name}: ${value}` : value);
  const select = (active: boolean) => cn("field h-9 min-h-0 w-full min-w-0 bg-white py-0 text-sm sm:w-auto sm:min-w-[9rem]", active && "border-brand/40 text-brand");

  const priorityName = t(dict.project.filterPriority);
  const dueName = t(dict.myTasks.filterDue);
  const projectName = t(dict.myTasks.filterProject);
  const statusName = t(dict.common.status);
  const selectCount = projects.length > 1 ? 4 : 3;

  return (
    <>
      <div className="mb-5 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Segmented
            label={t(dict.myTasks.scopeLabel)}
            value={scope}
            onChange={chooseScope}
            options={[
              { value: "all", label: t(dict.myTasks.scopeAll), count: counts.all },
              { value: "mine", label: t(dict.myTasks.scopeMine), count: counts.mine },
              { value: "general", label: t(dict.myTasks.scopeGeneral), count: counts.general },
            ]}
          />
          <label className="relative block sm:w-60">
            <span className="sr-only">{t(dict.common.search)}</span>
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-soft" />
            <input type="search" name="q" value={q} onChange={(e) => search(e.target.value)} placeholder={t(dict.common.search)} enterKeyHint="search" className="field h-9 min-h-0 w-full bg-white py-0 ps-9 text-sm" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <label className="relative min-w-0">
            <span className="sr-only">{priorityName}</span>
            <select name="priority" value={values.priority ?? ""} onChange={(e) => apply({ priority: (e.target.value || undefined) as TaskPriority | undefined })} className={select(!!values.priority)}>
              <option value="">
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
            <select name="due" value={values.due ?? ""} onChange={(e) => apply({ due: (e.target.value || undefined) as DueFilter | undefined })} className={select(!!values.due)}>
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
          {projects.length > 1 && (
            <label className="relative min-w-0">
              <span className="sr-only">{projectName}</span>
              <select name="project" value={values.project ?? ""} onChange={(e) => apply({ project: e.target.value || undefined })} className={cn(select(!!values.project), "sm:max-w-[14rem]")}>
                <option value="">
                  {projectName}: {t(dict.common.all)}
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {named(projectName, p.name, values.project === p.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="relative min-w-0">
            <span className="sr-only">{statusName}</span>
            <select name="status" value={values.status} onChange={(e) => apply({ status: e.target.value as MyTasksStatus })} className={select(values.status !== "open")}>
              <option value="open">
                {statusName}: {t(dict.myTasks.statusOpen)}
              </option>
              <option value="all">{named(statusName, t(dict.myTasks.statusAll), values.status === "all")}</option>
              {TASK_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {named(statusName, t(TASK_STATUS_META[s].label), values.status === s)}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                apply({ status: "open", priority: undefined, due: undefined, project: undefined, q: undefined });
              }}
              className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink", selectCount % 2 === 0 && "col-span-2")}
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
    </>
  );
}
