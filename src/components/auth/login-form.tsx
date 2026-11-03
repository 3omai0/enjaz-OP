"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useActionState, useState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { loginAction } from "@/lib/actions/auth";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

export function LoginForm({ next }: { next: string }) {
  const t = useT();
  const [state, action] = useActionState(loginAction, null);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <FormError message={state?.error} />
      <Field label={t(dict.common.email)} htmlFor="email">
        <input id="email" name="email" type="email" required autoComplete="email" dir="ltr" placeholder={t(dict.auth.emailPlaceholder)} className="field font-grotesk" />
      </Field>
      <Field label={t(dict.common.password)} htmlFor="password">
        <div className="relative" dir="ltr">
          <input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password" dir="ltr" className="field pe-12 font-grotesk" />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-ink-soft hover:text-ink"
            aria-label={show ? t(dict.auth.hidePassword) : t(dict.auth.showPassword)}
            title={show ? t(dict.auth.hidePassword) : t(dict.auth.showPassword)}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText={t(dict.auth.signingIn)}>
        <LogIn className="h-4 w-4" />
        {t(dict.auth.signIn)}
      </SubmitButton>
      <p className="text-center text-xs font-medium text-ink-soft">{t(dict.auth.rememberHint)}</p>
    </form>
  );
}
