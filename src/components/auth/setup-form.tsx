"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { setupAction } from "@/lib/actions/auth";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

export function SetupForm() {
  const t = useT();
  const [state, action] = useActionState(setupAction, null);
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      <FormError message={state?.error} />
      <Field label={t(dict.team.name)} htmlFor="name" error={errors.name}>
        <input id="name" name="name" required autoComplete="name" className="field" />
      </Field>
      <Field label={t(dict.common.email)} htmlFor="email" error={errors.email}>
        <input id="email" name="email" type="email" required autoComplete="email" dir="ltr" placeholder={t(dict.auth.emailPlaceholder)} className="field font-grotesk" />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t(dict.common.password)} htmlFor="password" error={errors.password} hint={t(dict.common.passwordMin)}>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className="field font-grotesk" />
        </Field>
        <Field label={t(dict.auth.confirmPassword)} htmlFor="confirm" error={errors.confirm}>
          <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className="field font-grotesk" />
        </Field>
      </div>
      <SubmitButton size="lg" className="w-full">
        <ShieldCheck className="h-4 w-4" />
        {t(dict.auth.createAdmin)}
      </SubmitButton>
    </form>
  );
}
