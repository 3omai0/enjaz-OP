import { notFound } from "next/navigation";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { ProjectTasksView } from "@/components/tasks/project-tasks-view";
import { TaskTable } from "@/components/tasks/task-table";
import { requireUser } from "@/lib/auth/session";
import { canSeeAllTasks } from "@/lib/permissions";
import { loadProject } from "@/lib/queries/access";
import { getAssigneeOptions, getProjectLabels } from "@/lib/queries/projects";
import { listProjectTaskPage } from "@/lib/queries/tasks";
import { parseTaskFilters, parseTaskView, type SearchInput } from "@/lib/task-filters";

/**
 * Every task of a project in one place: the board (the default) or the list,
 * switched from the page header, with the same quick switch and filters for
 * both. It replaces the separate board, list and "my tasks" pages.
 */
export default async function ProjectTasksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchInput> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await loadProject(user, id);
  if (!project) notFound();
  const query = await searchParams;
  const view = parseTaskView(query);
  // The board shows every status as a column, so the status filter belongs to the list.
  const filters = { ...parseTaskFilters(query), ...(view === "board" ? { status: "all" as const } : {}) };
  const [{ tasks, counts }, assignees, labels] = await Promise.all([listProjectTaskPage(user, project, filters), getAssigneeOptions(user, id), getProjectLabels(id)]);
  const currentUser = { id: user.id, role: user.role };
  // Filtering by a person only helps someone who can see other people's tasks.
  const people = canSeeAllTasks(user, project) ? assignees.filter((m) => !m.outside) : [];
  const filtered = [filters.assignee, filters.priority, filters.label, filters.status].some((v) => v && v !== "all") || !!filters.due || !!filters.q;

  return (
    <ProjectTasksView view={view} values={filters} counts={counts} people={people} labels={labels}>
      {view === "board" ? (
        <KanbanBoard tasks={tasks} projectId={id} projectKey={project.key} requireApproval={project.requireApproval} openProject={project.taskVisibility === "all"} currentUser={currentUser} members={assignees} labels={labels} />
      ) : (
        <TaskTable
          tasks={tasks}
          projectKey={project.key}
          filtered={filtered}
          emptyAction={<NewTaskButton projectId={id} requireApproval={project.requireApproval} openProject={project.taskVisibility === "all"} members={assignees} labels={labels} currentUser={currentUser} />}
        />
      )}
    </ProjectTasksView>
  );
}
