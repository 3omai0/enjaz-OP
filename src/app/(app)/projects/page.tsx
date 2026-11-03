import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectsToolbar } from "@/components/projects/projects-toolbar";
import { EmptyState, PageHeader } from "@/components/ui/card";
import type { ProjectStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { PROJECT_STATUS_ORDER } from "@/lib/constants";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canCreateProject } from "@/lib/permissions";
import { listPeopleOptions, listProjectsForUser } from "@/lib/queries/projects";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.nav.projects) };
}

type Search = { q?: string; status?: string; archived?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const { t } = await getT();
  const sp = await searchParams;
  const status = (PROJECT_STATUS_ORDER as string[]).includes(sp.status ?? "") ? (sp.status as ProjectStatus) : "all";
  const creator = canCreateProject(user);
  const [projects, people] = await Promise.all([listProjectsForUser(user, { q: sp.q, status, includeArchived: sp.archived === "1" }), creator ? listPeopleOptions() : Promise.resolve([])]);
  const createButton = creator ? <CreateProjectDialog people={people} currentUserId={user.id} /> : undefined;

  return (
    <div>
      <PageHeader title={t(dict.projects.title)} description={t(dict.projects.subtitle)} actions={createButton} />
      <ProjectsToolbar values={{ q: sp.q ?? "", status, archived: sp.archived === "1" }} />

      {projects.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-white">
          <EmptyState
            icon={FolderKanban}
            title={creator ? t(dict.projects.empty) : t(dict.projects.emptyMember)}
            description={creator ? t(dict.projects.emptyDesc) : t(dict.projects.emptyMemberDesc)}
            action={createButton}
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
