import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/dates';
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
  vaultFrom,
  trashEntry,
  vaultTree,
  writeNote,
} from './mock-vault';

/** The small vault these tests were written against (the demo, `seedVault`, is larger). */
function seedVault(today = '2026-11-10'): ReturnType<typeof vaultFrom> {
  const day = (offset: number) => addDays(today, offset);
  const vault = vaultFrom(
    {
      'Work/Inbox.md': `- [ ] Call the accountant 📅 ${day(0)}\n- [ ] Order a new keyboard\n`,
      'Work/Projects/Refactor 2FA.md': [
        '---',
        'tags: [auth, security]',
        '---',
        '',
        '## Problem',
        '',
        'SMS codes are being phased out. Move **TOTP** into the auth service. #backend',
        '',
        '## Plan',
        '',
        `- [x] Read RFC 6238 ✅ ${day(-2)}`,
        `- [ ] Agree on the tolerance window 📅 ${day(1)}`,
        '- [ ] Add unit tests',
        '  - [ ] Clock drift of one step',
        `- [ ] Review with the team 📅 ${day(-1)}`,
        '',
        '## Verification',
        '',
        '```ts',
        'export function verify(code: string) {}',
        '```',
        '',
        'See [[Reuniões]] and [[Onboarding#Week 1|the onboarding plan]].',
        '',
      ].join('\n'),
      'Work/Projects/Onboarding.md': `## Week 1\n\n1. [ ] Set up the laptop\n2. [ ] Meet the team 📅 ${day(6)}\n\n## Week 2\n\n- [ ] Ship a first small change\n`,
      'Work/Reuniões.md':
        'Weekly sync notes. #meetings\n\n## 2026-11-03\n\n- Decided to drop SMS codes, see [[Refactor 2FA]].\n- [ ] Send the summary to finance\n',
      'Personal/Ideias de prendas.md':
        'Books, a good coffee grinder, concert tickets, a plant for the office.\n',
      'Personal/Stickies/Recovery codes.md':
        'Recovery codes are shown once. Make that obvious before the user leaves the page.\n\nFrom [[Refactor 2FA]]\n',
    },
    today,
  );
  return vault;
}

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
      'Personal/Ideias de prendas.md',
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
    expect(renamed.linked).toEqual(['Personal/Stickies/Recovery codes.md', 'Work/Reuniões.md']);
    expect(readNote(vault, 'Work/Reuniões.md').text).toContain('[[TOTP]]');
    expect(resolveLink(vault, 'totp')).toBe('Work/Projects/TOTP.md');
    expect(searchVault(vault, 'reunioes', null)[0]?.path).toBe('Work/Reuniões.md');
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
    const path = createStickyNote(vault, 'Work/Reuniões.md', 'Finance', ' Send it ');
    expect(path).toBe('Work/Stickies/Finance.md');
    expect(readNote(vault, path).text).toBe('Send it\n\nFrom [[Reuniões]]\n');
    const sticky = stickyFor(vault, { path });
    expect(stickyFor(vault, { path })).toBe(sticky);
    renameEntry(vault, path, 'Work/Stickies/Money.md');
    expect(sticky.path).toBe('Work/Stickies/Money.md');
  });
});
