import { IconButton as KitIconButton } from '@mnml-tools/ui';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { formatShortcut, toAriaKeyShortcuts } from '../Kbd/shortcut';
import { cx } from '../utils';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'aria-label' | 'children' | 'title'
> {
  /** Required accessible name, e.g. "Pin to desktop". */
  'aria-label': string;
  /** The icon (decorative; the label names the button). */
  icon: ReactNode;
  /**
   * Native tooltip (`title`). Defaults to the aria-label; pass `false` to omit it.
   * The formatted shortcut is appended: "Pin to desktop (⌘⇧P)".
   */
  tooltip?: string | false;
  /** Platform-neutral shortcut shown in the tooltip and exposed via `aria-keyshortcuts`. */
  shortcut?: string;
  /** Toggle buttons: sets `aria-pressed` and the pressed style. */
  pressed?: boolean;
  /** `md` = 26px with a 14px icon (bars, headers); `sm` = 22px with a 13px icon (rows, tabs). */
  size?: 'sm' | 'md';
}

/**
 * Icon-only button on the kit's `IconButton` (@mnml-tools/ui), with a required accessible name
 * and a tooltip that includes its shortcut. `data-icon-button` lets a container hang its padding
 * outside the grid (Page.module.css).
 */
export function IconButton({
  'aria-label': label,
  icon,
  tooltip,
  shortcut,
  pressed,
  size = 'md',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  const tip =
    tooltip === false
      ? undefined
      : `${tooltip ?? label}${shortcut ? ` (${formatShortcut(shortcut)})` : ''}`;
  return (
    <KitIconButton
      type={type}
      aria-label={label}
      title={tip}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut ? toAriaKeyShortcuts(shortcut) : undefined}
      className={cx(styles.iconButton, styles[size], className)}
      data-icon-button=""
      {...rest}
    >
      {icon}
    </KitIconButton>
  );
}
