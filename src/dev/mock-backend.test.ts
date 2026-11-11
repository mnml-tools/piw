import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/lib/ipc/api';
import type { ChangeSet } from '@/lib/ipc/bindings/ChangeSet';
import { IpcError } from '@/lib/ipc/client';
import { COMMANDS, createMockBackend, type MockBackend } from './mock-backend';
import { type MockMode, seedStore } from './mock-data';
import { resolveWindowLabel } from './url-state';

let commits: ChangeSet[];
let opened: string[];
let backend: MockBackend;

function install(mode: MockMode = 'demo') {
  commits = [];
  opened = [];
  backend = createMockBackend(seedStore(mode), {
    label: 'main',
    host: {
      openSticky: (target) => opened.push(`${target.kind}:${target.id}`),
      closeSticky: () => undefined,
      emit: () => undefined,
      commit: (changes) => commits.push(changes),
      log: () => undefined,
    },
  });
  mockIPC((command, args) => backend.invoke(command, args));
}

beforeEach(() => install());
afterEach(() => clearMocks());

describe('mock backend', () => {
  it('implements exactly the commands called by api.ts', () => {
    const source = readFileSync(join(__dirname, '../lib/ipc/api.ts'), 'utf8');
    const called = new Set(Array.from(source.matchAll(/call<[^(]*>\('([a-z_]+)'/g), (m) => m[1]));
    expect(called.size).toBeGreaterThan(40);
    expect([...COMMANDS].sort()).toEqual([...called].sort());
  });

  it('guards note writes with the hash and rolls back failed writes', async () => {
    const note = await api.vaultReadNote('Work/Meetings.md');
    const saved = await api.vaultWriteNote(note.path, 'New text\n', note.hash);
    expect(saved.hash).not.toBe(note.hash);
    expect(commits.at(-1)).toEqual({
      origin: 'main',
      changes: [{ kind: 'file', id: 'Work/Meetings.md' }],
    });
    const error = await api.vaultWriteNote(note.path, 'stale', note.hash).catch((e) => e);
    expect(error).toBeInstanceOf(IpcError);
    expect(error).toMatchObject({ code: 'conflict' });
    expect((await api.vaultReadNote(note.path)).text).toBe('New text\n');
  });

  it('reads without committing', async () => {
    await api.vaultTree();
    await api.getSettings();
    expect(commits).toEqual([]);
  });

  it('pins a note to the desktop and colours its sticky', async () => {
    expect(await api.vaultPinNote('Work/Meetings.md')).toBe(1);
    const [pinned] = await api.vaultPinned();
    expect(pinned?.shows).toEqual({
      kind: 'note',
      path: 'Work/Meetings.md',
      title: 'Meetings',
    });
    expect(opened).toHaveLength(1);
    const target = pinned!.target;
    await api.setStickyColor(target, 'mint');
    expect(await api.getSticky(target)).toMatchObject({ color: 'mint', isOpen: true });
    await api.unpinSticky(target);
    expect(await api.vaultPinned()).toEqual([]);
  });

  it('captures into the space Inbox', async () => {
    const path = await api.vaultCapture({
      space: 'Personal',
      mode: 'task',
      text: 'Buy coffee',
      description: '',
      due: null,
    });
    expect(path).toBe('Personal/Inbox.md');
    expect((await api.vaultReadNote(path)).text).toContain('- [ ] Buy coffee');
  });

  it('reports and runs the Piw 0.1 import', async () => {
    expect(await api.vaultImportStatus()).toEqual({ pending: false, importedAt: null });
    await api.vaultImport();
    expect((await api.vaultImportStatus()).importedAt).not.toBeNull();
    expect((await api.getSettings()).vaultImportedAt).not.toBeNull();
  });

  it('starts with an empty vault with ?mock=empty', async () => {
    install('empty');
    expect(await api.vaultTree()).toEqual([]);
  });

  it('resolves friendly sticky labels', () => {
    const store = seedStore('demo');
    const note = resolveWindowLabel('sticky:vault_note:refactor', store);
    expect(note).toMatch(/^sticky:vault_note:[0-9a-f-]{36}$/);
    expect(store.vault.stickies[0]?.path).toBe('Work/Projects/Refactor 2FA.md');
    expect(resolveWindowLabel('sticky:vault_tasks:today', store)).toMatch(/^sticky:vault_tasks:/);
    expect(resolveWindowLabel('capture', store)).toBe('capture');
  });
});
