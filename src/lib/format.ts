import { localeOf, type Lang } from "@/lib/i18n";

/**
 * Every date the app shows or reasons about uses the team's time zone, so the
 * server (UTC on most hosts) and the browser always agree on "today", on
 * overdue tasks and on the clock times they print.
 */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE?.trim() || "Asia/Riyadh";

type DateInput = string | Date | null | undefined;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type Parsed = { date: Date; dateOnly: boolean };

/** Date-only strings become UTC midnight and are always formatted in UTC, so the calendar day never shifts. */
function parse(value: DateInput): Parsed | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false };
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return { date: new Date(Date.UTC(y, m - 1, d)), dateOnly: true };
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : { date: parsed, dateOnly: false };
}

const zoneOf = (p: Parsed) => (p.dateOnly ? "UTC" : APP_TIME_ZONE);

/** Calendar date (YYYY-MM-DD) of an instant in the app time zone. */
export function isoDateInZone(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's date in the app time zone, optionally shifted by whole days. */
export function todayISO(offsetDays = 0) {
  const today = isoDateInZone(new Date());
  return offsetDays ? addDaysISO(today, offsetDays) : today;
}

/** Current hour (0 to 23) in the app time zone. */
export function hourInZone(date = new Date()) {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(date);
  return Number(hour);
}

/** Offset of the app time zone from UTC at a given instant, in minutes. */
function zoneOffsetMinutes(at: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

/** The instant a calendar day starts in the app time zone. */
export function startOfDayInZone(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  return new Date(utcMidnight - zoneOffsetMinutes(new Date(utcMidnight)) * 60_000);
}

/** The instant the current month started in the app time zone. */
export function startOfMonthInZone() {
  return startOfDayInZone(`${todayISO().slice(0, 8)}01`);
}

export function fmtDate(value: DateInput, lang: Lang, options?: Intl.DateTimeFormatOptions) {
  const p = parse(value);
  if (!p) return "";
  return new Intl.DateTimeFormat(localeOf(lang), { ...(options ?? { day: "numeric", month: "long", year: "numeric" }), timeZone: zoneOf(p) }).format(p.date);
}

export function fmtShortDate(value: DateInput, lang: Lang) {
  const p = parse(value);
  if (!p) return "";
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: zoneOf(p), year: "numeric" }).format(p.date);
  const sameYear = year === todayISO().slice(0, 4);
  const options: Intl.DateTimeFormatOptions = sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(localeOf(lang), { ...options, timeZone: zoneOf(p) }).format(p.date);
}

export function fmtDateTime(value: DateInput, lang: Lang) {
  const p = parse(value);
  if (!p) return "";
  return new Intl.DateTimeFormat(localeOf(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zoneOf(p) }).format(p.date);
}

export function fmtNumber(value: number, lang: Lang) {
  return new Intl.NumberFormat(localeOf(lang)).format(value);
}

/** "3 hours ago" / "قبل 3 ساعات" style relative time. */
export function fmtRelative(value: DateInput, lang: Lang) {
  const p = parse(value);
  if (!p) return "";
  const diff = (p.date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

/** Whole days from today (app time zone) to the given date; negative when it has passed. */
export function daysUntil(value: DateInput) {
  const p = parse(value);
  if (!p) return null;
  const target = p.dateOnly ? p.date.toISOString().slice(0, 10) : isoDateInZone(p.date);
  const [ty, tm, td] = target.split("-").map(Number);
  const [cy, cm, cd] = todayISO().split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(cy, cm - 1, cd)) / 86_400_000);
}

export function isPast(value: DateInput) {
  const days = daysUntil(value);
  return days !== null && days < 0;
}

/** A real calendar date between the years 2000 and 2100; rejects half-typed years such as 0002. */
export function isValidDateOnly(value: string) {
  if (!DATE_ONLY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 2000 || y > 2100) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
