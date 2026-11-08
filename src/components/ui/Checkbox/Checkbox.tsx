import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../utils';
import styles from './Checkbox.module.css';

type Labelling =
  | { label: ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string }
  | { label?: undefined; 'aria-label': string; 'aria-labelledby'?: string }
  | { label?: undefined; 'aria-label'?: string; 'aria-labelledby': string };

export type CheckboxProps = Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'size' | 'aria-label' | 'aria-labelledby' | 'children'
> &
  Labelling & {
    /** `md` 16px (rows), `sm` 14px (subtasks and stickies). */
    size?: 'sm' | 'md';
  };

/**
 * Native `<input type="checkbox">` with a custom box. Click and Space toggle it natively; the
 * check draws in `--duration-fast` (0 under reduced motion). There is no indeterminate state.
 * A visible `label` is struck through while checked. Otherwise name it with `aria-label` /
 * `aria-labelledby` (the task title).
 */
export function Checkbox({ size = 'md', label, className, ...rest }: CheckboxProps) {
  const box = (
    <span className={cx(styles.root, styles[size], !label && className)}>
      <input type="checkbox" className={styles.input} {...rest} />
      <span className={styles.box} aria-hidden="true">
        <svg className={styles.check} viewBox="0 0 16 16" focusable="false">
          <path d="M3.75 8.25 6.75 11.25 12.25 5" pathLength={1} />
        </svg>
      </span>
    </span>
  );
  if (!label) return box;
  return (
    <label className={cx(styles.withLabel, styles[size], className)}>
      {box}
      <span className={styles.labelText}>{label}</span>
    </label>
  );
}
