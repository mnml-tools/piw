import { beforeEach, describe, expect, it } from 'vitest';
import { migratePersisted, useWorkspace } from './workspace';

const reset = () =>
  useWorkspace.setState({ area: 'inbox', focus: { type: 'none' }, history: [], spaceId: null });

describe('workspace store', () => {
  beforeEach(reset);

  it('keeps the space filter when switching areas (CA-10)', () => {
    useWorkspace.getState().setSpace('work');
    useWorkspace.getState().navigate('notes');
    useWorkspace.getState().navigate('tasks');
    expect(useWorkspace.getState().spaceId).toBe('work');
  });

  it('back returns to the previous area and focus', () => {
    useWorkspace.getState().navigate('notes');
    useWorkspace.getState().openNote('n1');
    expect(useWorkspace.getState().focus).toEqual({ type: 'note', id: 'n1' });
    useWorkspace.getState().back();
    expect(useWorkspace.getState()).toMatchObject({ area: 'notes', focus: { type: 'none' } });
    useWorkspace.getState().back();
    expect(useWorkspace.getState().area).toBe('inbox');
  });

  it('opening a note from Inbox stays in Inbox', () => {
    useWorkspace.getState().openNote('n1');
    expect(useWorkspace.getState().area).toBe('inbox');
  });

  it('never persists the open drawer', () => {
    useWorkspace.getState().openTask('t1');
    const persisted = JSON.parse(window.localStorage.getItem('piw.workspace') ?? '{}');
    expect(persisted.state?.drawerTaskId).toBeUndefined();
  });

  it('migrates v1 layout preferences: drops the sidebar keys and keeps the rest', () => {
    expect(
      migratePersisted({
        area: 'tasks',
        spaceId: 'work',
        sidebarCollapsed: true,
        documentsCollapsed: true,
        notesSplit: true,
        tasksView: 'today',
      }),
    ).toEqual({ area: 'tasks', spaceId: 'work', notesSplit: true, tasksView: 'today' });
    expect(migratePersisted(null)).toEqual({});
    expect(migratePersisted('corrupt')).toEqual({});
  });

  it('never persists sidebar state', () => {
    useWorkspace.getState().navigate('notes');
    const persisted = JSON.parse(window.localStorage.getItem('piw.workspace') ?? '{}');
    expect(persisted.version).toBe(2);
    expect(persisted.state).not.toHaveProperty('sidebarCollapsed');
    expect(persisted.state).not.toHaveProperty('documentsCollapsed');
  });
});
