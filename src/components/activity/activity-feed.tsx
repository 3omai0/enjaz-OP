"use client";

import { Activity } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/card";
import { TimeAgo } from "@/components/ui/time-ago";
import type { TaskStatus } from "@/db/schema";
import { TASK_STATUS_META } from "@/lib/constants";
import type { Pair } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { fillNodes } from "@/lib/i18n/render";
import { personalTaskHref, projectHref, taskHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type FeedItem = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date | string;
  taskId?: string | null;
  projectId?: string | null;
  actor: { id: string; name: string } | null;
  project?: { id: string; name: string; key: string } | null;
};

const TEMPLATES = dict.activity as Record<string, Pair>;

/**
 * Activity log. Each entry reads as a neutral phrase ("Moved ORD-4 to Done")
 * so Arabic needs no gendered verb; who did it and when sit on the line below.
 */
export function ActivityFeed({
  items,
  showProject = false,
  compact = false,
  personal = false,
  className,
}: {
  items: FeedItem[];
  showProject?: boolean;
  compact?: boolean;
  /** Entries of a personal task: its links open the personal task page. */
  personal?: boolean;
  className?: string;
}) {
  const t = useT();
  if (items.length === 0) {
    return <EmptyState icon={Activity} title={t(dict.dashboard.noActivity)} compact className={className} />;
  }

  return (
    <ol className={cn("relative", className)}>
      {items.map((item, i) => {
        const p = item.payload as Record<string, string | boolean | undefined>;
        const projectId = item.projectId ?? item.project?.id ?? null;
        const taskLabel = p.taskKey ? `${p.taskKey} ${p.taskTitle ?? ""}`.trim() : "";
        const to = p.to as TaskStatus | undefined;
        const strong = (text: unknown) => <bdi className="font-bold text-ink">{String(text ?? "")}</bdi>;

        const sentence = fillNodes(t(TEMPLATES[item.type] ?? dict.activity.fallback), {
          task:
            item.taskId && projectId ? (
              <Link href={personal ? personalTaskHref(item.taskId) : taskHref(projectId, item.taskId)} className="font-bold text-ink hover:text-brand">
                <bdi>{taskLabel}</bdi>
              </Link>
            ) : (
              strong(taskLabel)
            ),
          status: to && TASK_STATUS_META[to] ? <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold", TASK_STATUS_META[to].chip)}>{t(TASK_STATUS_META[to].label)}</span> : null,
          member: strong(p.memberName),
          project: strong(p.projectName ?? item.project?.name),
          label: strong(p.labelName),
        });

        return (
          <li key={item.id} className={cn("relative flex gap-3", compact ? "py-2.5" : "py-3.5", i < items.length - 1 && "border-b border-line")}>
            <Avatar name={item.actor?.name ?? "?"} id={item.actor?.id} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-relaxed text-ink-soft">{sentence}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-medium text-ink-soft/80">
                <bdi className="font-semibold text-ink-soft">{item.actor?.name ?? t(dict.team.formerMember)}</bdi>
                <span aria-hidden>·</span>
                <TimeAgo date={item.createdAt} />
                {showProject && item.project && (
                  <>
                    <span aria-hidden>·</span>
                    <Link href={projectHref(item.project.id)} className="hover:text-brand">
                      {item.project.name}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
