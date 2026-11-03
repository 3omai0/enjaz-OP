"use client";

import { Activity, Archive, ArchiveRestore, CalendarDays, ChevronLeft, ChevronRight, KanbanSquare, LayoutGrid, MoreHorizontal, Settings, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { SideNavItem } from "@/components/layout/side-nav-item";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import type { MemberOption } from "@/components/tasks/task-form-dialog";
import { AvatarStack } from "@/components/ui/avatar";
import { ProjectStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { ProgressBar } from "@/components/ui/progress";
import { NavTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import type { Project, SafeUser, TaskStatus } from "@/db/schema";
import { setProjectStatusAction } from "@/lib/actions/projects";
import { fmtShortDate } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { projectTasksHref } from "@/lib/routes";
import { percent } from "@/lib/utils";

type Props = {
  project: Project;
  owner: { id: string; name: string } | null;
  /** Active project members (avatars and count). */
  members: Array<{ id: string; name: string }>;
  /** Everyone the viewer may pick as assignee in the new task dialog. */
  assignees: MemberOption[];
  labels: Array<{ id: string; name: string; color: string }>;
  counts: Record<TaskStatus, number>;
  currentUser: Pick<SafeUser, "id" | "role">;
  canEdit: boolean;
};

/**
 * Project navigation. On desktop it is a second full-height sidebar with the
 * same anatomy as the main one (header, nav, footer), placed beside the icon
 * rail. On small screens it folds into a compact header with horizontal tabs.
 */
export function ProjectSidebar({ project, owner, members, assignees, labels, counts, currentUser, canEdit }: Props) {
  const t = useT();
  const { lang, isAr } = useLang();
  const pathname = usePathname();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const pct = percent(counts.done, total);
  const base = `/projects/${project.id}`;
  const BackIcon = isAr ? ChevronRight : ChevronLeft;

  const items = [
    { href: base, label: t(dict.project.tabs.overview), icon: LayoutGrid, exact: true },
    // One page for the board and the list; it stays highlighted while a task is open.
    { href: projectTasksHref(project.id), label: t(dict.project.tabs.tasks), icon: KanbanSquare, count: total - counts.done },
    { href: `${base}/members`, label: t(dict.project.tabs.members), icon: Users, count: members.length },
    { href: `${base}/activity`, label: t(dict.project.tabs.activity), icon: Activity },
    ...(canEdit ? [{ href: `${base}/settings`, label: t(dict.project.tabs.settings), icon: Settings }] : []),
  ];
  const isActive = (item: { href: string; exact?: boolean }) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const setStatus = (status: string) =>
    start(async () => {
      const r = await setProjectStatusAction(project.id, status);
      if (r?.error) toast(r.error, "error");
      else toast(r?.message ?? t(dict.common.changesSaved));
    });

  const actionsMenu = canEdit ? (
    <Menu
      trigger={({ toggle }) => (
        <Button variant="ghost" size="iconSm" onClick={toggle} aria-label={t(dict.common.actions)} loading={pending}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem href={`${base}/settings`} icon={Settings} onClick={close}>
            {t(dict.project.settingsTitle)}
          </MenuItem>
          <MenuSeparator />
          {project.status === "archived" ? (
            <MenuItem
              icon={ArchiveRestore}
              onClick={() => {
                close();
                setStatus("active");
              }}
            >
              {t(dict.project.unarchive)}
            </MenuItem>
          ) : (
            <MenuItem
              icon={Archive}
              onClick={() => {
                close();
                setStatus("archived");
              }}
            >
              {t(dict.project.archive)}
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  ) : null;

  return (
    <>
      {/* Desktop: full-height sidebar beside the icon rail, same anatomy as the main sidebar. */}
      <aside className="fixed inset-y-0 start-16 z-30 hidden w-60 flex-col border-e border-line bg-white lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line px-2">
          <Link href="/projects" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-ink" aria-label={t(dict.projects.title)} title={t(dict.projects.title)}>
            <BackIcon className="h-4 w-4" />
          </Link>
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: project.color }} />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-sm font-bold text-ink" title={project.name}>
              {project.name}
            </h1>
            <p className="font-grotesk text-[11px] text-ink-soft">
              <span dir="ltr">{project.key}</span>
            </p>
          </div>
          {actionsMenu}
        </div>

        <div className="shrink-0 border-b border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <ProjectStatusBadge status={project.status} />
            <span className="font-grotesk text-[11px] font-medium text-ink-soft" dir="ltr">
              {counts.done}/{total} · {pct}%
            </span>
          </div>
          <ProgressBar value={pct} className="mt-2" />
          <NewTaskButton projectId={project.id} requireApproval={project.requireApproval} openProject={project.taskVisibility === "all"} members={assignees} labels={labels} currentUser={currentUser} size="sm" className="mt-3 w-full" />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2" aria-label={project.name}>
          {items.map((item) => (
            <SideNavItem key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(item)} count={item.count} />
          ))}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-line p-3 text-[11px] font-medium text-ink-soft">
          {owner && (
            <p className="flex items-center gap-1.5 truncate">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{owner.name}</span>
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span suppressHydrationWarning>{project.dueDate ? fmtShortDate(project.dueDate, lang) : t(dict.projects.noDue)}</span>
          </p>
          {members.length > 0 && (
            <div className="flex items-center justify-between pt-1">
              <AvatarStack people={members} size="xs" max={5} />
              <span className="font-grotesk" dir="ltr">
                {members.length}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile: compact full-bleed header with horizontal tabs. */}
      <div className="-mx-4 -mt-6 mb-5 border-b border-line bg-white px-4 pt-3 md:-mx-8 md:px-8 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: project.color }} />
          <h1 className="min-w-0 flex-1 truncate text-base font-bold text-ink">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
          <NewTaskButton projectId={project.id} requireApproval={project.requireApproval} openProject={project.taskVisibility === "all"} members={assignees} labels={labels} currentUser={currentUser} size="sm" />
          {actionsMenu}
        </div>
        <NavTabs items={items.map(({ href, label, exact, icon }) => ({ href, label, exact, icon }))} className="mt-2" />
      </div>
    </>
  );
}
