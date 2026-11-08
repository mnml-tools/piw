import { AlertTriangle, CheckSquare, ChevronRight, FileText, MoreHorizontal } from 'lucide-react';
import {
  useId,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { spaceColor } from '@/components/app/space-color';
import {
  Checkbox,
  ContextMenu,
  cx,
  DropdownMenu,
  IconButton,
  ListRow,
  SpaceDot,
  type MenuEntry,
} from '@/components/ui';
import { describeDueDate, formatDueDate } from '@/lib/dates';
import type { Space } from '@/lib/ipc/bindings/Space';
import type { Task } from '@/lib/ipc/bindings/Task';
import { tasksStrings as t } from '@/strings/tasks';
import { describeTask } from './describeTask';
import styles from './TaskRow.module.css';

/** 14px icons in the 24px row actions (IconButton sm). */
const ACTION_ICON = { size: 14, 'aria-hidden': true } as const;
const NO_ENTRIES: ReadonlyArray<MenuEntry> = [];
/** 12px metadata icons; the stroke comes from base.css. */
const META_ICON = { size: 12, 'aria-hidden': true } as const;

export interface TaskRowProps {
  task: Task;
  /** Local date the due date is relative to ('YYYY-MM-DD'). */
  today: string;
  onToggle: (task: Task, completed: boolean) => void;
  /** Opens the task drawer (click outside the checkbox, or Enter from the list). */
  onOpen: (task: Task) => void;
  /** Shown when given; clicking the document name opens the document. */
  onOpenDocument?: (documentId: string) => void;
  /** The drawer shows this task (`aria-current` + selected background). */
  selected?: boolean;
  /** Space dot + name (only under the "All spaces" filter). Needs `space`. */
  showSpace?: boolean;
  space?: Space;
  /** Document name (hidden inside that document's own Tasks tab). */
  showDocument?: boolean;
  /** Leave the due date out when it is this day (the section heading already says it). */
  impliedDate?: string;
  /** Roving tab stop of the checkbox: 0 for the list's active row, -1 for the others. */
  tabIndex?: 0 | -1;
  onCheckboxKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCheckboxFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  /**
   * Row menu entries, built when a menu opens: right-click, Shift+F10 / Menu key, and the `⋯`
   * button revealed on hover or focus (with "Open details" next to it).
   */
  menu?: () => ReadonlyArray<MenuEntry>;
  className?: string;
}

/**
 * One task: checkbox · title · metadata right after the title (due date → document → subtasks →
 * space), wrapping under the title when the line is too short. The native checkbox is the row's
 * only tab stop and is named by the title; the metadata is read as its description. The title
 * is a pointer target stretched over the row, so a click anywhere outside the checkbox, the
 * document link and the row actions opens the drawer.
 */
export function TaskRow({
  task,
  today,
  onToggle,
  onOpen,
  onOpenDocument,
  selected = false,
  showSpace = false,
  space,
  showDocument = true,
  impliedDate,
  tabIndex = 0,
  onCheckboxKeyDown,
  onCheckboxFocus,
  menu,
  className,
}: TaskRowProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [contextOpen, setContextOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** Set by a click or Space that completes the task: plays the short check "pop" once. */
  const [justCompleted, setJustCompleted] = useState(false);
  const completed = task.status === 'completed';
  const overdue = !completed && task.dueDate !== null && task.dueDate < today;
  const description = describeTask(task, today, { space, showSpace, showDocument });
  const documentLabel = task.documentTitle
    ? `${task.documentTitle}${task.documentArchived ? ` ${t.row.archived}` : ''}`
    : null;

  const meta: ReactNode[] = [];
  if (task.dueDate && (overdue || task.dueDate !== impliedDate)) {
    meta.push(
      <span
        key="due"
        className={cx(styles.item, overdue && styles.overdue)}
        title={describeDueDate(task.dueDate, today)}
        aria-hidden="true"
      >
        {overdue && <AlertTriangle className={styles.icon} {...META_ICON} />}
        <span>{formatDueDate(task.dueDate, today)}</span>
      </span>,
    );
  }
  if (showDocument && documentLabel && task.documentId) {
    meta.push(
      <DocumentLink
        key="document"
        documentId={task.documentId}
        label={documentLabel}
        title={task.documentTitle ?? ''}
        onOpenDocument={onOpenDocument}
      />,
    );
  }
  if (task.subtaskCount > 0) {
    meta.push(
      <span key="subtasks" className={styles.item} aria-hidden="true">
        <CheckSquare className={styles.icon} {...META_ICON} />
        <span>{t.row.subtasksShort(task.subtaskDone, task.subtaskCount)}</span>
      </span>,
    );
  }
  if (showSpace && space) {
    meta.push(
      <span
        key="space"
        className={cx(styles.item, styles.space)}
        title={t.row.space(space.name)}
        aria-hidden="true"
      >
        <SpaceDot decorative color={spaceColor(space)} className={styles.dot} />
        <span className={styles.ellipsis}>{space.name}</span>
      </span>,
    );
  }

  const actions = menu && (
    <span className={styles.actions}>
      <IconButton
        size="sm"
        tabIndex={-1}
        aria-label={t.row.open}
        icon={<ChevronRight {...ACTION_ICON} />}
        onClick={() => onOpen(task)}
      />
      <DropdownMenu
        align="end"
        onOpenChange={setMoreOpen}
        items={moreOpen ? menu() : NO_ENTRIES}
        trigger={
          <IconButton
            size="sm"
            tabIndex={-1}
            aria-label={t.row.more}
            icon={<MoreHorizontal {...ACTION_ICON} />}
          />
        }
      />
    </span>
  );

  const row: ReactElement = (
    <ListRow
      role="listitem"
      current={selected ? 'true' : undefined}
      completed={completed}
      data-task-id={task.id}
      className={cx(styles.row, className)}
      leading={
        <span
          className={styles.check}
          data-pop={justCompleted && completed ? '' : undefined}
          onAnimationEnd={() => setJustCompleted(false)}
        >
          <Checkbox
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            checked={completed}
            tabIndex={tabIndex}
            onChange={(event) => {
              setJustCompleted(event.target.checked);
              onToggle(task, event.target.checked);
            }}
            onKeyDown={onCheckboxKeyDown}
            onFocus={onCheckboxFocus}
          />
        </span>
      }
    >
      <div className={styles.content}>
        <div className={styles.body}>
          <button
            type="button"
            tabIndex={-1}
            className={styles.open}
            title={task.title}
            onClick={() => onOpen(task)}
          >
            <span id={titleId} className={styles.title}>
              {task.title}
            </span>
          </button>
          {meta.length > 0 && <span className={styles.meta}>{meta}</span>}
        </div>
        {actions}
      </div>
      {description && (
        <span id={descriptionId} className="visually-hidden">
          {description}
        </span>
      )}
    </ListRow>
  );

  if (!menu) return row;
  return (
    <ContextMenu items={contextOpen ? menu() : NO_ENTRIES} onOpenChange={setContextOpen}>
      {row}
    </ContextMenu>
  );
}

function DocumentLink({
  documentId,
  label,
  title,
  onOpenDocument,
}: {
  documentId: string;
  label: string;
  title: string;
  onOpenDocument?: (documentId: string) => void;
}) {
  const content = (
    <>
      <FileText className={styles.icon} {...META_ICON} />
      <span className={styles.ellipsis}>{label}</span>
    </>
  );
  if (!onOpenDocument) {
    return (
      <span className={cx(styles.item, styles.document)} title={label} aria-hidden="true">
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      tabIndex={-1}
      className={cx(styles.item, styles.document, styles.documentLink)}
      title={label}
      aria-label={t.row.openDocument(title)}
      onClick={() => onOpenDocument(documentId)}
    >
      {content}
    </button>
  );
}
