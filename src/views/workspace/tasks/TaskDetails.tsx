import { CornerLeftUp } from 'lucide-react';
import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Checkbox, SaveIndicator, TextArea, type SaveState } from '@/components/ui';
import type { SaveStatus } from '@/lib/autosave';
import { formatRelative, parseDate } from '@/lib/dates';
import { api } from '@/lib/ipc/api';
import type { TaskDetail } from '@/lib/ipc/bindings/TaskDetail';
import { useWorkspace } from '@/state/workspace';
import { tasksStrings as t } from '@/strings/tasks';
import { ConflictNotice } from './ConflictNotice';
import { useTaskCommand, useToday } from './hooks';
import { localDate } from './sections';
import { SubtaskList } from './SubtaskList';
import { TaskProperties } from './TaskProperties';
import { useRecordText } from './useRecordText';
import styles from './TaskDrawer.module.css';

interface TaskText {
  title: string;
  description: string;
}

function sameText(a: TaskText, b: TaskText): boolean {
  return a.title === b.title && a.description === b.description;
}

function toSaveState(status: SaveStatus): SaveState {
  switch (status) {
    case 'saving':
      return 'saving';
    case 'saved':
      return 'saved';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

function shortDate(iso: string): string {
  return parseDate(localDate(iso)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

interface TaskDetailsProps {
  detail: TaskDetail;
  /** Drawer header node to render the save state into. */
  statusSlot: HTMLElement | null;
}

/**
 * The drawer's contents for one task. Render with `key={task id}`: the autosaver belongs to one
 * record, and unmounting flushes pending edits.
 */
export function TaskDetails({ detail, statusSlot }: TaskDetailsProps) {
  const { task, subtasks, parentTitle } = detail;
  const today = useToday();
  const command = useTaskCommand();
  const openTask = useWorkspace((state) => state.openTask);
  const hintId = useId();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const id = task.id;
  const save = useCallback(
    async (value: TaskText, rev: number) => (await api.updateTaskText(id, rev, value)).rev,
    [id],
  );
  const text = useRecordText<TaskText>(
    { value: { title: task.title, description: task.description }, rev: task.rev },
    save,
    sameText,
  );
  const { saver, value } = text;
  const titleMissing = value.title.trim() === '';
  /** A title can't be emptied: while it is, the last saved one is what gets saved. */
  const savedTitle = () => saver.unsaved?.title ?? saver.persisted.value.title;

  const changeTitle = (next: string) => {
    const title = next.replace(/[\r\n]+/g, ' ');
    text.setValue({ ...value, title });
    if (title.trim()) saver.update({ title, description: value.description });
  };
  const changeDescription = (description: string) => {
    text.setValue({ ...value, description });
    saver.update({ title: titleMissing ? savedTitle() : value.title, description });
  };
  const blurTitle = () => {
    if (titleMissing) text.setValue({ ...value, title: savedTitle() });
    void saver.flush();
  };
  const titleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault(); // Enter ends editing and moves on to the description
      descriptionRef.current?.focus();
    }
  };

  const reload = async () => {
    const fresh = await command(() => api.getTask(id));
    if (fresh)
      text.adopt({ title: fresh.task.title, description: fresh.task.description }, fresh.task.rev);
  };
  const keepMine = async () => {
    const fresh = await command(() => api.getTask(id));
    if (fresh) await saver.keepMine(fresh.task.rev);
  };

  // Optimistic completion, valid until the next version of the task arrives.
  const [toggled, setToggled] = useState<{ base: typeof task; completed: boolean } | null>(null);
  const completed =
    toggled && toggled.base === task ? toggled.completed : task.status === 'completed';
  const toggle = (next: boolean) => {
    setToggled({ base: task, completed: next });
    void command(() => api.setTaskCompleted(id, next), t.toasts.toggleFailed).then((result) => {
      if (!result) setToggled(null);
    });
  };

  const status = (
    <SaveIndicator
      state={toSaveState(text.status)}
      labels={t.drawer.save}
      onRetry={() => void saver.retry()}
    />
  );
  const created = t.drawer.createdValue(shortDate(task.createdAt), formatRelative(task.updatedAt));

  return (
    <div className={styles.details}>
      {task.parentTaskId && parentTitle && (
        <button
          type="button"
          className={styles.parentLink}
          onClick={() => openTask(task.parentTaskId)}
        >
          <CornerLeftUp aria-hidden size={14} />
          {t.drawer.subtaskOf(parentTitle)}
        </button>
      )}
      {text.status === 'conflict' && (
        <ConflictNotice onReload={() => void reload()} onKeepMine={() => void keepMine()} />
      )}
      <div className={styles.titleRow}>
        <Checkbox
          aria-label={value.title.trim() || task.title}
          checked={completed}
          onChange={(event) => toggle(event.target.checked)}
        />
        <TextArea
          variant="ghost"
          autoGrow
          rows={1}
          className={styles.titleField}
          aria-label={t.drawer.titleLabel}
          aria-describedby={titleMissing ? hintId : undefined}
          invalid={titleMissing}
          value={value.title}
          onChange={(event) => changeTitle(event.target.value)}
          onKeyDown={titleKeyDown}
          onBlur={blurTitle}
        />
      </div>
      {titleMissing && (
        <p id={hintId} className={styles.hint}>
          {t.drawer.titleRequired}
        </p>
      )}
      <TaskProperties task={task} today={today} created={created} />
      <TextArea
        ref={descriptionRef}
        autoGrow
        className={styles.descriptionField}
        aria-label={t.drawer.descriptionLabel}
        placeholder={t.drawer.descriptionPlaceholder}
        value={value.description}
        onChange={(event) => changeDescription(event.target.value)}
        onBlur={() => void saver.flush()}
      />
      {task.parentTaskId === null && <SubtaskList parent={task} subtasks={subtasks} />}
      {statusSlot && createPortal(status, statusSlot)}
    </div>
  );
}
