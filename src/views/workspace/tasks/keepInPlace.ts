/**
 * "Completing a task never moves the row until the user leaves the view"
 * (docs/ui-design-system.md §17 rule 6).
 *
 * A list remembers every row toggled while it is mounted ("held" rows). When a refetch no longer
 * includes a held row (an open-tasks query drops it once completed), the row is merged back at
 * its previous position; held rows that are still listed keep that position too, so even a new
 * completion date (Completed view) can't make them jump. Remount the list to forget them.
 *
 * Versions are compared by `updatedAt`, which every write to a task bumps, so a stale refetch
 * never overrides a newer result returned by our own command.
 */
import type { Task } from '@/lib/ipc/bindings/Task';
import type { TaskStatus } from '@/lib/ipc/bindings/TaskStatus';

export interface HeldTask {
  /** The row as first shown here; its `completedAt` keeps Completed groups stable. */
  origin: Task;
  /** Newest version known (our command's result, or a later listing). */
  latest: Task;
  /** Optimistic status, shown while `pending > 0`. */
  status: TaskStatus;
  /** Toggles still in flight. */
  pending: number;
  /**
   * `latest` came from our own command. When such a row stops being listed, our toggle is the
   * reason and the row stays; when a row last seen in a listing disappears, something else
   * removed it (trash, another window), so it goes.
   */
  ours: boolean;
}

export interface KeepInPlaceState {
  held: ReadonlyMap<string, HeldTask>;
  /** Row order (ids) when the last toggle or reorder started: where held rows go back. */
  order: readonly string[];
}

export const EMPTY_KEEP_STATE: KeepInPlaceState = { held: new Map(), order: [] };

function isNewer(candidate: Task, than: Task): boolean {
  return candidate.updatedAt >= than.updatedAt;
}

/** A toggle starts on `row` (as displayed). `order` is the current display order. */
export function startToggle(
  state: KeepInPlaceState,
  row: Task,
  completed: boolean,
  order: readonly string[],
): KeepInPlaceState {
  const previous = state.held.get(row.id);
  const held = new Map(state.held);
  held.set(row.id, {
    origin: previous?.origin ?? row,
    latest: previous?.latest ?? row,
    ours: previous?.ours ?? false,
    status: completed ? 'completed' : 'open',
    pending: (previous?.pending ?? 0) + 1,
  });
  return { held, order };
}

/** A toggle finished; `result` is the task returned by the command (null when it failed). */
export function finishToggle(
  state: KeepInPlaceState,
  id: string,
  result: Task | null,
): KeepInPlaceState {
  const entry = state.held.get(id);
  if (!entry) return state;
  const adopt = result !== null && isNewer(result, entry.latest);
  const held = new Map(state.held);
  held.set(id, {
    ...entry,
    pending: Math.max(0, entry.pending - 1),
    latest: adopt ? result : entry.latest,
    ours: adopt ? true : entry.ours,
  });
  return { ...state, held };
}

/** Folds a new listing into the held rows. Returns `state` itself when nothing changed. */
export function reconcile(state: KeepInPlaceState, tasks: readonly Task[]): KeepInPlaceState {
  let held: Map<string, HeldTask> | null = null;
  for (const task of tasks) {
    const entry = state.held.get(task.id);
    if (!entry || task === entry.latest || !isNewer(task, entry.latest)) continue;
    held ??= new Map(state.held);
    held.set(task.id, { ...entry, latest: task, ours: false });
  }
  return held ? { ...state, held } : state;
}

/** Stops holding a row (e.g. it was moved to Trash). */
export function forget(state: KeepInPlaceState, id: string): KeepInPlaceState {
  if (!state.held.has(id)) return state;
  const held = new Map(state.held);
  held.delete(id);
  return { ...state, held };
}

/** Records a new display order (after a manual reorder). */
export function withOrder(state: KeepInPlaceState, order: readonly string[]): KeepInPlaceState {
  return { ...state, order };
}

function heldRow(entry: HeldTask, listed: Task | undefined): Task {
  const source = listed && isNewer(listed, entry.latest) ? listed : entry.latest;
  return {
    ...source,
    status: entry.pending > 0 ? entry.status : source.status,
    completedAt: entry.origin.completedAt ?? source.completedAt,
  };
}

/** The rows to show: the listing with held rows merged back at their previous positions. */
export function mergeHeld(state: KeepInPlaceState, tasks: readonly Task[]): Task[] {
  if (state.held.size === 0) return [...tasks];
  const ordered = new Set(state.order);
  const listed = new Map(tasks.map((task) => [task.id, task]));
  // Held rows are placed by `order`; everything else keeps the listing's order.
  const rows = tasks.filter((task) => !(state.held.has(task.id) && ordered.has(task.id)));
  state.order.forEach((id, index) => {
    const entry = state.held.get(id);
    if (!entry) return;
    const current = listed.get(id);
    if (!current && !entry.ours && entry.pending === 0) return; // removed elsewhere
    let at = 0;
    for (let before = index - 1; before >= 0; before -= 1) {
      const anchor = state.order[before];
      const found = rows.findIndex((row) => row.id === anchor);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    rows.splice(at, 0, heldRow(entry, current));
  });
  return rows;
}
