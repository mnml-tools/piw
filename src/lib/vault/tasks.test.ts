import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VaultTaskChange } from '@/lib/ipc/bindings/VaultTaskChange';
import { suggestDates } from './date-words';
import { applyTaskChange, extractDates, parseNote, taskBox } from './tasks';

const FIXTURES = join(__dirname, '../../../fixtures');

interface Expected {
  notes: Record<string, { tasks: unknown[] }>;
}

describe('note tasks', () => {
  it('reads the fixture vault exactly as Rust does', () => {
    const expected = JSON.parse(
      readFileSync(join(FIXTURES, 'vault.expected.json'), 'utf8'),
    ) as Expected;
    for (const [path, note] of Object.entries(expected.notes)) {
      const text = readFileSync(join(FIXTURES, 'vault', path), 'utf8');
      const tasks = parseNote(text).tasks.map(({ lineText: _, boxAt: __, ...task }) => task);
      expect(tasks, path).toEqual(note.tasks);
    }
  });

  it('keeps line numbers with a byte-order mark and CRLF, and skips front matter', () => {
    const { tasks, headings } = parseNote(
      '﻿---\r\ntags: [x]\r\n---\r\n# H\r\n\r\n- [ ] one\r\n  - [x] two\r\n',
    );
    expect(headings).toEqual([{ line: 4, level: 1, text: 'H' }]);
    expect(tasks.map((t) => [t.line, t.lineText, t.parentLine, t.heading])).toEqual([
      [6, '- [ ] one', null, 'H'],
      [7, '  - [x] two', 6, 'H'],
    ]);
  });

  it('applies the shared line edits', () => {
    const cases = JSON.parse(readFileSync(join(FIXTURES, 'task-edits.json'), 'utf8')) as {
      cases: {
        name: string;
        line: string;
        boxAt: number;
        change: VaultTaskChange;
        expected: string;
      }[];
    };
    for (const c of cases.cases) {
      expect(applyTaskChange(c.line, c.boxAt, c.change), c.name).toBe(c.expected);
    }
    expect(() => applyTaskChange('- [ ] a', 2, { kind: 'text', text: ' ' })).toThrow();
  });

  it('finds a line’s box and its dates', () => {
    expect(taskBox('  1) [X] done')).toEqual({ boxAt: 5, checked: true });
    expect(taskBox('- [ ]')).toEqual({ boxAt: 2, checked: false });
    expect(taskBox('plain')).toBeNull();
    expect(extractDates('Call 📅 2026-11-12 the bank')).toEqual({
      text: 'Call the bank',
      due: '2026-11-12',
      done: null,
    });
  });
});

describe('date words', () => {
  const today = '2026-11-10'; // a Tuesday

  it('suggests the common dates and filters them as you type', () => {
    expect(suggestDates('', today).map((s) => [s.label, s.date])).toEqual([
      ['Today', '2026-11-10'],
      ['Tomorrow', '2026-11-11'],
      ['Next week', '2026-11-16'],
      ['Wednesday', '2026-11-11'],
      ['Thursday', '2026-11-12'],
      ['Friday', '2026-11-13'],
    ]);
    expect(suggestDates('tu', today)).toEqual([{ label: 'Tuesday', date: '2026-11-17' }]);
    expect(suggestDates('fri', today)[0]?.date).toBe('2026-11-13');
  });

  it('reads a day and a month, and ISO dates', () => {
    expect(suggestDates('nov 12', today)).toEqual([{ label: '12 Nov', date: '2026-11-12' }]);
    expect(suggestDates('3 jan', today)[0]?.date).toBe('2027-01-03');
    expect(suggestDates('feb 29', today)[0]?.date).toBe('2028-02-29');
    expect(suggestDates('2026-12-01', today)).toEqual([
      { label: '2026-12-01', date: '2026-12-01' },
    ]);
    expect(suggestDates('2026-02-30', today)).toEqual([]);
    expect(suggestDates('nope', today)).toEqual([]);
  });
});
