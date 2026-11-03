"use client";

import { fmtDateTime, fmtRelative } from "@/lib/format";
import { useLang } from "@/lib/i18n/client";

/**
 * Relative timestamp. The server and the client compute it a moment apart, so
 * React is told not to treat the small text difference as a hydration error.
 */
export function TimeAgo({ date, className }: { date: Date | string; className?: string }) {
  const { lang } = useLang();
  const iso = date instanceof Date ? date.toISOString() : date;
  return (
    <time dateTime={iso} title={fmtDateTime(date, lang)} className={className} suppressHydrationWarning>
      {fmtRelative(date, lang)}
    </time>
  );
}
