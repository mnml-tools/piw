/**
 * User-facing strings shared across the app. Kept in one place per area so a future i18n
 * layer can replace these objects without touching components (plan.md §0.1.14).
 */
export const common = {
  appName: 'Piw',
  areas: {
    inbox: 'Inbox',
    notes: 'Notes',
    tasks: 'Tasks',
    pinned: 'Pinned',
    trash: 'Trash',
    settings: 'Settings',
  },
  spaces: {
    all: 'All spaces',
    color: 'Colour',
    namePlaceholder: 'Space name',
  },
  actions: {
    search: 'Search',
    new: 'New',
    newTask: 'New task',
    undo: 'Undo',
    cancel: 'Cancel',
    delete: 'Delete',
    restore: 'Restore',
    close: 'Close',
    more: 'More actions',
    pinToDesktop: 'Pin to desktop',
    hideFromDesktop: 'Hide from desktop',
    moveToTrash: 'Move to Trash',
    moveToSpace: 'Move to space',
  },
  toasts: {
    restoredWithoutDocument: 'Restored without its document',
    genericError: 'Something went wrong',
  },
  data: {
    errorTitle: 'Piw couldn’t open your data',
    errorBody:
      'Your notes and tasks have not been changed. Restart Piw, or check the location below.',
  },
} as const;
