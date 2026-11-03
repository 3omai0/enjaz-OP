import type { Metadata } from "next";
import { CategoriesButton } from "@/components/personal/categories-button";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { ProjectTasksView } from "@/components/tasks/project-tasks-view";
import { TaskTable } from "@/components/tasks/task-table";
import { requireUser } from "@/lib/auth/session";
import { PERSONAL_STATUS_ORDER } from "@/lib/constants";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { getPersonalProject } from "@/lib/queries/personal";
import { getProjectLabels } from "@/lib/queries/projects";
import { listProjectTasks } from "@/lib/queries/tasks";
import { parseTaskFilters, parseTaskView, type SearchInput } from "@/lib/task-filters";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.personal.title) };
}

/**
 * The person's own everyday tasks (study, the gym, homework...) in the same
 * board and list as a project's tasks, with category chips instead of the
 * people switch. Nobody else can see them, whatever their role.
 */
export default async function PersonalTasksPage({ searchParams }: { searchParams: Promise<SearchInput> }) {
  const user = await requireUser();
  const [project, query] = await Promise.all([getPersonalProject(user.id, user.locale), searchParams]);
  const view = parseTaskView(query);
  // A personal task is always its owner's, and the board shows every status as a column.
  const filters = { ...parseTaskFilters(query), assignee: "all", ...(view === "board" ? { status: "all" as const } : {}) };
  const [tasks, labels] = await Promise.all([listProjectTasks(user, project, { ...filters, label: "all" }), getProjectLabels(project.id)]);

  // The category chips count the tasks under the other filters; the chosen one then narrows the list.
  const category = filters.label && filters.label !== "all" ? filters.label : null;
  const shown = category ? tasks.filter((task) => task.labels.some((l) => l.id === category)) : tasks;
  const options = labels.map((l) => ({ id: l.id, name: l.name, color: l.color }));
  const categories = options.map((l) => ({ ...l, count: tasks.filter((task) => task.labels.some((x) => x.id === l.id)).length }));
  const currentUser = { id: user.id, role: user.role };
  const filtered = [filters.priority, filters.status, filters.label].some((v) => v && v !== "all") || !!filters.due || !!filters.q;
  const newTask = (className?: string) => <NewTaskButton projectId={project.id} requireApproval={false} members={[]} labels={options} currentUser={currentUser} personal className={className} />;

  return (
    <ProjectTasksView
      view={view}
      values={filters}
      counts={{ all: tasks.length, me: tasks.length, general: 0 }}
      people={[]}
      labels={options}
      personal={{
        actions: (
          <>
            {newTask("flex-1 sm:flex-none")}
            <CategoriesButton projectId={project.id} labels={options} />
          </>
        ),
        categories,
        total: tasks.length,
      }}
    >
      {view === "board" ? (
        <KanbanBoard tasks={shown} projectId={project.id} projectKey="" requireApproval={false} currentUser={currentUser} members={[]} labels={options} statuses={PERSONAL_STATUS_ORDER} personal />
      ) : (
        <TaskTable tasks={shown} projectKey="" filtered={filtered} personal emptyAction={newTask()} />
      )}
    </ProjectTasksView>
  );
}
