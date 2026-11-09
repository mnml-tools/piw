/**
 * Typed wrappers for every Rust command. UI code calls these instead of `invoke` so argument
 * names and payload types are checked against the generated bindings (docs/architecture.md#ipc-contract).
 */
import { call } from './client';
import type { AppStatus } from './bindings/AppStatus';
import type { CaptureDraft } from './bindings/CaptureDraft';
import type { CaptureMode } from './bindings/CaptureMode';
import type { ColorName } from './bindings/ColorName';
import type { CreateDocument } from './bindings/CreateDocument';
import type { CreateNote } from './bindings/CreateNote';
import type { CreateTask } from './bindings/CreateTask';
import type { Document } from './bindings/Document';
import type { ExportData } from './bindings/ExportData';
import type { ExportFile } from './bindings/ExportFile';
import type { InboxItem } from './bindings/InboxItem';
import type { LinkedTasks } from './bindings/LinkedTasks';
import type { MovePreview } from './bindings/MovePreview';
import type { Note } from './bindings/Note';
import type { NoteListItem } from './bindings/NoteListItem';
import type { NoteQuery } from './bindings/NoteQuery';
import type { PinnedItem } from './bindings/PinnedItem';
import type { PlatformInfo } from './bindings/PlatformInfo';
import type { SearchResults } from './bindings/SearchResults';
import type { Settings } from './bindings/Settings';
import type { Space } from './bindings/Space';
import type { StickyRecord } from './bindings/StickyRecord';
import type { StickyTarget } from './bindings/StickyTarget';
import type { Tab } from './bindings/Tab';
import type { TabKind } from './bindings/TabKind';
import type { Tag } from './bindings/Tag';
import type { Task } from './bindings/Task';
import type { TaskDetail } from './bindings/TaskDetail';
import type { TaskQuery } from './bindings/TaskQuery';
import type { TasksTabSettings } from './bindings/TasksTabSettings';
import type { TasksTabShow } from './bindings/TasksTabShow';
import type { TasksTabSort } from './bindings/TasksTabSort';
import type { TrashItem } from './bindings/TrashItem';
import type { UpdateNoteText } from './bindings/UpdateNoteText';
import type { UpdateTaskText } from './bindings/UpdateTaskText';

const NOTE_QUERY_DEFAULTS: NoteQuery = {
  scope: 'active',
  sort: 'updated',
  documentsOnly: false,
};

