import { describe, expect, it } from 'vitest';
import { formatDueDate } from '@/lib/dates';
import { task } from '@/test/fixtures';
import { groupTasks, OVERDUE_LIMIT, singleSection } from './sections';

const TODAY = '2026-11-06'; // a Friday

function due(id: string, dueDate: string | null) {
  return task({ id, title: id, dueDate });
}

function shape(sections: ReturnType<typeof groupTasks>) {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    ids: section.tasks.map((row) => row.id),
  }));
}

describe('groupTasks', () => {
  it('All: Overdue (small, danger) + Today + Upcoming + No date (manual order)', () => {
    const sections = groupTasks(
      'all',
      [
        due('late', '2026-11-03'),
        due('now', TODAY),
        due('soon', '2026-11-10'),
        due('free-1', null),
        due('free-2', null),
      ],
      TODAY,
    );
    expect(shape(sections)).toEqual([
      { id: 'overdue', title: 'Overdue', ids: ['late'] },
      { id: 'today', title: 'Today', ids: ['now'] },
      { id: 'upcoming', title: 'Upcoming', ids: ['soon'] },
      { id: 'no-date', title: 'No date', ids: ['free-1', 'free-2'] },
    ]);
    expect(sections[0]).toMatchObject({ tone: 'danger', showCount: true, limit: OVERDUE_LIMIT });
    // Today's rows share the heading's date; the other sections have no single date.
    expect(sections.find((s) => s.id === 'today')?.date).toBe(TODAY);
    expect(sections.filter((s) => s.date !== undefined)).toHaveLength(1);
    expect(sections.find((s) => s.id === 'no-date')?.reorderable).toBe(true);
    expect(sections.filter((s) => s.reorderable)).toHaveLength(1);
  });

  it('leaves out empty sections, including Overdue', () => {
    expect(shape(groupTasks('all', [due('free', null)], TODAY))).toEqual([
      { id: 'no-date', title: 'No date', ids: ['free'] },
    ]);
  });

  it('Today: Overdue + Today', () => {
    const sections = groupTasks(
      'today',
      [due('a', '2026-10-30'), due('b', '2026-11-05'), due('c', TODAY)],
      TODAY,
    );
    expect(shape(sections)).toEqual([
      { id: 'overdue', title: 'Overdue', ids: ['a', 'b'] },
      { id: 'today', title: 'Today', ids: ['c'] },
    ]);
  });

  it('Upcoming: one section per day for 14 days, then Later', () => {
    const sections = groupTasks(
      'upcoming',
      [
        due('sat', '2026-11-07'),
        due('mon-1', '2026-11-09'),
        due('mon-2', '2026-11-09'),
        due('next-sat', '2026-11-14'),
        due('day-14', '2026-11-20'),
        due('day-15', '2026-11-21'),
        due('next-year', '2027-01-04'),
      ],
      TODAY,
    );
    expect(shape(sections)).toEqual([
      { id: 'day-2026-11-07', title: 'Tomorrow', ids: ['sat'] },
      {
        id: 'day-2026-11-09',
        title: formatDueDate('2026-11-09', TODAY),
        ids: ['mon-1', 'mon-2'],
      },
      { id: 'day-2026-11-14', title: formatDueDate('2026-11-14', TODAY), ids: ['next-sat'] },
      { id: 'day-2026-11-20', title: formatDueDate('2026-11-20', TODAY), ids: ['day-14'] },
      { id: 'later', title: 'Later', ids: ['day-15', 'next-year'] },
    ]);
  });

  it('Completed: Today / Yesterday / Earlier by local completion date', () => {
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
    const done = (id: string, completedAt: string) =>
      task({ id, title: id, status: 'completed', completedAt });
    const sections = groupTasks(
      'completed',
      [
        done('morning', at(6, 8)),
        done('late-night', at(5, 23)),
        done('last-week', at(1, 12)),
        done('dawn', at(6, 0)),
      ],
      TODAY,
    );
    expect(shape(sections)).toEqual([
      { id: 'today', title: 'Today', ids: ['morning', 'dawn'] },
      { id: 'yesterday', title: 'Yesterday', ids: ['late-night'] },
      { id: 'earlier', title: 'Earlier', ids: ['last-week'] },
    ]);
  });

  it('never reorders rows inside a section', () => {
    const rows = [due('z', null), due('a', null), due('m', null)];
    expect(groupTasks('all', rows, TODAY)[0]?.tasks.map((row) => row.id)).toEqual(['z', 'a', 'm']);
  });
});

describe('singleSection', () => {
  it('wraps rows in one untitled section', () => {
    const [section] = singleSection([due('a', null)], true);
    expect(section).toMatchObject({ id: 'tasks', reorderable: true });
    expect(section?.title).toBeUndefined();
  });
});
