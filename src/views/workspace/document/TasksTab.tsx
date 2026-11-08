import { Pin } from 'lucide-react';
import { useId } from 'react';
import { IconButton, Segmented, useToast } from '@/components/ui';
import { useDocumentTasks } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { Tab } from '@/lib/ipc/bindings/Tab';
import type { TasksTabSettings } from '@/lib/ipc/bindings/TasksTabSettings';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { documentStrings as t } from '@/strings/document';
import { AddTaskRow, TaskList, useToday } from '../tasks';
import styles from './DocumentView.module.css';

/**
 * A live view of the real tasks linked to this document (docs/ui-design-system.md §10, CA-04): the
 * same records, ids and rows as in Tasks, filtered and sorted by this tab's own settings.
 */
export function TasksTab({ tab, documentId }: { tab: Tab; documentId: string }) {
  const { settings } = tab;
  const tasks = useDocumentTasks(documentId, settings.show, settings.sort);
  const openTask = useWorkspace((s) => s.openTask);
  const drawerTaskId = useWorkspace((s) => s.drawerTaskId);
  const today = useToday();
  const { toast } = useToast();
  const showId = useId();
  const sortId = useId();

  const update = (patch: Partial<TasksTabSettings>) =>
    void api.updateTabSettings(tab.id, { ...settings, ...patch }).catch((error: unknown) =>
      toast({
        tone: 'error',
        message: error instanceof IpcError ? error.message : common.toasts.genericError,
      }),
    );

  return (
    <div className={styles.tasksTab}>
      <div className={styles.tasksToolbar}>
        <div className={styles.filter}>
          <span id={showId} className={styles.filterLabel}>
            {t.show}
          </span>
          <Segmented
            size="sm"
            variant="text"
            aria-labelledby={showId}
            value={settings.show}
            onValueChange={(show) => update({ show })}
            options={(['open', 'all', 'completed'] as const).map((v) => ({
              value: v,
              label: t.showOptions[v],
            }))}
          />
        </div>
        <div className={styles.filter}>
          <span id={sortId} className={styles.filterLabel}>
            {t.sort}
          </span>
          <Segmented
            size="sm"
            variant="text"
            aria-labelledby={sortId}
            value={settings.sort}
            onValueChange={(sort) => update({ sort })}
            options={(['manual', 'due_date'] as const).map((v) => ({
              value: v,
              label: t.sortOptions[v],
            }))}
          />
        </div>
        <span className={styles.spacer} />
        <IconButton
          aria-label={t.pinView}
          icon={<Pin aria-hidden size={16} />}
          onClick={() => void api.openSticky({ kind: 'tasks_tab', id: tab.id })}
        />
      </div>
      {settings.show !== 'completed' && (
        <AddTaskRow className={styles.hang} context={{ documentId }} />
      )}
      <TaskList
        key={`${settings.show}:${settings.sort}`}
        className={styles.hang}
        tasks={tasks.data ?? []}
        label={tab.title}
        today={today}
        reorderable={settings.sort === 'manual'}
        showDocument={false}
        openId={drawerTaskId}
        onOpen={(task) => openTask(task.id)}
      />
    </div>
  );
}
