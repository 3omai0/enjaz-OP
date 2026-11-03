import type { Recurrence } from "@/db/schema";
import { APP_TIME_ZONE, isoDateInZone, startOfDayInZone } from "@/lib/format";

/*
 * When a recurring task comes round. Every rule is expressed in the team's
 * time zone (a clock time plus weekdays, a day of the month, or a date in the
 * year) and turned into the instant the next task is due. Pure functions, so
 * the cron route, the actions and the tests share one source of truth.
 */

export type Rule = {
  recurrence: Recurrence;
  /** Minutes after midnight in the team's time zone (09:30 is 570). */
  minuteOfDay: number;
  /** Weekly: 0 = Sunday ... 6 = Saturday. */
  weekdays: number[];
  /** Monthly and yearly: 1 to 31; a shorter month fires on its last day. */
  dayOfMonth: number | null;
  /** Yearly: 1 to 12. */
  month: number | null;
};

const DAY_MS = 86_400_000;

/** The instant of a clock time on a calendar day, in the team's time zone. */
export function atTimeInZone(iso: string, minuteOfDay: number): Date {
  return new Date(startOfDayInZone(iso).getTime() + minuteOfDay * 60_000);
}

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** 0 = Sunday ... 6 = Saturday for a calendar day. */
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The calendar day a monthly or yearly rule falls on in a given month: the day asked for, or the last day of a shorter month. */
export function dayInMonth(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whether the rule is complete enough to schedule. */
export function validRule(rule: Rule): boolean {
  if (!Number.isInteger(rule.minuteOfDay) || rule.minuteOfDay < 0 || rule.minuteOfDay > 1439) return false;
  switch (rule.recurrence) {
    case "daily":
      return true;
    case "weekly":
      return rule.weekdays.length > 0 && rule.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    case "monthly":
      return !!rule.dayOfMonth && rule.dayOfMonth >= 1 && rule.dayOfMonth <= 31;
    case "yearly":
      return !!rule.dayOfMonth && rule.dayOfMonth >= 1 && rule.dayOfMonth <= 31 && !!rule.month && rule.month >= 1 && rule.month <= 12;
  }
}

/**
 * The first instant strictly after `after` on which the rule fires. Daily and
 * weekly rules walk forward day by day (at most two weeks); monthly and
 * yearly rules jump by their period.
 */
export function nextOccurrence(rule: Rule, after: Date): Date {
  const startIso = isoDateInZone(after);
  if (rule.recurrence === "daily" || rule.recurrence === "weekly") {
    const days = rule.recurrence === "daily" ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(rule.weekdays)];
    for (let i = 0; i <= 14; i++) {
      const iso = addDays(startIso, i);
      if (!days.includes(weekdayOf(iso))) continue;
      const at = atTimeInZone(iso, rule.minuteOfDay);
      if (at.getTime() > after.getTime()) return at;
    }
    throw new Error("No weekday to fire on.");
  }
  const [year, month] = startIso.split("-").map(Number);
  const dayOfMonth = rule.dayOfMonth ?? 1;
  if (rule.recurrence === "monthly") {
    for (let i = 0; i <= 13; i++) {
      const total = month - 1 + i;
      const y = year + Math.floor(total / 12);
      const m = (total % 12) + 1;
      const at = atTimeInZone(dayInMonth(y, m, dayOfMonth), rule.minuteOfDay);
      if (at.getTime() > after.getTime()) return at;
    }
  } else {
    const m = rule.month ?? 1;
    for (let i = 0; i <= 2; i++) {
      const at = atTimeInZone(dayInMonth(year + i, m, dayOfMonth), rule.minuteOfDay);
      if (at.getTime() > after.getTime()) return at;
    }
  }
  throw new Error("Could not find the next occurrence.");
}

/** Clock time of a minute-of-day as HH:MM (24-hour). */
export const minutesToClock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** HH:MM to minutes after midnight, or null when malformed. */
export function clockToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Whether a schedule that was due at `nextAt` should still fire now (not more than a day late, so a long outage does not flood). */
export const FIRE_GRACE_MS = DAY_MS;

export { APP_TIME_ZONE };
