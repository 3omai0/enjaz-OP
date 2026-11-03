import { AlertCircle, CalendarClock, CheckCircle2, Hourglass, ListTodo } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { PushBanner } from "@/components/push/push-banner";
import { TaskList } from "@/components/tasks/task-row";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Card, CardHeader, PageHeader, StatTile } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/session";
import { fmtDate, hourInZone } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canCreateProject, isStaff } from "@/lib/permissions";
import { listPeopleOptions } from "@/lib/queries/projects";
import { getDashboard } from "@/lib/queries/tasks";
import { projectHref } from "@/lib/routes";
import { firstName, percent } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.nav.home) };
}

/**
 * Home answers one question first: what should I do now? My tasks lead,
 * then the projects I am part of; managers also get the approval queue and
 * the team's workload.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const { t, lang } = await getT();
  const creator = canCreateProject(user);
  const [data, people] = await Promise.all([getDashboard(user), creator ? listPeopleOptions() : Promise.resolve([])]);
  const hour = hourInZone();
  const greeting = hour < 12 ? t(dict.dashboard.morning) : hour < 17 ? t(dict.dashboard.afternoon) : t(dict.dashboard.evening);
  const staff = isStaff(user.role);
  const currentUser = { id: user.id, role: user.role };
  const { stats } = data;
  const maxOpen = Math.max(...data.workload.map((x) => x.open), 1);

  return (
    <div>
      <PageHeader
        eyebrow={fmtDate(new Date(), lang, { weekday: "long", day: "numeric", month: "long" })}
        title={fill(t(dict.dashboard.greeting), { greeting, name: firstName(user.name) })}
        description={staff ? t(dict.dashboard.subtitle) : t(dict.dashboard.memberSubtitle)}
        actions={creator ? <CreateProjectDialog people={people} currentUserId={user.id} /> : undefined}
      />

      <PushBanner />

      {staff ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label={t(dict.dashboard.stats.staffOpen)} value={stats.open} icon={ListTodo} href="/projects" />
          <StatTile label={t(dict.dashboard.stats.staffOverdue)} value={stats.overdue} icon={AlertCircle} tone={stats.overdue > 0 ? "danger" : "default"} />
          <StatTile label={t(dict.dashboard.stats.awaitingReview)} value={stats.review} icon={Hourglass} tone={stats.review > 0 ? "warning" : "default"} href={stats.review > 0 ? "#review" : undefined} />
          <StatTile label={t(dict.dashboard.stats.staffDone)} value={stats.doneMonth} icon={CheckCircle2} tone="success" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label={t(dict.dashboard.stats.myOpen)} value={stats.open} icon={ListTodo} href="/my-tasks" />
          <StatTile label={t(dict.dashboard.stats.myDueWeek)} value={stats.dueWeek} icon={CalendarClock} tone={stats.dueWeek > 0 ? "warning" : "default"} />
          <StatTile label={t(dict.dashboard.stats.myOverdue)} value={stats.overdue} icon={AlertCircle} tone={stats.overdue > 0 ? "danger" : "default"} />
          <StatTile label={t(dict.dashboard.stats.myDone)} value={stats.doneMonth} icon={CheckCircle2} tone="success" />
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {staff && stats.review > 0 && (
            <section id="review" className="scroll-mt-20">
              <Card padded={false}>
                <CardHeader className="mb-0 px-4 pb-3 pt-4" title={t(dict.dashboard.review)} description={t(dict.dashboard.reviewDesc)} />
                <div className="border-t border-line">
                  <TaskList tasks={data.review} showProject showStatus={false} currentUser={currentUser} emptyTitle={t(dict.dashboard.noReview)} />
                </div>
              </Card>
            </section>
          )}

          <Card padded={false}>
            <CardHeader className="mb-0 px-4 pb-3 pt-4" title={t(dict.nav.myTasks)} description={t(dict.dashboard.myTasksDesc)} action={<Link href="/my-tasks" className="text-xs font-semibold text-brand hover:text-brand-deep">{t(dict.common.viewAll)}</Link>} />
            <div className="border-t border-line">
              <TaskList tasks={data.focus} showProject showStatus currentUser={currentUser} emptyTitle={t(dict.dashboard.noFocus)} />
            </div>
          </Card>

          <Card padded={false}>
            <CardHeader
              className="mb-0 px-4 pb-3 pt-4"
              title={staff ? t(dict.nav.projects) : t(dict.dashboard.myProjects)}
              description={staff ? t(dict.dashboard.allProjectsDesc) : t(dict.dashboard.myProjectsDesc)}
              action={<Link href="/projects" className="text-xs font-semibold text-brand hover:text-brand-deep">{t(dict.common.viewAll)}</Link>}
            />
            <div className="border-t border-line">
              {data.projects.length === 0 ? (
                <p className="px-4 py-6 text-sm font-medium text-ink-soft">{t(dict.dashboard.noProjects)}</p>
              ) : (
                <ul className="rows">
                  {data.projects.map((p) => {
                    const pct = percent(p.done, p.total);
                    return (
                      <li key={p.id}>
                        <Link href={projectHref(p.id)} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink group-hover:text-brand">{p.name}</span>
                          <AvatarStack people={p.members} size="xs" max={3} />
                          <ProgressBar value={pct} className="hidden w-28 sm:block" />
                          <span className="w-16 text-end font-grotesk text-xs font-medium text-ink-soft">
                            <span dir="ltr">
                              {p.done}/{p.total}
                            </span>
                          </span>
                          <span className="w-10 text-end font-grotesk text-xs font-semibold text-ink">
                            <span dir="ltr">{pct}%</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          {staff && data.workload.length > 0 && (
            <Card>
              <CardHeader title={t(dict.dashboard.workload)} description={t(dict.dashboard.workloadDesc)} />
              <ul className="space-y-2.5">
                {data.workload.map((w) => (
                  <li key={w.id}>
                    <Link href={`/team/${w.id}`} className="group flex items-center gap-2.5">
                      <Avatar name={w.name} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink group-hover:text-brand">{w.name}</span>
                      <ProgressBar value={(w.open / maxOpen) * 100} tone={w.overdue > 0 ? "bg-danger" : "bg-brand"} className="w-20" />
                      <span className="w-8 text-end font-grotesk text-xs font-medium text-ink-soft">
                        <span dir="ltr">{w.open}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card padded={false}>
            <CardHeader className="mb-0 px-4 pb-3 pt-4" title={t(dict.dashboard.upcoming)} description={t(dict.dashboard.upcomingDesc)} />
            <div className="border-t border-line">
              <TaskList tasks={data.upcoming} showProject showStatus={false} currentUser={currentUser} emptyTitle={t(dict.dashboard.noUpcoming)} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t(dict.dashboard.recentActivity)} />
            <ActivityFeed items={data.activity} showProject compact />
          </Card>
        </aside>
      </div>
    </div>
  );
}
