"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

export type TabItem = { href: string; label: React.ReactNode; count?: number; exact?: boolean; icon?: React.ComponentType<{ className?: string }> };

export function NavTabs({ items, className }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className={cn("scrollbar-hide relative -mb-px flex gap-4 overflow-x-auto", className)} aria-label={t(dict.common.sections)}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors",
              active ? "border-brand text-ink" : "border-transparent text-ink-soft hover:text-ink"
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {item.label}
            {typeof item.count === "number" && (
              <span className="font-grotesk text-xs text-ink-soft" dir="ltr">
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Segmented control for switching views (client state, not routes). Fills the width on phones. A null value leaves every option unpressed. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode; count?: number; icon?: React.ComponentType<{ className?: string }> }>;
  /** What the choice is about, for screen readers. */
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex h-9 items-stretch rounded-lg border border-line bg-paper p-0.5 sm:inline-flex", className)} role="group" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors sm:flex-none",
              active ? "border-line bg-white text-ink" : "border-transparent text-ink-soft hover:text-ink"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {o.label}
            {typeof o.count === "number" && (
              <span className={cn("font-grotesk text-xs", active ? "text-brand" : "text-ink-soft")} dir="ltr">
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
