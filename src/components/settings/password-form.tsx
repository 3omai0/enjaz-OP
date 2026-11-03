"use client";

import { useActionState, useRef } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { changePasswordAction } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/types";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

export function PasswordForm() {
  const t = useT();
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await changePasswordAction(prev, fd);
    if (r?.ok) {
      toast(r.message ?? t(dict.settings.passwordChanged));
      formRef.current?.reset();
    }
    return r;
  }, null);
  const errors = state?.fieldErrors ?? {};

  return (
    <Card>
      <CardHeader title={t(dict.settings.password)} description={t(dict.settings.passwordDesc)} />
      <form ref={formRef} action={action} className="space-y-5">
        <FormError message={state?.error} />
        <Field label={t(dict.settings.currentPassword)} htmlFor="pw-current" error={errors.current}>
          <input id="pw-current" name="current" type="password" required autoComplete="current-password" dir="ltr" className="field font-grotesk sm:max-w-sm" />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t(dict.settings.newPassword)} htmlFor="pw-next" error={errors.next} hint={t(dict.common.passwordMin)}>
            <input id="pw-next" name="next" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className="field font-grotesk" />
          </Field>
          <Field label={t(dict.settings.confirmPassword)} htmlFor="pw-confirm" error={errors.confirm}>
            <input id="pw-confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className="field font-grotesk" />
          </Field>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText={t(dict.common.saving)}>{t(dict.settings.password)}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
