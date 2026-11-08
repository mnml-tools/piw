import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Menus close in the same commit in which a dialog they invoked opens, so by the time the dialog
 * mounts the focused menu item is gone. Menus therefore remember their invoker (the `⋯` button or
 * the row) when an item is selected, and layers that open right after use it as the return target.
 */
let lastInvoker: { element: HTMLElement; at: number } | null = null;
const INVOKER_TTL_MS = 1000;

export function rememberInvoker(element: HTMLElement | null): void {
  lastInvoker = element ? { element, at: Date.now() } : null;
}

function takeInvoker(): HTMLElement | null {
  const invoker = lastInvoker;
  lastInvoker = null;
  if (!invoker || Date.now() - invoker.at > INVOKER_TTL_MS) return null;
  return invoker.element;
}

function usable(element: Element | null | undefined): element is HTMLElement {
  return (
    element instanceof HTMLElement && element.isConnected && element !== element.ownerDocument.body
  );
}

/**
 * Remembers what had focus when a layer opened and returns a function that puts focus back
 * when it closes: `returnFocusRef` first, then the element focused at open time, then the menu
 * invoker. Returns true when it moved focus.
 */
export function useReturnFocus(
  open: boolean,
  returnFocusRef?: RefObject<HTMLElement | null>,
): () => boolean {
  const opener = useRef<HTMLElement | null>(null);
  const invoker = useRef<HTMLElement | null>(null);

  // Layout effect: runs before Radix's FocusScope moves focus into the layer (passive effect).
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = usable(active) ? active : null;
    invoker.current = takeInvoker();
  }, [open]);

  return useCallback(() => {
    const target = [returnFocusRef?.current, opener.current, invoker.current].find(usable);
    opener.current = null;
    invoker.current = null;
    if (!target) return false;
    target.focus({ preventScroll: true });
    return true;
  }, [returnFocusRef]);
}
