import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode, RefObject } from 'react';
import { useReturnFocus } from '../focus-return';
import { IconButton } from '../IconButton/IconButton';
import { cx, iconProps } from '../utils';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog heading (also its accessible name). */
  title: ReactNode;
  /** Keep the title for assistive technology only (search palette). */
  hideTitle?: boolean;
  children?: ReactNode;
  /** Buttons, right-aligned. Put the primary action last. */
  footer?: ReactNode;
  /** Accessible name of the × button. */
  closeLabel?: string;
  /** Show the × button in the header (default true). */
  showClose?: boolean;
  /** `center` (default) or `top` (15vh from the top, like the search palette). */
  placement?: 'center' | 'top';
  /** `none` removes the body padding for custom layouts (search palette). */
  padding?: 'default' | 'none';
  /** Element to focus on open (default: the first focusable element). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * Modal dialog (`role="dialog"`, `aria-modal`): scrim, focus trap, Esc and outside click close
 * it, and focus returns to the invoker. Radix supplies the behaviour; the look is the kit's
 * `Dialog` (@mnml-tools/ui): `.mnml-dialog` with its soft `.mnml-dialog-heading` bar and a
 * `.mnml-dialog-actions` row.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  children,
  footer,
  closeLabel = 'Close',
  showClose = true,
  placement = 'center',
  padding = 'default',
  initialFocusRef,
  className,
}: DialogProps) {
  const restoreFocus = useReturnFocus(open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.overlay} />
        <DialogPrimitive.Content
          className={cx(
            'mnml-dialog',
            styles.dialog,
            styles[placement],
            padding === 'none' && styles.flush,
            className,
          )}
          onOpenAutoFocus={(event) => {
            if (initialFocusRef?.current) {
              event.preventDefault();
              initialFocusRef.current.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (restoreFocus()) event.preventDefault();
          }}
        >
          <div
            className={cx(hideTitle ? styles.headerHidden : 'mnml-dialog-heading', styles.header)}
          >
            <DialogPrimitive.Title className={cx(styles.title, hideTitle && 'visually-hidden')}>
              {title}
            </DialogPrimitive.Title>
            {showClose && (
              <DialogPrimitive.Close asChild>
                <IconButton
                  aria-label={closeLabel}
                  icon={<X {...iconProps} />}
                  size="sm"
                  className={cx('mnml-dialog-close', styles.close)}
                />
              </DialogPrimitive.Close>
            )}
          </div>
          {children != null && <div className={styles.body}>{children}</div>}
          {footer && <div className={cx('mnml-dialog-actions', styles.footer)}>{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
