"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { AvatarStack } from "@/components/ui/avatar";
import { ProjectStatusBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { daysUntil, fmtShortDate } from "@/lib/format";
import { useLang, usePlural, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import type { ProjectCard as ProjectCardData } from "@/lib/queries/projects";
import { projectHref } from "@/lib/routes";
import { cn, percent } from "@/lib/utils";

export function ProjectCard({ project: p }: { project: ProjectCardData }) {
  const t = useT();
  const tp = usePlural();
  const { lang } = useLang();
  const pct = percent(p.doneTasks, p.totalTasks);
  const days = daysUntil(p.dueDate);
  const late = days !== null && days < 0 && p.status !== "completed" && p.status !== "archived";

  return (
    <Link href={projectHref(p.id)} className="group flex flex-col rounded-lg border border-line bg-white p-4 transition-colors hover:border-brand/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <h3 className="truncate text-sm font-bold text-ink transition-colors group-hover:text-brand">{p.name}</h3>
          </div>
          <p className="mt-0.5 ps-[18px] font-grotesk text-xs text-ink-soft">
            <span dir="ltr">{p.key}</span>
          </p>
        </div>
        <ProjectStatusBadge status={p.status} />
      </div>

      <p dir="auto" className={cn("mt-3 line-clamp-2 min-h-[2.25rem] text-start text-xs font-medium leading-relaxed", p.description ? "text-ink-soft" : "text-ink-soft/50")}>
        {p.description ?? t(dict.project.noDescription)}
      </p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-ink-soft">
          <span>{tp(dict.plurals.tasks, p.totalTasks)}</span>
          <span className="font-grotesk text-ink" dir="ltr">
            {pct}%
          </span>
        </div>
        <ProgressBar value={pct} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {p.members.length > 0 ? <AvatarStack people={p.members} size="xs" /> : <span />}
        {p.dueDate && (
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", late ? "text-danger" : "text-ink-soft")} suppressHydrationWarning>
            <CalendarDays className="h-3.5 w-3.5" />
            {fmtShortDate(p.dueDate, lang)}
          </span>
        )}
      </div>

      {p.myOpenTasks > 0 && (
        <p className="mt-3 border-t border-line pt-2.5 text-xs font-semibold text-brand">
          {t(dict.projects.myTasksHere)}: <span className="font-grotesk">{p.myOpenTasks}</span>
        </p>
      )}
    </Link>
  );
}
