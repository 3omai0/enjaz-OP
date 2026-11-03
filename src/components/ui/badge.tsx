"use client";

import { ChevronDown, ChevronsUp, ChevronUp, Equal, Users } from "lucide-react";
import type { ProjectStatus, TaskPriority, TaskStatus, UserRole } from "@/db/schema";
import { PRIORITY_META, PROJECT_STATUS_META, ROLE_META, TASK_STATUS_META } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

/** Quiet chip: paper background, hairline border, dark text. Color arrives only through dots and icons. */
export function Chip({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-paper px-2 text-xs font-medium text-ink", className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, className, plain = false }: { status: TaskStatus; className?: string; plain?: boolean }) {
  const t = useT();
  const meta = TASK_STATUS_META[status];
  if (plain) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-soft", className)}>
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        {t(meta.label)}
      </span>
    );
  }
  return (
    <Chip className={className}>
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
      {t(meta.label)}
    </Chip>
  );
}

const PRIORITY_ICONS: Record<TaskPriority, typeof Equal> = { low: ChevronDown, medium: Equal, high: ChevronUp, urgent: ChevronsUp };

export function PriorityBadge({ priority, className, iconOnly = false }: { priority: TaskPriority; className?: string; iconOnly?: boolean }) {
  const t = useT();
  const meta = PRIORITY_META[priority];
  const Icon = PRIORITY_ICONS[priority];
  if (iconOnly) {
    return (
      <span title={t(meta.label)} className={cn("inline-flex h-5 w-5 items-center justify-center rounded", meta.text, className)}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium", meta.text, className)}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
      {t(meta.label)}
    </span>
  );
}

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const t = useT();
  const meta = PROJECT_STATUS_META[status];
  return (
    <Chip className={className}>
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
      {t(meta.label)}
    </Chip>
  );
}

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const t = useT();
  return <Chip className={cn(role === "admin" && "border-brand/30 text-brand", className)}>{t(ROLE_META[role].label)}</Chip>;
}

/** Marks a task with no assignee. `compact` keeps only the icon on phones, where rows are narrow. */
export function GeneralBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useT();
  return (
    <Chip className={cn("relative border-dashed text-ink-soft", compact && "max-sm:h-7 max-sm:w-7 max-sm:justify-center max-sm:rounded-full max-sm:px-0", className)} title={t(dict.task.generalBadge)}>
      <Users className="h-3 w-3" />
      <span className={cn(compact && "max-sm:sr-only")}>{t(dict.task.general)}</span>
    </Chip>
  );
}

export function LabelChip({ name, color, className, small = false }: { name: string; color: string; className?: string; small?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-white font-medium text-ink", small ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-xs", className)}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

/** KEY-12 for a team task; an empty key (a personal task) shows #12. */
export function TaskKey({ projectKey, number, className }: { projectKey: string; number: number; className?: string }) {
  return (
    <span dir="ltr" className={cn("font-grotesk text-xs font-medium tracking-wide text-ink-soft", className)}>
      {projectKey ? `${projectKey}-${number}` : `#${number}`}
    </span>
  );
}
