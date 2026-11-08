import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react';
import { Spinner } from '../Spinner/Spinner';
import { cx } from '../utils';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  /** `md` = 28px, 13px label (default: dialogs, forms, empty states); `sm` = 24px, 12px label. */
  size?: ButtonSize;
  /**
   * Busy: a spinner takes the place of the leading icon (or leads the label), the label stays,
   * `aria-busy` is set and clicks are ignored (it stays focusable).
   */
  loading?: boolean;
  /** Leading icon (decorative). */
  icon?: ReactNode;
  /** Trailing icon (decorative), e.g. a chevron on menu triggers. */
  iconEnd?: ReactNode;
}

/**
 * Command button: `primary` is the accent pill (one per surface), `secondary` a soft fill,
 * `ghost` text with a hover fill, `danger` for confirm-delete. Labels start with a verb
 * ("Move to Trash"), never "OK".
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconEnd,
  type = 'button',
  className,
  children,
  onClick,
  disabled,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[size], className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-loading={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.content}>
        {loading ? (
          <span className={styles.icon}>
            <Spinner size={size === 'sm' ? 'sm' : 'md'} />
          </span>
        ) : (
          icon && <span className={styles.icon}>{icon}</span>
        )}
        {children != null && children !== false && <span className={styles.label}>{children}</span>}
        {iconEnd && <span className={styles.icon}>{iconEnd}</span>}
      </span>
    </button>
  );
}
