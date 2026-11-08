import { DropdownMenu as DropdownPrimitive } from 'radix-ui';
import { useRef, type ReactElement } from 'react';
import { rememberInvoker } from '../focus-return';
import { cx } from '../utils';
import styles from './Menu.module.css';
import { MenuEntries } from './MenuEntries';
import type { MenuEntry } from './types';

export interface DropdownMenuProps {
  /**
   * The trigger, rendered "as child": a Button or IconButton (or any element that forwards its
   * ref and props). It receives `aria-haspopup`, `aria-expanded` and the open/close handlers.
   */
  trigger: ReactElement;
  items: ReadonlyArray<MenuEntry>;
  align?: 'start' | 'center' | 'end';
  onOpenChange?: (open: boolean) => void;
  /** Accessible name of the menu (defaults to being labelled by the trigger). */
  'aria-label'?: string;
  /** Class for the menu surface. */
  className?: string;
}

/**
 * `⋯` / `▾` menu. Radix handles roles (`menu`, `menuitem`, `menuitemcheckbox`,
 * `menuitemradio`), arrows, Home/End, typeahead, submenus, Esc and focus return to the trigger.
 */
export function DropdownMenu({
  trigger,
  items,
  align = 'start',
  onOpenChange,
  'aria-label': ariaLabel,
  className,
}: DropdownMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <DropdownPrimitive.Root onOpenChange={onOpenChange}>
      <DropdownPrimitive.Trigger asChild ref={triggerRef}>
        {trigger}
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          className={cx(styles.content, className)}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          aria-label={ariaLabel}
        >
          <MenuEntries
            primitives={DropdownPrimitive}
            entries={items}
            onAnySelect={() => rememberInvoker(triggerRef.current)}
          />
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}
