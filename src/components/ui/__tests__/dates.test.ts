import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  isISODate,
  nextWeekISO,
  parseISODate,
  resolveQuickDate,
  toISODate,
  todayISO,
  tomorrowISO,
  weekdayOf,
} from '../DateQuickPicker/dates';

// 2026-11-06 is a Friday.
const FRIDAY = '2026-11-06';

describe('date helpers', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-11-06')).toBe(true);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-1-1')).toBe(false);
    expect(isISODate('')).toBe(false);
    expect(isISODate(null)).toBe(false);
  });

  it('formats and parses the local calendar date', () => {
    expect(toISODate(new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06');
    expect(todayISO(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    const parsed = parseISODate('2026-11-06');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(10);
    expect(parsed?.getDate()).toBe(6);
    expect(parseISODate('nope')).toBeNull();
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays(FRIDAY, 1)).toBe('2026-11-07');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // EU DST change on 29 March
    expect(() => addDays('bad', 1)).toThrow(RangeError);
  });

  it('computes weekdays and day differences', () => {
    expect(weekdayOf(FRIDAY)).toBe(5);
    expect(daysBetween(FRIDAY, '2026-11-09')).toBe(3);
    expect(daysBetween('2026-11-09', FRIDAY)).toBe(-3);
  });

  it('resolves Tomorrow', () => {
    expect(tomorrowISO(FRIDAY)).toBe('2026-11-07');
  });

  it('resolves Next week as the first day of next week', () => {
    expect(nextWeekISO(FRIDAY, 1)).toBe('2026-11-09'); // Monday
    expect(nextWeekISO(FRIDAY, 0)).toBe('2026-11-08'); // Sunday
    expect(nextWeekISO('2026-11-09', 1)).toBe('2026-11-16'); // on a Monday: the next Monday
    expect(nextWeekISO('2026-11-08', 0)).toBe('2026-11-15'); // on a Sunday: the next Sunday
    expect(nextWeekISO('2026-11-08', 1)).toBe('2026-11-09'); // Sunday → tomorrow (Monday)
    expect(nextWeekISO('2026-12-30', 1)).toBe('2027-01-04');
  });

  it('resolves quick options with an injected today', () => {
    expect(resolveQuickDate('today', FRIDAY)).toBe(FRIDAY);
    expect(resolveQuickDate('tomorrow', FRIDAY)).toBe('2026-11-07');
    expect(resolveQuickDate('nextWeek', FRIDAY)).toBe('2026-11-09');
    expect(resolveQuickDate('nextWeek', FRIDAY, 0)).toBe('2026-11-08');
    expect(resolveQuickDate('clear', FRIDAY)).toBeNull();
  });
});
