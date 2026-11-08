import { describe, expect, it } from 'vitest';
import type { Task } from '@/lib/ipc/bindings/Task';
import { task } from '@/test/fixtures';
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

const T0 = '2026-11-06T10:00:00.000Z';
const T1 = '2026-11-06T10:00:01.000Z';
const T2 = '2026-11-06T10:00:02.000Z';

function row(id: string, overrides: Partial<Task> = {}): Task {
  return task({ id, title: id, updatedAt: T0, ...overrides });
}

function completedVersion(source: Task, at = T1): Task {
  return { ...source, status: 'completed', completedAt: at, updatedAt: at };
}

function view(state: KeepInPlaceState, tasks: Task[]) {
  return mergeHeld(state, tasks).map((t) => `${t.id}:${t.status}`);
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe('keep in place', () => {
  const a = row('a');
  const b = row('b');
  const c = row('c');
  const d = row('d');

  it('shows the optimistic status while the toggle is pending', () => {
    const state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c]));
    expect(view(state, [a, b, c])).toEqual(['a:open', 'b:completed', 'c:open']);
  });

  it('keeps a completed row where it was after the listing drops it', () => {
    let state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c]));
    state = finishToggle(state, 'b', completedVersion(b));
    const listing = [a, c];
    state = reconcile(state, listing);
    expect(view(state, listing)).toEqual(['a:open', 'b:completed', 'c:open']);
  });

  it('keeps consecutive held rows in their relative order', () => {
    let state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c, d]));
    state = startToggle(state, c, true, ids([a, b, c, d]));
    state = finishToggle(state, 'c', completedVersion(c));
    state = finishToggle(state, 'b', completedVersion(b));
    expect(view(reconcile(state, [a, d]), [a, d])).toEqual([
      'a:open',
      'b:completed',
      'c:completed',
      'd:open',
    ]);
  });

  it('puts a held first row back at the top', () => {
    let state = startToggle(EMPTY_KEEP_STATE, a, true, ids([a, b]));
    state = finishToggle(state, 'a', completedVersion(a));
    expect(view(state, [b])).toEqual(['a:completed', 'b:open']);
  });

  it('a stale listing never overrides the newer result of our command', () => {
    let state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c]));
    state = finishToggle(state, 'b', completedVersion(b, T2));
    const stale = [a, { ...b, updatedAt: T1 }, c];
    state = reconcile(state, stale);
    expect(view(state, stale)).toEqual(['a:open', 'b:completed', 'c:open']);
  });

  it('unchecking a held row shows it open again, in place', () => {
    let state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c]));
    state = finishToggle(state, 'b', completedVersion(b));
    state = reconcile(state, [a, c]);
    const shown = mergeHeld(state, [a, c]);
    state = startToggle(state, shown[1] as Task, false, ids(shown));
    const reopened = { ...b, updatedAt: T2 };
    state = finishToggle(state, 'b', reopened);
    // The open-tasks listing now lists it again, last by its manual order: it stays put.
    const listing = [a, c, reopened];
    state = reconcile(state, listing);
    expect(view(state, listing)).toEqual(['a:open', 'b:open', 'c:open']);
  });

  it('drops a row that something else removed after it was listed again', () => {
    let state = startToggle(EMPTY_KEEP_STATE, b, false, ids([a, b, c]));
    const reopened = { ...b, updatedAt: T1 };
    state = finishToggle(state, 'b', reopened);
    state = reconcile(state, [a, { ...reopened, updatedAt: T2 }, c]);
    expect(view(reconcile(state, [a, c]), [a, c])).toEqual(['a:open', 'c:open']);
  });

  it('keeps the first completion date so Completed groups stay stable', () => {
    const done = row('done', { status: 'completed', completedAt: T0 });
    let state = startToggle(EMPTY_KEEP_STATE, done, false, ['done']);
    state = finishToggle(state, 'done', {
      ...done,
      status: 'open',
      completedAt: null,
      updatedAt: T1,
    });
    state = reconcile(state, []);
    expect(mergeHeld(state, [])[0]).toMatchObject({ status: 'open', completedAt: T0 });
    // Completing it again gives it a new date on the server; the row keeps the original.
    state = startToggle(state, mergeHeld(state, [])[0] as Task, true, ['done']);
    const again = { ...done, completedAt: T2, updatedAt: T2 };
    state = finishToggle(state, 'done', again);
    expect(mergeHeld(reconcile(state, [again]), [again])[0]).toMatchObject({
      status: 'completed',
      completedAt: T0,
    });
  });

  it('a failed toggle falls back to the listed status', () => {
    let state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c]));
    state = finishToggle(state, 'b', null);
    expect(view(state, [a, b, c])).toEqual(['a:open', 'b:open', 'c:open']);
  });

  it('forget releases a row (e.g. moved to Trash)', () => {
    let state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c]));
    state = finishToggle(state, 'b', completedVersion(b));
    expect(view(forget(state, 'b'), [a, c])).toEqual(['a:open', 'c:open']);
  });

  it('withOrder moves held rows with a manual reorder', () => {
    let state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c]));
    state = finishToggle(state, 'b', completedVersion(b));
    state = withOrder(state, ['c', 'a', 'b']);
    expect(view(state, [c, a])).toEqual(['c:open', 'a:open', 'b:completed']);
  });

  it('reconcile returns the same state when nothing changed', () => {
    const state = startToggle(EMPTY_KEEP_STATE, b, true, ids([a, b, c]));
    expect(reconcile(state, [a, b, c])).toBe(state);
  });
});
