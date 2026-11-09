import { Button as KitButton } from '@mnml-tools/ui';
import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react';
import { Spinner } from '../Spinner/Spinner';
import { cx } from '../utils';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  /** `md` = 26px, 12px label (default: dialogs, forms, empty states); `sm` = 22px, 11px label. */
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
 * Command button on the kit's `Button` (@mnml-tools/ui): square, 1px border. `secondary` is the
 * kit's default button, `primary` the kit's primary (one per surface: Save, Create), `ghost` a
 * borderless text button with the hover fill, `danger` a default button that fills red on hover
 * (confirm-delete only). Labels start with a verb ("Move to Trash"), never "OK".
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
    <KitButton
      type={type}
      variant={variant === 'primary' ? 'primary' : 'default'}
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
    </KitButton>
  );
}
