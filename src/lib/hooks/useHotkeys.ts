import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts written platform-neutrally, e.g. `Mod+N`, `Mod+Shift+\\`, `Delete`, `/`.
 * `Mod` is ⌘ on macOS and Ctrl elsewhere. Single-key shortcuts (no Mod/Ctrl/Alt) never fire
 * while typing in a text field (docs/ui-design-system.md §14).
 */
export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(type);
  }
  return false;
}

function normaliseKey(key: string): string {
  if (key === ' ') return 'space';
  if (key === 'Esc') return 'escape';
  return key.toLowerCase();
}

/** Whether `event` matches `combo`. Exported for tests. */
export function matches(combo: string, event: KeyboardEvent, mac: boolean = isMac()): boolean {
  const parts = combo.split('+').map((p) => p.trim().toLowerCase());
  const key = parts.pop() === '' ? '+' : combo.split('+').at(-1)!.toLowerCase();
  const wants = new Set(parts);
  const mod = wants.has('mod');
  const ctrl = wants.has('ctrl') || (mod && !mac);
  const meta = wants.has('meta') || (mod && mac);
  if (event.ctrlKey !== ctrl || event.metaKey !== meta) return false;
  if (event.altKey !== wants.has('alt')) return false;
  // Shift is only checked when declared or for letters; symbols like `/` may need Shift.
  const shift = wants.has('shift');
  const eventKey = normaliseKey(event.key);
  if (shift !== event.shiftKey && (shift || /^[a-z]$/.test(eventKey))) return false;
  if (eventKey === key) return true;
  // Layout-independent fallback for letters/digits/backslash with modifiers held.
  const code = event.code.toLowerCase();
  return code === `key${key}` || code === `digit${key}` || (key === '\\' && code === 'backslash');
}

export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      for (const [combo, handler] of Object.entries(ref.current)) {
        const single = !/(^|\+)(mod|ctrl|meta|alt)\+/i.test(combo);
        if (single && isEditableTarget(event.target)) continue;
        if (matches(combo, event)) {
          event.preventDefault();
          handler(event);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
