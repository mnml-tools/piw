import { type RefObject, useCallback, useEffect, useState } from 'react';

/** Scroll distance after which the view header shows its hairline. */
const HAIRLINE_AT = 8;

/**
 * True once `ref`'s element has scrolled down (drives the view header's hairline). The element must
 * stay mounted while the view is; use {@link useScrollContainer} when the scroll container can be
 * replaced (e.g. a list that swaps with an empty state).
 */
export function useScrolled(ref: RefObject<HTMLElement | null>, threshold = HAIRLINE_AT): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScrolled(element.scrollTop > threshold);
    element.addEventListener('scroll', update, { passive: true });
    return () => element.removeEventListener('scroll', update);
  }, [ref, threshold]);
  return scrolled;
}

export interface ScrolledState<T extends HTMLElement> {
  /** Callback ref for the view's scroll container. */
  ref: (node: T | null) => void;
  /** Scrolled past the hairline threshold: `ViewToolbar scrolled`. */
  scrolled: boolean;
}

/**
 * Callback-ref variant of {@link useScrolled} that follows whichever element the ref is attached
 * to, so a view can swap its scroll container (list ↔ empty state, list ↔ editor) and the
 * header follows.
 */
export function useScrollContainer<T extends HTMLElement = HTMLDivElement>(
  threshold = HAIRLINE_AT,
): ScrolledState<T> {
  const [node, setNode] = useState<T | null>(null);
  const [position, setPosition] = useState<{ node: T | null; top: number }>({
    node: null,
    top: 0,
  });

  useEffect(() => {
    if (!node) return;
    const update = () => setPosition({ node, top: node.scrollTop });
    node.addEventListener('scroll', update, { passive: true });
    return () => node.removeEventListener('scroll', update);
  }, [node]);

  const ref = useCallback((next: T | null) => setNode(next), []);
  // A new container counts as unscrolled until it reports a scroll.
  const top = node !== null && position.node === node ? position.top : 0;
  return { ref, scrolled: top > threshold };
}
