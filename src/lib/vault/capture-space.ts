import type { CaptureSpace } from '@/lib/ipc/bindings/CaptureSpace';

/**
 * The space Quick Capture and "Add task" wrote to last, in the vault (a top-level folder). It is
 * a convenience of this device: kept in localStorage, which every Piw window shares.
 */
const KEY = 'piw.vault.captureSpace';

export function lastCaptureSpace(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberCaptureSpace(space: string): void {
  try {
    localStorage.setItem(KEY, space);
  } catch {
    // Private windows and blocked storage: the next capture falls back to the first space.
  }
}

/** The remembered space if it still exists, else the first one, else the vault root (null). */
export function captureSpace(spaces: readonly string[]): string | null {
  const last = lastCaptureSpace();
  return last !== null && spaces.includes(last) ? last : (spaces[0] ?? null);
}

/** Where a new capture goes: per the "New captures go to" setting, the first space by default. */
export function initialSpace(spaces: readonly string[], setting: CaptureSpace): string | null {
  return setting === 'last_used' ? captureSpace(spaces) : (spaces[0] ?? null);
}
