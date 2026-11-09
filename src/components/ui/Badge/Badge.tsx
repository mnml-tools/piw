import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../utils';
import styles from './Badge.module.css';

export interface BadgeProps extends ComponentPropsWithRef<'span'> {
  /** The text ("Archived", "#security", "3"). Required: a badge never relies on colour alone. */
  children: ReactNode;
}

/**
 * Small label for tags, counts and states ("Archived"): the kit's `.mnml-badge`
 * (@mnml-tools/ui), 10px mono in a 1px border. Rendered here rather than through the kit's
 * `Badge` so it keeps forwarding its ref and props.
 */
export function Badge({ className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx('mnml-badge', styles.badge, className)} {...rest}>
      {children}
    </span>
  );
}
