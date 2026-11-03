import { Briefcase, ChevronLeft, ChevronRight, FolderKanban, ListChecks, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskList } from "@/components/tasks/task-row";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badge";
import { Card, CardHeader, StatTile } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { isStaff } from "@/lib/permissions";
import { listProjectsForUser } from "@/lib/queries/projects";
import { listMyTasks } from "@/lib/queries/tasks";
import { getUserById } from "@/lib/queries/users";
import { projectHref } from "@/lib/routes";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const person = await getUserById((await params).id);
  return person ? { title: person.name } : {};
}

export default async function TeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const { id } = await params;
  const person = await getUserById(id);
  if (!person) notFound();
  const { t, lang } = await getT();
  // Staff and the person themselves see their tasks; everyone else only the projects they share.
  const canSeeWork = isStaff(viewer.role) || viewer.id === person.id;
  const [tasks, projects] = await Promise.all([canSeeWork ? listMyTasks(person.id) : Promise.resolve([]), listProjectsForUser(viewer, { memberId: person.id })]);
  const BackIcon = lang === "ar" ? ChevronRight : ChevronLeft;
  // Staff see all of the person's projects; everyone else only the ones they share.
  const projectsTitle = isStaff(viewer.role) ? t(dict.team.projects) : t(dict.team.profileProjects);

  return (
    <div>
      <Link href="/team" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-ink-soft transition-colors hover:text-brand">
        <BackIcon className="h-4 w-4" />
        {t(dict.team.title)}
      </Link>

      <Card className="mb-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <Avatar id={person.id} name={person.name} size="xl" solid />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-ink">{person.name}</h1>
              <RoleBadge role={person.role} />
              {!person.isActive && <span className="rounded-md bg-ink/5 px-2 py-0.5 text-xs font-bold text-ink-soft">{t(dict.team.inactive)}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm font-bold text-ink-soft">
              {(person.jobTitle || person.department) && (
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4" />
                  {[person.jobTitle, person.department].filter(Boolean).join(" · ")}
                </span>
              )}
              <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1.5 font-grotesk hover:text-brand" dir="ltr">
                <Mail className="h-4 w-4" />
                {person.email}
              </a>
              {person.phone && (
                <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1.5 font-grotesk hover:text-brand" dir="ltr">
                  <Phone className="h-4 w-4" />
                  {person.phone}
                </a>
              )}
            </div>
            <p className="mt-2 text-xs font-bold text-ink-soft/70">
              {t(dict.team.joined)} {fmtDate(person.createdAt, lang)}
            </p>
          </div>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {canSeeWork && <StatTile label={t(dict.team.openTasks)} value={tasks.length} icon={ListChecks} tone="brand" />}
        <StatTile label={projectsTitle} value={projects.length} icon={FolderKanban} tone="default" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {canSeeWork && (
          <Card padded={false}>
            <CardHeader className="mb-0 px-5 pb-3 pt-5" title={t(dict.team.profileTasks)} />
            <div className="border-t border-line">
              <TaskList tasks={tasks} showProject currentUser={{ id: viewer.id, role: viewer.role }} emptyTitle={viewer.id === person.id ? t(dict.myTasks.empty) : t(dict.team.noTasks)} />
            </div>
          </Card>
        )}
        <Card padded={false}>
          <CardHeader className="mb-0 px-5 pb-3 pt-5" title={projectsTitle} />
          <div className="border-t border-line">
            {projects.length === 0 ? (
              <p className="px-5 py-6 text-sm font-medium text-ink-soft">{t(dict.dashboard.noProjects)}</p>
            ) : (
              <ul className="divide-y divide-line">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={projectHref(p.id)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-paper">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg font-grotesk text-xs font-bold text-white" style={{ background: p.color }} dir="ltr">
                        {p.key.slice(0, 3)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{p.name}</span>
                      <span className="font-grotesk text-xs font-bold text-ink-soft">
                        <span dir="ltr">
                          {p.doneTasks}/{p.totalTasks}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
