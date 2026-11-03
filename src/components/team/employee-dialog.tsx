"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, MoreOptions, SubmitButton } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { USER_ROLES, type UserRole } from "@/db/schema";
import { createEmployeeAction, updateEmployeeAction } from "@/lib/actions/team";
import type { ActionState } from "@/lib/actions/types";
import { ROLE_META } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

export type EmployeeValues = {
  id?: string;
  name?: string;
  email?: string;
  role?: UserRole;
  jobTitle?: string | null;
  department?: string | null;
  phone?: string | null;
};

/** "Add employee" button with its dialog, or a controlled edit dialog when `initial` and `open` are given. */
export function EmployeeDialog({ initial, open: controlledOpen, onClose }: { initial?: EmployeeValues; open?: boolean; onClose?: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [innerOpen, setInnerOpen] = useState(false);
  const editing = !!initial?.id;
  const open = controlledOpen ?? innerOpen;
  const close = () => (onClose ? onClose() : setInnerOpen(false));
  const [role, setRole] = useState<UserRole>(initial?.role ?? "member");
  const hasExtras = !!(initial?.jobTitle || initial?.department || initial?.phone);

  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = editing ? await updateEmployeeAction(prev, fd) : await createEmployeeAction(prev, fd);
    if (r?.ok) {
      toast(r.message ?? t(dict.common.changesSaved));
      close();
    }
    return r;
  }, null);
  const errors = state?.fieldErrors ?? {};

  return (
    <>
      {!editing && (
        <Button onClick={() => setInnerOpen(true)}>
          <Plus className="h-4 w-4" />
          {t(dict.team.addEmployee)}
        </Button>
      )}
      <Dialog open={open} onClose={close} title={editing ? t(dict.team.editEmployee) : t(dict.team.addEmployee)} description={editing ? undefined : t(dict.team.addDesc)} size="md">
        <form action={action} className="space-y-4" key={initial?.id ?? "new"}>
          {editing && <input type="hidden" name="userId" value={initial?.id} />}
          <input type="hidden" name="role" value={role} />
          <FormError message={state?.error} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t(dict.team.name)} htmlFor="e-name" error={errors.name}>
              <input id="e-name" name="name" defaultValue={initial?.name ?? ""} required autoFocus className="field" />
            </Field>
            <Field label={t(dict.team.email)} htmlFor="e-email" error={errors.email}>
              <input id="e-email" name="email" type="email" defaultValue={initial?.email ?? ""} required dir="ltr" className="field font-grotesk" />
            </Field>
            {!editing && (
              <Field label={t(dict.team.password)} htmlFor="e-password" error={errors.password} hint={t(dict.team.passwordHint)} className="sm:col-span-2">
                <input id="e-password" name="password" type="text" required minLength={8} maxLength={128} dir="ltr" autoComplete="off" className="field font-grotesk" />
              </Field>
            )}
          </div>

          <Field label={t(dict.team.role)} error={errors.role}>
            <div className="overflow-hidden rounded-md border border-line">
              {USER_ROLES.map((r, i) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-start transition-colors", i > 0 && "border-t border-line", role === r ? "bg-brand/6" : "bg-white hover:bg-paper")}
                >
                  <span className={cn("mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", role === r ? "border-brand" : "border-line")}>
                    {role === r && <span className="h-2 w-2 rounded-full bg-brand" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", role === r ? "text-brand" : "text-ink")}>{t(ROLE_META[r].label)}</span>
                    <span className="block text-xs font-medium leading-relaxed text-ink-soft">{t(ROLE_META[r].desc)}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <MoreOptions defaultOpen={hasExtras}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t(dict.team.jobTitle)} htmlFor="e-job" optional>
                <input id="e-job" name="jobTitle" defaultValue={initial?.jobTitle ?? ""} placeholder={t(dict.team.jobTitlePlaceholder)} className="field" />
              </Field>
              <Field label={t(dict.team.department)} htmlFor="e-dept" optional>
                <input id="e-dept" name="department" defaultValue={initial?.department ?? ""} placeholder={t(dict.team.departmentPlaceholder)} className="field" />
              </Field>
              <Field label={t(dict.team.phone)} htmlFor="e-phone" optional className="sm:col-span-2">
                <input id="e-phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} dir="ltr" className="field font-grotesk" />
              </Field>
            </div>
          </MoreOptions>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={close}>
              {t(dict.common.cancel)}
            </Button>
            <SubmitButton pendingText={t(dict.common.saving)}>{editing ? t(dict.common.save) : t(dict.team.addEmployee)}</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
