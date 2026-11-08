import { MoreHorizontal, Pin } from 'lucide-react';
import { useState, type RefObject } from 'react';
import {
  Button,
  Drawer,
  DropdownMenu,
  EmptyState,
  IconButton,
  iconProps,
  type DrawerMode,
  type MenuEntry,
} from '@/components/ui';
import { useTask } from '@/lib/hooks/data';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { api } from '@/lib/ipc/api';
import type { Task } from '@/lib/ipc/bindings/Task';
import { IpcError } from '@/lib/ipc/client';
import { common } from '@/strings/common';
import { tasksStrings as t } from '@/strings/tasks';
import { useDelayedFlag, useTaskCommand, useTrashTask } from './hooks';
import { TaskDetails } from './TaskDetails';
import styles from './TaskDrawer.module.css';

export interface TaskDrawerProps {
  /** Task to show; `null` closes the drawer. Its open state is never persisted. */
  taskId: string | null;
  onClose: () => void;
  /**
   * Chosen by the parent from its content width (docs/ui-design-system.md §9): `docked` ≥ 820px,
   * `overlay` below (over the list's right edge), `full` below 560px.
   */
  mode?: DrawerMode;
  /** Where focus returns on close (default: what had focus when it opened, e.g. the row). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Task details (docs/ui-design-system.md §10): a non-modal region beside or over the list. It reads
 * the task with `useTask`, so edits made in any other window (sticky, document tab) show up live. ×
 * or Esc closes it and focus returns to the row.
 */
export function TaskDrawer({ taskId, onClose, mode = 'docked', returnFocusRef }: TaskDrawerProps) {
  const detail = useTask(taskId);
  /** Header slot the details render their save state into (next to the actions). */
  const [statusSlot, setStatusSlot] = useState<HTMLSpanElement | null>(null);
  const showLoading = useDelayedFlag(taskId !== null && detail.isPending);
  const command = useTaskCommand();
  const trash = useTrashTask();
  const task = detail.data?.task.id === taskId ? detail.data?.task : undefined;
  const available = task !== undefined && task.deletedAt === null;

  const pin = (target: Task) => void command(() => api.openSticky({ kind: 'task', id: target.id }));
  const hide = (target: Task) =>
    void command(() => api.closeSticky({ kind: 'task', id: target.id }));

  useHotkeys({ 'Mod+Shift+P': () => task && (task.pinned ? hide(task) : pin(task)) }, available);

  const menu = (target: Task): MenuEntry[] => [
    ...(target.pinned
      ? [
          { id: 'show', label: t.drawer.show, onSelect: () => pin(target) },
          { id: 'hide', label: t.drawer.hide, onSelect: () => hide(target) },
        ]
      : [
          {
            id: 'pin',
            label: t.drawer.pin,
            shortcut: 'Mod+Shift+P',
            onSelect: () => pin(target),
          },
        ]),
    ...(target.documentId
      ? [
          {
            id: 'unlink',
            label: t.drawer.unlink,
            onSelect: () => void command(() => api.setTaskDocument(target.id, null)),
          },
        ]
      : []),
    { id: 'sep', type: 'separator' },
    {
      id: 'trash',
      label: common.actions.moveToTrash,
      danger: true,
      onSelect: () => {
        void trash(target).then((done) => {
          if (done) onClose();
        });
      },
    },
  ];

  const actions = available && (
    <>
      <span ref={setStatusSlot} className={styles.statusSlot} />
      <IconButton
        aria-label={task.pinned ? t.drawer.show : t.drawer.pin}
        shortcut="Mod+Shift+P"
        icon={<Pin {...iconProps} />}
        onClick={() => pin(task)}
      />
      <DropdownMenu
        align="end"
        trigger={<IconButton aria-label={t.drawer.more} icon={<MoreHorizontal {...iconProps} />} />}
        items={menu(task)}
      />
    </>
  );

  const body = (() => {
    if (taskId === null) return null;
    if (detail.isError || (task && !available)) {
      const gone =
        (task && !available) ||
        (detail.error instanceof IpcError && detail.error.code === 'not_found');
      return (
        <EmptyState
          headingLevel={3}
          title={gone ? t.drawer.unavailable : t.drawer.loadFailed}
          description={gone ? t.drawer.unavailableHelper : undefined}
          action={
            gone ? (
              <Button onClick={onClose}>{common.actions.close}</Button>
            ) : (
              <Button onClick={() => void detail.refetch()}>{t.error.retry}</Button>
            )
          }
        />
      );
    }
    if (!detail.data || !task) {
      return showLoading ? <p className={styles.loading}>{t.loading}</p> : null;
    }
    return <TaskDetails key={task.id} detail={detail.data} statusSlot={statusSlot} />;
  })();

  return (
    <Drawer
      open={taskId !== null}
      onClose={onClose}
      title={t.drawer.title}
      regionLabel={t.drawer.region}
      closeLabel={t.drawer.close}
      mode={mode}
      actions={actions}
      returnFocusRef={returnFocusRef}
      className={styles.drawer}
    >
      {body}
    </Drawer>
  );
}
