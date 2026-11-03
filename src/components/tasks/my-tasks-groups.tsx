import { CheckSquare, SearchX, Users } from "lucide-react";
import { TaskList } from "@/components/tasks/task-row";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import type { SafeUser } from "@/db/schema";
import { daysUntil } from "@/lib/format";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { isFiltered, type MyTasksFilters } from "@/lib/my-tasks";
import type { TaskCard } from "@/lib/queries/tasks";
import { cn } from "@/lib/utils";

/**
 * My tasks grouped by due date (overdue, today, this week, later, no date,
 * then recently completed), or the empty state that fits the scope and the
 * filters.
 */
export async function MyTasksGroups({ tasks, filters, currentUser }: { tasks: TaskCard[]; filters: MyTasksFilters; currentUser: Pick<SafeUser, "id" | "role"> }) {
  const { t } = await getT();

  if (tasks.length === 0) {
    const empty = isFiltered(filters)
      ? { icon: SearchX, title: t(dict.myTasks.noMatch), description: t(dict.myTasks.noMatchDesc) }
      : filters.scope === "mine"
        ? { icon: CheckSquare, title: t(dict.myTasks.empty), description: t(dict.myTasks.emptyDesc) }
        : filters.scope === "general"
          ? { icon: Users, title: t(dict.myTasks.emptyGeneral), description: t(dict.myTasks.emptyGeneralDesc) }
          : { icon: CheckSquare, title: t(dict.myTasks.emptyAll), description: t(dict.myTasks.emptyAllDesc) };
    return (
      <div className="rounded-lg border border-dashed border-line bg-white">
        <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
      </div>
    );
  }

  const groups: Array<{ key: string; title: string; items: TaskCard[]; tone?: string }> = [
    { key: "overdue", title: t(dict.myTasks.overdue), items: [], tone: "text-danger" },
    { key: "today", title: t(dict.myTasks.today), items: [], tone: "text-warning" },
    { key: "week", title: t(dict.myTasks.thisWeek), items: [] },
    { key: "later", title: t(dict.myTasks.later), items: [] },
    { key: "nodate", title: t(dict.myTasks.noDate), items: [] },
    { key: "done", title: t(dict.myTasks.done), items: [], tone: "text-success" },
  ];
  for (const task of tasks) {
    if (task.status === "done") {
      groups[5].items.push(task);
      continue;
    }
    const d = daysUntil(task.dueDate);
    if (d === null) groups[4].items.push(task);
    else if (d < 0) groups[0].items.push(task);
    else if (d === 0) groups[1].items.push(task);
    else if (d <= 7) groups[2].items.push(task);
    else groups[3].items.push(task);
  }

  return (
    <div className="space-y-5">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <Card key={g.key} padded={false}>
            <CardHeader
              className="mb-0 px-5 pb-3 pt-4"
              title={
                <span className={cn("inline-flex items-center gap-2", g.tone)}>
                  {g.title}
                  <span className="rounded-md bg-ink/5 px-1.5 py-0.5 font-grotesk text-[11px] font-bold text-ink-soft" dir="ltr">
                    {g.items.length}
                  </span>
                </span>
              }
            />
            <div className="border-t border-line">
              <TaskList tasks={g.items} showProject currentUser={currentUser} emptyTitle="" />
            </div>
          </Card>
        ))}
    </div>
  );
}
