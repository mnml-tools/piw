import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayString } from '@/lib/dates';
import { api } from '@/lib/ipc/api';
import type { ChangeSet } from '@/lib/ipc/bindings/ChangeSet';
import { IpcError } from '@/lib/ipc/client';
import { COMMANDS, createMockBackend, type MockBackend } from './mock-backend';
import { DEMO_IDS, type MockMode, seedStore } from './mock-data';
import { resolveWindowLabel } from './url-state';

let commits: ChangeSet[];
let backend: MockBackend;

function install(mode: MockMode = 'demo') {
  commits = [];
  backend = createMockBackend(seedStore(mode), {
    label: 'main',
    host: {
      openSticky: () => undefined,
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
    expect(called.size).toBeGreaterThan(80);
    expect([...COMMANDS].sort()).toEqual([...called].sort());
  });

  it('puts demo tasks in the right sections relative to today', async () => {
    const today = todayString();
    const due = await api.listTasks({ view: 'today' });
    expect(due.map((t) => t.dueDate)).toEqual(
      [...due.map((t) => t.dueDate)].sort((a, b) => (a ?? '').localeCompare(b ?? '')),
    );
    expect(due.every((t) => t.dueDate !== null && t.dueDate <= today)).toBe(true);
    expect(due.some((t) => t.dueDate === addDays(today, -1))).toBe(true);
    const upcoming = await api.listTasks({ view: 'upcoming' });
    expect(upcoming.every((t) => t.dueDate !== null && t.dueDate > today)).toBe(true);
    const all = await api.listTasks();
    expect(all.at(-1)?.dueDate).toBeNull();
    expect(all.every((t) => t.status === 'open' && t.parentTaskId === null)).toBe(true);
    const totp = all.find((t) => t.id === DEMO_IDS.totpTask);
    expect(totp).toMatchObject({ subtaskCount: 2, subtaskDone: 1, documentTitle: 'Refactor 2FA' });
  });

  it('completes a task and reports the change like Rust', async () => {
    const task = await api.setTaskCompleted(DEMO_IDS.totpTask, true);
    expect(task).toMatchObject({ status: 'completed', completedAt: expect.any(String) });
    expect(commits.at(-1)).toEqual({
      origin: 'main',
      changes: [
        { kind: 'task', id: DEMO_IDS.totpTask },
        { kind: 'note', id: DEMO_IDS.refactorDoc },
      ],
    });
    const open = await api.listTasks();
    expect(open.some((t) => t.id === DEMO_IDS.totpTask)).toBe(false);
    const completed = await api.listTasks({ view: 'completed' });
    expect(completed[0]?.id).toBe(DEMO_IDS.totpTask);
  });

  it('guards text edits with rev and rolls back failed writes', async () => {
    const note = await api.getNote(DEMO_IDS.supplierNote);
    const saved = await api.updateNoteText(note.id, note.rev, { body: 'Call them\nNow.' });
    expect(saved).toMatchObject({ rev: note.rev + 1, displayTitle: 'Call them' });
    const error = await api.updateNoteText(note.id, note.rev, { body: 'stale' }).catch((e) => e);
    expect(error).toBeInstanceOf(IpcError);
    expect(error).toMatchObject({ code: 'conflict' });
    const commitsBefore = commits.length;
    await expect(api.createTask({ title: '   ' })).rejects.toMatchObject({ code: 'validation' });
    expect(commits).toHaveLength(commitsBefore);
  });

  it('returns documents with ProseMirror tabs and searchable content', async () => {
    const doc = await api.getDocument(DEMO_IDS.refactorDoc);
    expect(doc.tabs.map((t) => [t.title, t.kind])).toEqual([
      ['Overview', 'content'],
      ['Implementation', 'content'],
      ['To-dos', 'tasks'],
    ]);
    expect(JSON.parse(doc.tabs[0]?.contentJson ?? '{}')).toMatchObject({ type: 'doc' });
    const results = await api.search('rollout');
    expect(results.documents[0]).toMatchObject({
      id: DEMO_IDS.refactorDoc,
      tabTitle: 'Implementation',
    });
    expect(results.documents[0]?.snippet).toContain('\u0002rollout\u0003');
    const tasks = await api.search('recov');
    expect(tasks.tasks[0]).toMatchObject({ id: DEMO_IDS.recoveryTask, completed: false });
  });

  it('builds the inbox, trash and pinned views', async () => {
    const inbox = await api.listInbox();
    expect(inbox.length).toBe(await api.inboxCount());
    expect(
      inbox.every(
        (item) => (item.type === 'note' ? item.note.documentId : item.task.documentId) === null,
      ),
    ).toBe(true);
    const trash = await api.listTrash();
    expect(trash.map((item) => item.type)).toEqual(['note', 'task']);
    const pinned = await api.listPinned();
    expect(pinned.map((item) => item.target.kind).sort()).toEqual(['note', 'task', 'tasks_tab']);
  });

  it('starts empty with ?mock=empty', async () => {
    install('empty');
    expect(await api.listSpaces()).toHaveLength(2);
    expect(await api.listNotes()).toEqual([]);
    expect(await api.listTasks()).toEqual([]);
    const note = await api.createNote({ body: 'First note' });
    expect(await api.listInbox()).toEqual([
      { type: 'note', note: expect.objectContaining({ id: note.id }) },
    ]);
  });

  it('resolves friendly sticky labels', () => {
    const store = seedStore('demo');
    expect(resolveWindowLabel('sticky:task:totp', store)).toBe(`sticky:task:${DEMO_IDS.totpTask}`);
    expect(resolveWindowLabel('sticky:tasks_tab:refactor', store)).toBe(
      `sticky:tasks_tab:${DEMO_IDS.todosTab}`,
    );
    expect(resolveWindowLabel('capture', store)).toBe('capture');
  });
});
