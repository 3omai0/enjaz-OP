"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import type { SafeUser, TaskStatus } from "@/db/schema";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { TaskFormDialog, type LabelOption, type MemberOption } from "./task-form-dialog";

export function NewTaskButton({
  projectId,
  requireApproval,
  openProject = false,
  members,
  labels,
  currentUser,
  defaultStatus,
  variant = "primary",
  size = "md",
  label,
  className,
  personal = false,
}: {
  projectId: string;
  requireApproval: boolean;
  /** Every member of the project sees every task. */
  openProject?: boolean;
  members: MemberOption[];
  labels: LabelOption[];
  currentUser: Pick<SafeUser, "id" | "role">;
  defaultStatus?: TaskStatus;
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  className?: string;
  /** Adds to a personal space (no people, no review). */
  personal?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} className={className}>
        <Plus className="h-4 w-4" />
        {label ?? t(dict.project.newTask)}
      </Button>
      <TaskFormDialog
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        requireApproval={requireApproval}
        openProject={openProject}
        members={members}
        labels={labels}
        currentUser={currentUser}
        initial={defaultStatus ? { status: defaultStatus } : undefined}
        personal={personal}
      />
    </>
  );
}
