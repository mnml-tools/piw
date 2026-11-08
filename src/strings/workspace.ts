export const workspaceStrings = {
  window: {
    controls: 'Window',
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close window',
  },
  /** The app's one top bar (docs/ui-design-system.md, "Top bar"). */
  topBar: {
    label: 'Piw',
    areasLabel: 'Areas',
    areaMenu: (current: string) => `Go to: ${current}`,
    areaMenuLabel: 'Go to',
    inboxInMenu: (n: number) => `Inbox (${n})`,
    spaceTrigger: (name: string) => `Space filter: ${name}`,
    newSpace: 'New space…',
    renameSpace: 'Rename…',
    deleteSpace: 'Delete…',
  },
  newMenu: {
    note: 'New note',
    task: 'New task',
    document: 'New document',
    tooltip: 'New note, task or document',
  },
  inboxCount: (n: number) => `${n} unorganised`,
  spaces: {
    filterLabel: 'Space filter',
    createTitle: 'New space',
    renameTitle: 'Rename space',
    name: 'Name',
    save: 'Save',
    deleteTitle: (name: string) => `Delete “${name}”?`,
    deleteBody: (count: number) =>
      count === 0
        ? 'This space is empty.'
        : `Its ${count} ${count === 1 ? 'item moves' : 'items move'} to the space you choose.`,
    moveTo: 'Move items to',
    delete: 'Delete space',
    isDefault: 'Default space',
    lastSpace: 'Piw needs at least one space.',
  },
  colors: {
    none: 'No colour',
    yellow: 'Yellow',
    peach: 'Clay',
    rose: 'Rose',
    mint: 'Sage',
    sky: 'Blue',
    lavender: 'Lavender',
  },
  documents: {
    newTitle: 'New document',
    titleLabel: 'Title',
    titlePlaceholder: 'Refactor 2FA',
    create: 'Create document',
  },
  trayNotice: 'Piw keeps running in the tray. Use the tray menu to quit.',
  manyStickies: (n: number) =>
    `${n} stickies are open. Each one uses memory — hide the ones you don't need right now.`,
} as const;

export const searchStrings = {
  title: 'Search',
  placeholder: 'Search notes, documents and tasks…',
  groups: { documents: 'Documents', notes: 'Notes', tasks: 'Tasks' },
  showAll: (n: number) => `Show all ${n}`,
  noResults: (q: string) => `No results for “${q}”`,
  createNote: (q: string) => `Create note “${q}”`,
  createTask: (q: string) => `Create task “${q}”`,
  hint: 'Type to search. Use #tag for tags.',
  footer: { move: 'Navigate', open: 'Open', close: 'Close' },
  inTab: (tab: string) => `in ${tab}`,
  subtaskOf: (parent: string) => `Subtask of ${parent}`,
  archived: 'Archived',
  completed: 'Completed',
} as const;

export const trashStrings = {
  title: 'Trash',
  empty: 'Trash is empty',
  emptyDescription: 'Deleted notes, documents and tasks stay here until you delete them forever.',
  emptyTrash: 'Empty trash…',
  emptyTitle: (n: number) => `Permanently delete ${n} ${n === 1 ? 'item' : 'items'}?`,
  emptyBody: 'This can’t be undone.',
  deleteForever: 'Delete forever…',
  deleteForeverTitle: (name: string) => `Delete “${name}” forever?`,
  deleted: (when: string) => `Deleted ${when}`,
  restored: (name: string) => `“${name}” restored`,
  count: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
  kinds: { note: 'Note', document: 'Document', task: 'Task' },
  untitled: 'Untitled',
} as const;

export const inboxStrings = {
  title: 'Inbox',
  empty: 'Inbox is clear',
  emptyDescription: 'New captures land here until you organise them.',
  markOrganised: 'Mark organised',
  markAll: 'Mark all organised',
  organised: (n: number) => `${n} ${n === 1 ? 'item' : 'items'} marked organised`,
  listLabel: 'Unorganised notes and tasks',
  note: 'Note',
  count: (n: number) => `${n} unorganised`,
} as const;

export const pinnedStrings = {
  title: 'Pinned',
  empty: 'Nothing pinned yet',
  emptyDescription: 'Pin a note, a task or a document’s Tasks tab to keep it on your desktop.',
  onDesktop: 'On the desktop',
  hidden: 'Hidden',
  show: 'Show on desktop',
  hide: 'Hide from desktop',
  keepOnTop: 'Keep on top',
  onTop: 'On top',
  count: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
  status: (open: number, hidden: number) => `${open} on the desktop · ${hidden} hidden`,
  remove: 'Remove from desktop',
  removed: (title: string) => `“${title}” removed from the desktop`,
  kinds: { note: 'Note', task: 'Task', tasks_tab: 'Tasks view' },
} as const;
