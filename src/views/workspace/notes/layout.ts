import { useCallback, useState, useSyncExternalStore } from 'react';

import { layout } from '@/lib/layout';

/**
 * Content width from which Notes can show the list and the editor side by side
 * (docs/ui-design-system.md §9).
 */
export const SPLIT_MIN_CONTENT_WIDTH = layout.splitViewMinContent;

/**
 * Tracks an element's rendered width (the content region, which changes with the window and the
 * task drawer). Returns a callback ref and the width, or `null` while it is unknown (not mounted,
 * not laid out, or no ResizeObserver) so callers can fall back to the wide layout.
 */
export function useElementWidth<T extends HTMLElement>(): [
  (node: T | null) => void,
  number | null,
] {
  const [node, setNode] = useState<T | null>(null);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!node || typeof ResizeObserver === 'undefined') return () => {};
      const observer = new ResizeObserver(notify);
      observer.observe(node);
      return () => observer.disconnect();
    },
    [node],
  );
  const width = useSyncExternalStore(
    subscribe,
    () => {
      const measured = node ? node.getBoundingClientRect().width : 0;
      return measured > 0 ? Math.round(measured) : null;
    },
    () => null,
  );
  return [setNode, width];
}
