import { AlertTriangle } from 'lucide-react';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { PageSectionHeader } from '@/components/app/Page';
import {
  Button,
  cx,
  detectPlatform,
  resolveQuickDate,
  useToast,
  type MenuEntry,
  type QuickDateOption,
} from '@/components/ui';
import { api } from '@/lib/ipc/api';
import type { Space } from '@/lib/ipc/bindings/Space';
import type { Task } from '@/lib/ipc/bindings/Task';
import { common } from '@/strings/common';
import { tasksStrings as t } from '@/strings/tasks';
import { rowCheckbox } from './dom';
import { useTaskCommand, useTrashTask } from './hooks';
import { singleSection, type TaskGrouper, type TaskSection } from './sections';
import { TaskRow } from './TaskRow';
import { useKeepInPlace } from './useKeepInPlace';
import styles from './TaskList.module.css';

export interface TaskListProps {
  /** Rows in display order, as listed by the server. */
  tasks: readonly Task[];
  /** Accessible name of the list ("All tasks", "To-dos"). */
  label: string;
  /** Local date due dates are relative to ('YYYY-MM-DD'). */
  today: string;
  /** Splits rows into titled sections. Default: one untitled section. */
  group?: TaskGrouper;
  /** Manual order (Alt+↑/↓) for the default single section, e.g. a document Tasks tab. */
  reorderable?: boolean;
  /** Space dot + name on each row (only under the "All spaces" filter). */
  showSpace?: boolean;
  /** Document name on each row (hide it inside the document itself). */
  showDocument?: boolean;
  spaces?: readonly Space[];
  /** Task shown in the drawer: marked current, and ↑/↓ make the drawer follow. */
  openId?: string | null;
  /** Row that holds the tab stop at first (e.g. after navigating from search). */
  initialActiveId?: string | null;
  onOpen: (task: Task) => void;
  onOpenDocument?: (documentId: string) => void;
  /** After a row moved to Trash (e.g. close its drawer). */
  onTrashed?: (task: Task) => void;
  /** Esc while a row is focused (e.g. close the drawer). */
  onEscape?: () => void;
  /** A row's checkbox received focus: the element to return focus to later. */
  onActiveChange?: (task: Task, checkbox: HTMLInputElement) => void;
  /** Gets focus when the last row goes to Trash (e.g. the Add task field). */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  /** Shown instead of the rows when there are none (kept rows count as rows). */
  empty?: ReactNode;
  /** After the sections, e.g. "Show 12 completed". */
  footer?: ReactNode;
  className?: string;
}

const LAST = Number.MAX_SAFE_INTEGER;

function applyOrder(rows: readonly Task[], ids: readonly string[]): Task[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => (rank.get(a.id) ?? LAST) - (rank.get(b.id) ?? LAST));
}

/**
 * Task rows with sections, keyboard navigation and rows kept in place after completing.
 *
 * Semantics (docs/ui-design-system.md §15): each section is a `list` of `listitem` rows; a list of
 * tasks is not a `listbox`, because every row contains a real control (the native checkbox, named
 * by the title) that can't live inside an `option`, and a `grid` would add cell navigation for a
 * single control per row. All sections share one roving tab stop, so Tab leaves the whole list in
 * one step: ↑/↓ or k/j move, Home/End jump, Enter opens, Space toggles (native), Delete trashes
 * with undo, Alt+↑/↓ reorders in manual-order sections, Shift+F10 opens the row menu.
 *
 * Held rows (completed here) are forgotten when the list unmounts: give it a `key` per view.
 */
