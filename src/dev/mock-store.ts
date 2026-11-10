/**
 * Dev-only in-memory state for the mock backend (see `install.ts`): the vault (`mock-vault.ts`)
 * and what Rust keeps in its own database (settings, stickies, the capture draft). Never
 * imported by production code.
 */
import type { MockVault } from './mock-vault';
import type { AppError } from '@/lib/ipc/bindings/AppError';
import type { CaptureDraft } from '@/lib/ipc/bindings/CaptureDraft';
import type { ColorName } from '@/lib/ipc/bindings/ColorName';
import type { ErrorCode } from '@/lib/ipc/bindings/ErrorCode';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { StickyPlacement } from '@/lib/ipc/bindings/StickyPlacement';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';

export interface StickyRow {
  target: StickyTarget;
  placement: StickyPlacement;
  color: ColorName | null;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  stickies: StickyRow[];
  settings: Settings;
  draft: CaptureDraft | null;
  vault: MockVault;
  /** Piw 0.1 left notes and tasks to import (`?import=1`). */
  importPending: boolean;
}

export const STICKY_DEFAULT_WIDTH = 300;
export const STICKY_DEFAULT_HEIGHT = 260;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'purple',
  textSize: 'default',
  closeToTray: true,
  launchAtLogin: false,
  captureShortcut: 'CommandOrControl+Shift+Space',
  captureSpace: 'last_used',
  lastCaptureSpaceId: null,
  restoreStickiesOnLaunch: false,
  trayNoticeShown: false,
  vaultPath: null,
  vaultImportedAt: null,
};

// Errors: thrown as `{ code, message }`, exactly like a rejected Tauri command.

export function fail(code: ErrorCode, message: string): never {
  const error: AppError = { code, message };
  throw error;
}

export function notFound(entity: string): never {
  return fail('not_found', `${entity} not found`);
}

export function invalid(message: string): never {
  return fail('validation', message);
}

export function conflict(entity: string): never {
  return fail('conflict', `${entity} was changed elsewhere; reload and try again`);
}

let lastTimestamp = 0;

/** UTC timestamp like `2026-11-06T12:00:00.000Z`, strictly increasing so sorts are stable. */
export function now(): string {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return new Date(lastTimestamp).toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}
