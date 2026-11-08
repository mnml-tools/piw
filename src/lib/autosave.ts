import { IpcError } from '@/lib/ipc/client';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

export interface AutosaverOptions<T> {
  /** Persists `value` given the last known revision; resolves with the new revision. */
  save: (value: T, rev: number) => Promise<number>;
  onStatus: (status: SaveStatus) => void;
  delay?: number;
  equals?: (a: T, b: T) => boolean;
}

/**
 * Debounced, strictly sequential autosave with optimistic concurrency.
 *
 * - Never runs two saves at once; edits made during a save are saved right after it.
 * - A failed save keeps the unsaved value (status `error`) until `retry` or the next edit.
 * - A `conflict` (another window saved first) stops saving until the caller resolves it, so
 *   another window's text is never overwritten silently.
 */
export class Autosaver<T> {
  private base: { value: T; rev: number };
  private pending: { value: T } | null = null;
  private inFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private status: SaveStatus = 'idle';
  private disposed = false;
  private readonly delay: number;
  private readonly equals: (a: T, b: T) => boolean;

  private save: AutosaverOptions<T>['save'];

  constructor(
    initial: { value: T; rev: number },
    private readonly options: AutosaverOptions<T>,
  ) {
    this.save = options.save;
    this.base = initial;
    this.delay = options.delay ?? 600;
    this.equals = options.equals ?? Object.is;
  }

  /** Replaces the save function (e.g. a React callback that changed between renders). */
  setSave(save: AutosaverOptions<T>['save']): void {
    this.save = save;
  }

  get current(): SaveStatus {
    return this.status;
  }

  /** The last value known to be persisted, and its revision. */
  get persisted(): { value: T; rev: number } {
    return this.base;
  }

  /** True when there are edits that are not persisted yet. */
  get dirty(): boolean {
    return this.pending !== null || this.inFlight !== null;
  }

  /** Replaces the persisted baseline (e.g. after loading or reloading from the database). */
  reset(value: T, rev: number): void {
    this.clearTimer();
    this.base = { value, rev };
    this.pending = null;
    this.setStatus('idle');
  }

  update(value: T): void {
    if (this.disposed) return;
    if (this.status === 'conflict') {
      this.pending = { value };
      return;
    }
    if (!this.inFlight && this.equals(value, this.base.value)) {
      this.clearTimer();
      this.pending = null;
      if (this.status === 'pending' || this.status === 'error') this.setStatus('saved');
      return;
    }
    this.pending = { value };
    this.setStatus('pending');
    this.clearTimer();
    this.timer = setTimeout(() => void this.run(), this.delay);
  }

  /** Saves immediately and resolves when everything up to now is persisted (or failed). */
  async flush(): Promise<void> {
    this.clearTimer();
    for (let guard = 0; guard < 10; guard += 1) {
      if (this.inFlight) {
        await this.inFlight;
        continue;
      }
      if (!this.pending || this.status === 'conflict' || this.status === 'error') return;
      await this.run();
    }
  }

  retry(): Promise<void> {
    if (this.status === 'error') this.setStatus('pending');
    return this.flush();
  }

  /** After a conflict: keep the local text and save it over the newer revision. */
  keepMine(latestRev: number): Promise<void> {
    this.base = { ...this.base, rev: latestRev };
    this.setStatus('pending');
    return this.flush();
  }

  /** After a conflict: drop local edits and adopt the database version. */
  takeTheirs(value: T, rev: number): void {
    this.reset(value, rev);
  }

  /** The unsaved value, if any (used to recover text after an error). */
  get unsaved(): T | undefined {
    return this.pending?.value;
  }

  /** Stops timers and status callbacks (component unmounted). Reversible with `activate`. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  /** (Re)enables the saver — React StrictMode unmounts and remounts effects in development. */
  activate(): void {
    this.disposed = false;
  }

  private run(): Promise<void> {
    if (this.inFlight || !this.pending) return this.inFlight ?? Promise.resolve();
    const { value } = this.pending;
    this.pending = null;
    this.setStatus('saving');
    this.inFlight = this.save(value, this.base.rev).then(
      (rev) => {
        this.base = { value, rev };
        this.inFlight = null;
        if (this.pending && !this.equals(this.pending.value, value)) {
          void this.run();
        } else {
          this.pending = null;
          this.setStatus('saved');
        }
      },
      (error: unknown) => {
        this.inFlight = null;
        // Keep the newest unsaved text: an edit made during the failed save wins.
        this.pending = this.pending ?? { value };
        const conflict = error instanceof IpcError && error.code === 'conflict';
        this.setStatus(conflict ? 'conflict' : 'error');
      },
    );
    return this.inFlight;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: SaveStatus): void {
    if (this.status === status) return;
    this.status = status;
    if (!this.disposed) this.options.onStatus(status);
  }
}
