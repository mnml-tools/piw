import type { Ref } from 'react';

/** Joins class names, skipping falsy values. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/**
 * Default props for Lucide icons used inside components: 14px, decorative, as the kit
 * (@mnml-tools/ui) draws them. The stroke is Lucide's own 2 (base.css sets it for every
 * `svg.lucide`), so icons drawn with and without these props share one stroke width.
 */
export const iconProps = {
  size: 14,
  strokeWidth: 2,
  'aria-hidden': true,
} as const;

export type RovingKey = 'next' | 'prev' | 'first' | 'last';

/**
 * Maps a keyboard key to a roving-focus move for a one-dimensional widget.
 * Returns null when the key is not a navigation key.
 */
export function rovingMove(
  key: string,
  orientation: 'horizontal' | 'vertical' | 'both' = 'horizontal',
): RovingKey | null {
  const horizontal = orientation !== 'vertical';
  const vertical = orientation !== 'horizontal';
  if ((horizontal && key === 'ArrowRight') || (vertical && key === 'ArrowDown')) return 'next';
  if ((horizontal && key === 'ArrowLeft') || (vertical && key === 'ArrowUp')) return 'prev';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return null;
}

/**
 * Finds the index of the next enabled item for a roving move, wrapping at the ends.
 * Returns `current` when no other enabled item exists.
 */
export function rovingIndex(
  current: number,
  move: RovingKey,
  count: number,
  isDisabled: (index: number) => boolean = () => false,
): number {
  if (count === 0) return -1;
  if (move === 'first' || move === 'last') {
    const step = move === 'first' ? 1 : -1;
    let i = move === 'first' ? 0 : count - 1;
    for (let n = 0; n < count; n += 1, i += step) {
      if (!isDisabled(i)) return i;
    }
    return current;
  }
  const step = move === 'next' ? 1 : -1;
  let i = current;
  for (let n = 0; n < count; n += 1) {
    i = (i + step + count) % count;
    if (!isDisabled(i)) return i;
  }
  return current;
}

/** Writes a DOM node into a React 19 ref (callback or object). */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}
