import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { keys } from './keys';
import { applyChangeSet } from './sync';

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(keys.tasks({ view: 'all' }), []);
  client.setQueryData(keys.documentTasks('doc', 'open', 'manual'), []);
  client.setQueryData(keys.settings, {});
  client.setQueryData(keys.spaces, []);
  return client;
}

const invalidated = (client: QueryClient) =>
  client
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.isInvalidated)
    .map((query) => query.queryKey[0])
    .sort();

describe('applyChangeSet', () => {
  it('a task change refreshes every task view, including document tabs', async () => {
    const client = seeded();
    await applyChangeSet(client, { changes: [{ kind: 'task', id: 't1' }] });
    expect(invalidated(client)).toEqual(['documentTasks', 'tasks']);
  });

  it('a settings change refreshes only settings', async () => {
    const client = seeded();
    await applyChangeSet(client, { changes: [{ kind: 'settings', id: '*' }] });
    expect(invalidated(client)).toEqual(['settings']);
  });
});
