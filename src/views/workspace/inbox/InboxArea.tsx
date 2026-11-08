import { Check, Ellipsis, FileText, Inbox, StickyNote } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PageColumn, PageList, PageScroll, PageView, ViewToolbar } from '@/components/app/Page';
import {
  DropdownMenu,
  EmptyState,
  IconButton,
  ListRow,
  iconProps,
  useToast,
} from '@/components/ui';
import { formatRelative } from '@/lib/dates';
import { useInbox } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { InboxItem } from '@/lib/ipc/bindings/InboxItem';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { inboxStrings as t } from '@/strings/workspace';
import area from '../Area.module.css';
import { NoteEditor } from '../notes/NoteEditor';
import { AddTaskRow, TaskDrawer, TaskRow, useToday } from '../tasks';
import styles from './InboxArea.module.css';

/** Last Mod+T request handled here, so remounting the Inbox doesn't steal focus again. */
let handledAddRequest = 0;

const idOf = (item: InboxItem) => (item.type === 'note' ? item.note.id : item.task.id);

/**
 * Inbox: recent captures that are not organised yet — a view, not a container
 * (docs/ui-design-system.md §10).
 */
export default function InboxArea() {
  const ws = useWorkspace();
  const inbox = useInbox(ws.spaceId);
  const today = useToday();
  const { toast } = useToast();
  const items = inbox.data ?? [];
  const isEmpty = inbox.isSuccess && items.length === 0;
  const addTaskInput = useRef<HTMLInputElement>(null);
  const editing = ws.focus.type === 'note' || ws.focus.type === 'newNote';

  // Mod+T (shell) asks for a new task: in Inbox it is captured right here.
  const addTaskRequest = ws.addTaskRequest;
  useEffect(() => {
    if (addTaskRequest <= handledAddRequest) return;
    handledAddRequest = addTaskRequest;
    addTaskInput.current?.focus();
  }, [addTaskRequest]);

  const fail = (error: unknown) =>
    toast({
      tone: 'error',
      message: error instanceof IpcError ? error.message : common.toasts.genericError,
    });

  const organise = (item: InboxItem) =>
    (item.type === 'note'
      ? api.setNoteTriaged(item.note.id, true)
      : api.setTaskTriaged(item.task.id, true)
    ).catch(fail);

  const organiseAll = async () => {
    const snapshot = [...items];
    await api.markInboxTriaged(ws.spaceId).catch(fail);
    toast({
      message: t.organised(snapshot.length),
      action: {
        label: common.actions.undo,
        onAction: () =>
          void Promise.all(
            snapshot.map((item) =>
              item.type === 'note'
                ? api.setNoteTriaged(item.note.id, false)
                : api.setTaskTriaged(item.task.id, false),
            ),
          ).catch(fail),
      },
    });
  };

  if (ws.focus.type === 'note' || ws.focus.type === 'newNote') {
    const noteId = ws.focus.type === 'note' ? ws.focus.id : null;
    return (
      <NoteEditor key={noteId ?? 'new'} noteId={noteId} onBack={ws.back} backLabel={t.title} />
    );
  }

  const onKey = (event: React.KeyboardEvent, item: InboxItem) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      void organise(item);
    } else if (event.key === 'Enter' && item.type === 'note') {
      event.preventDefault();
      ws.openNote(item.note.id);
    }
  };

  const organiseButton = (item: InboxItem) => (
    <IconButton
      size="sm"
      aria-label={t.markOrganised}
      shortcut="O"
      icon={<Check {...iconProps} />}
      className={area.raised}
      onClick={() => void organise(item)}
    />
  );

  return (
    <div className={styles.inbox}>
      <PageView aria-labelledby="inbox-title">
        <ViewToolbar
          title={t.title}
          titleId="inbox-title"
          count={inbox.isSuccess && !editing ? t.count(items.length) : null}
          actions={
            items.length > 0 && (
              <DropdownMenu
                align="end"
                trigger={
                  <IconButton aria-label={common.actions.more} icon={<Ellipsis {...iconProps} />} />
                }
                items={[{ id: 'all', label: t.markAll, onSelect: () => void organiseAll() }]}
              />
            )
          }
        />
        <PageScroll>
          {/* Empty, the add row stays on the list column and the EmptyState centres in the
              canvas below it. */}
          <PageColumn className={isEmpty ? styles.addOnly : undefined}>
            <div className={styles.add}>
              <AddTaskRow inputRef={addTaskInput} context={{ spaceId: ws.spaceId }} />
            </div>
            {!isEmpty && (
              <PageList aria-label={t.listLabel}>
                {items.map((item) => (
                  <li key={idOf(item)} className={styles.item}>
                    {/* One grid for both kinds: the row, then the capture time and "Mark
                        organised" in fixed columns on the right, so times line up. */}
                    <div className={styles.line}>
                      {item.type === 'task' ? (
                        <>
                          <TaskRow
                            task={item.task}
                            today={today}
                            selected={ws.drawerTaskId === item.task.id}
                            onToggle={(task, completed) =>
                              void api.setTaskCompleted(task.id, completed).catch(fail)
                            }
                            onOpen={(task) => ws.openTask(task.id)}
                            onCheckboxKeyDown={(event) => onKey(event, item)}
                            className={styles.taskRow}
                          />
                          <time className={styles.taskWhen} dateTime={item.task.createdAt}>
                            {formatRelative(item.task.createdAt)}
                          </time>
                        </>
                      ) : (
                        <ListRow
                          role="group"
                          aria-label={`${t.note}: ${item.note.displayTitle}`}
                          className={styles.row}
                          leading={
                            <span className={area.leadingIcon}>
                              {item.note.kind === 'document' ? (
                                <FileText {...iconProps} />
                              ) : (
                                <StickyNote {...iconProps} />
                              )}
                            </span>
                          }
                          title={
                            <button
                              type="button"
                              className={area.open}
                              onClick={() => ws.openNote(item.note.id)}
                              onKeyDown={(event) => onKey(event, item)}
                            >
                              <span className={area.rowTitle}>{item.note.displayTitle || '—'}</span>
                            </button>
                          }
                          snippet={item.note.excerpt || undefined}
                          trailing={
                            <time className={styles.when} dateTime={item.note.createdAt}>
                              {formatRelative(item.note.createdAt)}
                            </time>
                          }
                        />
                      )}
                      <span className={styles.organise}>{organiseButton(item)}</span>
                    </div>
                  </li>
                ))}
              </PageList>
            )}
          </PageColumn>
          {isEmpty && (
            <PageColumn width="full">
              <EmptyState
                icon={<Inbox {...iconProps} />}
                title={t.empty}
                description={t.emptyDescription}
              />
            </PageColumn>
          )}
        </PageScroll>
      </PageView>
      {ws.drawerTaskId && (
        <TaskDrawer taskId={ws.drawerTaskId} mode="docked" onClose={() => ws.openTask(null)} />
      )}
    </div>
  );
}
