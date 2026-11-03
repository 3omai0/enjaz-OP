import type { Metadata } from "next";
import { MyTasksView } from "@/components/tasks/my-tasks-filters";
import { MyTasksGroups } from "@/components/tasks/my-tasks-groups";
import { PageHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { parseMyTasksFilters } from "@/lib/my-tasks";
import { getMyTasksScope } from "@/lib/my-tasks/server";
import { listProjectOptions } from "@/lib/queries/projects";
import { listMyTasksPage } from "@/lib/queries/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.nav.myTasks) };
}

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const [{ t }, params, scope] = await Promise.all([getT(), searchParams, getMyTasksScope()]);
  const filters = parseMyTasksFilters(params, scope);
  const [{ tasks, counts }, projects] = await Promise.all([listMyTasksPage(user, filters), listProjectOptions(user)]);

  return (
    <div>
      <PageHeader title={t(dict.myTasks.title)} description={t(dict.myTasks.subtitle)} />
      <MyTasksView values={filters} counts={counts} projects={projects}>
        <MyTasksGroups tasks={tasks} filters={filters} currentUser={{ id: user.id, role: user.role }} />
      </MyTasksView>
    </div>
  );
}
