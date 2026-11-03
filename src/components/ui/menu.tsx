"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAnchoredPanel } from "./anchored";

/** Items reachable with the keyboard (disabled ones are skipped). */
const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * Lightweight dropdown: click the trigger, click outside or press Escape to
 * close. The list is drawn on top of the page (in a portal) next to the
 * trigger, so a scrolling container such as a wide table never cuts it off.
 * It opens upwards when there is no room below, stays inside the screen and
 * follows the trigger while anything scrolls. Arrow keys move between items.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  className,
  width = "min-w-44",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  /** Which inline edge of the list lines up with the trigger (end is left in Arabic, right in English). */
  align?: "start" | "end";
  className?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  /** Close and hand the keyboard back to the trigger. */
  const closeToTrigger = () => {
    setOpen(false);
    anchorRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useAnchoredPanel(open, anchorRef, panelRef, align);
  // Once placed, the keyboard moves into the list.
  useLayoutEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  }, [open]);

  const onPanelKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      (e.key === "Home" ? items[0] : items[items.length - 1])?.focus();
    } else if (e.key === "Tab" || e.key === "Escape") {
      // The list lives at the end of the page, so leaving it goes back to the trigger.
      e.preventDefault();
      closeToTrigger();
    }
  };

  return (
    <div ref={anchorRef} className={cn("relative inline-block", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <div ref={panelRef} role="menu" onKeyDown={onPanelKey} className={cn("invisible fixed z-[95] rounded-md border border-line bg-white p-1", width)}>
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body
        )}
    </div>
  );
}

type ItemProps = {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
};

export function MenuItem({ icon: Icon, children, onClick, href, danger = false, active = false, disabled = false }: ItemProps) {
  const classes = cn(
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm font-medium transition-colors",
    danger ? "text-danger hover:bg-danger/6" : "text-ink hover:bg-paper",
    active && "bg-brand/8 text-brand",
    disabled && "pointer-events-none opacity-50"
  );
  const content = (
    <>
      {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-soft" />}
      <span className="flex-1 truncate">{children}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes} role="menuitem" onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} role="menuitem" onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold text-ink-soft">{children}</div>;
}
