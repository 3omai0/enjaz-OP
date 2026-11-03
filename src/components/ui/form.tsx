"use client";

import { ChevronDown, CircleAlert } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  error,
  optional = false,
  children,
  className,
  htmlFor,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const t = useT();
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label flex items-baseline gap-1.5">
        <span>{label}</span>
        {optional && <span className="font-medium text-ink-soft/60">({t(dict.common.optional)})</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
          <CircleAlert className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs font-medium text-ink-soft/80">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm font-medium text-danger" role="alert">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} loading={pending} disabled={disabled} className={cn(className)}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/** Color swatch picker used for projects and labels. */
export function ColorPicker({ name, colors, value, onChange }: { name?: string; colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {name && <input type="hidden" name={name} value={value} />}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          aria-pressed={value === c}
          className={cn("h-6 w-6 rounded-full ring-offset-2 transition-transform", value === c && "ring-2 ring-ink/60")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

/**
 * Collapsible "More options" block that keeps forms short by default.
 * `forceOpen` keeps it open while a field inside has an error, so the message is never hidden.
 */
export function MoreOptions({ children, defaultOpen = false, forceOpen = false, className }: { children: React.ReactNode; defaultOpen?: boolean; forceOpen?: boolean; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const shown = open || forceOpen;
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen(!shown)} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft transition-colors hover:text-ink" aria-expanded={shown}>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", shown && "rotate-180")} />
        {shown ? t(dict.common.lessOptions) : t(dict.common.moreOptions)}
      </button>
      <div className={cn("space-y-4 border-t border-line pt-4", shown ? "mt-3" : "hidden")}>{children}</div>
    </div>
  );
}
