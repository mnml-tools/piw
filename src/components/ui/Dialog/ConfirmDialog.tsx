import { AlertDialog as AlertPrimitive } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import { useReturnFocus } from '../focus-return';
import { cx } from '../utils';
import styles from './Dialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A question naming the object: "Delete “Refactor 2FA” forever?" */
  title: ReactNode;
  description?: ReactNode;
  /** Extra content, e.g. the "Keep the tasks / Move them too" radio group. */
  children?: ReactNode;
  /** Explicit verb: "Delete forever", "Move to Trash". Never "OK". */
  confirmLabel: string;
  cancelLabel: string;
  /**
   * Runs on confirm. Returning a promise keeps the dialog open and the button busy until it
   * resolves; a rejection keeps the dialog open (show the error in the caller).
   */
  onConfirm: () => void | Promise<unknown>;
  /** Danger styling for the confirm button (deletions). */
  destructive?: boolean;
  className?: string;
}

/**
 * Confirmation for irreversible or multi-item actions (`role="alertdialog"`), drawn as the kit's
 * `ConfirmDialog` (a 360px `.mnml-message-dialog`). Initial focus is on Cancel; Esc cancels;
 * focus returns to the invoker.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  className,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const restoreFocus = useReturnFocus(open);

  const handleConfirm = () => {
    const result = onConfirm();
    if (result instanceof Promise) {
      setBusy(true);
      result.then(
        () => {
          setBusy(false);
          onOpenChange(false);
        },
        () => setBusy(false),
      );
      return;
    }
    onOpenChange(false);
  };

  return (
    <AlertPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={styles.overlay} />
        <AlertPrimitive.Content
          className={cx('mnml-dialog', 'mnml-message-dialog', styles.dialog, className)}
          onCloseAutoFocus={(event) => {
            if (restoreFocus()) event.preventDefault();
          }}
        >
          <div className={cx('mnml-dialog-heading', styles.header)}>
            <AlertPrimitive.Title className={styles.title}>{title}</AlertPrimitive.Title>
          </div>
          {description && (
            <AlertPrimitive.Description className={styles.description}>
              {description}
            </AlertPrimitive.Description>
          )}
          {children != null && <div className={styles.body}>{children}</div>}
          <div className={cx('mnml-dialog-actions', styles.confirmFooter)}>
            <AlertPrimitive.Cancel asChild>
              <Button disabled={busy}>{cancelLabel}</Button>
            </AlertPrimitive.Cancel>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              loading={busy}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
