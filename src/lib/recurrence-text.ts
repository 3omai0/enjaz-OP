import type { Recurrence } from "@/db/schema";
import { fill, localeOf, type Lang } from "@/lib/i18n";
import { dict } from "@/lib/i18n/dictionary";
import { minutesToClock, type Rule } from "@/lib/recurrence";

/*
 * Words for a schedule. Weekday and month names come from Intl in the
 * reader's language; the sentence shapes live in the dictionary.
 */

/** Names of the weekdays, Sunday first, in the reader's language. */
export function weekdayNames(lang: Lang, style: "long" | "short" = "long"): string[] {
  const f = new Intl.DateTimeFormat(localeOf(lang), { weekday: style, timeZone: "UTC" });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2023, 0, 1 + i))));
}

/** Names of the months, January first, in the reader's language. */
export function monthNames(lang: Lang): string[] {
  const f = new Intl.DateTimeFormat(localeOf(lang), { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2023, i, 1))));
}

/** The clock time of a rule the way the reader writes it (09:30 / 9:30 AM). */
export function clockText(minuteOfDay: number, lang: Lang): string {
  const [h, m] = minutesToClock(minuteOfDay).split(":").map(Number);
  return new Intl.DateTimeFormat(localeOf(lang), { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1, h, m)));
}

const FREQUENCY: Record<Recurrence, keyof typeof dict.recurring.summary> = { daily: "daily", weekly: "weekly", monthly: "monthly", yearly: "yearly" };

/** One line that says when the schedule fires: "كل يوم الساعة 9:00". */
export function ruleSummary(rule: Rule, lang: Lang): string {
  const time = clockText(rule.minuteOfDay, lang);
  const t = <V>(pair: { ar: V; en: V }) => pair[lang];
  const listFormat = new Intl.ListFormat(lang === "ar" ? "ar" : "en", { style: "long", type: "conjunction" });
  switch (rule.recurrence) {
    case "daily":
      return fill(t(dict.recurring.summary.daily), { time });
    case "weekly": {
      const names = weekdayNames(lang);
      const days = [...rule.weekdays].sort().map((d) => names[d]);
      return fill(t(dict.recurring.summary.weekly), { days: days.length === 7 ? t(dict.recurring.daily).toLowerCase() : listFormat.format(days), time });
    }
    case "monthly":
      return fill(t(dict.recurring.summary.monthly), { day: String(rule.dayOfMonth ?? 1), time });
    case "yearly":
      return fill(t(dict.recurring.summary.yearly), { day: String(rule.dayOfMonth ?? 1), month: monthNames(lang)[(rule.month ?? 1) - 1], time });
  }
  return FREQUENCY[rule.recurrence];
}
