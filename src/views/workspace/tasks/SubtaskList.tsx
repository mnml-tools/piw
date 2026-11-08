import { Plus } from 'lucide-react';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { Checkbox, cx, iconProps, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/ipc/api';
import type { Task } from '@/lib/ipc/bindings/Task';
import { tasksStrings as t } from '@/strings/tasks';
import { ConflictNotice } from './ConflictNotice';
import { findIn } from './dom';
import { useTrashTask } from './hooks';
import { useRecordText } from './useRecordText';
import styles from './TaskDrawer.module.css';

interface SubtaskListProps {
  parent: Task;
  subtasks: readonly Task[];
}

/** Optimistic changes, valid while the listing they were made on is current. */
interface LocalChanges {
  base: readonly Task[] | null;
  order: readonly string[] | null;
  completed: ReadonlyMap<string, boolean>;
}

const NO_CHANGES: LocalChanges = { base: null, order: null, completed: new Map() };

function sameText(a: string, b: string) {
  return a === b;
}

/**
 * One level of subtasks: title + checkbox only (docs/ui-design-system.md §10). Enter in "Add
 * subtask" adds and continues, Backspace on an empty subtask deletes it (undo toast), Alt+↑/↓
 * reorders.
 */
export function SubtaskList({ parent, subtasks }: SubtaskListProps) {
  const headingId = useId();
  const { toast } = useToast();
  const trash = useTrashTask();
  const [local, setLocal] = useState<LocalChanges>(NO_CHANGES);
  const current: LocalChanges = local.base === subtasks ? local : { ...NO_CHANGES, base: subtasks };

  const rank = new Map((current.order ?? []).map((id, index) => [id, index]));
  const rows = current.order
    ? [...subtasks].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    : subtasks;
  const isDone = (subtask: Task) =>
    current.completed.get(subtask.id) ?? subtask.status === 'completed';
  const done = rows.filter(isDone).length;

  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const inputFor = (id: string) =>
    findIn<HTMLInputElement>(listRef.current, 'subtask-id', id, 'input[type="text"]');
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    const input = id ? inputFor(id) : null;
    if (!input) return;
    pendingFocus.current = null;
    if (document.activeElement !== input) input.focus();
  });

  const focusAt = (index: number) => {
    const target = rows[index];
    const input = target ? inputFor(target.id) : null;
    (input ?? addRef.current)?.focus();
  };

  const toggle = (subtask: Task, completed: boolean) => {
    setLocal({ ...current, completed: new Map(current.completed).set(subtask.id, completed) });
    api.setTaskCompleted(subtask.id, completed).catch(() => {
      setLocal(NO_CHANGES);
      toast({ message: t.toasts.toggleFailed, tone: 'error' });
    });
  };

  const remove = (subtask: Task, index: number) => {
    focusAt(index > 0 ? index - 1 : index + 1);
    void trash(subtask, t.toasts.subtaskDeleted(subtask.title));
  };

  const move = (subtask: Task, delta: -1 | 1) => {
    const ids = rows.map((row) => row.id);
    const from = ids.indexOf(subtask.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, subtask.id);
    setLocal({ ...current, order: ids });
    pendingFocus.current = subtask.id;
    api.reorderTasks(ids).catch(() => {
      setLocal(NO_CHANGES);
      toast({ message: t.toasts.reorderFailed, tone: 'error' });
    });
  };

  return (
    <div ref={listRef} className={styles.subtasks}>
      <div className={styles.sectionHeader}>
        <h3 id={headingId} className={styles.sectionTitle}>
          {t.subtasks.heading}
          {rows.length > 0 && (
            <span className="visually-hidden">, {t.subtasks.progress(done, rows.length)}</span>
          )}
        </h3>
        {rows.length > 0 && (
          <span className={styles.progress} aria-hidden="true">
            {t.row.subtasksShort(done, rows.length)}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <div role="list" aria-labelledby={headingId} className={styles.subtaskList}>
          {rows.map((subtask, index) => (
            <SubtaskRow
              key={subtask.id}
              subtask={subtask}
              checked={isDone(subtask)}
              onToggle={(completed) => toggle(subtask, completed)}
              onDelete={() => remove(subtask, index)}
              onMove={(delta) => move(subtask, delta)}
              onNext={() => focusAt(index + 1)}
            />
          ))}
        </div>
      )}
      <AddSubtask parentId={parent.id} inputRef={addRef} />
    </div>
  );
}

interface SubtaskRowProps {
  subtask: Task;
  checked: boolean;
  onToggle: (completed: boolean) => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
  onNext: () => void;
}

function SubtaskRow({ subtask, checked, onToggle, onDelete, onMove, onNext }: SubtaskRowProps) {
  const id = subtask.id;
  const save = useCallback(
    async (title: string, rev: number) => (await api.updateTaskText(id, rev, { title })).rev,
    [id],
  );
  const text = useRecordText({ value: subtask.title, rev: subtask.rev }, save, sameText);
  const { saver } = text;
  const lastSaved = () => saver.unsaved ?? saver.persisted.value;

  const change = (next: string) => {
    const clean = next.replace(/[\r\n]+/g, ' ');
    text.setValue(clean);
    if (clean.trim()) saver.update(clean); // an empty title is never saved
  };

  const reorderKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
    event.preventDefault();
    onMove(event.key === 'ArrowUp' ? -1 : 1);
    return true;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (reorderKey(event)) return;
    if (event.key === 'Backspace' && text.value === '' && !event.repeat) {
      event.preventDefault();
      saver.reset(saver.persisted.value, saver.persisted.rev); // drop the half-erased title
      onDelete();
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void saver.flush();
      onNext();
    }
  };

  const reload = async () => {
    const fresh = await api.getTask(id);
    text.adopt(fresh.task.title, fresh.task.rev);
  };
  const keepMine = async () => {
    const fresh = await api.getTask(id);
    await saver.keepMine(fresh.task.rev);
  };

  return (
    <div role="listitem" className={styles.subtask} data-subtask-id={id}>
      <div className={styles.subtaskLine}>
        <Checkbox
          size="sm"
          aria-label={text.value.trim() || subtask.title || t.subtasks.untitled}
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
          onKeyDown={reorderKey}
        />
        <TextInput
          variant="ghost"
          size="sm"
          aria-label={t.subtasks.titleLabel}
          className={cx(styles.subtaskTitle, checked && styles.subtaskDone)}
          value={text.value}
          onChange={(event) => change(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!text.value.trim()) text.setValue(lastSaved());
            void saver.flush();
          }}
        />
      </div>
      {text.status === 'conflict' && (
        <ConflictNotice compact onReload={() => void reload()} onKeepMine={() => void keepMine()} />
      )}
    </div>
  );
}

function AddSubtask({ parentId, inputRef }: { parentId: string; inputRef: Ref<HTMLInputElement> }) {
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const title = value.trim();
    if (!title || busy) return;
    const submitted = value;
    setBusy(true);
    try {
      await api.createTask({ title, parentTaskId: parentId });
      setValue((current) => (current === submitted ? '' : current));
    } catch {
      toast({ message: t.add.failed, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.addSubtask}>
      <span className={styles.addIcon} aria-hidden="true">
        <Plus {...iconProps} />
      </span>
      <TextInput
        ref={inputRef}
        variant="ghost"
        size="sm"
        className={styles.subtaskTitle}
        aria-label={t.subtasks.add}
        placeholder={t.subtasks.add}
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
        }}
      />
    </div>
  );
}
