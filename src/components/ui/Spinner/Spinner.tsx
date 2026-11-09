import { Spinner as KitSpinner } from '@mnml-tools/ui';
import type { ComponentPropsWithRef } from 'react';
import { cx } from '../utils';
import styles from './Spinner.module.css';

export interface SpinnerProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  size?: 'sm' | 'md';
}

/**
 * Small decorative busy indicator for buttons (the busy button carries `aria-busy`): the kit's
 * `Spinner` (@mnml-tools/ui), a turning Loader2. Lists never use spinners
 * (docs/ui-design-system.md §8).
 */
export function Spinner({ size = 'md', className, ...rest }: SpinnerProps) {
  return (
    <span className={cx(styles.spinner, className)} aria-hidden {...rest}>
      <KitSpinner size={size === 'sm' ? 12 : 13} />
    </span>
  );
}
