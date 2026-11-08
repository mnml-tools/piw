import { AlertTriangle, CalendarDays, ExternalLink, FileText, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SpaceMenu } from '@/components/app/SpaceMenu';
import {
  Button,
  cx,
  DateQuickPicker,
  DropdownMenu,
  IconButton,
  iconProps,
  TextInput,
  type MenuEntry,
} from '@/components/ui';
import { describeDueDate, formatDueDate } from '@/lib/dates';
import { useDocument, useNotes, useSpaces, useTags } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { Task } from '@/lib/ipc/bindings/Task';
import { useWorkspace } from '@/state/workspace';
import { tasksStrings as t } from '@/strings/tasks';
import { useTaskCommand } from './hooks';
import styles from './TaskDrawer.module.css';

interface TaskPropertiesProps {
  task: Task;
  today: string;
  /** Read-only "Created" value ("3 Nov · Edited 2 min ago"). */
  created?: string;
}

/**
 * Due · Space · Document · Tags · Created (docs/ui-design-system.md §10), as a two-column grid of
 * quiet labels and values. Empty properties show their action in subtle text, never "None".
 * Subtasks follow their parent, so they only have tags.
 */
export function TaskProperties({ task, today, created }: TaskPropertiesProps) {
  const top = task.parentTaskId === null;
  return (
    <dl className={styles.properties}>
      {top && (
        <>
          <Property label={t.drawer.due}>
            <DueProperty task={task} today={today} />
          </Property>
          <Property label={t.drawer.space}>
            <SpaceProperty task={task} />
          </Property>
          <Property label={t.drawer.document}>
            <DocumentProperty task={task} />
          </Property>
        </>
      )}
      <Property label={t.drawer.tags}>
        <TagsProperty task={task} />
      </Property>
      {created && (
        <Property label={t.drawer.created}>
          <span className={styles.readOnly}>{created}</span>
        </Property>
      )}
    </dl>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.property}>
      <dt className={styles.propertyLabel}>{label}</dt>
      <dd className={styles.propertyValue}>{children}</dd>
    </div>
  );
}

function DueProperty({ task, today }: { task: Task; today: string }) {
  const command = useTaskCommand();
  const due = task.dueDate;
  const overdue = due !== null && task.status === 'open' && due < today;
  const text = due ? formatDueDate(due, today) : t.drawer.addDate;
  return (
    <DateQuickPicker
      value={due}
      today={today}
      labels={t.dates}
      onChange={(next) => void command(() => api.setTaskDueDate(task.id, next))}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className={cx(styles.propertyButton, !due && styles.subtle, overdue && styles.overdue)}
          icon={
            overdue ? (
              <AlertTriangle aria-hidden size={14} />
            ) : (
              <CalendarDays aria-hidden size={14} />
            )
          }
          aria-label={t.drawer.dueLabel(due ? describeDueDate(due, today) : t.drawer.addDate)}
        >
          {text}
        </Button>
      }
    />
  );
}

function SpaceProperty({ task }: { task: Task }) {
  const spaces = useSpaces();
  const command = useTaskCommand();
  return (
    <SpaceMenu
      spaces={spaces.data ?? []}
      value={task.spaceId}
      label={t.drawer.space}
      onChange={(spaceId) => {
        if (spaceId !== task.spaceId) void command(() => api.moveTask(task.id, spaceId));
      }}
    />
  );
}

function DocumentProperty({ task }: { task: Task }) {
  const command = useTaskCommand();
  const openDocument = useWorkspace((state) => state.openDocument);
  const linked = useDocument(task.documentId);
  const documents = useNotes({ documentsOnly: true });

  if (task.documentId && task.documentTitle) {
    const documentId = task.documentId;
    const tasksTab = linked.data?.tabs.find((tab) => tab.kind === 'tasks');
    return (
      <span className={styles.documentValue}>
        <FileText aria-hidden size={14} className={styles.documentIcon} />
        <span className={styles.documentName} title={task.documentTitle}>
          {task.documentTitle}
          {task.documentArchived && ` ${t.row.archived}`}
        </span>
        <IconButton
          size="sm"
          aria-label={t.drawer.openDocument}
          icon={<ExternalLink {...iconProps} />}
          onClick={() => openDocument(documentId, tasksTab?.id)}
        />
      </span>
    );
  }

  const options: MenuEntry[] =
    documents.data && documents.data.length > 0
      ? documents.data.map((doc) => ({
          id: doc.id,
          label: doc.displayTitle,
          onSelect: () => void command(() => api.setTaskDocument(task.id, doc.id)),
        }))
      : [{ id: 'none', label: t.drawer.noDocuments, disabled: true, onSelect: () => {} }];
  return (
    <DropdownMenu
      trigger={
        <Button variant="ghost" size="sm" className={cx(styles.propertyButton, styles.subtle)}>
          {t.drawer.linkDocument}
        </Button>
      }
      items={options}
    />
  );
}

function normaliseTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim();
}

function TagsProperty({ task }: { task: Task }) {
  const command = useTaskCommand();
  const known = useTags();
  const listId = useId();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const save = (tags: string[]) => void command(() => api.setTaskTags(task.id, tags));
  const finish = (commit: boolean) => {
    const name = normaliseTag(draft);
    const exists = task.tags.some((tag) => tag.toLowerCase() === name.toLowerCase());
    if (commit && name && !exists) save([...task.tags, name]);
    setDraft('');
    setAdding(false);
  };

  return (
    <div className={styles.tags}>
      {task.tags.map((tag) => (
        <span key={tag} className={styles.tag}>
          #{tag}
          <button
            type="button"
            className={styles.tagRemove}
            aria-label={t.drawer.removeTag(tag)}
            title={t.drawer.removeTag(tag)}
            onClick={() => save(task.tags.filter((other) => other !== tag))}
          >
            <X aria-hidden size={12} />
          </button>
        </span>
      ))}
      {adding ? (
        <>
          <TextInput
            ref={inputRef}
            size="sm"
            className={styles.tagInput}
            aria-label={t.drawer.tagLabel}
            list={listId}
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                finish(true);
                requestAnimationFrame(() => addRef.current?.focus());
              } else if (event.key === 'Escape') {
                event.preventDefault(); // cancels the field, not the drawer (Esc order)
                finish(false);
                requestAnimationFrame(() => addRef.current?.focus());
              }
            }}
            onBlur={() => finish(true)}
          />
          <datalist id={listId}>
            {known.data
              ?.filter((tag) => !task.tags.includes(tag.name))
              .map((tag) => (
                <option key={tag.id} value={tag.name} />
              ))}
          </datalist>
        </>
      ) : task.tags.length === 0 ? (
        <Button
          ref={addRef}
          variant="ghost"
          size="sm"
          className={cx(styles.propertyButton, styles.subtle)}
          onClick={() => setAdding(true)}
        >
          {t.drawer.addTag}
        </Button>
      ) : (
        <IconButton
          ref={addRef}
          size="sm"
          aria-label={t.drawer.addTag}
          icon={<Plus {...iconProps} />}
          onClick={() => setAdding(true)}
        />
      )}
    </div>
  );
}
