/**
 * The words that type a due date (docs/vault-format.md §3, "Typing dates"): `@today`,
 * `@tomorrow`, `@next week`, `@mon` … `@sun` (the next one, never today), `@nov 12` / `@12 nov`
 * (the next one from today) and `@2026-11-12`. Only the date is ever written.
 */
import { addDays, isISODate, nextWeekISO, weekdayOf } from '@/components/ui/DateQuickPicker/dates';

export interface DateSuggestion {
  /** What the menu shows ("Tomorrow"). */
  label: string;
  /** `YYYY-MM-DD`, or null for "No date". */
  date: string | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const LIMIT = 6;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const pad = (n: number) => String(n).padStart(2, '0');

/** The next date (today or later) on `month` (0-based) / `day`, or null if it never exists. */
function nextMonthDay(month: number, day: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1, year + 2, year + 3, year + 4]) {
    const date = `${y}-${pad(month + 1)}-${pad(day)}`;
    if (isISODate(date) && date >= today) return date;
  }
  return null;
}

function monthDay(query: string, today: string): DateSuggestion | null {
  const match =
    /^([a-z]{3,9})\s*(\d{1,2})$/.exec(query) ?? /^(\d{1,2})\s*([a-z]{3,9})$/.exec(query);
  if (!match) return null;
  const word = /\d/.test(match[1]!) ? match[2]! : match[1]!;
  const day = Number(/\d/.test(match[1]!) ? match[1] : match[2]);
  const month = MONTHS.findIndex((name) => name.startsWith(word));
  if (month === -1) return null;
  const date = nextMonthDay(month, day, today);
  return date ? { label: `${day} ${capital(MONTHS[month]!.slice(0, 3))}`, date } : null;
}

/** The suggestions for what follows `@` (empty: the common ones), best first. */
export function suggestDates(input: string, today: string): DateSuggestion[] {
  const query = input.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(query))
    return isISODate(query) ? [{ label: query, date: query }] : [];
  const exact = monthDay(query, today);
  if (exact) return [exact];
  const words: DateSuggestion[] = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'Next week', date: nextWeekISO(today) },
  ];
  const weekday = weekdayOf(today);
  for (let step = 1; step <= 7; step += 1) {
    const name = WEEKDAYS[(weekday + step) % 7]!;
    words.push({ label: capital(name), date: addDays(today, step) });
  }
  return words.filter((w) => w.label.toLowerCase().startsWith(query)).slice(0, LIMIT);
}
