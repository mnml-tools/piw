import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Checkbox, iconProps, useToast } from '@/components/ui';
import { formatDueDate, todayString } from '@/lib/dates';
import { useDocumentTasks } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { Tab } from '@/lib/ipc/bindings/Tab';
import { IpcError } from '@/lib/ipc/client';
import { common } from '@/strings/common';
import { stickyStrings as t } from '@/strings/sticky';
import styles from './StickyBody.module.css';

export function TasksTabSticky({ tabId }: { tabId: string }) {
  const tab = useQuery({
    queryKey: ['document', 'tabRecord', tabId],
    queryFn: () => api.getTab(tabId),
  });
  if (tab.isError) return <p className={styles.missing}>{t.missing}</p>;
  if (!tab.data) return null;
  return <TabTasks tab={tab.data} />;
}

/** The same tasks as the document's Tasks tab, with its filter and order. */
function TabTasks({ tab }: { tab: Tab }) {
  const tasks = useDocumentTasks(tab.documentId, tab.settings.show, tab.settings.sort);
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const today = todayString();
  const fail = (error: unknown) =>
    toast({
      tone: 'error',
      message: error instanceof IpcError ? error.message : common.toasts.genericError,
    });

  return (
    <div className={styles.task}>
      <ul className={styles.tabList}>
        {(tasks.data ?? []).map((task) => (
          <li key={task.id} className={styles.tabRow}>
            <Checkbox
              size="sm"
              label={task.title}
              checked={task.status === 'completed'}
              onChange={(event) =>
                void api.setTaskCompleted(task.id, event.target.checked).catch(fail)
              }
            />
            <span className={styles.rowMeta}>
              {task.subtaskCount > 0 && `${task.subtaskDone}/${task.subtaskCount}`}
              {task.dueDate && ` ${formatDueDate(task.dueDate, today)}`}
            </span>
          </li>
        ))}
      </ul>
      <form
        className={styles.addRow}
        onSubmit={(event) => {
          event.preventDefault();
          const value = title.trim();
          if (!value) return;
          setTitle('');
          void api
            .createTask({ title: value, documentId: tab.documentId })
            .catch((error: unknown) => {
              setTitle(value);
              fail(error);
            });
        }}
      >
        <Plus {...iconProps} />
        <input
          className={styles.addInput}
          aria-label={common.actions.newTask}
          placeholder={t.addTask}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </form>
    </div>
  );
}
