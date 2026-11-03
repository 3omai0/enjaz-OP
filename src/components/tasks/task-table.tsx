"use client";

import { ChevronDown, Inbox, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { GeneralBadge, LabelChip, PriorityBadge, TaskKey } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/card";
import { DueChip } from "@/components/ui/due-chip";
import type { TaskStatus } from "@/db/schema";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import type { TaskCard as TaskCardData } from "@/lib/queries/tasks";
import { taskLink } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Tasks grouped by status as collapsible tables. `filtered` tells an empty
 * result apart from an empty project; `personal` drops the people column and
 * speaks of personal tasks.
 */
export function TaskTable({
  tasks,
  projectKey,
  emptyAction,
  filtered = false,
  personal = false,
}: {
  tasks: TaskCardData[];
  projectKey: string;
  emptyAction?: React.ReactNode;
  filtered?: boolean;
  personal?: boolean;
}) {
  const t = useT();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true });

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white">
        {filtered ? (
          <EmptyState icon={SearchX} title={t(dict.myTasks.noMatch)} description={t(dict.myTasks.noMatchDesc)} />
        ) : (
          <EmptyState icon={Inbox} title={t(personal ? dict.personal.emptyTitle : dict.project.noTasks)} description={t(personal ? dict.personal.emptyDesc : dict.project.noTasksDesc)} action={emptyAction} />
        )}
      </div>
    );
  }

  const groups = TASK_STATUS_ORDER.map((status) => ({ status, items: tasks.filter((x) => x.status === status).sort((a, b) => a.position - b.position || a.number - b.number) })).filter((g) => g.items.length > 0);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      {groups.map(({ status, items }, gi) => {
        const meta = TASK_STATUS_META[status];
        const open = !collapsed[status];
        return (
          <section key={status} className={cn(gi > 0 && "border-t border-line")}>
            <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [status]: open }))} className="flex w-full items-center gap-2 bg-paper/70 px-4 py-2 text-start transition-colors hover:bg-paper" aria-expanded={open}>
              <ChevronDown className={cn("h-3.5 w-3.5 text-ink-soft transition-transform", !open && "-rotate-90 rtl:rotate-90")} />
              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
              <span className="text-xs font-bold text-ink">{t(meta.label)}</span>
              <span className="font-grotesk text-xs text-ink-soft" dir="ltr">
                {items.length}
              </span>
            </button>
            {open && (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-t border-line text-[11px] font-semibold text-ink-soft">
                      <th className="px-4 py-2 text-start font-semibold">{t(dict.project.columns.task)}</th>
                      {!personal && <th className="px-3 py-2 text-start font-semibold">{t(dict.project.columns.assignee)}</th>}
                      <th className="px-3 py-2 text-start font-semibold">{t(dict.project.columns.priority)}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t(dict.project.columns.due)}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t(personal ? dict.personal.category : dict.project.columns.labels)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((task) => (
                      <Row key={task.id} task={task} projectKey={projectKey} status={status} personal={personal} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({ task, projectKey, status, personal }: { task: TaskCardData; projectKey: string; status: TaskStatus; personal: boolean }) {
  const t = useT();
  return (
    <tr className="group border-t border-line transition-colors hover:bg-paper">
      <td className="px-4 py-2.5">
        <Link href={taskLink(task)} className="flex min-w-0 items-center gap-3">
          <TaskKey projectKey={projectKey} number={task.number} className="w-16 shrink-0" />
          <span className={cn("truncate font-medium text-ink group-hover:text-brand", status === "done" && "line-through decoration-ink-soft/50")}>{task.title}</span>
        </Link>
      </td>
      {!personal && (
        <td className="px-3 py-2.5">
          {task.assignees.length > 0 ? (
            <span className="inline-flex items-center gap-2 text-xs font-medium text-ink" title={task.assignees.map((a) => a.name).join("، ")}>
              <AvatarStack people={task.assignees} size="xs" max={3} />
              {task.assignees.length === 1 && <span className="max-w-[140px] truncate">{task.assignees[0].name}</span>}
            </span>
          ) : (
            <GeneralBadge />
          )}
        </td>
      )}
      <td className="px-3 py-2.5">
        <PriorityBadge priority={task.priority} />
      </td>
      <td className="px-3 py-2.5">
        <DueChip date={task.dueDate} status={task.status} />
        {!task.dueDate && <span className="text-xs font-medium text-ink-soft/50">{t(dict.common.noDueDate)}</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} small />
          ))}
        </div>
      </td>
    </tr>
  );
}
