import { describe, expect, it } from 'vitest';
import type { ExportData } from '@/lib/ipc/bindings/ExportData';
import { note, spaces, task } from '@/test/fixtures';
import { buildExport, csvCell, exportFolderName, safeName, tasksToCsv } from './build';

const doc = (contentJson: string) => ({
  note: note({
    id: 'd1',
    kind: 'document',
    title: 'Refactor 2FA',
    displayTitle: 'Refactor 2FA',
    body: null,
  }),
  tabs: [
    {
      id: 't1',
      documentId: 'd1',
      title: 'Overview',
      kind: 'content' as const,
      sortOrder: 0,
      contentJson,
      settings: { show: 'open' as const, sort: 'manual' as const },
      rev: 1,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 't2',
      documentId: 'd1',
      title: 'To-dos',
      kind: 'tasks' as const,
      sortOrder: 1,
      contentJson: null,
      settings: { show: 'open' as const, sort: 'manual' as const },
      rev: 1,
      createdAt: '',
      updatedAt: '',
    },
  ],
});

const data = (): ExportData => ({
  formatVersion: 1,
  appVersion: '0.1.0',
  exportedAt: '2026-11-06T12:00:00.000Z',
  spaces,
  notes: [
    note({ body: 'Ligar ao fornecedor\nAção ☕', tags: ['calls'] }),
    note({ id: 'n2', body: 'Ligar ao fornecedor' }),
  ],
  documents: [
    doc(
      JSON.stringify({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Problem' }] },
        ],
      }),
    ),
  ],
  tasks: [
    task({ documentId: 'd1', documentTitle: 'Refactor 2FA', title: 'Adicionar testes' }),
    task({ id: 't9', title: '=HYPERLINK("x")' }),
  ],
  tags: [],
});

describe('buildExport', () => {
  it('writes readable Markdown, task lists and the canonical data', () => {
    const files = buildExport(data());
    const byPath = new Map(files.map((f) => [f.path, f.contents]));
    expect([...byPath.keys()]).toEqual([
      'Notes/Work/Ligar ao fornecedor.md',
      'Notes/Work/Ligar ao fornecedor (2).md',
      'Documents/Work/Refactor 2FA/01 Overview.md',
      'Documents/Work/Refactor 2FA/02 To-dos.md',
      'tasks.json',
      'tasks.csv',
      'data.json',
      'manifest.json',
      'README.md',
    ]);
    expect(byPath.get('Notes/Work/Ligar ao fornecedor.md')).toContain('id: "n1"');
    expect(byPath.get('Notes/Work/Ligar ao fornecedor.md')).toMatch(/Ação ☕$/);
    expect(byPath.get('Documents/Work/Refactor 2FA/01 Overview.md')).toContain('## Problem');
    expect(byPath.get('Documents/Work/Refactor 2FA/02 To-dos.md')).toContain(
      '- [ ] Adicionar testes',
    );
    expect(JSON.parse(byPath.get('data.json') ?? '{}').formatVersion).toBe(1);
  });

  it('keeps unconvertible content instead of dropping it', () => {
    const d = data();
    d.documents = [doc('{"type":"doc","content":[{"type":"unknownNode"}]}')];
    const overview = buildExport(d).find((f) => f.path.endsWith('01 Overview.md'));
    expect(overview?.contents).toContain('unknownNode');
  });
});

describe('helpers', () => {
  it('makes names safe on every OS', () => {
    expect(safeName('a/b:c*?"<>|')).toBe('a b c');
    expect(safeName('  ...  ')).toBe('Untitled');
    expect(safeName('CON')).toBe('_CON');
    expect(safeName('x'.repeat(200))).toHaveLength(80);
  });

  it('escapes CSV and neutralises formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    const csv = tasksToCsv([task({ title: 'Café, já' })], new Map([['work', 'Work']]));
    expect(csv.startsWith('﻿id,title')).toBe(true);
    expect(csv).toContain('"Café, já"');
  });

  it('names export folders by date and time', () => {
    expect(exportFolderName(new Date(2026, 10, 6, 9, 5))).toBe('Piw export 2026-11-06 09-05');
  });
});
