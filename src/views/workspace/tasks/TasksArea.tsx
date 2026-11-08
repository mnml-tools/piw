import { AlertTriangle, CalendarClock, CircleCheck, ListChecks, Plus, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PageColumn, ViewToolbar } from '@/components/app/Page';
import { useScrolled } from '@/components/app/useScrolled';
import {
  Button,
  EmptyState,
  formatShortcut,
  Segmented,
  toAriaKeyShortcuts,
  useToast,
  type DrawerMode,
  type SegmentedOption,
} from '@/components/ui';
import { addDays } from '@/lib/dates';
import { useCompletedCount, useSettings, useSpaces, useTasks } from '@/lib/hooks/data';
import type { Task } from '@/lib/ipc/bindings/Task';
import type { TaskView } from '@/lib/ipc/bindings/TaskView';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { tasksStrings as t } from '@/strings/tasks';
import { AddTaskRow } from './AddTaskRow';
import { rowCheckbox } from './dom';
import {
  COMPACT_MAX_WIDTH,
  DRAWER_DOCK_MIN_WIDTH,
  useDelayedFlag,
  useElementWidth,
  useToday,
} from './hooks';
import { groupTasks } from './sections';
import { TaskDrawer } from './TaskDrawer';
import { TaskList } from './TaskList';
import styles from './TasksArea.module.css';

const VIEWS: TaskView[] = ['today', 'upcoming', 'all', 'completed'];
const VIEW_OPTIONS: SegmentedOption<TaskView>[] = VIEWS.map((view) => ({
  value: view,
  label: t.views[view],
}));

/** The empty-state icon: EmptyState sizes it (28px, thin stroke). */
const EMPTY_ICON = { 'aria-hidden': true } as const;

/** Mod+T requests already answered, so remounting the area doesn't steal focus again. */
let handledAddRequest = 0;

function drawerMode(width: number): DrawerMode {
  if (width === 0 || width >= DRAWER_DOCK_MIN_WIDTH) return 'docked';
  return width < COMPACT_MAX_WIDTH ? 'full' : 'overlay';
}

/**
 * The Tasks area (docs/ui-design-system.md §10): Today · Upcoming · All · Completed, filtered by
 * the global space filter, with the task inspector docked at ≥ 820px and overlaid below. The view
 * header carries the title, the quiet count, the view filters and "New task"; the list sits in the
 * page column under it (880px, left on the grid), so rows, group labels and the header share one
 * grid.
 */
