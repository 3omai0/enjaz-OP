"use client";

import { Check, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "@/components/ui/anchored";
import { RoleBadge } from "@/components/ui/badge";
import type { UserRole } from "@/db/schema";
import { ROLE_META } from "@/lib/constants";
import { fill } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

/** Delay before the card closes, so the pointer can move from the badge onto it. */
const CLOSE_DELAY = 120;

/**
 * A role badge that shows what the role may do: on hover, on keyboard focus,
 * or with a tap on touch screens (tap again, tap elsewhere or press Escape to
 * close). The card is drawn on top of the page, so the scrolling team table
 * never cuts it off. The team page gives it to administrators only.
 */
export function RoleWithPermissions({ role }: { role: UserRole }) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = useRef<number | undefined>(undefined);
  const name = t(ROLE_META[role].label);
  const perms = dict.team.permissions[role];
  const can = t(perms.can);
  const cannot = t(perms.cannot);

  useAnchoredPanel(open, anchorRef, panelRef, "start");
  useEffect(() => () => window.clearTimeout(closing.current), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const show = () => {
    window.clearTimeout(closing.current);
    setOpen(true);
  };
  const hideSoon = () => {
    window.clearTimeout(closing.current);
    closing.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY);
  };
  // Hover is for mice; touch screens open and close the card with a tap.
  const onEnter = (e: React.PointerEvent) => e.pointerType === "mouse" && show();
  const onLeave = (e: React.PointerEvent) => e.pointerType === "mouse" && hideSoon();

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        // Keyboard focus opens it; a tap also focuses the button, and the click below handles that.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show()}
        onBlur={hideSoon}
        onClick={(e) => {
          // A mouse already opened it on hover; a tap or the keyboard toggles it.
          if (e.detail === 0 || !open) show();
          else setOpen(false);
        }}
        aria-describedby={open ? id : undefined}
        className="relative cursor-help rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <RoleBadge role={role} />
        <span className="sr-only">{fill(t(dict.team.permissionsShow), { role: name })}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="tooltip"
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
            className="invisible fixed z-[95] w-96 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-white p-4 text-start"
          >
            <p className="text-sm font-bold text-ink">{fill(t(dict.team.permissionsTitle), { role: name })}</p>
            <p className="mt-3 text-[11px] font-bold text-success">{t(dict.team.permissionsCan)}</p>
            <ul className="mt-1.5 space-y-1.5">
              {can.map((line) => (
                <li key={line} className="flex gap-2 text-xs font-medium leading-relaxed text-ink">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            {cannot.length > 0 && (
              <>
                <p className="mt-3 text-[11px] font-bold text-danger">{t(dict.team.permissionsCannot)}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {cannot.map((line) => (
                    <li key={line} className="flex gap-2 text-xs font-medium leading-relaxed text-ink-soft">
                      <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" strokeWidth={2.5} aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
