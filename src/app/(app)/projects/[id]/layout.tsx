import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProjectSidebar } from "@/components/projects/project-sidebar";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canEditProject } from "@/lib/permissions";
import { loadProject } from "@/lib/queries/access";
import { getAssigneeOptions, getProjectLabels, getProjectMembers, getProjectStatusCounts } from "@/lib/queries/projects";
import { personalHref } from "@/lib/routes";

/**
 * Pages inside a project are titled with the project's name; a task page
 * replaces it with the task, keeping the app name at the end.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return {};
  const project = await loadProject(user, (await params).id);
  if (!project) return {};
  const { t } = await getT();
  return { title: { absolute: `${project.name} | ${t(dict.app.name)}`, template: `%s | ${t(dict.app.name)}` } };
}

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await loadProject(user, id);
  if (!project) notFound();
  // A personal space has its own page; it never opens as a team project.
  if (project.personalOwnerId) redirect(personalHref);

  const [members, labels, counts, assignees] = await Promise.all([getProjectMembers(id), getProjectLabels(id), getProjectStatusCounts(user, project), getAssigneeOptions(user, id)]);
  const active = members.filter((m) => m.user.isActive).map((m) => ({ id: m.user.id, name: m.user.name }));
  const owner = members.find((m) => m.userId === project.ownerId)?.user ?? null;

  return (
    <>
      <ProjectSidebar
        project={project}
        owner={owner ? { id: owner.id, name: owner.name } : null}
        members={active}
        assignees={assignees}
        labels={labels.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
        counts={counts}
        currentUser={{ id: user.id, role: user.role }}
        canEdit={canEditProject(user, project)}
      />
      {children}
    </>
  );
}
