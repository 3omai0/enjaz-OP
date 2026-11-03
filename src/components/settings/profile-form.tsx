"use client";

import { useActionState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { updateProfileAction } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/types";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

export function ProfileForm({ user }: { user: { name: string; email: string; jobTitle: string | null; department: string | null; phone: string | null } }) {
  const t = useT();
  const { toast } = useToast();
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await updateProfileAction(prev, fd);
    if (r?.ok) toast(r.message ?? t(dict.common.changesSaved));
    return r;
  }, null);

  return (
    <Card>
      <CardHeader title={t(dict.settings.profile)} description={t(dict.settings.profileDesc)} />
      <form action={action} className="space-y-5">
        <FormError message={state?.error} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t(dict.team.name)} htmlFor="pf-name" error={state?.fieldErrors?.name}>
            <input id="pf-name" name="name" defaultValue={user.name} required className="field" />
          </Field>
          <Field label={t(dict.common.email)} htmlFor="pf-email">
            <input id="pf-email" value={user.email} disabled dir="ltr" className="field font-grotesk" />
          </Field>
          <Field label={t(dict.team.jobTitle)} htmlFor="pf-job" optional>
            <input id="pf-job" name="jobTitle" defaultValue={user.jobTitle ?? ""} className="field" />
          </Field>
          <Field label={t(dict.team.department)} htmlFor="pf-dept" optional>
            <input id="pf-dept" name="department" defaultValue={user.department ?? ""} className="field" />
          </Field>
          <Field label={t(dict.team.phone)} htmlFor="pf-phone" optional>
            <input id="pf-phone" name="phone" type="tel" defaultValue={user.phone ?? ""} dir="ltr" className="field font-grotesk" />
          </Field>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText={t(dict.common.saving)}>{t(dict.common.save)}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
