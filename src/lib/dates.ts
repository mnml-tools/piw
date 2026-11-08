/** Calendar-date helpers. Dates are `YYYY-MM-DD` strings in the user's local time zone. */

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function todayString(now: Date = new Date()): string {
  return toDateString(now);
}

export function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export function daysBetween(from: string, to: string): number {
  const ms = parseDate(to).getTime() - parseDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** "Today", "Tomorrow", "Yesterday", weekday within a week, else "14 Nov" (+ year if needed). */
export function formatDueDate(value: string, today: string, locale?: string): string {
  const diff = daysBetween(today, value);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const date = parseDate(value);
  if (diff > 1 && diff < 7) {
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }
  const sameYear = date.getFullYear() === parseDate(today).getFullYear();
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Long form for accessible labels: "Overdue, 3 November". */
export function describeDueDate(value: string, today: string, locale?: string): string {
  const long = parseDate(value).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  return value < today ? `Overdue, ${long}` : `Due ${formatDueDate(value, today, locale)}, ${long}`;
}

/** "2d ago", "just now"… for Trash and metadata. `iso` is a UTC timestamp. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
