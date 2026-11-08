import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { StickyKind } from '@/lib/ipc/bindings/StickyKind';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';

/** Which UI a webview renders. Mirrors the labels defined in `platform/labels.rs`. */
export type WindowKind =
  | { kind: 'main' }
  | { kind: 'capture' }
  | { kind: 'sticky'; target: StickyTarget }
  /** Dev-only component gallery (`?window=gallery` in a browser). */
  | { kind: 'gallery' };

const STICKY_KINDS: readonly StickyKind[] = ['note', 'task', 'tasks_tab'];
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function parseWindowLabel(label: string): WindowKind | null {
  if (label === 'main') return { kind: 'main' };
  if (label === 'capture') return { kind: 'capture' };
  if (label === 'gallery' && import.meta.env.DEV) return { kind: 'gallery' };
  const [prefix, kind, id, ...rest] = label.split(':');
  if (
    prefix === 'sticky' &&
    rest.length === 0 &&
    STICKY_KINDS.includes(kind as StickyKind) &&
    id !== undefined &&
    ID_PATTERN.test(id)
  ) {
    return { kind: 'sticky', target: { kind: kind as StickyKind, id } };
  }
  return null;
}

export function stickyLabel(target: StickyTarget): string {
  return `sticky:${target.kind}:${target.id}`;
}

/**
 * Resolves the current window. Outside Tauri (plain browser during UI development) the
 * `?window=` query parameter selects the view, defaulting to the workspace.
 */
export function currentWindowKind(): WindowKind {
  const label = isTauri()
    ? getCurrentWindow().label
    : (new URLSearchParams(window.location.search).get('window') ?? 'main');
  return parseWindowLabel(label) ?? { kind: 'main' };
}
