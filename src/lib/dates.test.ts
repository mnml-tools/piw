import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, describeDueDate, formatDueDate, formatRelative } from './dates';

describe('dates', () => {
  const today = '2026-11-06';

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween(today, '2026-11-20')).toBe(14);
  });

  it('formats due dates relative to today', () => {
    expect(formatDueDate(today, today)).toBe('Today');
    expect(formatDueDate('2026-11-07', today)).toBe('Tomorrow');
    expect(formatDueDate('2026-11-05', today)).toBe('Yesterday');
    expect(formatDueDate('2026-11-20', today, 'en-GB')).toBe('20 Nov');
    expect(formatDueDate('2027-01-02', today, 'en-GB')).toBe('2 Jan 2027');
  });

  it('describes overdue dates for screen readers', () => {
    expect(describeDueDate('2026-11-03', today, 'en-GB')).toBe('Overdue, 3 November');
  });

  it('formats relative timestamps', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    expect(formatRelative('2026-11-06T11:59:30Z', now)).toBe('just now');
    expect(formatRelative('2026-11-04T12:00:00Z', now)).toBe('2d ago');
  });
});
