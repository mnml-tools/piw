import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '../utils';
import styles from './TextInput.module.css';

export interface TextInputProps extends Omit<ComponentPropsWithRef<'input'>, 'size'> {
  /** Visible label. Without it, pass `aria-label` or `aria-labelledby`. */
  label?: ReactNode;
  /** Error text below the field (linked with `aria-describedby`); also marks the field invalid. */
  error?: ReactNode;
  /** `default` bordered field, `ghost` borderless inline (rename, add row). */
  variant?: 'default' | 'ghost';
  /** `sm` 24px, `md` 26px (default), `lg` 28px (dialog fields). */
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}

/** Single-line text field. `className` always goes on the <input>. */
export function TextInput({
  variant = 'default',
  size = 'md',
  invalid,
  label,
  error,
  className,
  id,
  type = 'text',
  'aria-describedby': describedBy,
  ...rest
}: TextInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  const isInvalid = invalid || Boolean(error);
  const input = (
    <input
      id={inputId}
      type={type}
      className={cx(styles.input, styles[variant], styles[size], className)}
      aria-invalid={isInvalid || undefined}
      aria-describedby={cx(describedBy, errorId) || undefined}
      {...rest}
    />
  );
  if (!label && !error) return input;
  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      {input}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
