import { notFound } from "next/navigation";
import { MembersPanel } from "@/components/projects/members-panel";
import { requireUser } from "@/lib/auth/session";
import { canManageMembers, canSeeAllTasks } from "@/lib/permissions";
import { loadProject } from "@/lib/queries/access";
import { getMemberOpenCounts, getProjectMembers, listAddableUsers } from "@/lib/queries/projects";

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await loadProject(user, id);
  if (!project) notFound();
  const manage = canManageMembers(user);
  // Other people's open task counts are only shown to those who may see every task here.
  const [members, addable, openCounts] = await Promise.all([
    getProjectMembers(id),
    manage ? listAddableUsers(id) : Promise.resolve([]),
    canSeeAllTasks(user, project) ? getMemberOpenCounts(id) : Promise.resolve(null),
  ]);

  return (
    <MembersPanel
      projectId={id}
      ownerId={project.ownerId}
      canManage={manage}
      members={members.map((m) => ({
        userId: m.userId,
        role: m.role,
        openTasks: openCounts ? (openCounts.get(m.userId) ?? 0) : null,
        user: m.user,
      }))}
      addable={addable}
    />
  );
}
