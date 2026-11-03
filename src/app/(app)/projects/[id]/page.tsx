import { CalendarDays, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { TaskList } from "@/components/tasks/task-row";
import { Avatar } from "@/components/ui/avatar";
import { LabelChip } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { daysUntil, fmtDate } from "@/lib/format";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canSeeAllTasks } from "@/lib/permissions";
import { listProjectActivity } from "@/lib/queries/activity";
import { loadProject } from "@/lib/queries/access";
import { getAssigneeOptions, getMemberOpenCounts, getProjectLabels, getProjectMembers } from "@/lib/queries/projects";
import { listProjectTasks } from "@/lib/queries/tasks";
import { projectTasksHref } from "@/lib/routes";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await loadProject(user, id);
  if (!project) notFound();
  const { t, tp, lang } = await getT();
  const seeAll = canSeeAllTasks(user, project);

  const [tasks, members, labels, activity, assignees, openCounts] = await Promise.all([
    listProjectTasks(user, project),
    getProjectMembers(id),
    getProjectLabels(id),
    listProjectActivity(user, project, 8),
    getAssigneeOptions(user, id),
    seeAll ? getMemberOpenCounts(id) : Promise.resolve(null),
  ]);
  const currentUser = { id: user.id, role: user.role };

  const mine = tasks.filter((x) => x.assignees.some((a) => a.id === user.id) && x.status !== "done");
  const general = tasks.filter((x) => x.assignees.length === 0 && x.status !== "done");
  const daysLeft = daysUntil(project.dueDate);
  const dateOpts = { day: "numeric", month: "short", year: "numeric" } as const;

  return (
    <div>
      <PageHeader title={t(dict.project.tabs.overview)} description={t(dict.project.pages.overviewDesc)} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card padded={false}>
            <CardHeader className="mb-0 px-4 pb-3 pt-4" title={t(dict.project.myTasks)} description={t(dict.project.myTasksDesc)} action={<Link href={projectTasksHref(id, { assignee: "me" })} className="text-xs font-semibold text-brand hover:text-brand-deep">{t(dict.common.viewAll)}</Link>} />
            <div className="border-t border-line">
              <TaskList tasks={mine.slice(0, 8)} projectKey={project.key} currentUser={currentUser} emptyTitle={t(dict.project.noMyTasks)} />
            </div>
          </Card>

          <Card padded={false}>
            <CardHeader
              className="mb-0 px-4 pb-3 pt-4"
              title={t(dict.project.generalTasks)}
              description={t(dict.project.generalTasksDesc)}
              action={<NewTaskButton projectId={id} requireApproval={project.requireApproval} openProject={project.taskVisibility === "all"} members={assignees} labels={labels} currentUser={currentUser} variant="secondary" size="sm" />}
            />
            <div className="border-t border-line">
              <TaskList tasks={general.slice(0, 8)} projectKey={project.key} currentUser={currentUser} emptyTitle={t(dict.project.noGeneralTasks)} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t(dict.dashboard.recentActivity)} action={<Link href={`/projects/${id}/activity`} className="text-xs font-semibold text-brand hover:text-brand-deep">{t(dict.common.viewAll)}</Link>} />
            <ActivityFeed items={activity} compact />
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title={t(dict.project.details)} />
            <p dir="auto" className={`prose-plain text-start text-sm font-medium ${project.description ? "text-ink" : "text-ink-soft/60"}`}>
              {project.description ?? t(dict.project.noDescription)}
            </p>
            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {t(dict.projects.startDate)}
                </dt>
                <dd className="font-semibold text-ink">{project.startDate ? fmtDate(project.startDate, lang, dateOpts) : t(dict.common.none)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {t(dict.projects.dueDate)}
                </dt>
                <dd className={`font-semibold ${daysLeft !== null && daysLeft < 0 && project.status !== "completed" ? "text-danger" : "text-ink"}`}>
                  {project.dueDate ? fmtDate(project.dueDate, lang, dateOpts) : t(dict.projects.noDue)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card padded={false}>
            <CardHeader
              className="mb-0 px-4 pb-3 pt-4"
              title={t(dict.project.membersTitle)}
              action={
                <Link href={`/projects/${id}/members`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-deep">
                  <Users className="h-3.5 w-3.5" />
                  {tp(dict.plurals.members, members.length)}
                </Link>
              }
            />
            <ul className="rows border-t border-line">
              {members.slice(0, 6).map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5 px-4 py-2.5">
                  <Avatar name={m.user.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{m.user.name}</p>
                    <p className="truncate text-[11px] font-medium text-ink-soft">{m.user.jobTitle ?? (m.role === "lead" ? t(dict.project.lead) : t(dict.project.memberRole))}</p>
                  </div>
                  {openCounts && (
                    <span className="font-grotesk text-xs font-medium text-ink-soft" title={tp(dict.plurals.openTasks, openCounts.get(m.userId) ?? 0)}>
                      <span dir="ltr">{openCounts.get(m.userId) ?? 0}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {labels.length > 0 && (
            <Card>
              <CardHeader title={t(dict.project.labelsTitle)} />
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <Link key={l.id} href={projectTasksHref(id, { label: l.id })}>
                    <LabelChip name={l.name} color={l.color} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
