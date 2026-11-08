import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { QueryClient } from '@tanstack/react-query';
import type { ChangeSet } from '@/lib/ipc/bindings/ChangeSet';
import { type QueryRoot, rootsFor } from './keys';

export const CHANGED_EVENT = 'piw://changed';

/** Invalidates every query affected by a change set. */
export function applyChangeSet(client: QueryClient, changes: ChangeSet): Promise<void> {
  const roots = rootsFor(changes.changes.map((change) => change.kind));
  return client.invalidateQueries({
    predicate: (query) => roots.has(query.queryKey[0] as QueryRoot),
  });
}

/**
 * Keeps this window's cache in sync with writes made by any window (including this one), so
 * a task completed in a sticky updates the workspace and vice versa. Returns an unsubscribe.
 */
export function subscribeToChanges(client: QueryClient): () => void {
  if (!isTauri()) return () => {};
  const unlisten = listen<ChangeSet>(CHANGED_EVENT, (event) => {
    void applyChangeSet(client, event.payload);
  });
  return () => {
    void unlisten.then((stop) => stop());
  };
}
