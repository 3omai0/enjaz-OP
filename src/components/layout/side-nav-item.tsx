"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * One row of a sidebar. The icon sits in a fixed 32px box so it stays centered
 * when the sidebar collapses to a 64px rail; the label and counters fade out.
 */
export function SideNavItem({
  href,
  label,
  icon: Icon,
  active,
  expanded = true,
  count,
  badge,
}: {
  href: string;
  label: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  expanded?: boolean;
  count?: number;
  badge?: string;
}) {
  const fade = cn("transition-opacity duration-150", expanded ? "opacity-100" : "opacity-0");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-10 items-center rounded-md px-2 text-sm font-medium transition-colors", active ? "bg-brand/8 text-brand" : "text-ink-soft hover:bg-paper hover:text-ink")}
    >
      <span className="relative flex h-10 w-8 shrink-0 items-center justify-center">
        <Icon className="h-[18px] w-[18px]" />
        {badge && !expanded && <span className="absolute top-2 end-1 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />}
      </span>
      <span className={cn(fade, "ms-2 min-w-0 flex-1 truncate whitespace-nowrap")}>{label}</span>
      {typeof count === "number" && (
        <span className={cn(fade, "font-grotesk text-xs", active ? "text-brand" : "text-ink-soft")} dir="ltr">
          {count}
        </span>
      )}
      {badge && (
        <span className={cn(fade, "rounded bg-brand px-1.5 py-0.5 font-grotesk text-[10px] font-semibold leading-none text-white")} dir="ltr">
          {badge}
        </span>
      )}
    </Link>
  );
}
