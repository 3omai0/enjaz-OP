"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, MoreOptions, SubmitButton } from "@/components/ui/form";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import type { Recurrence, SafeUser, TaskPriority } from "@/db/schema";
import { saveRecurringTaskAction } from "@/lib/actions/recurring";
import type { ActionState } from "@/lib/actions/types";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/constants";
import { useLang, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { canAssignOthers } from "@/lib/permissions";
import type { PersonOption } from "@/lib/queries/projects";
import { minutesToClock } from "@/lib/recurrence";
import { monthNames, weekdayNames } from "@/lib/recurrence-text";
import { cn } from "@/lib/utils";

export type RecurringFormValues = {
  id?: string;
  projectId?: string;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  assigneeIds?: string[];
  labelIds?: string[];
  recurrence?: Recurrence;
  minuteOfDay?: number;
  weekdays?: number[];
  dayOfMonth?: number | null;
  month?: number | null;
};

/** A project the schedule can live in; "personal" is the user's own space. */
export type ProjectChoice = { id: string; name: string; color: string; personal?: boolean; members: PersonOption[]; labels: Array<{ id: string; name: string; color: string }> };

const RECURRENCES: Recurrence[] = ["daily", "weekly", "monthly", "yearly"];

/**
 * Create or edit a recurring task: what it is, where it goes, who it is
 * for, and when it comes round. The rule fields change with the chosen
 * frequency: weekdays for weekly, a day for monthly, a month and day for
 * yearly; every one has a reminder time.
 */
export function RecurringDialog({
  open,
  onClose,
  projects,
  currentUser,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectChoice[];
  currentUser: Pick<SafeUser, "id" | "role">;
  initial?: RecurringFormValues;
}) {
  const t = useT();
  const { lang } = useLang();
  const { toast } = useToast();
  const editing = !!initial?.id;
  const [projectId, setProjectId] = useState(initial?.projectId ?? projects[0]?.id ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? "daily");
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? []);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assigneeIds ?? []);
  const [labelIds, setLabelIds] = useState<string[]>(initial?.labelIds ?? []);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setProjectId(initial?.projectId ?? projects[0]?.id ?? "");
      setRecurrence(initial?.recurrence ?? "daily");
      setWeekdays(initial?.weekdays ?? []);
      setAssigneeIds(initial?.assigneeIds ?? []);
      setLabelIds(initial?.labelIds ?? []);
    }
  }
  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const personal = !!project?.personal;
  const days = weekdayNames(lang, "short");
  const months = monthNames(lang);

  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await saveRecurringTaskAction(prev, fd);
    if (r?.ok) {
      toast(r.message ?? t(dict.recurring.saved));
      onClose();
    }
    return r;
  }, null);
  const errors = state?.fieldErrors ?? {};
  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));
  const toggleLabel = (id: string) => setLabelIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const pill = (on: boolean) => cn("inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2.5 text-sm font-medium transition-colors", on ? "border-brand bg-brand/8 text-brand" : "border-line bg-white text-ink-soft hover:border-brand/40 hover:text-ink");

  return (
    <Dialog open={open} onClose={onClose} title={editing ? t(dict.recurring.editTitle) : t(dict.recurring.createTitle)} description={editing ? undefined : t(dict.recurring.createDesc)} size="md">
      <form action={action} className="space-y-4" key={initial?.id ?? "new"}>
        {editing && <input type="hidden" name="id" value={initial?.id} />}
        <input type="hidden" name="projectId" value={personal ? "personal" : projectId} />
        <input type="hidden" name="recurrence" value={recurrence} />
        {weekdays.map((d) => (
          <input key={d} type="hidden" name="weekdays" value={d} />
        ))}
        {labelIds.map((id) => (
          <input key={id} type="hidden" name="labelIds" value={id} />
        ))}
        <FormError message={state?.error} />

        <Field label={t(dict.task.title)} htmlFor="r-title" error={errors.title}>
          <input id="r-title" name="title" defaultValue={initial?.title ?? ""} required maxLength={300} autoFocus placeholder={t(dict.task.titlePlaceholder)} className="field" />
        </Field>

        {!editing && projects.length > 1 && (
          <Field label={t(dict.recurring.where)} htmlFor="r-project">
            <select id="r-project" value={projectId} onChange={(e) => { setProjectId(e.target.value); setAssigneeIds([]); setLabelIds([]); }} className="field">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.personal ? t(dict.recurring.personalSpace) : p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t(dict.recurring.frequency)}>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t(dict.recurring.frequency)}>
            {RECURRENCES.map((r) => (
              <button key={r} type="button" aria-pressed={recurrence === r} onClick={() => setRecurrence(r)} className={pill(recurrence === r)}>
                {t(dict.recurring[r])}
              </button>
            ))}
          </div>
        </Field>

        {recurrence === "weekly" && (
          <Field label={t(dict.recurring.weekdays)} error={errors.weekdays}>
            <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t(dict.recurring.weekdays)}>
              {days.map((name, d) => (
                <button key={d} type="button" aria-pressed={weekdays.includes(d)} onClick={() => toggleDay(d)} className={cn(pill(weekdays.includes(d)), "px-1 text-xs")}>
                  {name}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className={cn("grid grid-cols-1 gap-4", recurrence === "yearly" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {recurrence === "yearly" && (
            <Field label={t(dict.recurring.monthLabel)} htmlFor="r-month" error={errors.month}>
              <select id="r-month" name="month" defaultValue={initial?.month ?? 1} className="field">
                {months.map((name, i) => (
                  <option key={i} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {(recurrence === "monthly" || recurrence === "yearly") && (
            <Field label={recurrence === "monthly" ? t(dict.recurring.dayOfMonth) : t(dict.recurring.dayNumber)} htmlFor="r-day" error={errors.dayOfMonth} hint={t(dict.recurring.dayOfMonthHint)}>
              <select id="r-day" name="dayOfMonth" defaultValue={initial?.dayOfMonth ?? 1} className="field font-grotesk" dir="ltr">
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t(dict.recurring.time)} htmlFor="r-time" error={errors.time}>
            <input id="r-time" name="time" type="time" required defaultValue={minutesToClock(initial?.minuteOfDay ?? 540)} className="field font-grotesk" dir="ltr" />
          </Field>
        </div>

        {!personal && project && (
          <Field label={t(dict.recurring.assignees)} error={errors.assigneeIds} hint={t(dict.recurring.assigneesHint)}>
            <PeoplePicker
              people={canAssignOthers(currentUser) ? project.members : project.members.filter((m) => m.id === currentUser.id)}
              value={assigneeIds}
              onChange={setAssigneeIds}
              name="assigneeIds"
              currentUserId={currentUser.id}
              emptyLabel={t(dict.task.generalEmpty)}
              allOption={{ kind: "none", label: t(dict.task.generalEmpty) }}
              canToggle={(id) => canAssignOthers(currentUser) || id === currentUser.id}
            />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t(dict.task.priority)} htmlFor="r-priority" error={errors.priority}>
            <select id="r-priority" name="priority" defaultValue={initial?.priority ?? "medium"} className="field">
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {t(PRIORITY_META[p].label)}
                </option>
              ))}
            </select>
          </Field>
          {project && project.labels.length > 0 && (
            <Field label={personal ? t(dict.personal.category) : t(dict.task.labels)} optional>
              <div className="flex flex-wrap gap-1.5">
                {project.labels.map((l) => {
                  const on = labelIds.includes(l.id);
                  return (
                    <button key={l.id} type="button" onClick={() => toggleLabel(l.id)} aria-pressed={on} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors", on ? "border-brand bg-brand/8 text-ink" : "border-line bg-white text-ink-soft hover:border-brand/40")}>
                      <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        </div>

        <MoreOptions defaultOpen={!!initial?.description}>
          <Field label={t(dict.task.description)} htmlFor="r-desc" optional>
            <textarea id="r-desc" name="description" rows={3} dir="auto" defaultValue={initial?.description ?? ""} placeholder={t(dict.task.descriptionPlaceholder)} className="field resize-y" />
          </Field>
        </MoreOptions>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            {t(dict.common.cancel)}
          </Button>
          <SubmitButton pendingText={t(dict.common.saving)}>{editing ? t(dict.common.save) : t(dict.recurring.add)}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

/** Button that opens the dialog for a new schedule. */
export function NewRecurringButton({ projects, currentUser, variant = "primary", size = "md", className }: { projects: ProjectChoice[]; currentUser: Pick<SafeUser, "id" | "role">; variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (projects.length === 0) return null;
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} className={className}>
        <Plus className="h-4 w-4" />
        {t(dict.recurring.add)}
      </Button>
      <RecurringDialog open={open} onClose={() => setOpen(false)} projects={projects} currentUser={currentUser} />
    </>
  );
}
