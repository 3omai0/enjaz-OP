"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, MoreOptions, SubmitButton } from "@/components/ui/form";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import type { SafeUser, TaskPriority, TaskStatus } from "@/db/schema";
import { createTaskAction, updateTaskAction } from "@/lib/actions/tasks";
import type { ActionState } from "@/lib/actions/types";
import { PERSONAL_STATUS_ORDER, PRIORITY_META, PRIORITY_ORDER, TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { canAssignOthers, canSetStatus } from "@/lib/permissions";
import type { PersonOption } from "@/lib/queries/projects";
import { cn } from "@/lib/utils";

export type MemberOption = PersonOption;
export type LabelOption = { id: string; name: string; color: string };

export type TaskFormValues = {
  id?: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeIds?: string[];
  /** The current assignees with their names, shown even when they are no longer active members. */
  assignees?: Array<{ id: string; name: string }>;
  dueDate?: string | null;
  startDate?: string | null;
  estimateHours?: number | null;
  labelIds?: string[];
};

/**
 * The people on a task. Project members come first, then (for staff) the
 * rest of the team, who join the project when picked. Employees can only add
 * or remove themselves; everyone else already on the task stays as it is.
 */
export function AssigneePicker({
  members,
  currentUser,
  value,
  onChange,
  current = [],
  name,
  disabled,
}: {
  members: MemberOption[];
  currentUser: Pick<SafeUser, "id" | "role">;
  value: string[];
  onChange: (ids: string[]) => void;
  /** Who is on the task now; they stay listed even after leaving the project or the team. */
  current?: MemberOption[];
  name?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const staff = canAssignOthers(currentUser);
  const listed = [...members, ...current.filter((p) => !members.some((m) => m.id === p.id))];
  const people = staff ? listed : listed.filter((p) => p.id === currentUser.id || value.includes(p.id));
  return (
    <PeoplePicker
      people={people}
      value={value}
      onChange={onChange}
      name={name}
      currentUserId={currentUser.id}
      emptyLabel={t(dict.task.generalEmpty)}
      allOption={{ kind: "none", label: t(dict.task.generalEmpty) }}
      outsideLabel={t(dict.task.notInProject)}
      canToggle={(id) => staff || id === currentUser.id}
      disabled={disabled}
    />
  );
}

/**
 * One dialog for creating and editing tasks. Only the essentials are visible
 * (title, assignee, due date, priority); everything else sits behind "More
 * options". For a personal task there are no people and no review, and its
 * categories sit up front.
 */
export function TaskFormDialog({
  open,
  onClose,
  projectId,
  requireApproval,
  openProject = false,
  members,
  labels,
  currentUser,
  initial,
  onSaved,
  personal = false,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  requireApproval: boolean;
  /** Every member of the project sees every task (changes what the assignee hint says). */
  openProject?: boolean;
  members: MemberOption[];
  labels: LabelOption[];
  currentUser: Pick<SafeUser, "id" | "role">;
  initial?: TaskFormValues;
  onSaved?: (id?: string) => void;
  personal?: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const editing = !!initial?.id;
  const [picked, setPicked] = useState<string[]>(initial?.labelIds ?? []);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assigneeIds ?? []);
  // Every time the dialog opens it starts from the saved labels and people, never from an abandoned edit.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(initial?.labelIds ?? []);
      setAssigneeIds(initial?.assigneeIds ?? []);
    }
  }
  const hasExtras = !!(initial?.description || initial?.startDate || initial?.estimateHours || (!personal && initial?.labelIds && initial.labelIds.length > 0));
  const statusChoices = personal ? PERSONAL_STATUS_ORDER : TASK_STATUS_ORDER;
  const currentStatus = initial?.status ?? "todo";
  const statusAllowed = (s: TaskStatus) => canSetStatus(currentUser, { requireApproval }, editing ? currentStatus : "todo", s);
  const statusLocked = editing && !statusChoices.some((s) => s !== currentStatus && statusAllowed(s));

  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = editing ? await updateTaskAction(prev, fd) : await createTaskAction(prev, fd);
    if (result?.ok) {
      toast(result.message ?? t(dict.task.saved));
      onSaved?.(result.id);
      onClose();
      if (!editing) {
        setPicked([]);
        setAssigneeIds([]);
      }
    }
    return result;
  }, null);
  const errors = state?.fieldErrors ?? {};

  const toggleLabel = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const labelPicker = labels.length > 0 && (
    <Field label={t(personal ? dict.personal.category : dict.task.labels)} optional>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => {
          const on = picked.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggleLabel(l.id)}
              aria-pressed={on}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors", on ? "border-brand bg-brand/8 text-ink" : "border-line bg-white text-ink-soft hover:border-brand/40")}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
              {l.name}
            </button>
          );
        })}
      </div>
    </Field>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t(dict.task.editTitle) : t(personal ? dict.personal.createTitle : dict.task.createTitle)}
      description={editing ? undefined : t(personal ? dict.personal.createDesc : dict.task.createDesc)}
      size="md"
    >
      <form action={action} className="space-y-4" key={initial?.id ?? "new"}>
        <input type="hidden" name="projectId" value={projectId} />
        {editing && <input type="hidden" name="taskId" value={initial?.id} />}
        {picked.map((id) => (
          <input key={id} type="hidden" name="labelIds" value={id} />
        ))}
        <FormError message={state?.error} />

        <Field label={t(dict.task.title)} htmlFor="t-title" error={errors.title}>
          <input id="t-title" name="title" defaultValue={initial?.title ?? ""} required maxLength={300} autoFocus placeholder={t(dict.task.titlePlaceholder)} className="field" />
        </Field>

        {personal ? (
          labelPicker
        ) : (
          <Field label={t(dict.task.assignees)} error={errors.assigneeIds} hint={openProject ? t(dict.task.assigneesHintOpen) : t(dict.task.assigneesHint)}>
            <AssigneePicker members={members} currentUser={currentUser} value={assigneeIds} onChange={setAssigneeIds} current={initial?.assignees} name="assigneeIds" />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t(dict.task.dueDate)} htmlFor="t-due" error={errors.dueDate} optional>
            <input id="t-due" name="dueDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={initial?.dueDate ?? ""} className="field" />
          </Field>
          <Field label={t(dict.task.priority)} htmlFor="t-priority">
            <select id="t-priority" name="priority" defaultValue={initial?.priority ?? "medium"} className="field">
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {t(PRIORITY_META[p].label)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t(dict.task.status)} htmlFor="t-status" error={errors.status} hint={requireApproval && !canSetStatus(currentUser, { requireApproval }, "in_review", "done") ? (statusLocked ? t(dict.task.completeLocked) : t(dict.task.approvalNote)) : undefined}>
            {statusLocked && <input type="hidden" name="status" value={currentStatus} />}
            <select id="t-status" name={statusLocked ? undefined : "status"} defaultValue={currentStatus} disabled={statusLocked} className="field">
              {statusChoices.map((s) => (
                <option key={s} value={s} disabled={!statusAllowed(s)}>
                  {t(TASK_STATUS_META[s].label)}
                  {!statusAllowed(s) ? ` (${t(dict.task.approverOnly)})` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <MoreOptions defaultOpen={hasExtras} forceOpen={!!errors.startDate || !!errors.estimateHours}>
          <Field label={t(dict.task.description)} htmlFor="t-desc" optional>
            <textarea id="t-desc" name="description" rows={4} dir="auto" defaultValue={initial?.description ?? ""} placeholder={t(dict.task.descriptionPlaceholder)} className="field resize-y" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t(dict.task.startDate)} htmlFor="t-start" error={errors.startDate} optional>
              <input id="t-start" name="startDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={initial?.startDate ?? ""} className="field" />
            </Field>
            <Field label={t(dict.task.estimate)} htmlFor="t-estimate" error={errors.estimateHours} optional>
              <input id="t-estimate" name="estimateHours" type="number" min={0} max={10000} step={0.5} dir="ltr" defaultValue={initial?.estimateHours ?? ""} className="field font-grotesk" />
            </Field>
          </div>
          {!personal && labelPicker}
        </MoreOptions>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            {t(dict.common.cancel)}
          </Button>
          <SubmitButton pendingText={t(dict.common.saving)}>{editing ? t(dict.common.save) : t(dict.task.createTitle)}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
