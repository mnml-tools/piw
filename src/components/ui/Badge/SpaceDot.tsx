import type { ComponentPropsWithRef } from 'react';
import { cx } from '../utils';
import type { StickyColor } from './colors';
import styles from './SpaceDot.module.css';

type DotLabelling =
  /** The name is rendered elsewhere (e.g. next to it in a menu item): purely decorative. */
  | { decorative: true; label?: undefined }
  | {
      decorative?: false;
      /** Space name ("Work"), rendered next to the dot. */
      label: string;
    };

export type SpaceDotProps = Omit<ComponentPropsWithRef<'span'>, 'children' | 'color'> &
  DotLabelling & {
    color: StickyColor;
  };

/** 8px round colour dot for spaces and stickies. Never colour-only: always paired with a name. */
export function SpaceDot({ color, decorative, label, className, ...rest }: SpaceDotProps) {
  if (decorative) {
    return (
      <span className={cx(styles.dot, className)} data-color={color} aria-hidden="true" {...rest} />
    );
  }
  return (
    <span className={cx(styles.withLabel, className)} {...rest}>
      <span className={styles.dot} data-color={color} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </span>
  );
}
