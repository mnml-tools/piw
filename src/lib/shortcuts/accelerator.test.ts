import { describe, expect, it } from 'vitest';
import { isReserved, recordAccelerator } from './accelerator';

const ev = (
  code: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key: code,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('recordAccelerator', () => {
  it('records the default shortcut on every platform', () => {
    expect(recordAccelerator(ev('Space', { ctrlKey: true, shiftKey: true }), 'linux')).toEqual({
      ok: true,
      accelerator: 'CommandOrControl+Shift+Space',
    });
    expect(recordAccelerator(ev('Space', { metaKey: true, shiftKey: true }), 'macos')).toEqual({
      ok: true,
      accelerator: 'CommandOrControl+Shift+Space',
    });
  });

  it('waits for a non-modifier key and requires Mod or Alt', () => {
    expect(recordAccelerator({ ...ev('ShiftLeft'), key: 'Shift' }, 'linux')).toEqual({
      ok: false,
      reason: 'incomplete',
    });
    expect(recordAccelerator(ev('KeyN', { shiftKey: true }), 'linux')).toEqual({
      ok: false,
      reason: 'needs-modifier',
    });
    expect(recordAccelerator(ev('F9'), 'windows')).toMatchObject({ ok: true, accelerator: 'F9' });
  });

  it('uses physical keys so layouts do not matter', () => {
    expect(
      recordAccelerator({ ...ev('KeyN', { ctrlKey: true, shiftKey: true }), key: 'Ñ' }, 'linux'),
    ).toMatchObject({
      accelerator: 'CommandOrControl+Shift+N',
    });
  });
});

describe('isReserved', () => {
  it('rejects AltGr-like and OS combinations', () => {
    expect(isReserved('CommandOrControl+Alt+T', 'linux')).toBe(true);
    expect(isReserved('Alt+F4', 'windows')).toBe(true);
    expect(isReserved('CommandOrControl+Space', 'windows')).toBe(true);
    expect(isReserved('CommandOrControl+Space', 'macos')).toBe(true);
    expect(isReserved('CommandOrControl+Shift+4', 'macos')).toBe(true);
    expect(isReserved('CommandOrControl+C', 'linux')).toBe(true);
  });

  it('accepts sensible capture shortcuts', () => {
    expect(isReserved('CommandOrControl+Shift+Space', 'linux')).toBe(false);
    expect(isReserved('CommandOrControl+Shift+Space', 'macos')).toBe(false);
    expect(isReserved('CommandOrControl+Shift+J', 'windows')).toBe(false);
  });
});
