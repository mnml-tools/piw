import { beforeEach, describe, expect, it } from 'vitest';
import { useVaultUi } from './vault';

const state = () => useVaultUi.getState();
const note = (path: string) => ({ type: 'note' as const, path });

beforeEach(() => {
  useVaultUi.setState({
    root: null,
    tabs: [],
    active: null,
    space: null,
    expanded: [],
    renaming: null,
    goto: null,
  });
});

describe('vault tabs', () => {
  it('opens after the active tab, reuses an open one and closes to a neighbour', () => {
    state().open(note('a.md'));
    state().open(note('b.md'));
    state().activate('note:a.md');
    state().open(note('c.md'));
    expect(state().tabs.map((t) => (t.type === 'note' ? t.path : t.type))).toEqual([
      'a.md',
      'c.md',
      'b.md',
    ]);
    state().open(note('b.md'));
    expect(state().active).toBe('note:b.md');
    expect(state().tabs).toHaveLength(3);
    state().close('note:b.md');
    expect(state().active).toBe('note:c.md');
    state().cycle(1);
    expect(state().active).toBe('note:a.md');
  });

  it('follows a rename of a note or of a folder above it', () => {
    state().open(note('Work/Projects/x.md'));
    state().open({ type: 'trash' });
    state().activate('note:Work/Projects/x.md');
    useVaultUi.setState({ expanded: ['Work', 'Work/Projects'], space: 'Work' });
    state().renamed('Work/Projects', 'Work/Clients');
    expect(state().tabs[0]).toEqual(note('Work/Clients/x.md'));
    expect(state().active).toBe('note:Work/Clients/x.md');
    expect(state().expanded).toEqual(['Work', 'Work/Clients']);
    state().renamed('Work', 'Job');
    expect(state().space).toBe('Job');
  });

  it('opens a note at a line, keeping one tab per note', () => {
    state().open({ type: 'tasks', view: 'today' });
    state().openAt('Work/a.md', 4);
    state().openAt('Work/a.md', 9);
    expect(state().tabs).toEqual([{ type: 'tasks', view: 'today' }, note('Work/a.md')]);
    expect(state().goto).toEqual({ path: 'Work/a.md', line: 9 });
    state().renamed('Work', 'Job');
    expect(state().goto).toEqual({ path: 'Job/a.md', line: 9 });
  });

  it('closes the tabs of what was removed and reveals a note’s folders', () => {
    state().open(note('Work/a.md'));
    state().open(note('Personal/b.md'));
    state().removed('Work');
    expect(state().tabs).toEqual([note('Personal/b.md')]);
    state().reveal('Work/Projects/c.md');
    expect(state().expanded).toEqual(['Work', 'Work/Projects']);
  });

  it('forgets the notes of another vault folder, keeping the other tabs', () => {
    state().adopt('/home/you/Piw');
    state().open(note('Work/a.md'));
    state().open({ type: 'settings' });
    state().setSpace('Work');
    state().reveal('Work/Projects/c.md');
    state().adopt('/home/you/Piw');
    expect(state().tabs).toHaveLength(2);
    state().adopt('/media/sync/Notes');
    expect(state()).toMatchObject({
      root: '/media/sync/Notes',
      tabs: [{ type: 'settings' }],
      active: 'settings',
      space: null,
      expanded: [],
    });
  });
});
