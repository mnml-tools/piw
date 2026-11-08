/**
 * Pure all-day date helpers. Dates are 'YYYY-MM-DD' strings in the user's local calendar; the
 * arithmetic runs in UTC so DST changes never shift a day. "Today" is always injectable.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 0 = Sunday … 6 = Saturday (as `Date#getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function toUtc(iso: string): Date | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year); // years 0–99 would otherwise map to 1900–1999
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function fromUtc(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30). */
export function isISODate(value: unknown): value is string {
  return typeof value === 'string' && toUtc(value) !== null;
}

/** Local calendar date of `date` as 'YYYY-MM-DD'. */
export function toISODate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of an ISO date, or null when invalid. */
export function parseISODate(iso: string): Date | null {
  const utc = toUtc(iso);
  if (!utc) return null;
  const local = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  local.setFullYear(utc.getUTCFullYear());
  return local;
}

/** Today in the local calendar ('YYYY-MM-DD'). */
export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** `iso` plus `days` (may be negative). Throws on an invalid date. */
export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  if (!date) throw new RangeError(`Invalid ISO date: ${iso}`);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Day of the week of an ISO date (0 = Sunday). */
export function weekdayOf(iso: string): Weekday {
  const date = toUtc(iso);
  if (!date) throw new RangeError(`Invalid ISO date: ${iso}`);
  return date.getUTCDay() as Weekday;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const a = toUtc(from);
  const b = toUtc(to);
  if (!a || !b) throw new RangeError(`Invalid ISO date: ${a ? to : from}`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Tomorrow relative to `today`. */
export function tomorrowISO(today: string): string {
  return addDays(today, 1);
}

/**
 * "Next week" = the first day of next week (docs/ui-design-system.md §7). Always 1–7 days ahead: on
 * the first day of a week it is the same weekday a week later.
 */
export function nextWeekISO(today: string, weekStartsOn: Weekday = 1): string {
  const offset = (weekStartsOn - weekdayOf(today) + 7) % 7 || 7;
  return addDays(today, offset);
}

export type QuickDateOption = 'today' | 'tomorrow' | 'nextWeek' | 'clear';

/** Resolves a quick option to a date ('clear' → null). */
export function resolveQuickDate(
  option: QuickDateOption,
  today: string,
  weekStartsOn: Weekday = 1,
): string | null {
  switch (option) {
    case 'today':
      return today;
    case 'tomorrow':
      return tomorrowISO(today);
    case 'nextWeek':
      return nextWeekISO(today, weekStartsOn);
    case 'clear':
      return null;
  }
}
