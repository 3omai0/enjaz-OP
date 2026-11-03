import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { loadVisibleTask } from "@/lib/queries/access";
import { taskHref } from "@/lib/routes";

/** Legacy address kept for old notification links: sends the visitor to the task inside its project. */
export default async function LegacyTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const task = await loadVisibleTask(user, taskId);
  if (!task) notFound();
  redirect(taskHref(task.projectId, task.id));
}
