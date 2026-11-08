import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/ipc/api';
import { IpcError } from '@/lib/ipc/client';
import { applyChangeSet } from '@/lib/query/sync';
import { task } from '@/test/fixtures';
import { createQueryTaskRefStore } from './query-task-ref-store';

afterEach(() => vi.restoreAllMocks());

const ID = '0190f1b2-7c3d-7a00-8000-000000000001';

describe('createQueryTaskRefStore', () => {
  it('shows the real task and follows changes from other windows (CA-04)', async () => {
    const client = new QueryClient();
    const getTask = vi
      .spyOn(api, 'getTask')
      .mockResolvedValueOnce({
        task: task({ id: ID, title: 'Adicionar testes' }),
        subtasks: [],
        parentTitle: null,
      })
      .mockResolvedValueOnce({
        task: task({ id: ID, title: 'Adicionar testes', status: 'completed', completedAt: 'x' }),
        subtasks: [],
        parentTitle: null,
      });
    const store = createQueryTaskRefStore(client);
    const onChange = vi.fn();
    const unsubscribe = store.subscribe(ID, onChange);
    expect(store.getSnapshot(ID)).toBeUndefined();
    await vi.waitFor(() => expect(store.getSnapshot(ID)).toMatchObject({ status: 'open' }));
    const first = store.getSnapshot(ID);
    expect(store.getSnapshot(ID)).toBe(first);

    // Completed in Tasks or a sticky → the change event invalidates → the reference updates.
    await applyChangeSet(client, { changes: [{ kind: 'task', id: ID }] });
    await vi.waitFor(() => expect(store.getSnapshot(ID)).toMatchObject({ status: 'done' }));
    expect(getTask).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('reports missing tasks as null', async () => {
    const client = new QueryClient();
    vi.spyOn(api, 'getTask').mockRejectedValue(new IpcError('not_found', 'task not found'));
    const store = createQueryTaskRefStore(client);
    const unsubscribe = store.subscribe(ID, () => undefined);
    await vi.waitFor(() => expect(store.getSnapshot(ID)).toBeNull());
    unsubscribe();
  });
});
