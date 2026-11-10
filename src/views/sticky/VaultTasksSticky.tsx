import { Plus } from 'lucide-react';
import { inlineText } from '@/lib/markdown';
import { useState } from 'react';
import { Checkbox, iconProps, useToast } from '@/components/ui';
import { formatDueDate } from '@/lib/dates';
import { useToday, useVaultStickyView, useVaultTasks } from '@/lib/hooks/vault';
import { api } from '@/lib/ipc/api';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import type { VaultTaskView } from '@/lib/ipc/bindings/VaultTaskView';
import { IpcError } from '@/lib/ipc/client';
import { common } from '@/strings/common';
import { stickyStrings as t } from '@/strings/sticky';
import styles from './StickyBody.module.css';

/** A task view on the desktop: tick, and add to the space's Inbox. */
export function VaultTasksSticky({ target }: { target: StickyTarget }) {
  const view = useVaultStickyView(target);
  if (view.isError) return <p className={styles.missing}>{t.missing}</p>;
  if (view.data?.kind !== 'tasks') return null;
  return <TaskList view={view.data.view} space={view.data.space} />;
}

function TaskList({ view, space }: { view: VaultTaskView; space: string | null }) {
  const today = useToday();
  const tasks = useVaultTasks(view, space, today);
  const { toast } = useToast();
  const [text, setText] = useState('');
  const fail = (error: unknown) =>
    toast({
      tone: 'error',
      message: error instanceof IpcError ? error.message : common.toasts.genericError,
    });

  return (
    <div className={styles.task}>
      <ul className={styles.tabList}>
        {(tasks.data ?? []).map((task) => (
          <li key={`${task.path}:${task.line}`} className={styles.tabRow}>
            <Checkbox
              size="sm"
              label={inlineText(task.text)}
              checked={task.checked}
              onChange={(event) =>
                void api
                  .vaultEditTask(task, { kind: 'check', checked: event.target.checked, today })
                  .catch(fail)
              }
            />
            <span
              className={
                task.due && task.due < today && !task.checked
                  ? `${styles.rowMeta} ${styles.lineOverdue}`
                  : styles.rowMeta
              }
            >
              {task.due && formatDueDate(task.due, today)}
            </span>
          </li>
        ))}
      </ul>
      {space !== null && (
        <form
          className={styles.addRow}
          onSubmit={(event) => {
            event.preventDefault();
            const value = text.trim();
            if (!value) return;
            setText('');
            const due = view === 'today' ? today : null;
            void api
              .vaultCapture({ space, mode: 'task', text: value, description: '', due })
              .catch((error: unknown) => {
                setText(value);
                fail(error);
              });
          }}
        >
          <Plus {...iconProps} />
          <input
            className={styles.addInput}
            aria-label={common.actions.newTask}
            placeholder={t.addTask}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </form>
      )}
    </div>
  );
}
