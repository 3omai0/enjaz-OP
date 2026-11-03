import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Checklist } from "@/components/tasks/checklist";
import { Comments } from "@/components/tasks/comments";
import { TaskActions } from "@/components/tasks/task-actions";
import { TaskProperties } from "@/components/tasks/task-properties";
import { GeneralBadge, LabelChip, PriorityBadge, StatusBadge, TaskKey } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canDeleteTask, canEditTask, canMoveTask } from "@/lib/permissions";
import { getAssigneeOptions, getProjectLabels } from "@/lib/queries/projects";
import { getTaskDetail } from "@/lib/queries/tasks";
import { projectHref, taskHref } from "@/lib/routes";

export async function generateMetadata({ params }: { params: Promise<{ taskId: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return {};
  const task = await getTaskDetail(user, (await params).taskId);
  return task ? { title: `${task.project.key}-${task.number} ${task.title}` } : {};
}

export default async function TaskPage({ params }: { params: Promise<{ id: string; taskId: string }> }) {
  const user = await requireUser();
  const { id, taskId } = await params;
  const task = await getTaskDetail(user, taskId);
  if (!task) notFound();
  // Keep the URL honest: a task always lives under its own project.
  if (task.projectId !== id) redirect(taskHref(task.projectId, task.id));

  const { t, lang } = await getT();
  const [assignees, labels] = await Promise.all([getAssigneeOptions(user, task.projectId), getProjectLabels(task.projectId)]);
  const currentUser = { id: user.id, role: user.role };
  const editable = canEditTask(user, task, task.project);
  const movable = canMoveTask(user, task, task.project);
  const people = task.assignees.map((a) => ({ id: a.user.id, name: a.user.name, hint: a.user.jobTitle }));
  const openProject = task.project.taskVisibility === "all";
  const Sep = lang === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div>
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-soft" aria-label={t(dict.common.breadcrumb)}>
        <Link href={projectHref(task.projectId)} className="inline-flex items-center gap-1.5 hover:text-ink">
          <span className="h-2 w-2 rounded-sm" style={{ background: task.project.color }} />
          {task.project.name}
        </Link>
        <Sep className="h-3.5 w-3.5 opacity-50" />
        <TaskKey projectKey={task.project.key} number={task.number} className="text-ink" />
      </nav>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={task.status} />
                  <PriorityBadge priority={task.priority} />
                  {task.assigneeIds.length === 0 && <GeneralBadge />}
                  {task.taskLabels.map((tl) => (
                    <LabelChip key={tl.label.id} name={tl.label.name} color={tl.label.color} />
                  ))}
                </div>
                <h1 className="text-xl font-bold leading-snug tracking-tight text-ink">{task.title}</h1>
              </div>
              <TaskActions
                task={{
                  id: task.id,
                  projectId: task.projectId,
                  title: task.title,
                  description: task.description,
                  status: task.status,
                  priority: task.priority,
                  assigneeIds: task.assigneeIds,
                  assignees: people,
                  dueDate: task.dueDate,
                  startDate: task.startDate,
                  estimateHours: task.estimateHours,
                  labelIds: task.taskLabels.map((tl) => tl.label.id),
                }}
                requireApproval={task.project.requireApproval}
                openProject={openProject}
                members={assignees}
                labels={labels}
                currentUser={currentUser}
                canEdit={editable}
                canDelete={canDeleteTask(user, task, task.project)}
              />
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <h2 className="mb-1.5 text-xs font-semibold text-ink-soft">{t(dict.task.description)}</h2>
              <p dir="auto" className={`prose-plain text-start text-sm font-medium ${task.description ? "text-ink" : "text-ink-soft/60"}`}>
                {task.description ?? t(dict.task.noDescription)}
              </p>
            </div>
          </Card>

          <Checklist taskId={task.id} items={task.checklist} canEdit={editable} canToggle={movable} />

          <Comments taskId={task.id} comments={task.comments} currentUser={currentUser} />
        </div>

        <aside className="space-y-5">
          <TaskProperties
            task={{ id: task.id, status: task.status, priority: task.priority, assignees: people, dueDate: task.dueDate }}
            requireApproval={task.project.requireApproval}
            openProject={openProject}
            members={assignees}
            currentUser={currentUser}
            canEdit={editable}
            canMove={movable}
          />

          <Card>
            <CardHeader title={t(dict.task.reference)} />
            <dl className="space-y-2.5 text-xs">
              <Row label={t(dict.task.project)} value={task.project.name} />
              <Row label={t(dict.task.createdBy)} value={task.creator?.name ?? t(dict.team.formerMember)} />
              <Row label={t(dict.common.created)} value={fmtDateTime(task.createdAt, lang)} />
              <Row label={t(dict.common.updated)} value={fmtDateTime(task.updatedAt, lang)} />
              {task.completedAt && <Row label={t(dict.task.completedOn)} value={fmtDateTime(task.completedAt, lang)} />}
              {task.estimateHours != null && <Row label={t(dict.task.estimate)} value={String(task.estimateHours)} />}
            </dl>
          </Card>

          <Card>
            <CardHeader title={t(dict.project.tabs.activity)} />
            <ActivityFeed items={task.history.map((h) => ({ ...h, taskId: task.id, projectId: task.projectId }))} compact />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-medium text-ink-soft">{label}</dt>
      <dd className="truncate font-semibold text-ink">{value}</dd>
    </div>
  );
}
