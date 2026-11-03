"use client";

import { X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

const noop = () => () => {};
/** false during SSR and hydration, true afterwards (portals need a document). */
export const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

const SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

/** Flat modal. Opens with a short CSS fade, closes instantly. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  footer?: React.ReactNode;
}) {
  const mounted = useMounted();
  const t = useT();

  useEffect(() => {
    if (!open) return;
    // A field that uses Escape itself (a search box closing its list) marks it handled.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="dialog-overlay fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn("dialog-panel flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg border border-line bg-white sm:rounded-lg", SIZES[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs font-medium leading-relaxed text-ink-soft">{description}</p>}
          </div>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label={t(dict.common.close)} className="-me-2 -mt-1">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger = true,
  loading = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t(dict.common.cancel)}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t(dict.common.confirm)}
          </Button>
        </>
      }
    >
      {children ?? <p className="text-sm font-medium text-ink-soft">{t(dict.common.deleteConfirm)}</p>}
    </Dialog>
  );
}
