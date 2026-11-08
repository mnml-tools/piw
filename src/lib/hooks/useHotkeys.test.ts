import { describe, expect, it } from 'vitest';
import { isEditableTarget, matches } from './useHotkeys';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('matches', () => {
  it('maps Mod to Ctrl on Windows/Linux and ⌘ on macOS', () => {
    expect(matches('Mod+N', key({ key: 'n', ctrlKey: true }), false)).toBe(true);
    expect(matches('Mod+N', key({ key: 'n', metaKey: true }), false)).toBe(false);
    expect(matches('Mod+N', key({ key: 'n', metaKey: true }), true)).toBe(true);
  });

  it('requires exactly the declared modifiers', () => {
    expect(matches('Mod+N', key({ key: 'N', ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(matches('Mod+Shift+N', key({ key: 'N', ctrlKey: true, shiftKey: true }), false)).toBe(
      true,
    );
    expect(matches('Mod+N', key({ key: 'n', ctrlKey: true, altKey: true }), false)).toBe(false);
  });

  it('matches by physical key when the layout changes the character', () => {
    expect(matches('Mod+\\', key({ key: 'º', code: 'Backslash', ctrlKey: true }), false)).toBe(
      true,
    );
    expect(matches('Mod+1', key({ key: '&', code: 'Digit1', ctrlKey: true }), false)).toBe(true);
  });

  it('handles single keys and named keys', () => {
    expect(matches('Delete', key({ key: 'Delete' }), false)).toBe(true);
    expect(matches('Space', key({ key: ' ' }), false)).toBe(true);
    expect(matches('/', key({ key: '/', shiftKey: true }), false)).toBe(true);
  });
});

describe('isEditableTarget', () => {
  it('treats text fields as editable but not checkboxes', () => {
    const text = document.createElement('input');
    const box = document.createElement('input');
    box.type = 'checkbox';
    expect(isEditableTarget(text)).toBe(true);
    expect(isEditableTarget(box)).toBe(false);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
  });
});
