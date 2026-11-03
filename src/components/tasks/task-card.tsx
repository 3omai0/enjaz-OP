"use client";

import { CheckSquare, MessageSquare } from "lucide-react";
import Link from "next/link";
import { AvatarStack } from "@/components/ui/avatar";
import { GeneralBadge, LabelChip, PriorityBadge, TaskKey } from "@/components/ui/badge";
import { DueChip } from "@/components/ui/due-chip";
import type { TaskCard as TaskCardData } from "@/lib/queries/tasks";
import { taskLink } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Compact card used on the board. */
export function TaskCard({ task, projectKey, showProject = false, className, overlay = false }: { task: TaskCardData; projectKey: string; showProject?: boolean; className?: string; overlay?: boolean }) {
  return (
    <Link
      href={taskLink(task)}
      className={cn(
        "block rounded-md border border-line bg-white p-3 transition-colors hover:border-brand/50",
        overlay && "border-brand",
        task.status === "done" && "opacity-70",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TaskKey projectKey={projectKey} number={task.number} />
          {showProject && task.project && (
            <span className="inline-flex items-center gap-1 truncate text-[11px] font-medium text-ink-soft">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: task.project.color }} />
              <span className="truncate">{task.project.name}</span>
            </span>
          )}
        </div>
        <PriorityBadge priority={task.priority} iconOnly />
      </div>
      <p className={cn("mt-1 line-clamp-2 text-sm font-medium leading-snug text-ink", task.status === "done" && "line-through decoration-ink-soft/50")}>{task.title}</p>
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} small />
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <DueChip date={task.dueDate} status={task.status} />
          {task.checklistTotal > 0 && (
            <span className={cn("inline-flex items-center gap-1 font-grotesk text-[11px] font-medium", task.checklistDone === task.checklistTotal ? "text-success" : "text-ink-soft")} dir="ltr">
              <CheckSquare className="h-3 w-3" />
              {task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 font-grotesk text-[11px] font-medium text-ink-soft" dir="ltr">
              <MessageSquare className="h-3 w-3" />
              {task.commentCount}
            </span>
          )}
        </div>
        {/* A personal task is always its owner's, so it shows no people. */}
        {task.project.personalOwnerId ? null : task.assignees.length > 0 ? <AvatarStack people={task.assignees} size="xs" max={3} /> : <GeneralBadge className="h-5 px-1.5 text-[11px]" />}
      </div>
    </Link>
  );
}