export function TaskList({
  tasks,
  label,
  today,
  group,
  reorderable = false,
  showSpace = false,
  showDocument = true,
  spaces = [],
  openId = null,
  initialActiveId = null,
  onOpen,
  onOpenDocument,
  onTrashed,
  onEscape,
  onActiveChange,
  fallbackFocusRef,
  empty,
  footer,
  className,
}: TaskListProps) {
  const baseId = useId();
  const { toast } = useToast();
  const trash = useTrashTask();
  const command = useTaskCommand();
  const reportToggleError = useCallback(
    () => toast({ message: t.toasts.toggleFailed, tone: 'error' }),
    [toast],
  );
  const keep = useKeepInPlace(tasks, api.setTaskCompleted, reportToggleError);

  // Optimistic manual order, valid until the next listing arrives.
  const [localOrder, setLocalOrder] = useState<{
    base: readonly Task[];
    ids: readonly string[];
  } | null>(null);
  const rows = useMemo(
    () =>
      localOrder && localOrder.base === tasks ? applyOrder(keep.rows, localOrder.ids) : keep.rows,
    [localOrder, tasks, keep.rows],
  );
  const sections = useMemo(
    () => (group ? group(rows) : singleSection(rows, reorderable)),
    [group, rows, reorderable],
  );

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const visible = sections.map((section) => {
    const limited =
      section.limit !== undefined &&
      !expanded.has(section.id) &&
      section.tasks.length > section.limit;
    return {
      section,
      rows: limited ? section.tasks.slice(0, section.limit) : section.tasks,
      hidden: limited && section.limit !== undefined ? section.tasks.length - section.limit : 0,
    };
  });
  const flat = visible.flatMap((entry) => entry.rows);

  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const stopId = flat.some((task) => task.id === activeId) ? activeId : (flat[0]?.id ?? null);

  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  // After a reorder, Trash or "Show more", put focus on the intended row once it is rendered.
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    const box = id ? rowCheckbox(listRef.current, id) : null;
    if (!box) return;
    pendingFocus.current = null;
    if (document.activeElement !== box) box.focus();
    box.scrollIntoView?.({ block: 'nearest' });
  });

  const focusRow = (task: Task) => {
    setActiveId(task.id);
    const box = rowCheckbox(listRef.current, task.id);
    if (box) {
      box.focus();
      box.scrollIntoView?.({ block: 'nearest' });
    } else {
      pendingFocus.current = task.id;
    }
  };

  const spaceById = useMemo(() => new Map(spaces.map((space) => [space.id, space])), [spaces]);
  const sectionOf = (id: string): TaskSection | undefined =>
    sections.find((section) => section.tasks.some((task) => task.id === id));

  const toggle = (task: Task, completed: boolean) =>
    keep.toggle(
      task,
      completed,
      rows.map((row) => row.id),
    );

  const moveToTrash = async (task: Task) => {
    const index = flat.findIndex((row) => row.id === task.id);
    const neighbour = flat[index + 1] ?? flat[index - 1];
    if (!(await trash(task))) return;
    keep.release(task.id);
    onTrashed?.(task);
    if (neighbour) {
      setActiveId(neighbour.id);
      pendingFocus.current = neighbour.id;
    } else {
      fallbackFocusRef?.current?.focus();
    }
  };

  const reorder = (task: Task, delta: -1 | 1) => {
    const section = sectionOf(task.id);
    if (!section?.reorderable) return;
    const ids = section.tasks.map((row) => row.id);
    const from = ids.indexOf(task.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, task.id);
    const members = new Set(ids);
    let cursor = 0;
    const order = rows.map((row) => (members.has(row.id) ? (next[cursor++] ?? row.id) : row.id));
    setLocalOrder({ base: tasks, ids: order });
    keep.setOrder(order);
    pendingFocus.current = task.id;
    api.reorderTasks(next).catch(() => {
      setLocalOrder(null);
      toast({ message: t.toasts.reorderFailed, tone: 'error' });
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, task: Task) => {
    const { key, altKey, ctrlKey, metaKey, shiftKey } = event;
    if (altKey && !ctrlKey && !metaKey && !shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      event.preventDefault();
      reorder(task, key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (metaKey && key === 'Backspace' && detectPlatform() === 'macos') {
      event.preventDefault();
      void moveToTrash(task);
      return;
    }
    if (altKey || ctrlKey || metaKey || shiftKey) return;
    const index = flat.findIndex((row) => row.id === task.id);
    const target = (() => {
      switch (key) {
        case 'ArrowDown':
        case 'j':
          return flat[Math.min(index + 1, flat.length - 1)];
        case 'ArrowUp':
        case 'k':
          return flat[Math.max(index - 1, 0)];
        case 'Home':
          return flat[0];
        case 'End':
          return flat[flat.length - 1];
        default:
          return undefined;
      }
    })();
    if (target) {
      event.preventDefault();
      if (target.id === task.id) return;
      focusRow(target);
      if (openId !== null) onOpen(target); // the drawer follows the selection
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      onOpen(task);
    } else if (key === 'Delete') {
      event.preventDefault();
      void moveToTrash(task);
    } else if (key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
    }
  };

  const setDue = (task: Task, option: QuickDateOption) =>
    void command(() => api.setTaskDueDate(task.id, resolveQuickDate(option, today)));

  const menuFor = (task: Task): MenuEntry[] => {
    const section = sectionOf(task.id);
    const position = section ? section.tasks.findIndex((row) => row.id === task.id) : -1;
    const completed = task.status === 'completed';
    const entries: MenuEntry[] = [
      { id: 'open', label: t.menu.open, shortcut: 'Enter', onSelect: () => onOpen(task) },
      {
        id: 'toggle',
        label: completed ? t.menu.reopen : t.menu.complete,
        shortcut: 'Space',
        onSelect: () => toggle(task, !completed),
      },
      {
        id: 'due',
        type: 'submenu',
        label: t.menu.due,
        items: [
          { id: 'today', label: t.dates.today, onSelect: () => setDue(task, 'today') },
          { id: 'tomorrow', label: t.dates.tomorrow, onSelect: () => setDue(task, 'tomorrow') },
          { id: 'next', label: t.dates.nextWeek, onSelect: () => setDue(task, 'nextWeek') },
          { id: 'sep', type: 'separator' },
          {
            id: 'clear',
            label: t.dates.clear,
            disabled: task.dueDate === null,
            onSelect: () => setDue(task, 'clear'),
          },
        ],
      },
    ];
    if (spaces.length > 1) {
      entries.push({
        id: 'space',
        type: 'submenu',
        label: t.menu.moveToSpace,
        items: [
          {
            id: 'spaces',
            type: 'radio-group',
            label: t.menu.moveToSpace,
            value: task.spaceId,
            onValueChange: (spaceId) => void command(() => api.moveTask(task.id, spaceId)),
            options: spaces.map((space) => ({ value: space.id, label: space.name })),
          },
        ],
      });
    }
    entries.push({
      id: 'pin',
      label: task.pinned ? common.actions.hideFromDesktop : common.actions.pinToDesktop,
      shortcut: 'Mod+Shift+P',
      onSelect: () =>
        void command<unknown>(() =>
          task.pinned
            ? api.closeSticky({ kind: 'task', id: task.id })
            : api.openSticky({ kind: 'task', id: task.id }),
        ),
    });
    if (section?.reorderable) {
      entries.push(
        { id: 'order-sep', type: 'separator' },
        {
          id: 'up',
          label: t.menu.moveUp,
          shortcut: 'Alt+ArrowUp',
          disabled: position <= 0,
          onSelect: () => reorder(task, -1),
        },
        {
          id: 'down',
          label: t.menu.moveDown,
          shortcut: 'Alt+ArrowDown',
          disabled: position < 0 || position >= section.tasks.length - 1,
          onSelect: () => reorder(task, 1),
        },
      );
    }
    entries.push(
      { id: 'trash-sep', type: 'separator' },
      {
        id: 'trash',
        label: common.actions.moveToTrash,
        shortcut: 'Delete',
        danger: true,
        onSelect: () => void moveToTrash(task),
      },
    );
    return entries;
  };

  const expand = (section: TaskSection) => {
    setExpanded((current) => new Set(current).add(section.id));
    const first = section.limit !== undefined ? section.tasks[section.limit] : undefined;
    if (first) {
      setActiveId(first.id);
      pendingFocus.current = first.id;
    }
  };

  return (
    <div ref={listRef} role="group" aria-label={label} className={cx(styles.list, className)}>
      {visible.map(({ section, rows: shown, hidden }) => {
        const headingId = `${baseId}-${section.id}`;
        return (
          <div key={section.id} className={styles.section}>
            {section.title && (
              <PageSectionHeader
                id={headingId}
                title={section.title}
                icon={
                  section.tone === 'danger' ? (
                    <AlertTriangle className={styles.danger} aria-hidden />
                  ) : undefined
                }
                count={section.showCount ? section.tasks.length : undefined}
                countLabel={t.taskCount(section.tasks.length)}
              />
            )}
            <div
              role="list"
              aria-labelledby={section.title ? headingId : undefined}
              aria-label={section.title ? undefined : label}
              className={styles.rows}
            >
              {shown.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  selected={task.id === openId}
                  showSpace={showSpace}
                  space={spaceById.get(task.spaceId)}
                  showDocument={showDocument}
                  impliedDate={section.date}
                  tabIndex={task.id === stopId ? 0 : -1}
                  onToggle={toggle}
                  onOpen={onOpen}
                  onOpenDocument={onOpenDocument}
                  onCheckboxKeyDown={(event) => handleKeyDown(event, task)}
                  onCheckboxFocus={(event) => {
                    setActiveId(task.id);
                    onActiveChange?.(task, event.currentTarget);
                  }}
                  menu={() => menuFor(task)}
                />
              ))}
            </div>
            {hidden > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className={styles.more}
                onClick={() => expand(section)}
              >
                {t.showMore(hidden)}
              </Button>
            )}
          </div>
        );
      })}
      {flat.length === 0 && empty}
      {footer}
    </div>
  );
}
