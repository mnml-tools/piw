import { CalendarDays, ChevronDown, Plus, X } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type Ref } from 'react';
import { cx, DateQuickPicker, IconButton, TextInput, useToast } from '@/components/ui';
import { formatDueDate } from '@/lib/dates';
import { useSettings, useSpaces } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { CreateTask } from '@/lib/ipc/bindings/CreateTask';
import { initialSpace } from '@/lib/spaces';
import { tasksStrings as t } from '@/strings/tasks';
import { useToday } from './hooks';
import styles from './AddTaskRow.module.css';

/** What new tasks inherit from the visible context (docs/ui-design-system.md §10). */
export interface AddTaskContext {
  /** Active space filter. Without it, the "New items go to" setting decides. */
  spaceId?: string | null;
  /** Link new tasks to this document (they take its space). */
  documentId?: string | null;
  /** Inherited due date ('YYYY-MM-DD'): Today in Today, Tomorrow in Upcoming. */
  dueDate?: string | null;
}

export interface AddTaskRowProps {
  context?: AddTaskContext;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

interface Overrides {
  /** Context the overrides belong to; a new context starts clean. */
  key: string;
  /** `undefined` = inherited date, `null` = removed. */
  dueDate: string | null | undefined;
}

const fresh = (key: string): Overrides => ({
  key,
  dueDate: undefined,
});

/**
 * "Add task" row: a quiet "+ Add task" that is a borderless input. Enter creates the task and
 * keeps focus for the next one. The inherited date shows as a quiet removable part and is never
 * applied silently. The inherited space is not repeated here: the space filter has one place,
 * the top bar, and the field's description names it. Under "All", tasks go to the space chosen
 * in Settings ("New items go to"); their row then shows that space.
 */
export function AddTaskRow({ context = {}, inputRef, className }: AddTaskRowProps) {
  const spaces = useSpaces();
  const settings = useSettings();
  const today = useToday();
  const { toast } = useToast();
  const contextId = useId();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const contextKey = `${context.spaceId ?? ''}|${context.documentId ?? ''}|${context.dueDate ?? ''}`;
  const [overrides, setOverrides] = useState(() => fresh(contextKey));
  if (overrides.key !== contextKey) setOverrides(fresh(contextKey));
  const update = (patch: Partial<Omit<Overrides, 'key'>>) =>
    setOverrides((current) => ({ ...current, ...patch }));

  const documentId = context.documentId ?? null;
  const spaceId = !documentId ? (context.spaceId ?? null) : null;
  const space = spaces.data?.find((candidate) => candidate.id === spaceId);
  const dueDate = overrides.dueDate !== undefined ? overrides.dueDate : (context.dueDate ?? null);
  const dueLabel = dueDate ? formatDueDate(dueDate, today) : null;

  const contextParts = [dueLabel && t.add.due(dueLabel), space && t.add.inSpace(space.name)].filter(
    Boolean,
  );

  const submit = async () => {
    const title = value.trim();
    if (!title || busy) return;
    const submitted = value;
    const input: Partial<CreateTask> & { title: string } = { title };
    if (documentId) input.documentId = documentId;
    else {
      const target = spaceId ?? initialSpace(spaces.data ?? [], settings.data);
      if (target) input.spaceId = target;
    }
    if (dueDate) input.dueDate = dueDate;
    setBusy(true);
    try {
      const task = await api.createTask(input);
      setValue((current) => (current === submitted ? '' : current));
      setAnnouncement(t.add.added(task.title));
    } catch {
      toast({ message: t.add.failed, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className={cx(styles.row, className)}>
      <span className={styles.plus} aria-hidden="true">
        <Plus aria-hidden size={16} />
      </span>
      <TextInput
        ref={inputRef}
        variant="ghost"
        className={styles.input}
        aria-label={t.add.label}
        aria-describedby={contextParts.length > 0 ? contextId : undefined}
        placeholder={t.add.placeholder}
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={styles.chips}>
        <DateQuickPicker
          value={dueDate}
          onChange={(next) => update({ dueDate: next })}
          labels={t.dates}
          today={today}
          align="end"
          trigger={
            dueLabel ? (
              <button
                type="button"
                className={cx(styles.chip, styles.chipButton)}
                aria-label={t.add.changeDue(dueLabel)}
              >
                <CalendarDays aria-hidden size={12} />
                <span className={styles.chipLabel}>{dueLabel}</span>
                <ChevronDown aria-hidden size={12} />
              </button>
            ) : (
              <IconButton
                aria-label={t.add.setDue}
                size="sm"
                className={styles.reveal}
                icon={<CalendarDays aria-hidden size={14} />}
              />
            )
          }
        />
        {dueLabel && (
          <ChipRemove
            label={t.add.removeDue}
            className={styles.dueRemove}
            onClick={() => update({ dueDate: null })}
          />
        )}
      </div>
      {contextParts.length > 0 && (
        <span id={contextId} className="visually-hidden">
          {t.add.contextLabel(contextParts.join(', '))}
        </span>
      )}
      <span role="status" className="visually-hidden">
        {announcement}
      </span>
    </div>
  );
}

function ChipRemove({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cx(styles.remove, className)}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <X aria-hidden size={12} />
    </button>
  );
}
