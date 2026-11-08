/**
 * Global-shortcut accelerators in Tauri's format (`CommandOrControl+Shift+Space`), recorded
 * from keyboard events and validated against combinations the OS or keyboard layouts reserve
 * (docs/ui-design-system.md §14).
 */
import type { Platform } from '@/components/ui/Kbd/shortcut';

export type RecordResult =
  | { ok: true; accelerator: string }
  | { ok: false; reason: 'incomplete' | 'needs-modifier' | 'reserved' };

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'OS']);

/** Physical key → accelerator key name (layout independent). */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const named: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete',
  };
  return named[code] ?? null;
}

export function recordAccelerator(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  platform: Platform,
): RecordResult {
  if (MODIFIER_KEYS.has(event.key)) return { ok: false, reason: 'incomplete' };
  const key = keyName(event.code);
  if (!key) return { ok: false, reason: 'incomplete' };
  const mod = platform === 'macos' ? event.metaKey : event.ctrlKey;
  const isFunctionKey = /^F\d+$/.test(key);
  if (!mod && !event.altKey && !isFunctionKey) return { ok: false, reason: 'needs-modifier' };

  const parts: string[] = [];
  if (mod) parts.push('CommandOrControl');
  if (platform === 'macos' && event.ctrlKey) parts.push('Control');
  if (platform !== 'macos' && event.metaKey) parts.push('Super');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  const accelerator = parts.join('+');
  return isReserved(accelerator, platform)
    ? { ok: false, reason: 'reserved' }
    : { ok: true, accelerator };
}

/** Combinations that would break typing, the OS or common desktop shortcuts. */
export function isReserved(accelerator: string, platform: Platform): boolean {
  const parts = accelerator.split('+');
  const key = parts.at(-1) ?? '';
  const has = (m: string) => parts.includes(m);
  const mod = has('CommandOrControl');
  const letter = /^[A-Z0-9]$/.test(key);

  if (platform !== 'macos') {
    // AltGr = Ctrl+Alt types characters on many layouts (PT @ € {).
    if (mod && has('Alt')) return true;
    if (has('Super')) return true;
    if (
      has('Alt') &&
      !mod &&
      (letter || key === 'Space' || key === 'F4' || key === 'F1' || key === 'F2')
    )
      return true;
    // Ctrl+Space / Win+Space switch input methods.
    if (mod && key === 'Space' && !has('Shift')) return true;
  } else {
    if (mod && key === 'Space' && !has('Shift') && !has('Alt')) return true; // Spotlight
    if (has('Control') && key === 'Space') return true; // input sources
    if (mod && has('Alt') && key === 'Space') return true; // Finder search
    if (mod && !has('Shift') && !has('Alt') && ['Q', 'W', 'H', 'M', 'Tab', '`'].includes(key))
      return true;
    if (mod && has('Shift') && ['3', '4', '5'].includes(key)) return true; // screenshots
    if (has('Alt') && !mod && letter) return true; // ⌥ types characters
  }
  // Plain Mod+letter shortcuts collide with every app's own menus (copy, paste…).
  if (mod && !has('Shift') && !has('Alt') && !has('Control') && letter) return true;
  return false;
}