export default function TasksArea() {
  const view = useWorkspace((state) => state.tasksView);
  const spaceId = useWorkspace((state) => state.spaceId);
  const drawerTaskId = useWorkspace((state) => state.drawerTaskId);
  const selectedTaskId = useWorkspace((state) => state.selectedTaskId);
  const addTaskRequest = useWorkspace((state) => state.addTaskRequest);
  const requestAddTask = useWorkspace((state) => state.requestAddTask);
  const setTasksView = useWorkspace((state) => state.setTasksView);
  const openTask = useWorkspace((state) => state.openTask);
  const openDocument = useWorkspace((state) => state.openDocument);
  const setSpace = useWorkspace((state) => state.setSpace);

  const today = useToday();
  const tasks = useTasks(spaceId ? { view, spaceId } : { view });
  const completedCount = useCompletedCount(spaceId);
  const spaces = useSpaces();
  const settings = useSettings();
  const { toast } = useToast();
  const showLoading = useDelayedFlag(tasks.isPending);

  const [areaRef, width] = useElementWidth<HTMLDivElement>();
  const mode = drawerMode(width);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolled = useScrolled(scrollRef);
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Mod+T: focus "Add task" (switching away from Completed, which has none).
  useEffect(() => {
    if (addTaskRequest <= handledAddRequest) return;
    if (view === 'completed') {
      setTasksView('all');
      return;
    }
    handledAddRequest = addTaskRequest;
    addRef.current?.focus();
  }, [addTaskRequest, view, setTasksView]);

  const group = useCallback(
    (rows: readonly Task[]) => groupTasks(view, rows, today),
    [view, today],
  );
  const closeDrawer = useCallback(() => openTask(null), [openTask]);
  const open = (task: Task) => {
    returnFocusRef.current = rowCheckbox(listRef.current, task.id) ?? returnFocusRef.current;
    openTask(task.id);
  };

  const space = spaces.data?.find((candidate) => candidate.id === spaceId);
  const addContext = useMemo(
    () => ({
      spaceId,
      dueDate: view === 'today' ? today : view === 'upcoming' ? addDays(today, 1) : null,
    }),
    [spaceId, view, today],
  );

  const showAll = <Button onClick={() => setTasksView('all')}>{t.empty.showAll}</Button>;
  const empty = (() => {
    switch (view) {
      case 'today':
        return (
          <EmptyState
            className={styles.empty}
            icon={<Sun {...EMPTY_ICON} />}
            title={t.empty.today}
            action={showAll}
          />
        );
      case 'upcoming':
        return (
          <EmptyState
            className={styles.empty}
            icon={<CalendarClock {...EMPTY_ICON} />}
            title={t.empty.upcoming}
            description={t.empty.upcomingHelper}
            action={showAll}
          />
        );
      case 'completed':
        return (
          <EmptyState
            className={styles.empty}
            icon={<CircleCheck {...EMPTY_ICON} />}
            title={t.empty.completed}
            action={showAll}
          />
        );
      case 'all': {
        if (space) {
          return (
            <EmptyState
              className={styles.empty}
              icon={<ListChecks {...EMPTY_ICON} />}
              title={t.empty.inSpace(space.name)}
              action={<Button onClick={() => setSpace(null)}>{t.empty.showAllSpaces}</Button>}
            />
          );
        }
        const shortcut = settings.data?.captureShortcut;
        return (
          <EmptyState
            className={styles.empty}
            icon={<ListChecks {...EMPTY_ICON} />}
            title={t.empty.all}
            description={t.empty.allHelper(shortcut ? formatShortcut(shortcut) : null)}
            action={<Button onClick={() => addRef.current?.focus()}>{t.empty.allAction}</Button>}
          />
        );
      }
    }
  })();

  const completed = completedCount.data ?? 0;
  const footer = view === 'all' && completed > 0 && (
    <Button
      variant="ghost"
      size="sm"
      className={styles.completedToggle}
      aria-label={t.showCompletedLabel(completed)}
      onClick={() => setTasksView('completed')}
    >
      {t.showCompleted(completed)}
    </Button>
  );

  const copyDetails = (error: unknown) => {
    const details =
      error instanceof IpcError ? `${error.code}: ${error.message}` : String(error ?? '');
    void navigator.clipboard
      ?.writeText(details)
      .then(() => toast({ message: t.error.copied }))
      .catch(() => undefined);
  };

  const body = (() => {
    if (tasks.data) {
      return (
        <TaskList
          key={`${view}:${spaceId ?? 'all'}`}
          tasks={tasks.data}
          label={t.listLabel[view]}
          today={today}
          group={group}
          showSpace={spaceId === null}
          spaces={spaces.data}
          openId={drawerTaskId}
          initialActiveId={selectedTaskId}
          onOpen={open}
          onOpenDocument={(documentId) => openDocument(documentId)}
          onTrashed={(task) => {
            if (task.id === drawerTaskId) closeDrawer();
          }}
          onEscape={drawerTaskId ? closeDrawer : undefined}
          onActiveChange={(_task, checkbox) => {
            returnFocusRef.current = checkbox;
          }}
          fallbackFocusRef={addRef}
          empty={empty}
          footer={footer}
          className={styles.list}
        />
      );
    }
    if (tasks.isError) {
      return (
        <EmptyState
          className={styles.empty}
          icon={<AlertTriangle {...EMPTY_ICON} />}
          title={t.error.title}
          description={t.error.helper}
          action={
            <div className={styles.errorActions}>
              <Button onClick={() => void tasks.refetch()}>{t.error.retry}</Button>
              <button
                type="button"
                className={styles.link}
                onClick={() => copyDetails(tasks.error)}
              >
                {t.error.copy}
              </button>
            </div>
          }
        />
      );
    }
    return showLoading ? <p className={styles.loading}>{t.loading}</p> : null;
  })();

  const count = tasks.data ? t.note(tasks.data.length, view === 'completed') : null;

  return (
    <div ref={areaRef} className={styles.area} data-drawer={drawerTaskId ? mode : undefined}>
      <div className={styles.main}>
        <ViewToolbar
          scrolled={scrolled}
          title={t.title}
          count={count}
          filters={
            <Segmented
              size="sm"
              variant="text"
              aria-label={t.viewsLabel}
              options={VIEW_OPTIONS}
              value={view}
              onValueChange={setTasksView}
            />
          }
          actions={
            <Button
              size="sm"
              icon={<Plus aria-hidden size={14} />}
              title={`${t.newTask} (${formatShortcut('Mod+T')})`}
              aria-keyshortcuts={toAriaKeyShortcuts('Mod+T')}
              onClick={requestAddTask}
            >
              <span className={styles.newTaskLabel}>{t.newTask}</span>
            </Button>
          }
        />
        <div ref={scrollRef} className={styles.scroller}>
          <PageColumn>
            <div ref={listRef} className={styles.content}>
              {view !== 'completed' && <AddTaskRow inputRef={addRef} context={addContext} />}
              {body}
            </div>
          </PageColumn>
        </div>
      </div>
      <TaskDrawer
        taskId={drawerTaskId}
        onClose={closeDrawer}
        mode={mode}
        returnFocusRef={returnFocusRef}
      />
    </div>
  );
}
