import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

/**
 * What a taskRef NodeView may show. Comes from the app's task cache (Rust is
 * the source of truth), NEVER from the document JSON.
 */
export interface TaskRefData {
  id: string;
  title: string;
  status: 'open' | 'done';
}

/**
 * External store contract (works with useSyncExternalStore):
 * - getSnapshot(id) → data, `null` if the task does not exist (deleted /
 *   archived), `undefined` while still loading;
 * - must return the SAME object while the task is unchanged;
 * - subscribe(id, cb) → unsubscribe.
 * The integrator can back it with Zustand / TanStack Query + Tauri events.
 */
export interface TaskRefStore {
  getSnapshot: (taskId: string) => TaskRefData | null | undefined;
  subscribe: (taskId: string, onChange: () => void) => () => void;
}

export interface TaskRefLabels {
  loading: string;
  missing: string;
  toggle: (task: TaskRefData) => string;
}

export interface TaskRefContextValue {
  store: TaskRefStore;
  /** Toggle the REAL task (IPC to Rust). The document is not modified. */
  onToggle?: (taskId: string) => void;
  onOpen?: (taskId: string) => void;
  labels: TaskRefLabels;
}

const DEFAULT_LABELS: TaskRefLabels = {
  loading: 'Loading task…',
  missing: 'Task unavailable',
  toggle: (task) => (task.status === 'done' ? `Reopen: ${task.title}` : `Complete: ${task.title}`),
};

const EMPTY_STORE: TaskRefStore = {
  getSnapshot: () => undefined,
  subscribe: () => () => undefined,
};

const TaskRefContext = createContext<TaskRefContextValue>({
  store: EMPTY_STORE,
  labels: DEFAULT_LABELS,
});

export interface TaskRefProviderProps {
  store: TaskRefStore;
  onToggle?: (taskId: string) => void;
  onOpen?: (taskId: string) => void;
  labels?: Partial<TaskRefLabels>;
  children: ReactNode;
}

/** Must wrap <DocumentEditor>; NodeViews are portals inside EditorContent and inherit context. */
export function TaskRefProvider({
  store,
  onToggle,
  onOpen,
  labels,
  children,
}: TaskRefProviderProps) {
  const value = useMemo<TaskRefContextValue>(
    () => ({
      store,
      ...(onToggle ? { onToggle } : {}),
      ...(onOpen ? { onOpen } : {}),
      labels: { ...DEFAULT_LABELS, ...labels },
    }),
    [store, onToggle, onOpen, labels],
  );
  return <TaskRefContext value={value}>{children}</TaskRefContext>;
}

export function useTaskRefContext(): TaskRefContextValue {
  return useContext(TaskRefContext);
}

/** Live task data for one reference; re-renders only that NodeView on change. */
export function useTaskRef(taskId: string | null): TaskRefData | null | undefined {
  const { store } = useTaskRefContext();
  const subscribe = useCallback(
    (onChange: () => void) =>
      taskId === null ? () => undefined : store.subscribe(taskId, onChange),
    [store, taskId],
  );
  const getSnapshot = useCallback(
    () => (taskId === null ? null : store.getSnapshot(taskId)),
    [store, taskId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Minimal in-memory store (tests, previews). */
export function createMemoryTaskRefStore(initial: TaskRefData[] = []) {
  const tasks = new Map<string, TaskRefData | null>(initial.map((t) => [t.id, t]));
  const listeners = new Map<string, Set<() => void>>();
  const notify = (id: string) => listeners.get(id)?.forEach((cb) => cb());
  return {
    getSnapshot: (id: string) => tasks.get(id),
    subscribe: (id: string, cb: () => void) => {
      const set = listeners.get(id) ?? new Set<() => void>();
      set.add(cb);
      listeners.set(id, set);
      return () => set.delete(cb);
    },
    set(task: TaskRefData) {
      tasks.set(task.id, { ...task });
      notify(task.id);
    },
    remove(id: string) {
      tasks.set(id, null);
      notify(id);
    },
    listenerCount: (id: string) => listeners.get(id)?.size ?? 0,
  } satisfies TaskRefStore & Record<string, unknown>;
}
