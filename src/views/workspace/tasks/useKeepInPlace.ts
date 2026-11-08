import { useCallback, useMemo, useRef, useState } from 'react';
import type { Task } from '@/lib/ipc/bindings/Task';
import {
  EMPTY_KEEP_STATE,
  finishToggle,
  forget,
  mergeHeld,
  reconcile,
  startToggle,
  withOrder,
  type KeepInPlaceState,
} from './keepInPlace';

export type ToggleTask = (id: string, completed: boolean) => Promise<Task>;

/**
 * Optimistic completion with rows kept in place (see `keepInPlace.ts`). Toggles of one task run
 * one after another so the database sees them in the order the user made them.
 */
export function useKeepInPlace(
  tasks: readonly Task[],
  setCompleted: ToggleTask,
  onError: (error: unknown) => void,
) {
  const [state, setState] = useState<KeepInPlaceState>(EMPTY_KEEP_STATE);
  // Fold each new listing in during render (React's "adjust state on prop change" pattern).
  const [seen, setSeen] = useState(tasks);
  if (seen !== tasks) {
    setSeen(tasks);
    setState((current) => reconcile(current, tasks));
  }

  const rows = useMemo(() => mergeHeld(state, tasks), [state, tasks]);
  const chains = useRef(new Map<string, Promise<unknown>>());

  const toggle = useCallback(
    (row: Task, completed: boolean, order: readonly string[]) => {
      setState((current) => startToggle(current, row, completed, order));
      const previous = chains.current.get(row.id) ?? Promise.resolve();
      const run = previous.catch(() => undefined).then(() => setCompleted(row.id, completed));
      chains.current.set(row.id, run);
      run.then(
        (result) => setState((current) => finishToggle(current, row.id, result)),
        (error: unknown) => {
          setState((current) => finishToggle(current, row.id, null));
          onError(error);
        },
      );
    },
    [setCompleted, onError],
  );

  const release = useCallback((id: string) => setState((current) => forget(current, id)), []);
  const setOrder = useCallback(
    (order: readonly string[]) => setState((current) => withOrder(current, order)),
    [],
  );

  return { rows, toggle, release, setOrder };
}
