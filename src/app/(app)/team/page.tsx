import type { Metadata } from "next";
import { EmployeeDialog } from "@/components/team/employee-dialog";
import { TeamTable } from "@/components/team/team-table";
import { PageHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canManageTeam, isStaff } from "@/lib/permissions";
import { listTeam } from "@/lib/queries/users";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.nav.team) };
}

export default async function TeamPage() {
  const user = await requireUser();
  const { t } = await getT();
  // Workload numbers cover every project, so only staff see them.
  const showWorkload = isStaff(user.role);
  const team = await listTeam({ withWorkload: showWorkload });
  const manage = canManageTeam(user);

  return (
    <div>
      <PageHeader title={t(dict.team.title)} description={t(dict.team.subtitle)} actions={manage ? <EmployeeDialog /> : undefined} />
      <TeamTable
        people={team.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          jobTitle: u.jobTitle,
          department: u.department,
          phone: u.phone,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt,
          openTasks: u.openTasks,
          projectCount: u.projectCount,
          pushDevices: u.pushDevices,
        }))}
        canManage={manage}
        showWorkload={showWorkload}
        currentUserId={user.id}
      />
    </div>
  );
}
