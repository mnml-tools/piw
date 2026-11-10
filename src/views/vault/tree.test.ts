import { describe, expect, it } from 'vitest';
import type { VaultEntry } from '@/lib/ipc/bindings/VaultEntry';
import { buildTree, newNoteFolder, spacesOf, visibleRows } from './tree';

const folder = (path: string): VaultEntry => ({
  path,
  kind: 'folder',
  name: path.split('/').at(-1)!,
});
const note = (path: string): VaultEntry => ({
  path,
  kind: 'note',
  name: path.split('/').at(-1)!.replace(/\.md$/, ''),
});

// Tree order, as `vault_tree` returns it.
const ENTRIES = [
  folder('Personal'),
  note('Personal/Gifts.md'),
  folder('Work'),
  folder('Work/Projects'),
  note('Work/Projects/Refactor.md'),
  note('Work/Agenda.md'),
  note('Work/Inbox.md'),
  note('Loose.md'),
];

const paths = (rows: { entry: VaultEntry; depth: number }[]) =>
  rows.map((r) => `${'  '.repeat(r.depth)}${r.entry.path}`);

describe('vault tree', () => {
  it('nests entries and lists only the contents of open folders', () => {
    const tree = buildTree(ENTRIES, null);
    expect(paths(visibleRows(tree, new Set()))).toEqual(['Personal', 'Work', 'Loose.md']);
    expect(paths(visibleRows(tree, new Set(['Work', 'Work/Projects'])))).toEqual([
      'Personal',
      'Work',
      '  Work/Inbox.md',
      '  Work/Projects',
      '    Work/Projects/Refactor.md',
      '  Work/Agenda.md',
      'Loose.md',
    ]);
  });

  it('shows one space’s contents one level up, its Inbox first', () => {
    const tree = buildTree(ENTRIES, 'Work');
    expect(paths(visibleRows(tree, new Set()))).toEqual([
      'Work/Inbox.md',
      'Work/Projects',
      'Work/Agenda.md',
    ]);
  });

  it('names the spaces and picks the folder for a new note', () => {
    expect(spacesOf(ENTRIES)).toEqual(['Personal', 'Work']);
    expect(newNoteFolder('Work/Projects/Refactor.md', null)).toBe('Work/Projects');
    expect(newNoteFolder('Loose.md', null)).toBeNull();
    expect(newNoteFolder('Personal/Gifts.md', 'Work')).toBe('Work');
    expect(newNoteFolder(null, 'Work')).toBe('Work');
  });
});
