import { ContextMenu as ContextPrimitive } from 'radix-ui';
import { useRef, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react';
import { rememberInvoker } from '../focus-return';
import { cx } from '../utils';
import styles from './Menu.module.css';
import { MenuEntries } from './MenuEntries';
import type { MenuEntry } from './types';

export interface ContextMenuProps {
  /**
   * The element that owns the menu (a row, a tab, the sticky strip), rendered "as child".
   * It must forward its ref and event props to a DOM element.
   */
  children: ReactElement;
  items: ReadonlyArray<MenuEntry>;
  onOpenChange?: (open: boolean) => void;
  /** Class for the menu surface. */
  className?: string;
}

/** Events we dispatch ourselves; they carry real coordinates and must pass through. */
const synthesized = new WeakSet<Event>();

function openAt(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const event = new globalThis.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + Math.min(rect.width / 2, 32),
    clientY: rect.top + rect.height / 2,
  });
  synthesized.add(event);
  target.dispatchEvent(event);
}

/**
 * Right-click menu that also opens from the keyboard (Shift+F10 or the Menu key), anchored to the
 * focused element. Esc closes it and focus returns to that element.
 */
export function ContextMenu({ children, items, onOpenChange, className }: ContextMenuProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  // What had focus when the menu opened (the row or a control inside it) gets it back.
  const openerRef = useRef<HTMLElement | null>(null);
  const handleOpenChange = (open: boolean) => {
    if (open) {
      const active = document.activeElement;
      const trigger = triggerRef.current;
      openerRef.current =
        active instanceof HTMLElement && trigger?.contains(active) ? active : trigger;
    }
    onOpenChange?.(open);
  };
  // Keyboard-initiated contextmenu events often report (0, 0); re-anchor them on the element.
  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (synthesized.has(event.nativeEvent)) return;
    if (event.clientX === 0 && event.clientY === 0) {
      event.preventDefault();
      openAt(event.currentTarget);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      event.preventDefault();
      openAt(event.currentTarget);
    }
  };
  return (
    <ContextPrimitive.Root onOpenChange={handleOpenChange}>
      <ContextPrimitive.Trigger
        asChild
        ref={triggerRef}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      >
        {children}
      </ContextPrimitive.Trigger>
      <ContextPrimitive.Portal>
        <ContextPrimitive.Content className={cx(styles.content, className)} collisionPadding={8}>
          <MenuEntries
            primitives={ContextPrimitive}
            entries={items}
            onAnySelect={() => rememberInvoker(openerRef.current)}
          />
        </ContextPrimitive.Content>
      </ContextPrimitive.Portal>
    </ContextPrimitive.Root>
  );
}
