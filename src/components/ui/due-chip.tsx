"use client";

import { CalendarDays } from "lucide-react";
import type { TaskStatus } from "@/db/schema";
import { daysUntil, fmtShortDate } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

/** Due date as quiet text; turns amber today and red once overdue (unless done). */
export function DueChip({ date, status, className, showIcon = true }: { date: string | null; status?: TaskStatus; className?: string; showIcon?: boolean }) {
  const { lang } = useLang();
  const t = useT();
  if (!date) return null;
  const days = daysUntil(date) ?? 0;
  const done = status === "done";
  let tone = "text-ink-soft";
  let text = fmtShortDate(date, lang);
  if (!done) {
    if (days < 0) {
      tone = "text-danger font-semibold";
      text = `${t(dict.common.overdue)} · ${fmtShortDate(date, lang)}`;
    } else if (days === 0) {
      tone = "text-warning font-semibold";
      text = t(dict.common.today);
    } else if (days === 1) {
      tone = "text-warning";
      text = t(dict.common.tomorrow);
    }
  }
  return (
    // "Today", "tomorrow" and overdue depend on the current day, which can change between server render and hydration.
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium", tone, className)} suppressHydrationWarning>
      {showIcon && <CalendarDays className="h-3.5 w-3.5" />}
      {text}
    </span>
  );
}
