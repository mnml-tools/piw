/**
 * Test-only helpers for the Notes area. Never import from app code.
 */
import { notifyManager } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { Settings } from '@/lib/ipc/bindings/Settings';

export const settings: Settings = {
  theme: 'system',
  accent: 'blue',
  textSize: 'default',
  closeToTray: true,
  launchAtLogin: false,
  captureShortcut: null,
  captureSpace: 'default',
  lastCaptureSpaceId: null,
  restoreStickiesOnLaunch: false,
  trayNoticeShown: true,
};

/**
 * Vitest fake timers for component tests. Returns the cleanup.
 *
 * - Testing Library only advances fake timers it recognises as Jest's (its async wrapper drains
 *   with a `setTimeout(0)`), so a minimal `jest` shim is exposed meanwhile.
 * - TanStack Query notifies observers with `setTimeout(0)`, which fake timers delay by 1 ms when
 *   scheduled during a tick; microtasks keep query results independent of the clock.
 */
export function useFakeClock(): () => void {
  vi.useFakeTimers();
  Object.defineProperty(globalThis, 'jest', {
    configurable: true,
    value: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) },
  });
  notifyManager.setScheduler(queueMicrotask);
  return () => {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    Reflect.deleteProperty(globalThis, 'jest');
    vi.useRealTimers();
  };
}

/**
 * Advances fake time, then lets cascades settle (a query resolving mounts a component whose own
 * queries resolve next…) without moving the clock further.
 */
export async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    for (let round = 0; round < 5; round += 1) await vi.advanceTimersByTimeAsync(0);
  });
}

/** `userEvent.setup` options for fake timers. */
export const fakeTimerUser = { advanceTimers: (ms: number) => vi.advanceTimersByTime(ms) };
