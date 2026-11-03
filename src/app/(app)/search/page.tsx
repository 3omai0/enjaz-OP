import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { ProjectCard } from "@/components/projects/project-card";
import { TaskList } from "@/components/tasks/task-row";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { listProjectsForUser } from "@/lib/queries/projects";
import { searchTasks } from "@/lib/queries/tasks";
import { clip } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.search.title) };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requireUser();
  const { t, tp } = await getT();
  const raw = (await searchParams).q;
  const query = clip((Array.isArray(raw) ? raw[0] : raw ?? "").trim(), 100);
  const [tasks, projects] = query ? await Promise.all([searchTasks(user, query), listProjectsForUser(user, { q: query, includeArchived: true })]) : [[], []];
  const empty = projects.length === 0 && tasks.length === 0;

  return (
    <div>
      <PageHeader title={t(dict.search.title)} description={query ? `${t(dict.search.for)}: “${query}”` : t(dict.search.hint)} />
      {query && empty ? (
        <div className="rounded-lg border border-dashed border-line bg-white">
          <EmptyState icon={SearchX} title={t(dict.common.noResults)} description={t(dict.search.empty)} />
        </div>
      ) : (
        <div className="space-y-8">
          {projects.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold text-ink-soft">
                {t(dict.search.projects)} · {tp(dict.plurals.projects, projects.length)}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </section>
          )}
          {tasks.length > 0 && (
            <Card padded={false}>
              <CardHeader className="mb-0 px-5 pb-3 pt-5" title={`${t(dict.search.tasks)} · ${tp(dict.plurals.tasks, tasks.length)}`} />
              <div className="border-t border-line">
                <TaskList tasks={tasks} showProject currentUser={{ id: user.id, role: user.role }} emptyTitle="" />
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
