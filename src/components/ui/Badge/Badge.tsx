import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../utils';
import styles from './Badge.module.css';

export interface BadgeProps extends ComponentPropsWithRef<'span'> {
  /** The text ("Archived", "#security", "3"). Required: a badge never relies on colour alone. */
  children: ReactNode;
}

/** Small label for tags, counts and states ("Archived"). */
export function Badge({ className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, className)} {...rest}>
      {children}
    </span>
  );
}
