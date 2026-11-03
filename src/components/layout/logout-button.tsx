"use client";

import { useFormStatus } from "react-dom";
import { usePush } from "@/components/push/push-provider";
import { logoutAction } from "@/lib/actions/auth";

function SubmitButton({ className, label, children }: { className: string; label?: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} title={label} aria-label={label}>
      {children}
    </button>
  );
}

/**
 * Sign-out button. Signing out also stops notifications on this device, so
 * the next person who uses it does not receive them. `label` names an icon-only button.
 */
export function LogoutButton({ className, formClassName, label, children }: { className: string; formClassName?: string; label?: string; children: React.ReactNode }) {
  const { detach } = usePush();
  return (
    <form
      className={formClassName}
      action={async (formData) => {
        formData.set("pushEndpoint", await detach());
        await logoutAction(formData);
      }}
    >
      <SubmitButton className={className} label={label}>
        {children}
      </SubmitButton>
    </form>
  );
}