export const api = {
  // App and platform
  appStatus: () => call<AppStatus>('app_status'),
  platformInfo: () => call<PlatformInfo>('platform_info'),
  showCapture: (mode: CaptureMode) => call<void>('show_capture', { mode }),
  hideCapture: () => call<void>('hide_capture'),
  /** Opens an http(s)/mailto link in the user's browser or mail client (validated in Rust). */
  openLink: (url: string) => call<void>('open_link', { url }),
  /** "Open in Piw" from a sticky: shows the workspace at the item. */
  openInWorkspace: (target: StickyTarget) => call<void>('open_in_workspace', { target }),
  retryShortcut: () => call<void>('retry_shortcut'),
  quit: () => call<void>('quit_app'),

  // Stickies: Pin, Hide, Remove and Keep on top are distinct actions
  // (docs/ui-design-system.md §17 rule 9).
  /** Pin to desktop (or reopen). Resolves to the number of open stickies. */
  openSticky: (target: StickyTarget) => call<number>('open_sticky', { target }),
  /** Hide from desktop: closes the window, keeps the item in Pinned. */
  closeSticky: (target: StickyTarget) => call<void>('close_sticky', { target }),
  /** Remove from Pinned and from the desktop. */
  unpinSticky: (target: StickyTarget) => call<void>('unpin_sticky', { target }),
  setStickyAlwaysOnTop: (target: StickyTarget, enabled: boolean) =>
    call<void>('set_sticky_always_on_top', { target, enabled }),
  setStickyColor: (target: StickyTarget, color: ColorName | null) =>
    call<void>('set_sticky_color', { target, color }),
  getSticky: (target: StickyTarget) => call<StickyRecord | null>('get_sticky', { target }),
  listPinned: (spaceId: string | null = null) => call<PinnedItem[]>('list_pinned', { spaceId }),
  resetStickyPositions: () => call<void>('reset_sticky_positions'),

  // Spaces
  listSpaces: () => call<Space[]>('list_spaces'),
  createSpace: (name: string, color: ColorName | null = null) =>
    call<Space>('create_space', { name, color }),
  renameSpace: (id: string, name: string) => call<Space>('rename_space', { id, name }),
  setSpaceColor: (id: string, color: ColorName | null) =>
    call<Space>('set_space_color', { id, color }),
  setDefaultSpace: (id: string) => call<void>('set_default_space', { id }),
  spaceItemCount: (id: string) => call<number>('space_item_count', { id }),
  deleteSpace: (id: string, moveTo: string) => call<void>('delete_space', { id, moveTo }),

  // Notes
  listNotes: (query: Partial<NoteQuery> = {}) =>
    call<NoteListItem[]>('list_notes', { query: { ...NOTE_QUERY_DEFAULTS, ...query } }),
  getNote: (id: string) => call<Note>('get_note', { id }),
  createNote: (input: Partial<CreateNote>) =>
    call<Note>('create_note', { input: { title: '', body: '', ...input } }),
  updateNoteText: (id: string, expectedRev: number, patch: UpdateNoteText) =>
    call<Note>('update_note_text', { id, expectedRev, patch }),
  discardNoteIfEmpty: (id: string) => call<boolean>('discard_note_if_empty', { id }),
  setNoteArchived: (id: string, archived: boolean) =>
    call<Note>('set_note_archived', { id, archived }),
  moveNote: (id: string, spaceId: string) => call<Note>('move_note', { id, spaceId }),
  trashNote: (id: string) => call<void>('trash_note', { id }),
  /** Resolves to `true` when the note came back without its document. */
  restoreNote: (id: string) => call<boolean>('restore_note', { id }),
  purgeNote: (id: string) => call<void>('purge_note', { id }),
  setNoteTriaged: (id: string, triaged: boolean) => call<void>('set_note_triaged', { id, triaged }),
  setNoteTags: (id: string, tags: string[]) => call<string[]>('set_note_tags', { id, tags }),

  // Documents
  getDocument: (id: string) => call<Document>('get_document', { id }),
  getTab: (id: string) => call<Tab>('get_tab', { id }),
  createDocument: (input: CreateDocument) => call<Document>('create_document', { input }),
  convertNoteToDocument: (id: string, content?: { contentJson: string; plainText: string }) =>
    call<Document>('convert_note_to_document', {
      id,
      contentJson: content?.contentJson ?? null,
      plainText: content?.plainText ?? null,
    }),
  revertDocumentConversion: (id: string, title: string, body: string) =>
    call<Note>('revert_document_conversion', { id, title, body }),
  createTab: (documentId: string, kind: TabKind, title: string) =>
    call<Tab>('create_tab', { documentId, kind, title }),
  renameTab: (id: string, title: string) => call<Tab>('rename_tab', { id, title }),
  reorderTabs: (documentId: string, ids: string[]) =>
    call<void>('reorder_tabs', { documentId, ids }),
  updateTabContent: (id: string, expectedRev: number, contentJson: string, plainText: string) =>
    call<Tab>('update_tab_content', { id, expectedRev, contentJson, plainText }),
  updateTabSettings: (id: string, settings: TasksTabSettings) =>
    call<Tab>('update_tab_settings', { id, settings }),
  duplicateTab: (id: string) => call<Tab>('duplicate_tab', { id }),
  deleteTab: (id: string) => call<void>('delete_tab', { id }),
  restoreTab: (id: string) => call<Tab>('restore_tab', { id }),
  trashDocument: (id: string, linkedTasks: LinkedTasks) =>
    call<void>('trash_document', { id, linkedTasks }),
  documentMovePreview: (id: string) => call<MovePreview>('document_move_preview', { id }),
  setDocumentInSidebar: (id: string, inSidebar: boolean) =>
    call<void>('set_document_in_sidebar', { id, inSidebar }),

  // Tasks
  listTasks: (query: Partial<TaskQuery> = {}) =>
    call<Task[]>('list_tasks', { query: { view: 'all', ...query } }),
  listDocumentTasks: (documentId: string, show: TasksTabShow, sort: TasksTabSort) =>
    call<Task[]>('list_document_tasks', { documentId, show, sort }),
  countCompletedTasks: (spaceId: string | null = null) =>
    call<number>('count_completed_tasks', { spaceId }),
  getTask: (id: string) => call<TaskDetail>('get_task', { id }),
  createTask: (input: Partial<CreateTask> & { title: string }) =>
    call<Task>('create_task', { input: { description: '', ...input } }),
  updateTaskText: (id: string, expectedRev: number, patch: UpdateTaskText) =>
    call<Task>('update_task_text', { id, expectedRev, patch }),
  setTaskCompleted: (id: string, completed: boolean) =>
    call<Task>('set_task_completed', { id, completed }),
  setTaskDueDate: (id: string, dueDate: string | null) =>
    call<Task>('set_task_due_date', { id, dueDate }),
  moveTask: (id: string, spaceId: string) => call<Task>('move_task', { id, spaceId }),
  setTaskDocument: (id: string, documentId: string | null) =>
    call<Task>('set_task_document', { id, documentId }),
  reorderTasks: (ids: string[]) => call<void>('reorder_tasks', { ids }),
  trashTask: (id: string) => call<void>('trash_task', { id }),
  /** Resolves to `true` when the task came back without its document. */
  restoreTask: (id: string) => call<boolean>('restore_task', { id }),
  purgeTask: (id: string) => call<void>('purge_task', { id }),
  setTaskTriaged: (id: string, triaged: boolean) => call<void>('set_task_triaged', { id, triaged }),
  setTaskTags: (id: string, tags: string[]) => call<string[]>('set_task_tags', { id, tags }),

  // Inbox, trash, tags, search
  listInbox: (spaceId: string | null = null) => call<InboxItem[]>('list_inbox', { spaceId }),
  inboxCount: (spaceId: string | null = null) => call<number>('inbox_count', { spaceId }),
  markInboxTriaged: (spaceId: string | null = null) =>
    call<void>('mark_inbox_triaged', { spaceId }),
  listTrash: () => call<TrashItem[]>('list_trash'),
  emptyTrash: () => call<void>('empty_trash'),
  listTags: () => call<Tag[]>('list_tags'),
  search: (query: string, spaceId: string | null = null) =>
    call<SearchResults>('search', { query, spaceId }),

  // Export and backup (native dialogs are opened by Rust)
  exportData: () => call<ExportData>('export_data'),
  /** Resolves to the chosen folder, or null when cancelled. */
  chooseExportFolder: () => call<string | null>('choose_export_folder'),
  writeExport: (folderName: string, files: ExportFile[]) =>
    call<string>('write_export', { folderName, files }),
  /** Resolves to the backup file path, or null when cancelled. */
  backupDatabase: () => call<string | null>('backup_database'),

  // Settings and capture drafts
  getSettings: () => call<Settings>('get_settings'),
  updateSettings: (patch: Partial<Settings>) => call<Settings>('update_settings', { patch }),
  rememberCaptureSpace: (spaceId: string) => call<void>('remember_capture_space', { spaceId }),
  getCaptureDraft: () => call<CaptureDraft | null>('get_capture_draft'),
  saveCaptureDraft: (draft: CaptureDraft) => call<void>('save_capture_draft', { draft }),
  clearCaptureDraft: () => call<void>('clear_capture_draft'),
} as const;
