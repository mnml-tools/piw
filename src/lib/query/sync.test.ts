import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { keys } from './keys';
import { applyChangeSet } from './sync';

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(keys.vaultTasks('today', null, '2026-11-10'), []);
  client.setQueryData(keys.vaultNote('Work/Plan.md'), {});
  client.setQueryData(keys.settings, {});
  client.setQueryData(keys.sticky('sticky:vault_note:abc'), null);
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
  it('a file change refreshes every vault view', async () => {
    const client = seeded();
    await applyChangeSet(client, { changes: [{ kind: 'file', id: 'Work/Plan.md' }] });
    expect(invalidated(client)).toEqual(['vaultNote', 'vaultTasks']);
  });

  it('a sticky change refreshes only stickies', async () => {
    const client = seeded();
    await applyChangeSet(client, { changes: [{ kind: 'sticky', id: 'sticky:vault_note:abc' }] });
    expect(invalidated(client)).toEqual(['sticky']);
  });

  it('a settings change refreshes only settings', async () => {
    const client = seeded();
    await applyChangeSet(client, { changes: [{ kind: 'settings', id: '*' }] });
    expect(invalidated(client)).toEqual(['settings']);
  });
});
