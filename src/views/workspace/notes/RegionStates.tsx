import { useEffect, useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { IpcError } from '@/lib/ipc/client';
import { notesStrings as t } from '@/strings/notes';
import { copyText } from './clipboard';
import styles from './RegionStates.module.css';

/**
 * Nothing shows for the first 300 ms, then one muted line (docs/ui-design-system.md §8: no
 * skeletons).
 */
const LOADING_DELAY_MS = 300;

export function LoadingLine() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <p className={styles.loading} role="status">
      {t.loading}
    </p>
  );
}

interface RegionErrorProps {
  title: string;
  error: unknown;
  onRetry: () => void;
}

/** What happened + what to do + Try again; "Copy details" copies the code for a bug report. */
export function RegionError({ title, error, onRetry }: RegionErrorProps) {
  const { toast } = useToast();
  const copyDetails = () => {
    const details =
      error instanceof IpcError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    copyText(details)
      .then(() => toast({ message: t.error.detailsCopied }))
      .catch(() => toast({ message: t.toasts.copyFailed, tone: 'error' }));
  };
  return (
    <div className={styles.error} role="alert">
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{t.error.description}</p>
      <div className={styles.actions}>
        <Button onClick={onRetry}>{t.error.retry}</Button>
        <Button variant="ghost" onClick={copyDetails}>
          {t.error.copyDetails}
        </Button>
      </div>
    </div>
  );
}
