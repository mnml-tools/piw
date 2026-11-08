import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcError } from '@/lib/ipc/client';
import { Autosaver, type SaveStatus } from './autosave';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Autosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(save: (value: string, rev: number) => Promise<number>) {
    const statuses: SaveStatus[] = [];
    const saver = new Autosaver(
      { value: 'a', rev: 1 },
      { save, delay: 500, onStatus: (s) => statuses.push(s) },
    );
    return { saver, statuses };
  }

  it('debounces edits into one save', async () => {
    const save = vi.fn(async (_value: string, rev: number) => rev + 1);
    const { saver, statuses } = setup(save);
    saver.update('ab');
    saver.update('abc');
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith('abc', 1);
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
    expect(saver.persisted).toEqual({ value: 'abc', rev: 2 });
  });

  it('never runs two saves at once and saves edits made during a save', async () => {
    const first = deferred<number>();
    const save = vi.fn((value: string, rev: number) =>
      value === 'b' ? first.promise : Promise.resolve(rev + 1),
    );
    const { saver } = setup(save);
    saver.update('b');
    await vi.advanceTimersByTimeAsync(500);
    saver.update('bc');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve(2);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith('bc', 2);
    await saver.flush();
    expect(saver.persisted).toEqual({ value: 'bc', rev: 3 });
    expect(saver.dirty).toBe(false);
  });

  it('keeps unsaved text after an error and retries', async () => {
    let fail = true;
    const save = vi.fn(async (_value: string, rev: number) => {
      if (fail) throw new IpcError('storage', 'disk full');
      return rev + 1;
    });
    const { saver } = setup(save);
    saver.update('important');
    await saver.flush();
    expect(saver.current).toBe('error');
    expect(saver.unsaved).toBe('important');
    fail = false;
    await saver.retry();
    expect(saver.current).toBe('saved');
    expect(saver.persisted.value).toBe('important');
  });

  it('stops on a conflict until the user chooses', async () => {
    const save = vi.fn(async (_value: string, rev: number) => {
      if (rev === 1) throw new IpcError('conflict', 'changed elsewhere');
      return rev + 1;
    });
    const { saver } = setup(save);
    saver.update('mine');
    await saver.flush();
    expect(saver.current).toBe('conflict');
    saver.update('mine, edited');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
    await saver.keepMine(5);
    expect(save).toHaveBeenLastCalledWith('mine, edited', 5);
    expect(saver.persisted).toEqual({ value: 'mine, edited', rev: 6 });
  });

  it('flush saves immediately', async () => {
    const save = vi.fn(async (_value: string, rev: number) => rev + 1);
    const { saver } = setup(save);
    saver.update('now');
    await saver.flush();
    expect(save).toHaveBeenCalledOnce();
  });

  it('reverting to the saved text cancels the pending save', async () => {
    const save = vi.fn(async (_value: string, rev: number) => rev + 1);
    const { saver } = setup(save);
    saver.update('typo');
    saver.update('a');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });
});
