import { QueryObserver, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/ipc/api';
import type { TaskDetail } from '@/lib/ipc/bindings/TaskDetail';
import { keys } from '@/lib/query/keys';
import type { TaskRefData, TaskRefStore } from './react/task-ref-store';

/**
 * `TaskRefStore` backed by the TanStack Query cache, so a task reference in a document shows
 * exactly the same record as Tasks, the drawer and stickies, and refreshes from the same
 * `piw://changed` events. Each subscription is a real query observer (so invalidation
 * refetches it); snapshots are memoised per cached object (stable identity).
 */
export function createQueryTaskRefStore(client: QueryClient): TaskRefStore {
  const snapshots = new WeakMap<TaskDetail, TaskRefData | null>();

  const toSnapshot = (detail: TaskDetail): TaskRefData | null => {
    const cached = snapshots.get(detail);
    if (cached !== undefined) return cached;
    const { task } = detail;
    const snapshot: TaskRefData | null =
      task.deletedAt !== null
        ? null
        : { id: task.id, title: task.title, status: task.status === 'completed' ? 'done' : 'open' };
    snapshots.set(detail, snapshot);
    return snapshot;
  };

  return {
    getSnapshot: (taskId) => {
      const query = client
        .getQueryCache()
        .find<TaskDetail>({ queryKey: keys.task(taskId), exact: true });
      if (query?.state.data) return toSnapshot(query.state.data);
      return query?.state.status === 'error' ? null : undefined;
    },
    subscribe: (taskId, onChange) => {
      const observer = new QueryObserver(client, {
        queryKey: keys.task(taskId),
        queryFn: () => api.getTask(taskId),
        retry: false,
      });
      return observer.subscribe(() => onChange());
    },
  };
}
