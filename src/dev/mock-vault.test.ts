import { describe, expect, it } from 'vitest';
import {
  captureToInbox,
  createNote,
  createStickyNote,
  stickyFor,
  editTask,
  vaultTasks,
  listTrash,
  readNote,
  renameEntry,
  resolveLink,
  restoreEntry,
  searchVault,
  seedVault,
  trashEntry,
  vaultTree,
  writeNote,
} from './mock-vault';

describe('mock vault', () => {
  it('lists folders before notes and guards writes with the hash', () => {
    const vault = seedVault();
    expect(
      vaultTree(vault)
        .slice(0, 4)
        .map((e) => e.path),
    ).toEqual([
      'Personal',
      'Personal/Stickies',
      'Personal/Stickies/Recovery codes.md',
      'Personal/Gift ideas.md',
    ]);
    const note = readNote(vault, 'Work/Inbox.md');
    const saved = writeNote(vault, note.path, 'new\n', note.hash);
    expect(saved.hash).not.toBe(note.hash);
    expect(() => writeNote(vault, note.path, 'lost', note.hash)).toThrow(
      expect.objectContaining({ code: 'conflict' }),
    );
  });

  it('picks free names and rewrites links on rename, like Rust', () => {
    const vault = seedVault();
    expect(createNote(vault, 'Work', 'Inbox', '').path).toBe('Work/Inbox 2.md');
    const renamed = renameEntry(vault, 'Work/Projects/Refactor 2FA.md', 'Work/Projects/TOTP.md');
    expect(renamed.linked).toEqual(['Personal/Stickies/Recovery codes.md', 'Work/Meetings.md']);
    expect(readNote(vault, 'Work/Meetings.md').text).toContain('[[TOTP]]');
    expect(resolveLink(vault, 'totp')).toBe('Work/Projects/TOTP.md');
    expect(searchVault(vault, 'meetings', null)[0]?.path).toBe('Work/Meetings.md');
    expect(searchVault(vault, 'creme brulee', null)[0]?.path).toBe('Personal/Gift ideas.md');
  });

  it('trashes and restores a folder whole', () => {
    const vault = seedVault();
    const item = trashEntry(vault, 'Work/Projects');
    expect(vaultTree(vault).some((e) => e.path.startsWith('Work/Projects'))).toBe(false);
    expect(listTrash(vault)).toEqual([item]);
    expect(restoreEntry(vault, item.id)).toBe('Work/Projects');
    expect(readNote(vault, 'Work/Projects/Onboarding.md').title).toBe('Onboarding');
  });
});

describe('mock vault tasks', () => {
  const today = '2026-11-10';

  it('lists the views like Rust and edits a line with its guard', () => {
    const vault = seedVault(today);
    const due = vaultTasks(vault, 'today', null, today);
    expect(due.map((t) => t.text)).toEqual(['Review with the team', 'Call the accountant']);
    expect(vaultTasks(vault, 'upcoming', 'Personal', today)).toEqual([]);
    const call = due[1]!;
    editTask(vault, call, { kind: 'check', checked: true, today });
    expect(readNote(vault, 'Work/Inbox.md').text).toContain(
      '- [x] Call the accountant 📅 2026-11-10 ✅ 2026-11-10',
    );
    // Still listed, ticked, for the rest of the day.
    expect(vaultTasks(vault, 'today', null, today).find((t) => t.path === call.path)?.checked).toBe(
      true,
    );
    expect(() => editTask(vault, call, { kind: 'due', due: null })).toThrow(
      expect.objectContaining({ code: 'conflict' }),
    );
  });
});

describe('mock vault capture and stickies', () => {
  it('appends to an Inbox like Rust', () => {
    const vault = seedVault('2026-11-10');
    captureToInbox(vault, 'Work', 'task', 'Pay the bill', '', '2026-11-12');
    captureToInbox(vault, 'Work', 'note', 'A thought', 'more', null);
    expect(readNote(vault, 'Work/Inbox.md').text).toBe(
      '- [ ] Call the accountant 📅 2026-11-10\n- [ ] Order a new keyboard\n' +
        '- [ ] Pay the bill 📅 2026-11-12\n\nA thought\nmore\n',
    );
    expect(captureToInbox(vault, 'Personal', 'task', 'Buy flowers', '', null)).toBe(
      'Personal/Inbox.md',
    );
    expect(() => captureToInbox(vault, 'Nowhere', 'task', 'x', '', null)).toThrow();
  });

  it('makes a sticky note from a selection and keeps one sticky per note', () => {
    const vault = seedVault('2026-11-10');
    const path = createStickyNote(vault, 'Work/Meetings.md', 'Finance', ' Send it ');
    expect(path).toBe('Work/Stickies/Finance.md');
    expect(readNote(vault, path).text).toBe('Send it\n\nFrom [[Meetings]]\n');
    const sticky = stickyFor(vault, { path });
    expect(stickyFor(vault, { path })).toBe(sticky);
    renameEntry(vault, path, 'Work/Stickies/Money.md');
    expect(sticky.path).toBe('Work/Stickies/Money.md');
  });
});
