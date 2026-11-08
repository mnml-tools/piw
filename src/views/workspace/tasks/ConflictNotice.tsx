import { AlertTriangle } from 'lucide-react';
import { Button, cx } from '@/components/ui';
import { tasksStrings as t } from '@/strings/tasks';
import styles from './TaskDrawer.module.css';

interface ConflictNoticeProps {
  onReload: () => void;
  onKeepMine: () => void;
  compact?: boolean;
}

/** "Changed in another window" with Reload / Keep mine: the local text is never lost silently. */
export function ConflictNotice({ onReload, onKeepMine, compact = false }: ConflictNoticeProps) {
  return (
    <div role="alert" className={cx(styles.conflict, compact && styles.conflictCompact)}>
      <AlertTriangle aria-hidden size={14} className={styles.conflictIcon} />
      <span className={styles.conflictText}>{t.drawer.conflict}</span>
      <Button size="sm" variant="secondary" onClick={onReload}>
        {t.drawer.reload}
      </Button>
      <Button size="sm" variant="ghost" onClick={onKeepMine}>
        {t.drawer.keepMine}
      </Button>
    </div>
  );
}
