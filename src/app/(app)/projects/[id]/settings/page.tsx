import { notFound, redirect } from "next/navigation";
import { DangerZone } from "@/components/projects/danger-zone";
import { LabelsManager } from "@/components/projects/labels-manager";
import { ProjectSettingsForm } from "@/components/projects/project-settings-form";
import { requireUser } from "@/lib/auth/session";
import { canDeleteProject, canEditProject, canTransferProject } from "@/lib/permissions";
import { loadProject } from "@/lib/queries/access";
import { getProjectLabels, getProjectMembers } from "@/lib/queries/projects";
import { getUserById } from "@/lib/queries/users";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await loadProject(user, id);
  if (!project) notFound();
  if (!canEditProject(user, project)) redirect(`/projects/${id}`);
  const [members, labels] = await Promise.all([getProjectMembers(id), getProjectLabels(id)]);

  // Owner candidates: active members, plus the current owner even when deactivated or no longer a member.
  const owners = members.filter((m) => m.user.isActive || m.userId === project.ownerId).map((m) => ({ id: m.user.id, name: m.user.name, isActive: m.user.isActive }));
  if (!owners.some((o) => o.id === project.ownerId)) {
    const owner = await getUserById(project.ownerId);
    if (owner) owners.unshift({ id: owner.id, name: owner.name, isActive: owner.isActive });
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <ProjectSettingsForm key={project.updatedAt.getTime()} project={project} owners={owners} canTransfer={canTransferProject(user, project)} />
      <div className="space-y-6">
        <LabelsManager projectId={id} labels={labels} />
        <DangerZone project={{ id: project.id, key: project.key, status: project.status }} canDelete={canDeleteProject(user, project)} />
      </div>
    </div>
  );
}
