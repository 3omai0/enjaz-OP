"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { SafeUser, TaskPriority, TaskStatus } from "@/db/schema";
import { setTaskAssigneesAction, setTaskFieldAction } from "@/lib/actions/tasks";
import { PERSONAL_STATUS_ORDER, PRIORITY_META, PRIORITY_ORDER, TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { isValidDateOnly } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { canSetStatus } from "@/lib/permissions";
import { AssigneePicker, type MemberOption } from "./task-form-dialog";

type FieldName = "status" | "priority" | "dueDate";
type Values = { status: TaskStatus; priority: TaskPriority; dueDate: string | null };

/** Waiting time after the last keystroke in the date field before it saves on its own. */
const DATE_SAVE_DELAY_MS = 800;

/**
 * Status, who, when and how urgent. Each change shows at once and is saved in
 * the background; if saving fails the field goes back and a message explains
 * why. The date only saves once it is a complete, real date. The people on the
 * task are picked first and saved together, so each of them is notified once.
 */
export function TaskProperties({
  task,
  requireApproval,
  openProject = false,
  members,
  currentUser,
  canEdit,
  canMove,
  personal = false,
}: {
  task: Values & { id: string; assignees: MemberOption[] };
  requireApproval: boolean;
  /** Every member of the project sees every task (changes what the assignee hint says). */
  openProject?: boolean;
  members: MemberOption[];
  currentUser: Pick<SafeUser, "id" | "role">;
  canEdit: boolean;
  canMove: boolean;
  /** A personal task: always its owner's, and never in review. */
  personal?: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  // Local values win until the server confirms them; fresh server data resets them.
  const savedAssignees = task.assignees.map((a) => a.id);
  const snapshot = `${task.status}|${task.priority}|${savedAssignees.join(",")}|${task.dueDate ?? ""}`;
  const [seen, setSeen] = useState(snapshot);
  const [local, setLocal] = useState<Partial<Record<FieldName, string>>>({});
  // People picked but not saved yet; null while nothing changed.
  const [draft, setDraft] = useState<string[] | null>(null);
  if (seen !== snapshot) {
    setSeen(snapshot);
    setLocal({});
    setDraft(null);
  }
  const draftChanged = draft !== null && (draft.length !== savedAssignees.length || draft.some((id) => !savedAssignees.includes(id)));
  const [savingPeople, startPeople] = useTransition();

  const saveAssignees = () => {
    if (!draft) return;
    const next = draft;
    startPeople(async () => {
      const r = await setTaskAssigneesAction(task.id, next);
      if (r?.error) toast(r.error, "error");
      else {
        setDraft(null);
        if (r?.message && r.message !== t(dict.task.saved)) toast(r.message);
      }
    });
  };
  const value = (f: FieldName) => local[f] ?? (task[f] ?? "");

  // Due date: typing a year digit by digit passes through dates like 0002-05-01,
  // so it saves after a pause, on Enter, or when the field loses focus.
  const [dateDraft, setDateDraft] = useState<string | null>(null);
  const dateTimer = useRef<number | undefined>(undefined);
  const lastSentDate = useRef<string | null>(null);

  const save = (field: FieldName, next: string) => {
    setLocal((l) => ({ ...l, [field]: next }));
    start(async () => {
      const r = await setTaskFieldAction(task.id, field, next);
      // Once the server has answered, the same date may be chosen again later.
      if (field === "dueDate") lastSentDate.current = null;
      if (r?.error) {
        toast(r.error, "error");
        setLocal((l) => {
          const rest = { ...l };
          delete rest[field];
          return rest;
        });
      } else if (r?.message && r.message !== t(dict.task.saved)) {
        toast(r.message);
      }
    });
  };

  const commitDate = (next: string) => {
    window.clearTimeout(dateTimer.current);
    if (next === (task.dueDate ?? "") || next === lastSentDate.current) return;
    if (next && !isValidDateOnly(next)) {
      toast(t(dict.common.invalidDate), "error");
      setDateDraft(null);
      return;
    }
    lastSentDate.current = next;
    save("dueDate", next);
  };

  const statusOptions = (personal ? PERSONAL_STATUS_ORDER : TASK_STATUS_ORDER).map((s) => ({ s, allowed: canSetStatus(currentUser, { requireApproval }, task.status, s) }));
  const statusLocked = !statusOptions.some((o) => o.s !== task.status && o.allowed);
  const needsApproval = requireApproval && !canSetStatus(currentUser, { requireApproval }, "in_review", "done");

  return (
    <Card>
      <CardHeader title={t(dict.task.properties)} action={pending || savingPeople ? <span className="text-[11px] font-medium text-ink-soft">{t(dict.common.saving)}</span> : undefined} />
      <div className="space-y-4">
        <Field label={t(dict.task.status)} htmlFor="prop-status" hint={needsApproval && canMove ? (statusLocked ? t(dict.task.completeLocked) : t(dict.task.approvalNote)) : undefined}>
          <select id="prop-status" value={value("status")} onChange={(e) => save("status", e.target.value)} disabled={!canMove || statusLocked} className="field">
            {statusOptions.map(({ s, allowed }) => (
              <option key={s} value={s} disabled={!allowed}>
                {t(TASK_STATUS_META[s].label)}
                {!allowed ? ` (${t(dict.task.approverOnly)})` : ""}
              </option>
            ))}
          </select>
        </Field>
        {!personal && (
          <Field label={t(dict.task.assignees)} hint={canEdit ? (openProject ? t(dict.task.assigneesHintOpen) : t(dict.task.assigneesHint)) : undefined}>
            <AssigneePicker members={members} currentUser={currentUser} value={draft ?? savedAssignees} onChange={setDraft} current={task.assignees} disabled={!canEdit || savingPeople} />
            {draftChanged && (
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={savingPeople}>
                  {t(dict.common.cancel)}
                </Button>
                <Button size="sm" onClick={saveAssignees} loading={savingPeople}>
                  {t(dict.picker.save)}
                </Button>
              </div>
            )}
          </Field>
        )}
        <Field label={t(dict.task.dueDate)} htmlFor="prop-due">
          <input
            id="prop-due"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={dateDraft ?? value("dueDate")}
            onFocus={(e) => setDateDraft(e.currentTarget.value)}
            onChange={(e) => {
              const next = e.target.value;
              setDateDraft(next);
              window.clearTimeout(dateTimer.current);
              // A half-erased date also reads as ""; only a truly empty field means "no due date".
              if (e.target.validity.badInput) return;
              if (next === "" || isValidDateOnly(next)) dateTimer.current = window.setTimeout(() => commitDate(next), DATE_SAVE_DELAY_MS);
            }}
            onBlur={(e) => {
              const next = e.currentTarget.value;
              const incomplete = e.currentTarget.validity.badInput;
              setDateDraft(null);
              // Leaving the field with half a date keeps the saved one.
              if (!incomplete) commitDate(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            disabled={!canEdit}
            className="field"
          />
        </Field>
        <Field label={t(dict.task.priority)} htmlFor="prop-priority">
          <select id="prop-priority" value={value("priority")} onChange={(e) => save("priority", e.target.value)} disabled={!canEdit} className="field">
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {t(PRIORITY_META[p].label)}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Card>
  );
}
