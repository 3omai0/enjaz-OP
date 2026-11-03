"use client";

import { Check, CheckSquare, Clock, Inbox, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { GeneralBadge, LabelChip, PriorityBadge, StatusBadge, TaskKey } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/card";
import { DueChip } from "@/components/ui/due-chip";
import { useToast } from "@/components/ui/toast";
import type { SafeUser, TaskStatus } from "@/db/schema";
import { setTaskFieldAction } from "@/lib/actions/tasks";
import { TASK_STATUS_META } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { canCompleteTask, canMoveTask } from "@/lib/permissions";
import type { TaskCard as TaskCardData } from "@/lib/queries/tasks";
import { taskLink } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Actor = Pick<SafeUser, "id" | "role">;

/**
 * One task per row. When the viewer may move the task, the leading circle is a
 * one-tap control (Todoist style): it completes the task, or sends it to review
 * when the project needs a manager's approval. Every tap can be undone from
 * the confirmation message. Otherwise the circle is just a status dot.
 */
export function TaskRow({ task, projectKey, showProject = false, showStatus = true, currentUser }: { task: TaskCardData; projectKey: string; showProject?: boolean; showStatus?: boolean; currentUser?: Actor }) {
  const t = useT();
  const meta = TASK_STATUS_META[task.status];
  const canToggle = !!currentUser && canMoveTask(currentUser, { assigneeIds: task.assignees.map((a) => a.id), creatorId: task.creatorId }, task.project);
  const done = task.status === "done";

  return (
    <div className="group flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-paper">
      {canToggle && currentUser ? <CompleteToggle task={task} currentUser={currentUser} /> : <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} title={t(meta.label)} />}
      <Link href={taskLink(task)} className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className={cn("truncate text-sm font-medium text-ink group-hover:text-brand", done && "text-ink-soft line-through decoration-ink-soft/50")}>{task.title}</p>
          {task.labels.slice(0, 2).map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} small className="hidden md:inline-flex" />
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-ink-soft">
          <TaskKey projectKey={projectKey} number={task.number} className="text-[11px]" />
          {showProject && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: task.project.color }} />
              <span className="truncate">{task.project.name}</span>
            </span>
          )}
          {task.checklistTotal > 0 && (
            <span className="inline-flex items-center gap-1 font-grotesk" dir="ltr">
              <CheckSquare className="h-3 w-3" />
              {task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 font-grotesk" dir="ltr">
              <MessageSquare className="h-3 w-3" />
              {task.commentCount}
            </span>
          )}
        </div>
      </Link>
      <DueChip date={task.dueDate} status={task.status} className="hidden md:inline-flex" />
      {showStatus && <StatusBadge status={task.status} plain className="hidden w-28 lg:inline-flex" />}
      <PriorityBadge priority={task.priority} iconOnly />
      {task.project.personalOwnerId ? null : task.assignees.length > 0 ? <AvatarStack people={task.assignees} size="sm" max={3} /> : <GeneralBadge compact />}
    </div>
  );
}

function CompleteToggle({ task, currentUser }: { task: TaskCardData; currentUser: Actor }) {
  const t = useT();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<TaskStatus | null>(null);
  const [seenStatus, setSeenStatus] = useState(task.status);

  // fresh data from the server wins over the optimistic guess
  if (seenStatus !== task.status) {
    setSeenStatus(task.status);
    setOptimistic(null);
  }
  const status = optimistic ?? task.status;
  const canFinish = canCompleteTask(currentUser, task.project);

  // What one tap does from here.
  let next: TaskStatus | null;
  let label: string;
  let message: string;
  if (status === "done") {
    next = canFinish ? "todo" : null;
    label = canFinish ? t(dict.task.quickReopen) : t(dict.task.completeLocked);
    message = t(dict.task.reopenedToast);
  } else if (canFinish) {
    next = "done";
    label = t(dict.task.quickComplete);
    message = t(dict.task.completedToast);
  } else if (status === "in_review") {
    next = "in_progress";
    label = t(dict.task.backToWork);
    message = t(dict.task.updated);
  } else {
    next = "in_review";
    label = t(dict.task.sendToReview);
    message = t(dict.task.sentToReviewToast);
  }

  const change = (to: TaskStatus, from: TaskStatus) => {
    setOptimistic(to);
    start(async () => {
      const r = await setTaskFieldAction(task.id, "status", to);
      if (r?.error) {
        toast(r.error, "error");
        setOptimistic(null);
        return;
      }
      // The row may already be gone (a completed task leaves "my open tasks"), so undo does not rely on it.
      const undo = async () => {
        const back = await setTaskFieldAction(task.id, "status", from);
        if (back?.error) toast(back.error, "error");
      };
      toast(message, { action: { label: t(dict.common.undo), onClick: () => void undo() } });
    });
  };

  const waiting = status === "in_review" && !canFinish;
  return (
    <button
      type="button"
      onClick={() => next && change(next, status)}
      disabled={pending || !next}
      aria-pressed={status === "done"}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-default",
        status === "done"
          ? "border-success bg-success text-white"
          : waiting
            ? "border-warning bg-warning/10 text-warning"
            : canFinish
              ? "border-ink-soft/40 bg-white text-transparent hover:border-success hover:text-success"
              : "border-ink-soft/40 bg-white text-transparent hover:border-warning hover:text-warning",
        pending && "opacity-60"
      )}
    >
      {waiting ? <Clock className="h-3 w-3" strokeWidth={2.5} /> : <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

export function TaskList({
  tasks,
  projectKey,
  showProject = false,
  showStatus = true,
  emptyTitle,
  emptyDescription,
  emptyAction,
  className,
  currentUser,
}: {
  tasks: TaskCardData[];
  projectKey?: string;
  showProject?: boolean;
  showStatus?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  className?: string;
  currentUser?: Actor;
}) {
  if (tasks.length === 0) {
    return <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} action={emptyAction} compact className={className} />;
  }
  return (
    <div className={cn("rows", className)}>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} projectKey={projectKey ?? task.project.key} showProject={showProject} showStatus={showStatus} currentUser={currentUser} />
      ))}
    </div>
  );
}
