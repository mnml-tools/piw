import { AlertTriangle } from 'lucide-react';
import { EmptyState, iconProps } from '@/components/ui';
import { common } from '@/strings/common';
import styles from './DataError.module.css';

/** Shown instead of the workspace when Piw's own database (settings, stickies) could not be opened. */
export function DataError({ reason, path }: { reason: string; path: string | null }) {
  return (
    <main className={styles.dataError}>
      <EmptyState
        icon={<AlertTriangle {...iconProps} />}
        title={common.data.errorTitle}
        description={
          <>
            {common.data.errorBody}
            <code className={styles.detail}>{reason}</code>
            {path && <code className={styles.detail}>{path}</code>}
          </>
        }
        headingLevel={2}
      />
    </main>
  );
}
