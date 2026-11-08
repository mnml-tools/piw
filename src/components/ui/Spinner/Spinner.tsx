import type { ComponentPropsWithRef } from 'react';
import { cx } from '../utils';
import styles from './Spinner.module.css';

export interface SpinnerProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  size?: 'sm' | 'md';
}

/**
 * Small decorative busy indicator for buttons (the busy button carries `aria-busy`). Lists never
 * use spinners (docs/ui-design-system.md §8).
 */
export function Spinner({ size = 'md', className, ...rest }: SpinnerProps) {
  return <span className={cx(styles.spinner, styles[size], className)} aria-hidden {...rest} />;
}
