/**
 * Pure grouping of task rows into the sections of each Tasks view (docs/ui-design-system.md §10).
 * The input is already ordered (server order, with kept-in-place rows merged back), and every
 * section keeps that order: grouping never reorders rows.
 */
import { daysBetween, formatDueDate, toDateString } from '@/lib/dates';
import type { Task } from '@/lib/ipc/bindings/Task';
import type { TaskView } from '@/lib/ipc/bindings/TaskView';
import { tasksStrings as t } from '@/strings/tasks';

export interface TaskSection {
  /** Stable key, unique within the list. */
  id: string;
  /** Visible heading; omit for an untitled list (e.g. a document Tasks tab). */
  title?: string;
  /** `danger` for Overdue: a warning icon next to the heading (never colour alone). */
  tone?: 'danger';
  /** Show the count next to the heading. */
  showCount?: boolean;
  /**
   * The due date every row of this section shares ('YYYY-MM-DD'), e.g. Today or a day of
   * Upcoming. Rows due that day leave the date out: the heading already says it.
   */
  date?: string;
  tasks: Task[];
  /** Show at most this many rows, then "Show N more". */
  limit?: number;
  /** Manual order applies here (Alt+↑/↓). */
  reorderable?: boolean;
}

/** Splits rows into sections. Must be pure. */
export type TaskGrouper = (tasks: readonly Task[]) => TaskSection[];

export const OVERDUE_LIMIT = 5;
/** Upcoming lists one section per day for this many days, then "Later". */
const UPCOMING_DAYS = 14;

/** Local calendar date of a UTC timestamp ('YYYY-MM-DD'). */
export function localDate(iso: string): string {
  return toDateString(new Date(iso));
}

function overdue(tasks: Task[]): TaskSection {
  return {
    id: 'overdue',
    title: t.sections.overdue,
    tone: 'danger',
    showCount: true,
    tasks,
    limit: OVERDUE_LIMIT,
  };
}

function nonEmpty(sections: TaskSection[]): TaskSection[] {
  return sections.filter((section) => section.tasks.length > 0);
}

function groupToday(tasks: readonly Task[], today: string): TaskSection[] {
  const late: Task[] = [];
  const due: Task[] = [];
  for (const task of tasks) {
    if (task.dueDate !== null && task.dueDate < today) late.push(task);
    else due.push(task);
  }
  return nonEmpty([
    overdue(late),
    { id: 'today', title: t.sections.today, showCount: true, tasks: due, date: today },
  ]);
}

function groupUpcoming(tasks: readonly Task[], today: string): TaskSection[] {
  const days = new Map<string, Task[]>();
  const later: Task[] = [];
  for (const task of tasks) {
    const due = task.dueDate;
    if (due === null || daysBetween(today, due) > UPCOMING_DAYS) {
      later.push(task);
      continue;
    }
    const day = days.get(due);
    if (day) day.push(task);
    else days.set(due, [task]);
  }
  const byDay = [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, rows]): TaskSection => ({
      id: `day-${date}`,
      title: formatDueDate(date, today),
      showCount: true,
      tasks: rows,
      date,
    }));
  return nonEmpty([
    ...byDay,
    { id: 'later', title: t.sections.later, showCount: true, tasks: later },
  ]);
}

function groupAll(tasks: readonly Task[], today: string): TaskSection[] {
  const late: Task[] = [];
  const due: Task[] = [];
  const upcoming: Task[] = [];
  const undated: Task[] = [];
  for (const task of tasks) {
    const date = task.dueDate;
    if (date === null) undated.push(task);
    else if (date < today) late.push(task);
    else if (date === today) due.push(task);
    else upcoming.push(task);
  }
  return nonEmpty([
    overdue(late),
    { id: 'today', title: t.sections.today, showCount: true, tasks: due, date: today },
    { id: 'upcoming', title: t.sections.upcoming, showCount: true, tasks: upcoming },
    {
      id: 'no-date',
      title: t.sections.noDate,
      showCount: true,
      tasks: undated,
      reorderable: true,
    },
  ]);
}

function groupCompleted(tasks: readonly Task[], today: string): TaskSection[] {
  const sameDay: Task[] = [];
  const yesterday: Task[] = [];
  const earlier: Task[] = [];
  for (const task of tasks) {
    const day = task.completedAt ? localDate(task.completedAt) : null;
    const diff = day ? daysBetween(day, today) : Infinity;
    if (diff <= 0) sameDay.push(task);
    else if (diff === 1) yesterday.push(task);
    else earlier.push(task);
  }
  return nonEmpty([
    { id: 'today', title: t.sections.today, showCount: true, tasks: sameDay },
    { id: 'yesterday', title: t.sections.yesterday, showCount: true, tasks: yesterday },
    { id: 'earlier', title: t.sections.earlier, showCount: true, tasks: earlier },
  ]);
}

/** Sections for a Tasks view, relative to `today` ('YYYY-MM-DD', local). */
export function groupTasks(view: TaskView, tasks: readonly Task[], today: string): TaskSection[] {
  switch (view) {
    case 'today':
      return groupToday(tasks, today);
    case 'upcoming':
      return groupUpcoming(tasks, today);
    case 'all':
      return groupAll(tasks, today);
    case 'completed':
      return groupCompleted(tasks, today);
  }
}

/** One untitled section (document Tasks tabs, Inbox, stickies). */
export function singleSection(tasks: readonly Task[], reorderable = false): TaskSection[] {
  return [{ id: 'tasks', tasks: [...tasks], reorderable }];
}
