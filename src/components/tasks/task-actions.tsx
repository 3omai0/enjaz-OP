"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { SafeUser } from "@/db/schema";
import { deleteTaskAction } from "@/lib/actions/tasks";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { personalHref, projectTasksHref } from "@/lib/routes";
import { TaskFormDialog, type LabelOption, type MemberOption, type TaskFormValues } from "./task-form-dialog";

/** Edit and delete. The status is changed from the properties panel only. */
export function TaskActions({
  task,
  requireApproval,
  openProject = false,
  members,
  labels,
  currentUser,
  canEdit,
  canDelete,
  personal = false,
}: {
  task: TaskFormValues & { id: string; projectId: string };
  requireApproval: boolean;
  /** Every member of the project sees every task. */
  openProject?: boolean;
  members: MemberOption[];
  labels: LabelOption[];
  currentUser: Pick<SafeUser, "id" | "role">;
  canEdit: boolean;
  canDelete: boolean;
  /** A personal task: edited without people, and deleting goes back to the personal tasks. */
  personal?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      const r = await deleteTaskAction(task.id);
      if (r?.error) toast(r.error, "error");
      else {
        toast(r?.message ?? t(dict.task.deleted));
        router.push(personal ? personalHref : projectTasksHref(task.projectId));
      }
    });

  if (!canEdit && !canDelete) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {canEdit && (
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
          {t(dict.common.edit)}
        </Button>
      )}
      {canDelete && (
        <Menu
          trigger={({ toggle }) => (
            <Button variant="secondary" size="icon" onClick={toggle} aria-label={t(dict.common.actions)}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        >
          {(close) => (
            <MenuItem
              icon={Trash2}
              danger
              onClick={() => {
                close();
                setDeleteOpen(true);
              }}
            >
              {t(dict.task.deleteTask)}
            </MenuItem>
          )}
        </Menu>
      )}
      {canEdit && (
        <TaskFormDialog open={editOpen} onClose={() => setEditOpen(false)} projectId={task.projectId} requireApproval={requireApproval} openProject={openProject} members={members} labels={labels} currentUser={currentUser} initial={task} />
      )}
      <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={remove} loading={pending} title={t(dict.task.deleteTask)} confirmLabel={t(dict.common.delete)} />
    </div>
  );
}
