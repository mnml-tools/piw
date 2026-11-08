import type { ComponentPropsWithRef } from 'react';
import { cx } from '../utils';
import styles from './Kbd.module.css';
import { describeShortcut, formatShortcut, formatShortcutParts } from './shortcut';

export interface KbdProps extends Omit<ComponentPropsWithRef<'kbd'>, 'children'> {
  /** Platform-neutral shortcut, e.g. `Mod+Shift+Space` (see `formatShortcut`). */
  shortcut: string;
  /** `inline`: one chip with the whole shortcut ("⌘⇧Space"; plain text inside menus). `chip`: one key cap per key, as in Settings. */
  variant?: 'inline' | 'chip';
}

/**
 * Shows a keyboard shortcut in the current OS notation. The visible glyphs are hidden from
 * assistive technology, which reads the spelled-out version ("Control Shift Space") instead.
 */
export function Kbd({ shortcut, variant = 'inline', className, ...rest }: KbdProps) {
  const spoken = describeShortcut(shortcut);
  return (
    <kbd className={cx(styles.kbd, styles[variant], className)} {...rest}>
      <span aria-hidden="true" className={styles.visual}>
        {variant === 'chip'
          ? formatShortcutParts(shortcut).map((part, index) => (
              <kbd key={index} className={styles.key}>
                {part}
              </kbd>
            ))
          : formatShortcut(shortcut)}
      </span>
      <span className="visually-hidden">{spoken}</span>
    </kbd>
  );
}
