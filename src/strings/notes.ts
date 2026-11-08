/**
 * User-facing strings for the Notes area (list + note editor). Kept in one module so a future
 * i18n layer can replace it without touching components (docs/ui-design-system.md §16).
 */

const MAX_QUOTED = 40;

/** Names an object in curly quotes, truncated at ~40 characters (docs/ui-design-system.md §16). */
export function quoted(title: string): string {
  const clean = title.trim();
  const short = clean.length > MAX_QUOTED ? `${clean.slice(0, MAX_QUOTED - 1).trimEnd()}…` : clean;
  return `“${short}”`;
}

function plural(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

export const notesStrings = {
  title: 'Notes',
  untitledNote: 'Untitled note',
  untitledDocument: 'Untitled document',
  documentKind: 'Document',

  header: {
    split: 'Split view',
    splitUnavailable: 'Widen the window to use split view',
    newNote: 'New note',
    options: 'View options',
    sortLabel: 'Sort by',
    sort: { updated: 'Last edited', created: 'Created', title: 'Title' },
    showArchived: 'Show archived',
  },

  archived: {
    banner: 'Archived notes',
    back: 'Back to notes',
  },

  list: {
    label: 'Notes',
    archivedLabel: 'Archived notes',
    tasks: (count: number) => plural(count, 'task', 'tasks'),
    moreTags: (count: number) => `+${count}`,
    moreTagsLabel: (count: number) => plural(count, 'more tag', 'more tags'),
    onDesktop: 'On desktop',
    rowActions: 'More actions',
    noSelectionTitle: 'No note selected',
    noSelection: 'Select a note to show it here.',
    /** Group labels, shown only while some documents are favourites. */
    favourites: 'Favourites',
    others: 'Notes',
    /** Quiet stand-ins for an empty snippet line, so every row keeps the same three lines. */
    noText: 'No additional text',
    documentSnippet: 'Document',
    count: (count: number) => plural(count, 'note', 'notes'),
    archivedCount: (count: number) => plural(count, 'archived note', 'archived notes'),
  },

  menu: {
    open: 'Open',
    pin: 'Pin to desktop',
    convert: 'Convert to document',
    addToFavourites: 'Add to favourites',
    removeFromFavourites: 'Remove from favourites',
    moveToSpace: 'Move to space',
    archive: 'Archive',
    unarchive: 'Unarchive',
    trash: 'Move to Trash',
    addTag: 'Add tag…',
    copyMarkdown: 'Copy as Markdown',
  },

  empty: {
    title: 'No notes yet',
    description: 'Write something down — it saves as you type.',
    action: 'New note',
    inSpace: (space: string) => `No notes in ${space}`,
    showAll: 'Show all spaces',
    archivedTitle: 'No archived notes',
    archivedAction: 'Back to notes',
  },

  loading: 'Loading…',

  error: {
    listTitle: 'Couldn’t load your notes',
    noteTitle: 'Couldn’t open this note',
    description: 'Nothing was changed. Try again in a moment.',
    retry: 'Try again',
    copyDetails: 'Copy details',
    detailsCopied: 'Details copied',
  },

  editor: {
    label: 'Note editor',
    backTo: (origin: string) => `Back to ${origin}`,
    text: 'Note text',
    placeholder: 'Write a note…',
    space: 'Space',
    pin: 'Pin to desktop',
    more: 'More actions',
    tags: 'Tags',
    removeTag: (tag: string) => `Remove tag “${tag}”`,
    save: { saving: 'Saving…', saved: 'Saved', error: 'Couldn’t save', retry: 'Retry' },
    errorBanner: 'Couldn’t save. Your text is kept and Piw keeps trying.',
    retry: 'Retry',
    conflict: 'This note changed in another window',
    reload: 'Reload',
    keepMine: 'Keep mine',
    trashed: 'This note is in Trash',
    restore: 'Restore',
    gone: 'This note was deleted in another window',
  },

  tagDialog: {
    title: 'Add tag',
    label: 'Tag',
    placeholder: 'Tag name…',
    add: 'Add tag',
    tooLong: 'Tags can be up to 40 characters.',
    exists: 'This note already has that tag.',
  },

  confirmTrashDocument: {
    title: (title: string) => `Move ${quoted(title)} to Trash?`,
    body: (count: number) => `It has ${plural(count, 'linked task', 'linked tasks')}.`,
    groupLabel: 'Linked tasks',
    keep: 'Keep the tasks in Tasks (remove the link)',
    trashToo: 'Move the tasks to Trash too',
    confirm: 'Move to Trash',
  },

  confirmMoveDocument: {
    title: (title: string, space: string) => `Move ${quoted(title)} to ${space}?`,
    body: (tasks: number, notes: number) => {
      const parts = [
        tasks > 0 ? plural(tasks, 'task', 'tasks') : null,
        notes > 0 ? plural(notes, 'note', 'notes') : null,
      ].filter(Boolean);
      return `Its ${parts.join(' and ')} move with it.`;
    },
    confirm: 'Move',
  },

  toasts: {
    trashed: (title: string) => `${quoted(title)} moved to Trash`,
    archived: (title: string) => `${quoted(title)} archived`,
    unarchived: (title: string) => `${quoted(title)} unarchived`,
    converted: 'Converted to document',
    copied: 'Copied as Markdown',
    copyFailed: 'Couldn’t copy to the clipboard',
    trashFailed: 'Couldn’t move to Trash',
    archiveFailed: 'Couldn’t archive the note',
    moveFailed: 'Couldn’t move to that space',
    pinFailed: 'Couldn’t pin to desktop',
    convertFailed: 'Couldn’t convert to document',
    needsSave: 'Couldn’t save your latest changes. Try again.',
    favouriteFailed: 'Couldn’t update your favourites',
    tagFailed: 'Couldn’t save the tag',
    reloadFailed: 'Couldn’t reload the note',
    restoreFailed: 'Couldn’t restore the note',
    undoFailed: 'Couldn’t undo',
    revertFailed: 'Couldn’t undo — the document has changed since',
  },
} as const;
