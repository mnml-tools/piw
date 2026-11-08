/**
 * Strings for the Tasks area, task rows, the Add task row and the task drawer
 * (docs/ui-design-system.md §16). Sentence case; objects are named in curly quotes and truncated at
 * ~40 characters.
 */

const MAX_QUOTED = 40;

/** “Comprar café”, cut to ~40 characters with an ellipsis. */
export function quoted(title: string): string {
  const clean = title.trim();
  const short = clean.length > MAX_QUOTED ? `${clean.slice(0, MAX_QUOTED - 1).trimEnd()}…` : clean;
  return `“${short}”`;
}

function plural(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

export const tasksStrings = {
  title: 'Tasks',
  viewsLabel: 'Task views',
  views: { today: 'Today', upcoming: 'Upcoming', all: 'All', completed: 'Completed' },
  listLabel: {
    today: 'Tasks due today',
    upcoming: 'Upcoming tasks',
    all: 'All tasks',
    completed: 'Completed tasks',
  },
  sections: {
    overdue: 'Overdue',
    today: 'Today',
    upcoming: 'Upcoming',
    noDate: 'No date',
    later: 'Later',
    yesterday: 'Yesterday',
    earlier: 'Earlier',
  },
  /** Spoken after a section heading: "Overdue, 1 task". */
  taskCount: (count: number) => plural(count, 'task', 'tasks'),
  showMore: (count: number) => `Show ${count} more`,
  /** Quiet text button under All: "Show 3 completed" (opens the Completed view). */
  showCompleted: (count: number) => `Show ${count} completed`,
  showCompletedLabel: (count: number) =>
    `Show ${plural(count, 'completed task', 'completed tasks')}`,
  loading: 'Loading…',
  newTask: 'New task',
  /** The quiet count after the view title: "9 open" / "2 completed". */
  note: (count: number, completed: boolean) => `${count} ${completed ? 'completed' : 'open'}`,

  add: {
    placeholder: 'Add task',
    label: 'Add task',
    contextLabel: (parts: string) => `New tasks: ${parts}`,
    due: (label: string) => `due ${label}`,
    inSpace: (name: string) => `in ${name}`,
    removeDue: 'Remove date',
    setDue: 'Set due date',
    changeDue: (label: string) => `Due date: ${label}`,
    added: (title: string) => `Added ${quoted(title)}`,
    failed: 'Couldn’t add the task. Your text is kept.',
  },

  row: {
    openDocument: (title: string) => `Open document ${quoted(title)}`,
    archived: '(archived)',
    inDocument: (title: string, archived: boolean) =>
      `In ${quoted(title)}${archived ? ' (archived)' : ''}`,
    subtasks: (done: number, total: number) => `${done} of ${total} subtasks done`,
    subtasksShort: (done: number, total: number) => `${done}/${total}`,
    space: (name: string) => `Space: ${name}`,
    open: 'Open details',
    more: 'More actions',
  },

  menu: {
    open: 'Open',
    complete: 'Mark as complete',
    reopen: 'Mark as not complete',
    due: 'Due date',
    moveToSpace: 'Move to space',
    moveUp: 'Move up',
    moveDown: 'Move down',
  },

  empty: {
    all: 'No tasks',
    allHelper: (shortcut: string | null) =>
      shortcut ? `Add one here, or press ${shortcut} in any app.` : 'Add one here.',
    allAction: 'Add task',
    inSpace: (space: string) => `No tasks in ${space}`,
    showAllSpaces: 'Show all spaces',
    today: 'Nothing due today',
    upcoming: 'Nothing scheduled',
    upcomingHelper: 'Tasks with a future date appear here.',
    completed: 'No completed tasks yet',
    showAll: 'Show all tasks',
  },

  error: {
    title: 'Couldn’t load your tasks',
    helper: 'Nothing was changed. Try again, or restart Piw if it keeps happening.',
    retry: 'Try again',
    copy: 'Copy details',
    copied: 'Details copied',
  },

  toasts: {
    trashed: (title: string) => `${quoted(title)} moved to Trash`,
    subtaskDeleted: (title: string) =>
      title.trim() ? `Subtask ${quoted(title)} deleted` : 'Subtask deleted',
    restoredWithoutDocument: 'Restored without its document',
    toggleFailed: 'Couldn’t update the task',
    actionFailed: 'Couldn’t change the task',
    trashFailed: 'Couldn’t move the task to Trash',
    restoreFailed: 'Couldn’t restore the task',
    reorderFailed: 'Couldn’t save the new order',
  },

  dates: {
    today: 'Today',
    tomorrow: 'Tomorrow',
    nextWeek: 'Next week',
    pick: 'Pick a date…',
    clear: 'Remove date',
    pickInput: 'Due date',
    apply: 'Set date',
  },

  drawer: {
    title: 'Task',
    region: 'Task details',
    close: 'Close task details',
    more: 'More actions',
    pin: 'Pin to desktop',
    show: 'Show on desktop',
    hide: 'Hide from desktop',
    unlink: 'Unlink from document',
    titleLabel: 'Title',
    titleRequired: 'A task needs a title',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Add a description…',
    conflict: 'Changed in another window',
    reload: 'Reload',
    keepMine: 'Keep mine',
    subtaskOf: (title: string) => `Subtask of ${quoted(title)}`,
    unavailable: 'This task is no longer available',
    unavailableHelper: 'It may have been moved to Trash in another window.',
    loadFailed: 'Couldn’t load this task',
    created: 'Created',
    createdValue: (date: string, edited: string) => `${date} · Edited ${edited}`,
    save: { saving: 'Saving…', saved: 'Saved', error: 'Couldn’t save', retry: 'Retry' },
    due: 'Due',
    dueLabel: (label: string) => `Due date: ${label}`,
    addDate: 'Add date',
    space: 'Space',
    document: 'Document',
    openDocument: 'Open document',
    linkDocument: 'Link to document…',
    noDocuments: 'No documents yet',
    tags: 'Tags',
    addTag: 'Add tag',
    tagLabel: 'Tag name',
    removeTag: (tag: string) => `Remove tag “${tag}”`,
  },

  subtasks: {
    heading: 'Subtasks',
    progress: (done: number, total: number) => `${done} of ${total} done`,
    add: 'Add subtask',
    titleLabel: 'Subtask title',
    untitled: 'Untitled subtask',
  },
} as const;
