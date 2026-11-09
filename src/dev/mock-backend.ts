/**
 * Dev-only in-memory implementation of every Rust command called by `src/lib/ipc/api.ts`, so
 * the UI runs in a plain browser (see `install.ts` and docs/architecture.md#browser-preview).
 * Semantics follow `src-tauri/src/services/*` closely enough for UI work: writes
 * run on a copy of the store (a failed command changes nothing, like a rolled-back
 * transaction) and report the same `ChangeSet` the Rust side broadcasts as `piw://changed`.
 */
import { detectPlatform } from '@/app/theme';
import { todayString } from '@/lib/dates';
import type { AppStatus } from '@/lib/ipc/bindings/AppStatus';
import type { CaptureDraft } from '@/lib/ipc/bindings/CaptureDraft';
import type { CaptureMode } from '@/lib/ipc/bindings/CaptureMode';
import type { ChangeSet } from '@/lib/ipc/bindings/ChangeSet';
import type { ColorName } from '@/lib/ipc/bindings/ColorName';
import type { CreateDocument } from '@/lib/ipc/bindings/CreateDocument';
import type { CreateNote } from '@/lib/ipc/bindings/CreateNote';
import type { CreateTask } from '@/lib/ipc/bindings/CreateTask';
import type { Document } from '@/lib/ipc/bindings/Document';
import type { EntityKind } from '@/lib/ipc/bindings/EntityKind';
import type { ExportData } from '@/lib/ipc/bindings/ExportData';
import type { ExportFile } from '@/lib/ipc/bindings/ExportFile';
import type { InboxItem } from '@/lib/ipc/bindings/InboxItem';
import type { LinkedTasks } from '@/lib/ipc/bindings/LinkedTasks';
import type { MovePreview } from '@/lib/ipc/bindings/MovePreview';
import type { Note } from '@/lib/ipc/bindings/Note';
import type { NoteListItem } from '@/lib/ipc/bindings/NoteListItem';
import type { NoteQuery } from '@/lib/ipc/bindings/NoteQuery';
import type { PinnedItem } from '@/lib/ipc/bindings/PinnedItem';
import type { PlatformInfo } from '@/lib/ipc/bindings/PlatformInfo';
import type { SearchResults } from '@/lib/ipc/bindings/SearchResults';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { ShortcutStatus } from '@/lib/ipc/bindings/ShortcutStatus';
import type { Space } from '@/lib/ipc/bindings/Space';
import type { StickyRecord } from '@/lib/ipc/bindings/StickyRecord';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import type { Tab } from '@/lib/ipc/bindings/Tab';
import type { TabKind } from '@/lib/ipc/bindings/TabKind';
import type { Tag } from '@/lib/ipc/bindings/Tag';
import type { Task } from '@/lib/ipc/bindings/Task';
import type { TaskDetail } from '@/lib/ipc/bindings/TaskDetail';
import type { TaskQuery } from '@/lib/ipc/bindings/TaskQuery';
import type { TasksTabSettings } from '@/lib/ipc/bindings/TasksTabSettings';
import type { TasksTabShow } from '@/lib/ipc/bindings/TasksTabShow';
import type { TasksTabSort } from '@/lib/ipc/bindings/TasksTabSort';
import type { TrashItem } from '@/lib/ipc/bindings/TrashItem';
import type { UpdateNoteText } from '@/lib/ipc/bindings/UpdateNoteText';
import type { UpdateTaskText } from '@/lib/ipc/bindings/UpdateTaskText';
import packageJson from '../../package.json';
import { search } from './mock-search';
import {
  byText,
  conflict,
  DEFAULT_SETTINGS,
  DEFAULT_TAB_TITLE,
  DEFAULT_TASKS_TAB_SETTINGS,
  displayTitle,
  documentTabs,
  fail,
  findNote,
  findTask,
  getDocumentRow,
  getNoteRow,
  getTabRow,
  getTaskRow,
  invalid,
  liveDocumentSpace,
  newId,
  nextOrder,
  normalizeTag,
  notFound,
  now,
  ORDER_STEP,
  plainTextToDocJson,
  requireDate,
  requireName,
  requireSameIds,
  resolveSpace,
  sortTags,
  STICKY_DEFAULT_HEIGHT,
  STICKY_DEFAULT_WIDTH,
  type NoteRow,
  type StickyRow,
  type Store,
  type TabRow,
  type TaskRow,
  toListItem,
  toNote,
  toTab,
  toTask,
} from './mock-store';

const APP_VERSION = packageJson.version;
const SCHEMA_VERSION = 1;
const EXPORT_FORMAT_VERSION = 1;
/** Above this many open stickies the workspace shows a memory warning. */
const STICKY_SOFT_LIMIT = 8;

type Empty = Record<string, never>;
type Id = { id: string };
type Target = { target: StickyTarget };
type SpaceFilter = { spaceId: string | null };

/** `[arguments, result]` of every command, with argument names exactly as `api.ts` passes them. */
export interface Commands {
  // App and platform
  app_status: [Empty, AppStatus];
  platform_info: [Empty, PlatformInfo];
  show_capture: [{ mode: CaptureMode }, null];
  hide_capture: [Empty, null];
  open_link: [{ url: string }, null];
  open_in_workspace: [Target, null];
  retry_shortcut: [Empty, null];
  quit_app: [Empty, null];
  // Stickies
  open_sticky: [Target, number];
  close_sticky: [Target, null];
  unpin_sticky: [Target, null];
  set_sticky_always_on_top: [Target & { enabled: boolean }, null];
  set_sticky_color: [Target & { color: ColorName | null }, null];
  get_sticky: [Target, StickyRecord | null];
  list_pinned: [SpaceFilter, PinnedItem[]];
  reset_sticky_positions: [Empty, null];
  // Spaces
  list_spaces: [Empty, Space[]];
  create_space: [{ name: string; color: ColorName | null }, Space];
  rename_space: [Id & { name: string }, Space];
  set_space_color: [Id & { color: ColorName | null }, Space];
  set_default_space: [Id, null];
  space_item_count: [Id, number];
  delete_space: [Id & { moveTo: string }, null];
  // Notes
  list_notes: [{ query: NoteQuery }, NoteListItem[]];
  get_note: [Id, Note];
  create_note: [{ input: CreateNote }, Note];
  update_note_text: [Id & { expectedRev: number; patch: UpdateNoteText }, Note];
  discard_note_if_empty: [Id, boolean];
  set_note_archived: [Id & { archived: boolean }, Note];
  move_note: [Id & { spaceId: string }, Note];
  trash_note: [Id, null];
  restore_note: [Id, boolean];
  purge_note: [Id, null];
  set_note_triaged: [Id & { triaged: boolean }, null];
  set_note_tags: [Id & { tags: string[] }, string[]];
  // Documents
  get_document: [Id, Document];
  get_tab: [Id, Tab];
  create_document: [{ input: CreateDocument }, Document];
  convert_note_to_document: [
    Id & { contentJson: string | null; plainText: string | null },
    Document,
  ];
  revert_document_conversion: [Id & { title: string; body: string }, Note];
  create_tab: [{ documentId: string; kind: TabKind; title: string }, Tab];
  rename_tab: [Id & { title: string }, Tab];
  reorder_tabs: [{ documentId: string; ids: string[] }, null];
  update_tab_content: [Id & { expectedRev: number; contentJson: string; plainText: string }, Tab];
  update_tab_settings: [Id & { settings: TasksTabSettings }, Tab];
  duplicate_tab: [Id, Tab];
  delete_tab: [Id, null];
  restore_tab: [Id, Tab];
  trash_document: [Id & { linkedTasks: LinkedTasks }, null];
  document_move_preview: [Id, MovePreview];
  set_document_in_sidebar: [Id & { inSidebar: boolean }, null];
  // Tasks
  list_tasks: [{ query: TaskQuery }, Task[]];
  list_document_tasks: [{ documentId: string; show: TasksTabShow; sort: TasksTabSort }, Task[]];
  count_completed_tasks: [SpaceFilter, number];
  get_task: [Id, TaskDetail];
  create_task: [{ input: CreateTask }, Task];
  update_task_text: [Id & { expectedRev: number; patch: UpdateTaskText }, Task];
  set_task_completed: [Id & { completed: boolean }, Task];
  set_task_due_date: [Id & { dueDate: string | null }, Task];
  move_task: [Id & { spaceId: string }, Task];
  set_task_document: [Id & { documentId: string | null }, Task];
  reorder_tasks: [{ ids: string[] }, null];
  trash_task: [Id, null];
  restore_task: [Id, boolean];
  purge_task: [Id, null];
  set_task_triaged: [Id & { triaged: boolean }, null];
  set_task_tags: [Id & { tags: string[] }, string[]];
  // Inbox, trash, tags, search
  list_inbox: [SpaceFilter, InboxItem[]];
  inbox_count: [SpaceFilter, number];
  mark_inbox_triaged: [SpaceFilter, null];
  list_trash: [Empty, TrashItem[]];
  empty_trash: [Empty, null];
  list_tags: [Empty, Tag[]];
  search: [{ query: string; spaceId: string | null }, SearchResults];
  // Export and backup
  export_data: [Empty, ExportData];
  choose_export_folder: [Empty, string | null];
  write_export: [{ folderName: string; files: ExportFile[] }, string];
  backup_database: [Empty, string | null];
  // Settings and capture drafts
  get_settings: [Empty, Settings];
  update_settings: [{ patch: Partial<Settings> }, Settings];
  remember_capture_space: [{ spaceId: string }, null];
  get_capture_draft: [Empty, CaptureDraft | null];
  save_capture_draft: [{ draft: CaptureDraft }, null];
  clear_capture_draft: [Empty, null];
}

export type Command = keyof Commands;

/** What the backend asks of the page it runs in (windows, events, logging). */
export interface MockHost {
  /** Shows a sticky window ("Pin to desktop"). */
  openSticky(target: StickyTarget): void;
  /** Closes a sticky window if it is open. */
  closeSticky(target: StickyTarget): void;
  /** Sends an app event to the window with `label`, or to every window when `null`. */
  emit(label: string | null, event: string, payload: unknown): void;
  /** Called after every committed write; `changes` is what Rust broadcasts as `piw://changed`. */
  commit(changes: ChangeSet): void;
  log(message: string): void;
}

export interface MockBackendOptions {
  /** Label of the window this backend serves (the `origin` of its change sets). */
  label: string;
  host: MockHost;
  /** Per-page theme override (`?theme=`): settings always report it. */
  theme?: Settings['theme'] | null;
}

export interface MockBackend {
  /** Runs a command like Tauri would: JSON-cloned arguments and result, errors thrown. */
  invoke(command: string, args?: unknown): unknown;
  getStore(): Store;
  /** Replaces the data (e.g. with a peer window's after it wrote). */
  setStore(store: Store): void;
}

interface Ctx {
  store: Store;
  host: MockHost;
  /** Records an entity touched by a write (deduplicated, like `ChangeSet::add`). */
  touch(kind: EntityKind, id: string): void;
  theme: Settings['theme'] | null;
}

interface Handler<A, R> {
  write: boolean;
  run(args: A, ctx: Ctx): R;
}

type Handlers = { [K in Command]: Handler<Commands[K][0], Commands[K][1]> };

const read = <A, R>(run: (args: A, ctx: Ctx) => R): Handler<A, R> => ({ write: false, run });
const write = <A, R>(run: (args: A, ctx: Ctx) => R): Handler<A, R> => ({ write: true, run });

// ---------------------------------------------------------------------------------------------
// Shared rules

const same = (a: StickyTarget, b: StickyTarget) => a.kind === b.kind && a.id === b.id;
const stickyLabel = (target: StickyTarget) => `sticky:${target.kind}:${target.id}`;
const byManual = (a: TaskRow, b: TaskRow) =>
  a.sortOrder - b.sortOrder || byText(a.createdAt, b.createdAt);
const byDue = (a: TaskRow, b: TaskRow) =>
  Number(a.dueDate === null) - Number(b.dueDate === null) ||
  byText(a.dueDate ?? '', b.dueDate ?? '') ||
  byManual(a, b);
const newestFirst = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  byText(b.createdAt, a.createdAt) || byText(b.id, a.id);

function safeDocumentSpace(store: Store, documentId: string): string | null {
  const doc = findNote(store, documentId);
  return doc?.kind === 'document' && doc.deletedAt === null ? doc.spaceId : null;
}

function getSpace(store: Store, id: string): Space {
  return store.spaces.find((space) => space.id === id) ?? notFound('space');
}

function sortedSpaces(store: Store): Space[] {
  return [...store.spaces].sort(
    (a, b) => a.sortOrder - b.sortOrder || byText(a.createdAt, b.createdAt),
  );
}

function requireUniqueSpaceName(store: Store, name: string, except: string | null): void {
  const taken = store.spaces.some(
    (space) => space.id !== except && space.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) invalid('A space with that name already exists');
}

function toDocument(store: Store, row: NoteRow): Document {
  return { note: toNote(store, row), tabs: documentTabs(store, row.id).map(toTab) };
}

/** Changes for a task: itself, its parent and its document (`tasks::changes_for`). */
function touchTask(ctx: Ctx, task: TaskRow): void {
  ctx.touch('task', task.id);
  if (task.parentTaskId !== null) ctx.touch('task', task.parentTaskId);
  if (task.documentId !== null) ctx.touch('note', task.documentId);
}

function touchDocumentTasks(ctx: Ctx, documentId: string): void {
  for (const task of ctx.store.tasks) {
    if (task.documentId === documentId) ctx.touch('task', task.id);
  }
}

function touchSticky(ctx: Ctx, target: StickyTarget): void {
  const kind: EntityKind =
    target.kind === 'note' ? 'note' : target.kind === 'task' ? 'task' : 'tab';
  ctx.touch(kind, target.id);
  ctx.touch('sticky', stickyLabel(target));
}

function touchDocument(store: Store, documentId: string): void {
  const doc = findNote(store, documentId);
  if (doc) doc.updatedAt = now();
}

function requireTopLevel(task: TaskRow): void {
  if (task.parentTaskId !== null) invalid('subtasks follow their parent task');
}

function requireLiveDocument(store: Store, documentId: string): NoteRow {
  const doc = getDocumentRow(store, documentId);
  if (doc.deletedAt !== null) invalid('restore the document from Trash first');
  return doc;
}

function validateContent(contentJson: string): void {
  let value: unknown;
  try {
    value = JSON.parse(contentJson);
  } catch {
    invalid('tab content is not valid JSON');
  }
  if (typeof value !== 'object' || value === null || (value as { type?: unknown }).type !== 'doc') {
    invalid('tab content must be an editor document');
  }
}

function insertTab(
  store: Store,
  documentId: string,
  kind: TabKind,
  title: string,
  content: { json: string; text: string } | null,
): TabRow {
  const ts = now();
  const row: TabRow = {
    id: newId(),
    documentId,
    title,
    kind,
    sortOrder: nextOrder(documentTabs(store, documentId).map((tab) => tab.sortOrder)),
    contentJson: kind === 'content' ? (content?.json ?? plainTextToDocJson('')) : null,
    plainText: kind === 'content' ? (content?.text ?? '') : '',
    settings: kind === 'tasks' ? { ...DEFAULT_TASKS_TAB_SETTINGS } : null,
    rev: 1,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  };
  store.tabs.push(row);
  return row;
}

function newNoteRow(fields: Pick<NoteRow, 'spaceId' | 'kind' | 'title' | 'body'>): NoteRow {
  const ts = now();
  return {
    id: newId(),
    documentId: null,
    sidebarOrder: null,
    rev: 1,
    tags: [],
    triagedAt: null,
    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,
    deletedAt: null,
    ...fields,
  };
}

/** Deletes notes for good, with the cascades of the schema (tabs; links set to NULL). */
function deleteNotes(store: Store, ids: Set<string>): void {
  store.notes = store.notes.filter((note) => !ids.has(note.id));
  store.tabs = store.tabs.filter((tab) => !ids.has(tab.documentId));
  for (const row of [...store.notes, ...store.tasks]) {
    if (row.documentId !== null && ids.has(row.documentId)) row.documentId = null;
  }
}

/** Deletes tasks for good, with their subtasks (`ON DELETE CASCADE`). */
function deleteTasks(store: Store, ids: Set<string>): void {
  store.tasks = store.tasks.filter(
    (task) => !ids.has(task.id) && !(task.parentTaskId !== null && ids.has(task.parentTaskId)),
  );
}

function setTags(ctx: Ctx, kind: 'note' | 'task', id: string, names: string[]): string[] {
  const row = kind === 'note' ? findNote(ctx.store, id) : findTask(ctx.store, id);
  if (!row) notFound('item');
  const normalized: string[] = [];
  for (const name of names) {
    const tag = normalizeTag(name);
    if (!normalized.some((n) => n.toLowerCase() === tag.toLowerCase())) normalized.push(tag);
  }
  if (normalized.length > 20) invalid('an item can have at most 20 tags');
  // Existing tags keep their spelling (names are unique regardless of case).
  row.tags = normalized.map((name) => {
    const existing = ctx.store.tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.name;
    ctx.store.tags.push({ id: newId(), name });
    return name;
  });
  const used = new Set(
    [...ctx.store.notes, ...ctx.store.tasks].flatMap((item) =>
      item.tags.map((t) => t.toLowerCase()),
    ),
  );
  ctx.store.tags = ctx.store.tags.filter((tag) => used.has(tag.name.toLowerCase()));
  row.updatedAt = now();
  ctx.touch(kind, id);
  ctx.touch('tag', '*');
  return sortTags(row.tags);
}

// ---------------------------------------------------------------------------------------------
// Documents, tasks, inbox and trash

function trashDocument(ctx: Ctx, id: string, linked: LinkedTasks): void {
  const doc = getDocumentRow(ctx.store, id);
  if (doc.deletedAt !== null) return;
  const ts = now();
  ctx.touch('note', id);
  touchDocumentTasks(ctx, id);
  doc.deletedAt = ts;
  for (const task of ctx.store.tasks) {
    if (task.documentId !== id) continue;
    if (linked === 'keep') {
      task.documentId = null;
      task.updatedAt = ts;
    } else if (task.deletedAt === null) {
      task.deletedAt = ts;
    }
  }
  for (const note of ctx.store.notes) {
    if (note.documentId !== id) continue;
    ctx.touch('note', note.id);
    note.documentId = null;
    note.updatedAt = ts;
  }
}

function restoreDocument(ctx: Ctx, id: string): void {
  const doc = getDocumentRow(ctx.store, id);
  const deletedAt = doc.deletedAt;
  if (deletedAt === null) return;
  ctx.touch('note', id);
  touchDocumentTasks(ctx, id);
  for (const task of ctx.store.tasks) {
    if (task.documentId === id && task.deletedAt === deletedAt) task.deletedAt = null;
  }
  doc.deletedAt = null;
  doc.updatedAt = now();
}

/** Moves a document with its tasks (and their subtasks) and grouped notes. */
function moveDocument(ctx: Ctx, id: string, spaceId: string): Document {
  getDocumentRow(ctx.store, id);
  resolveSpace(ctx.store, spaceId);
  const ts = now();
  ctx.touch('note', id);
  touchDocumentTasks(ctx, id);
  for (const note of ctx.store.notes) {
    if (note.id !== id && note.documentId !== id) continue;
    note.spaceId = spaceId;
    note.updatedAt = ts;
    if (note.documentId === id) ctx.touch('note', note.id);
  }
  const linked = new Set(ctx.store.tasks.filter((t) => t.documentId === id).map((t) => t.id));
  for (const task of ctx.store.tasks) {
    if (task.documentId === id || (task.parentTaskId !== null && linked.has(task.parentTaskId))) {
      task.spaceId = spaceId;
      task.updatedAt = ts;
    }
  }
  return toDocument(ctx.store, getDocumentRow(ctx.store, id));
}

/** Restores a task; a subtask brings its parent back. Returns whether it lost its document. */
function restoreTask(ctx: Ctx, id: string): boolean {
  const task = getTaskRow(ctx.store, id);
  touchTask(ctx, task);
  if (task.parentTaskId !== null) {
    const unlinked = restoreTask(ctx, task.parentTaskId);
    task.deletedAt = null;
    return unlinked;
  }
  const alive = task.documentId === null || safeDocumentSpace(ctx.store, task.documentId) !== null;
  task.deletedAt = null;
  task.updatedAt = now();
  if (!alive) {
    for (const t of ctx.store.tasks) {
      if (t.id === id || t.parentTaskId === id) t.documentId = null;
    }
  }
  return !alive;
}

function listTasks(store: Store, query: TaskQuery, today: string): Task[] {
  const view = query.view ?? 'all';
  const rows = store.tasks.filter((t) => {
    if (t.deletedAt !== null || t.parentTaskId !== null) return false;
    if (query.spaceId != null && t.spaceId !== query.spaceId) return false;
    if (query.documentId != null && t.documentId !== query.documentId) return false;
    if (view === 'completed') return t.status === 'completed';
    if (t.status !== 'open') return false;
    if (view === 'today') return t.dueDate !== null && t.dueDate <= today;
    if (view === 'upcoming') return t.dueDate !== null && t.dueDate > today;
    return true;
  });
  rows.sort(
    view === 'completed'
      ? (a, b) => byText(b.completedAt ?? '', a.completedAt ?? '') || byText(b.id, a.id)
      : byDue,
  );
  return rows.map((row) => toTask(store, row));
}

function listNotes(store: Store, query: NoteQuery): NoteListItem[] {
  const rows = store.notes.filter(
    (n) =>
      n.deletedAt === null &&
      (query.scope === 'archived' ? n.archivedAt !== null : n.archivedAt === null) &&
      (query.spaceId == null || n.spaceId === query.spaceId) &&
      (!query.documentsOnly || n.kind === 'document'),
  );
  if (query.sort === 'created') rows.sort(newestFirst);
  else rows.sort((a, b) => byText(b.updatedAt, a.updatedAt) || byText(b.id, a.id));
  const items = rows.map((row) => toListItem(store, row));
  if (query.sort === 'title') {
    items.sort((a, b) => byText(a.displayTitle.toLowerCase(), b.displayTitle.toLowerCase()));
  }
  return items;
}

function inboxRows(store: Store, spaceId: string | null) {
  const inSpace = (id: string) => spaceId === null || id === spaceId;
  const notes = store.notes.filter(
    (n) =>
      n.kind === 'quick_note' &&
      n.documentId === null &&
      n.deletedAt === null &&
      n.archivedAt === null &&
      n.triagedAt === null &&
      inSpace(n.spaceId),
  );
  const tasks = store.tasks.filter(
    (t) =>
      t.parentTaskId === null &&
      t.documentId === null &&
      t.deletedAt === null &&
      t.status === 'open' &&
      t.triagedAt === null &&
      inSpace(t.spaceId),
  );
  return { notes, tasks };
}

function listTags(store: Store): Tag[] {
  return [...store.tags]
    .sort((a, b) => byText(a.name.toLowerCase(), b.name.toLowerCase()))
    .map((tag) => {
      const key = tag.name.toLowerCase();
      const usage = [...store.notes, ...store.tasks].filter((item) =>
        item.tags.some((t) => t.toLowerCase() === key),
      ).length;
      return { id: tag.id, name: tag.name, usage };
    });
}

function trashItems(store: Store): TrashItem[] {
  const items: { deletedAt: string; item: TrashItem }[] = [];
  for (const note of store.notes) {
    if (note.deletedAt === null) continue;
    items.push({
      deletedAt: note.deletedAt,
      item: { type: 'note', note: toListItem(store, note) },
    });
  }
  for (const task of store.tasks) {
    if (task.deletedAt === null) continue;
    const parent = task.parentTaskId === null ? undefined : findTask(store, task.parentTaskId);
    if (parent?.deletedAt != null) continue;
    items.push({ deletedAt: task.deletedAt, item: { type: 'task', task: toTask(store, task) } });
  }
  return items.sort((a, b) => byText(b.deletedAt, a.deletedAt)).map((entry) => entry.item);
}

// ---------------------------------------------------------------------------------------------
// Stickies

function findSticky(store: Store, target: StickyTarget): StickyRow | undefined {
  return store.stickies.find((sticky) => same(sticky.target, target));
}

/** Checks that a sticky target exists outside Trash (`stickies::live_target`). */
function requireLiveTarget(store: Store, target: StickyTarget): void {
  const live = () => {
    if (target.kind === 'note') {
      const note = findNote(store, target.id);
      return note?.kind === 'quick_note' && note.deletedAt === null;
    }
    if (target.kind === 'task') return findTask(store, target.id)?.deletedAt === null;
    const tab = store.tabs.find((t) => t.id === target.id);
    const doc = tab && findNote(store, tab.documentId);
    return tab?.kind === 'tasks' && tab.deletedAt === null && doc?.deletedAt === null;
  };
  if (!live()) notFound('item');
}

function pinnedItem(store: Store, sticky: StickyRow): PinnedItem | null {
  const base = {
    target: { ...sticky.target },
    isOpen: sticky.isOpen,
    alwaysOnTop: sticky.placement.alwaysOnTop,
    color: sticky.color,
    updatedAt: sticky.updatedAt,
  };
  const { kind, id } = sticky.target;
  if (kind === 'note') {
    const note = findNote(store, id);
    if (!note || note.deletedAt !== null) return null;
    const title = displayTitle(note.title, note.body);
    return { ...base, title, documentTitle: null, spaceId: note.spaceId, completed: false };
  }
  if (kind === 'task') {
    const task = findTask(store, id);
    if (!task || task.deletedAt !== null) return null;
    const doc = task.documentId === null ? undefined : findNote(store, task.documentId);
    return {
      ...base,
      title: task.title,
      documentTitle: doc?.title ?? null,
      spaceId: task.spaceId,
      completed: task.status === 'completed',
    };
  }
  const tab = store.tabs.find((t) => t.id === id && t.deletedAt === null);
  const doc = tab && findNote(store, tab.documentId);
  if (!tab || !doc || doc.deletedAt !== null) return null;
  return {
    ...base,
    title: tab.title,
    documentTitle: doc.title,
    spaceId: doc.spaceId,
    completed: false,
  };
}

/** Closes windows whose item went to Trash; reopens a restored item's sticky if it was open. */
function reconcileStickies(ctx: Ctx, restored: StickyTarget | null): void {
  for (const sticky of ctx.store.stickies) {
    if (pinnedItem(ctx.store, sticky) === null) ctx.host.closeSticky(sticky.target);
    else if (restored && same(sticky.target, restored) && sticky.isOpen) {
      ctx.host.openSticky(restored);
    }
  }
}

function updateSticky(ctx: Ctx, target: StickyTarget, patch: (row: StickyRow) => void): null {
  const row = findSticky(ctx.store, target);
  if (row) {
    patch(row);
    row.updatedAt = now();
  }
  touchSticky(ctx, target);
  return null;
}

// ---------------------------------------------------------------------------------------------
// Platform

function shortcutStatus(settings: Settings): ShortcutStatus {
  return settings.captureShortcut === null
    ? { state: 'disabled' }
    : { state: 'registered', accelerator: settings.captureShortcut, backend: 'native' };
}

function platformInfo(settings: Settings): PlatformInfo {
  const os = detectPlatform();
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(window.screen.width * scale);
  const height = Math.round(window.screen.height * scale);
  return {
    environment: {
      os,
      displayServer: os === 'linux' ? 'wayland' : 'native',
      waylandSession: os === 'linux',
      desktop: os === 'linux' ? 'KDE' : null,
    },
    shortcut: shortcutStatus(settings),
    monitors: [
      {
        name: 'Built-in display',
        scaleFactor: scale,
        bounds: { x: 0, y: 0, width, height },
        workArea: { x: 0, y: 0, width, height: Math.max(0, height - Math.round(40 * scale)) },
      },
    ],
  };
}

/** A plausible folder for paths shown in Settings › Data. */
function homeFolder(): string {
  const os = detectPlatform();
  if (os === 'windows') return 'C:\\Users\\demo';
  return os === 'macos' ? '/Users/demo' : '/home/demo';
}

function dataPath(): string {
  const os = detectPlatform();
  if (os === 'windows') return `${homeFolder()}\\AppData\\Roaming\\app.piw.Piw\\piw.sqlite3`;
  if (os === 'macos') return `${homeFolder()}/Library/Application Support/app.piw.Piw/piw.sqlite3`;
  return `${homeFolder()}/.local/share/app.piw.Piw/piw.sqlite3`;
}

function joinPath(folder: string, name: string): string {
  return `${folder}${detectPlatform() === 'windows' ? '\\' : '/'}${name}`;
}

// ---------------------------------------------------------------------------------------------
// Commands

const HANDLERS: Handlers = {
  // App and platform ---------------------------------------------------------------------------
  app_status: read(() => ({
    version: APP_VERSION,
    dataError: null,
    dataPath: dataPath(),
    schemaVersion: SCHEMA_VERSION,
  })),
  platform_info: read((_, { store }) => platformInfo(store.settings)),
  show_capture: read(({ mode }, { host }) => {
    host.log(`show_capture: ${mode} (the dev mock has no capture window)`);
    return null;
  }),
  hide_capture: read(() => null),
  open_link: read(({ url }, { host }) => {
    if (!/^(https?:\/\/|mailto:)/i.test(url)) invalid('only web and email links can be opened');
    host.log(`open_link: ${url} (not opened by the dev mock)`);
    return null;
  }),
  open_in_workspace: read(({ target }, { host }) => {
    host.emit('main', 'piw://open', target);
    return null;
  }),
  retry_shortcut: read((_, { store, host }) => {
    host.emit(null, 'piw://shortcut/status', shortcutStatus(store.settings));
    return null;
  }),
  quit_app: read((_, { host }) => {
    host.log('quit_app: ignored in the browser');
    return null;
  }),

  // Stickies -----------------------------------------------------------------------------------
  open_sticky: write(({ target }, ctx) => {
    requireLiveTarget(ctx.store, target);
    const ts = now();
    const row = findSticky(ctx.store, target);
    if (row) {
      row.isOpen = true;
      row.updatedAt = ts;
    } else {
      ctx.store.stickies.push({
        target: { kind: target.kind, id: target.id },
        placement: {
          x: null,
          y: null,
          width: STICKY_DEFAULT_WIDTH,
          height: STICKY_DEFAULT_HEIGHT,
          alwaysOnTop: false,
        },
        color: null,
        isOpen: true,
        createdAt: ts,
        updatedAt: ts,
      });
    }
    touchSticky(ctx, target);
    ctx.host.openSticky(target);
    const count = ctx.store.stickies.filter((sticky) => sticky.isOpen).length;
    if (count > STICKY_SOFT_LIMIT) ctx.host.emit('main', 'piw://stickies/many', count);
    return count;
  }),
  close_sticky: write(({ target }, ctx) => {
    updateSticky(ctx, target, (row) => (row.isOpen = false));
    ctx.host.closeSticky(target);
    return null;
  }),
  unpin_sticky: write(({ target }, ctx) => {
    ctx.store.stickies = ctx.store.stickies.filter((sticky) => !same(sticky.target, target));
    touchSticky(ctx, target);
    ctx.host.closeSticky(target);
    return null;
  }),
  set_sticky_always_on_top: write(({ target, enabled }, ctx) =>
    updateSticky(ctx, target, (row) => (row.placement.alwaysOnTop = enabled)),
  ),
  set_sticky_color: write(({ target, color }, ctx) =>
    updateSticky(ctx, target, (row) => (row.color = color)),
  ),
  get_sticky: read(({ target }, { store }) => {
    const row = findSticky(store, target);
    return row ? { placement: row.placement, color: row.color, isOpen: row.isOpen } : null;
  }),
  list_pinned: read(({ spaceId }, { store }) =>
    [...store.stickies]
      .sort((a, b) => byText(b.updatedAt, a.updatedAt))
      .map((sticky) => pinnedItem(store, sticky))
      .filter((item): item is PinnedItem => item !== null)
      .filter((item) => spaceId == null || item.spaceId === spaceId),
  ),
  reset_sticky_positions: write((_, ctx) => {
    for (const sticky of ctx.store.stickies) {
      sticky.placement.x = null;
      sticky.placement.y = null;
    }
    ctx.touch('sticky', '*');
    return null;
  }),

  // Spaces -------------------------------------------------------------------------------------
  list_spaces: read((_, { store }) => sortedSpaces(store)),
  create_space: write(({ name, color }, ctx) => {
    const clean = requireName(name, 'Space name', 80);
    requireUniqueSpaceName(ctx.store, clean, null);
    const ts = now();
    const space: Space = {
      id: newId(),
      name: clean,
      color: color ?? null,
      sortOrder: nextOrder(ctx.store.spaces.map((s) => s.sortOrder)),
      isDefault: false,
      createdAt: ts,
      updatedAt: ts,
    };
    ctx.store.spaces.push(space);
    ctx.touch('space', space.id);
    return space;
  }),
  rename_space: write(({ id, name }, ctx) => {
    const clean = requireName(name, 'Space name', 80);
    const space = getSpace(ctx.store, id);
    requireUniqueSpaceName(ctx.store, clean, id);
    space.name = clean;
    space.updatedAt = now();
    ctx.touch('space', id);
    return space;
  }),
  set_space_color: write(({ id, color }, ctx) => {
    const space = getSpace(ctx.store, id);
    space.color = color;
    space.updatedAt = now();
    ctx.touch('space', id);
    return space;
  }),
  set_default_space: write(({ id }, ctx) => {
    const target = getSpace(ctx.store, id);
    const ts = now();
    for (const space of ctx.store.spaces) {
      if (space.isDefault) {
        space.isDefault = false;
        space.updatedAt = ts;
      }
    }
    target.isDefault = true;
    target.updatedAt = ts;
    ctx.touch('space', id);
    return null;
  }),
  space_item_count: read(
    ({ id }, { store }) =>
      store.notes.filter((n) => n.spaceId === id).length +
      store.tasks.filter((t) => t.spaceId === id).length,
  ),
  delete_space: write(({ id, moveTo }, ctx) => {
    if (id === moveTo) invalid('choose another space for the items');
    const space = getSpace(ctx.store, id);
    const target = getSpace(ctx.store, moveTo);
    const ts = now();
    ctx.touch('space', id);
    ctx.touch('space', moveTo);
    for (const note of ctx.store.notes) {
      if (note.spaceId !== id) continue;
      ctx.touch('note', note.id);
      note.spaceId = moveTo;
      note.updatedAt = ts;
    }
    for (const task of ctx.store.tasks) {
      if (task.spaceId !== id) continue;
      ctx.touch('task', task.id);
      task.spaceId = moveTo;
      task.updatedAt = ts;
    }
    ctx.store.spaces = ctx.store.spaces.filter((s) => s.id !== id);
    if (space.isDefault) {
      target.isDefault = true;
      target.updatedAt = ts;
    }
    return null;
  }),

  // Notes --------------------------------------------------------------------------------------
  list_notes: read(({ query }, { store }) => listNotes(store, query)),
  get_note: read(({ id }, { store }) => toNote(store, getNoteRow(store, id))),
  create_note: write(({ input }, ctx) => {
    const title = input.title ?? '';
    const body = input.body ?? '';
    if (!title.trim() && !body.trim()) invalid('a note needs some text');
    if (Array.from(title).length > 300) invalid('the title is too long');
    let spaceId = resolveSpace(ctx.store, input.spaceId);
    const documentId = input.documentId ?? null;
    if (documentId !== null) spaceId = liveDocumentSpace(ctx.store, documentId);
    const row = newNoteRow({ spaceId, kind: 'quick_note', title: title.trim(), body });
    row.documentId = documentId;
    ctx.store.notes.push(row);
    ctx.touch('note', row.id);
    if (documentId !== null) ctx.touch('note', documentId);
    return toNote(ctx.store, row);
  }),
  update_note_text: write(({ id, expectedRev, patch }, ctx) => {
    const note = getNoteRow(ctx.store, id);
    if (note.deletedAt !== null) invalid('restore the note from Trash before editing it');
    if (note.rev !== expectedRev) conflict('note');
    const title = patch.title == null ? note.title : patch.title.trim();
    if (Array.from(title).length > 300) invalid('the title is too long');
    if (note.kind === 'document' && !title) invalid('documents need a title');
    if (patch.body != null) {
      if (note.kind === 'document') invalid('document text lives in its tabs');
      note.body = patch.body;
    }
    note.title = title;
    note.rev += 1;
    note.updatedAt = now();
    ctx.touch('note', id);
    return toNote(ctx.store, note);
  }),
  discard_note_if_empty: write(({ id }, ctx) => {
    const note = findNote(ctx.store, id);
    const empty = note?.kind === 'quick_note' && !note.title.trim() && !note.body?.trim();
    if (!empty) return false;
    deleteNotes(ctx.store, new Set([id]));
    ctx.touch('note', id);
    return true;
  }),
  set_note_archived: write(({ id, archived }, ctx) => {
    const note = findNote(ctx.store, id);
    if (!note || note.deletedAt !== null) notFound('note');
    const ts = now();
    note.archivedAt = archived ? (note.archivedAt ?? ts) : null;
    note.updatedAt = ts;
    ctx.touch('note', id);
    if (note.kind === 'document') touchDocumentTasks(ctx, id);
    return toNote(ctx.store, note);
  }),
  move_note: write(({ id, spaceId }, ctx) => {
    const note = getNoteRow(ctx.store, id);
    if (note.kind === 'document') return moveDocument(ctx, id, spaceId).note;
    resolveSpace(ctx.store, spaceId);
    const previous = note.documentId;
    const keep = previous !== null && safeDocumentSpace(ctx.store, previous) === spaceId;
    note.spaceId = spaceId;
    if (!keep) note.documentId = null;
    note.updatedAt = now();
    ctx.touch('note', id);
    if (previous !== null) ctx.touch('note', previous);
    return toNote(ctx.store, note);
  }),
  trash_note: write(({ id }, ctx) => {
    const note = getNoteRow(ctx.store, id);
    if (note.kind === 'document') {
      trashDocument(ctx, id, 'keep');
    } else {
      note.deletedAt ??= now();
      ctx.touch('note', id);
      if (note.documentId !== null) ctx.touch('note', note.documentId);
    }
    reconcileStickies(ctx, null);
    return null;
  }),
  restore_note: write(({ id }, ctx) => {
    const note = getNoteRow(ctx.store, id);
    let unlinked = false;
    if (note.kind === 'document') {
      restoreDocument(ctx, id);
    } else {
      unlinked = note.documentId !== null && safeDocumentSpace(ctx.store, note.documentId) === null;
      note.deletedAt = null;
      note.updatedAt = now();
      if (unlinked) note.documentId = null;
      ctx.touch('note', id);
    }
    reconcileStickies(ctx, { kind: 'note', id });
    return unlinked;
  }),
  purge_note: write(({ id }, ctx) => {
    const note = findNote(ctx.store, id);
    if (note?.deletedAt == null) invalid('only items in Trash can be deleted permanently');
    deleteNotes(ctx.store, new Set([id]));
    ctx.touch('note', id);
    reconcileStickies(ctx, null);
    return null;
  }),
  set_note_triaged: write(({ id, triaged }, ctx) => {
    const note = findNote(ctx.store, id);
    if (note) note.triagedAt = triaged ? (note.triagedAt ?? now()) : null;
    ctx.touch('note', id);
    return null;
  }),
  set_note_tags: write(({ id, tags }, ctx) => setTags(ctx, 'note', id, tags)),

  // Documents ----------------------------------------------------------------------------------
  get_document: read(({ id }, { store }) => toDocument(store, getDocumentRow(store, id))),
  get_tab: read(({ id }, { store }) => toTab(getTabRow(store, id))),
  create_document: write(({ input }, ctx) => {
    const title = requireName(input.title, 'Document title', 300);
    const spaceId = resolveSpace(ctx.store, input.spaceId);
    const row = newNoteRow({ spaceId, kind: 'document', title, body: null });
    ctx.store.notes.push(row);
    const tab = insertTab(ctx.store, row.id, 'content', DEFAULT_TAB_TITLE, null);
    ctx.touch('note', row.id);
    ctx.touch('tab', tab.id);
    return toDocument(ctx.store, row);
  }),
  convert_note_to_document: write(({ id, contentJson, plainText }, ctx) => {
    const note = getNoteRow(ctx.store, id);
    if (note.kind !== 'quick_note') invalid('this is already a document');
    if (note.deletedAt !== null) invalid('restore the note from Trash first');
    const body = note.body ?? '';
    let content = { json: plainTextToDocJson(body), text: body };
    if (contentJson != null && plainText != null) {
      validateContent(contentJson);
      content = { json: contentJson, text: plainText };
    }
    const previous = note.documentId;
    note.kind = 'document';
    note.title = displayTitle(note.title, body) || 'Untitled';
    note.body = null;
    note.documentId = null;
    note.rev += 1;
    note.updatedAt = now();
    const tab = insertTab(ctx.store, id, 'content', DEFAULT_TAB_TITLE, content);
    ctx.touch('note', id);
    ctx.touch('tab', tab.id);
    if (previous !== null) ctx.touch('note', previous);
    return toDocument(ctx.store, note);
  }),
  revert_document_conversion: write(({ id, title, body }, ctx) => {
    const doc = getDocumentRow(ctx.store, id);
    const tabs = documentTabs(ctx.store, id);
    const [only] = tabs;
    const untouched = tabs.length === 1 && only?.kind === 'content' && only.rev === 1;
    const linked =
      ctx.store.tasks.some((t) => t.documentId === id) ||
      ctx.store.notes.some((n) => n.documentId === id);
    if (!untouched || linked) {
      invalid(
        "the document has changed since it was converted and can't be turned back into a note",
      );
    }
    ctx.store.tabs = ctx.store.tabs.filter((tab) => tab.documentId !== id);
    doc.kind = 'quick_note';
    doc.title = title.trim();
    doc.body = body;
    doc.sidebarOrder = null;
    doc.rev += 1;
    doc.updatedAt = now();
    ctx.touch('note', id);
    for (const tab of tabs) ctx.touch('tab', tab.id);
    return toNote(ctx.store, doc);
  }),
  create_tab: write(({ documentId, kind, title }, ctx) => {
    requireLiveDocument(ctx.store, documentId);
    const tab = insertTab(ctx.store, documentId, kind, requireName(title, 'Tab name', 80), null);
    touchDocument(ctx.store, documentId);
    ctx.touch('tab', tab.id);
    ctx.touch('note', documentId);
    return toTab(tab);
  }),
  rename_tab: write(({ id, title }, ctx) => {
    const clean = requireName(title, 'Tab name', 80);
    const tab = getTabRow(ctx.store, id);
    tab.title = clean;
    tab.updatedAt = now();
    ctx.touch('tab', id);
    ctx.touch('note', tab.documentId);
    return toTab(tab);
  }),
  reorder_tabs: write(({ documentId, ids }, ctx) => {
    const tabs = documentTabs(ctx.store, documentId);
    requireSameIds(
      ids,
      tabs.map((tab) => tab.id),
    );
    ids.forEach((id, index) => {
      getTabRow(ctx.store, id).sortOrder = index * ORDER_STEP;
      ctx.touch('tab', id);
    });
    ctx.touch('note', documentId);
    return null;
  }),
  update_tab_content: write(({ id, expectedRev, contentJson, plainText }, ctx) => {
    const tab = getTabRow(ctx.store, id);
    if (tab.kind !== 'content') invalid('only content tabs have text');
    if (tab.rev !== expectedRev) conflict('tab');
    validateContent(contentJson);
    tab.contentJson = contentJson;
    tab.plainText = plainText;
    tab.rev += 1;
    tab.updatedAt = now();
    touchDocument(ctx.store, tab.documentId);
    ctx.touch('tab', id);
    ctx.touch('note', tab.documentId);
    return toTab(tab);
  }),
  update_tab_settings: write(({ id, settings }, ctx) => {
    const tab = getTabRow(ctx.store, id);
    if (tab.kind !== 'tasks') invalid('only tasks tabs have task settings');
    tab.settings = { show: settings.show, sort: settings.sort };
    tab.updatedAt = now();
    ctx.touch('tab', id);
    ctx.touch('note', tab.documentId);
    return toTab(tab);
  }),
  duplicate_tab: write(({ id }, ctx) => {
    const tab = getTabRow(ctx.store, id);
    const title = Array.from(`${tab.title} copy`).slice(0, 80).join('');
    const content =
      tab.contentJson === null ? null : { json: tab.contentJson, text: tab.plainText };
    const copy = insertTab(ctx.store, tab.documentId, tab.kind, title, content);
    if (tab.kind === 'tasks') copy.settings = { ...(tab.settings ?? DEFAULT_TASKS_TAB_SETTINGS) };
    const order = documentTabs(ctx.store, tab.documentId)
      .map((t) => t.id)
      .filter((t) => t !== copy.id);
    const position = order.indexOf(id);
    order.splice(position < 0 ? order.length : position + 1, 0, copy.id);
    order.forEach((tabId, index) => (getTabRow(ctx.store, tabId).sortOrder = index * ORDER_STEP));
    ctx.touch('tab', copy.id);
    ctx.touch('note', tab.documentId);
    return toTab(copy);
  }),
  delete_tab: write(({ id }, ctx) => {
    const tab = getTabRow(ctx.store, id);
    if (documentTabs(ctx.store, tab.documentId).length <= 1) {
      invalid('a document needs at least one tab');
    }
    tab.deletedAt = now();
    ctx.touch('tab', id);
    ctx.touch('note', tab.documentId);
    return null;
  }),
  restore_tab: write(({ id }, ctx) => {
    const tab = ctx.store.tabs.find((t) => t.id === id) ?? notFound('tab');
    tab.deletedAt = null;
    ctx.touch('tab', id);
    ctx.touch('note', tab.documentId);
    return toTab(tab);
  }),
  trash_document: write(({ id, linkedTasks }, ctx) => {
    trashDocument(ctx, id, linkedTasks);
    reconcileStickies(ctx, null);
    return null;
  }),
  document_move_preview: read(({ id }, { store }) => {
    getDocumentRow(store, id);
    return {
      tasks: store.tasks.filter(
        (t) => t.documentId === id && t.parentTaskId === null && t.deletedAt === null,
      ).length,
      notes: store.notes.filter((n) => n.documentId === id && n.deletedAt === null).length,
    };
  }),
  set_document_in_sidebar: write(({ id, inSidebar }, ctx) => {
    const doc = getDocumentRow(ctx.store, id);
    const order = nextOrder(
      ctx.store.notes.filter((n) => n.kind === 'document').map((n) => n.sidebarOrder),
    );
    doc.sidebarOrder = inSidebar ? (doc.sidebarOrder ?? order) : null;
    ctx.touch('note', id);
    return null;
  }),

  // Tasks --------------------------------------------------------------------------------------
  list_tasks: read(({ query }, { store }) => listTasks(store, query, todayString())),
  list_document_tasks: read(({ documentId, show, sort }, { store }) =>
    store.tasks
      .filter(
        (t) =>
          t.deletedAt === null &&
          t.parentTaskId === null &&
          t.documentId === documentId &&
          (show === 'all' || t.status === (show === 'open' ? 'open' : 'completed')),
      )
      .sort(sort === 'due_date' ? byDue : byManual)
      .map((row) => toTask(store, row)),
  ),
  count_completed_tasks: read(
    ({ spaceId }, { store }) =>
      store.tasks.filter(
        (t) =>
          t.deletedAt === null &&
          t.parentTaskId === null &&
          t.status === 'completed' &&
          (spaceId == null || t.spaceId === spaceId),
      ).length,
  ),
  get_task: read(({ id }, { store }) => {
    const task = getTaskRow(store, id);
    const parent = task.parentTaskId === null ? null : getTaskRow(store, task.parentTaskId);
    return {
      task: toTask(store, task),
      subtasks: store.tasks
        .filter((t) => t.parentTaskId === id && t.deletedAt === null)
        .sort(byManual)
        .map((row) => toTask(store, row)),
      parentTitle: parent?.title ?? null,
    };
  }),
  create_task: write(({ input }, ctx) => {
    const title = requireName(input.title, 'Task title', 500);
    let dueDate = input.dueDate == null ? null : requireDate(input.dueDate);
    let spaceId: string;
    let documentId: string | null = null;
    let parentTaskId: string | null = null;
    if (input.parentTaskId != null) {
      const parent = getTaskRow(ctx.store, input.parentTaskId);
      if (parent.parentTaskId !== null) invalid('subtasks cannot have subtasks');
      if (parent.deletedAt !== null) invalid('restore the parent task first');
      ctx.touch('task', parent.id);
      ({ spaceId, documentId } = parent);
      parentTaskId = parent.id;
      dueDate = null;
    } else if (input.documentId != null) {
      ctx.touch('note', input.documentId);
      spaceId = liveDocumentSpace(ctx.store, input.documentId);
      documentId = input.documentId;
    } else {
      spaceId = resolveSpace(ctx.store, input.spaceId);
    }
    const ts = now();
    const row: TaskRow = {
      id: newId(),
      spaceId,
      documentId,
      parentTaskId,
      title,
      description: input.description ?? '',
      status: 'open',
      dueDate,
      completedAt: null,
      sortOrder: nextOrder(
        ctx.store.tasks.filter((t) => t.parentTaskId === parentTaskId).map((t) => t.sortOrder),
      ),
      rev: 1,
      tags: [],
      triagedAt: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    };
    ctx.store.tasks.push(row);
    ctx.touch('task', row.id);
    return toTask(ctx.store, row);
  }),
  update_task_text: write(({ id, expectedRev, patch }, ctx) => {
    const task = getTaskRow(ctx.store, id);
    if (task.rev !== expectedRev) conflict('task');
    if (patch.title != null) task.title = requireName(patch.title, 'Task title', 500);
    if (patch.description != null) task.description = patch.description;
    task.rev += 1;
    task.updatedAt = now();
    touchTask(ctx, task);
    return toTask(ctx.store, task);
  }),
  set_task_completed: write(({ id, completed }, ctx) => {
    const task = findTask(ctx.store, id);
    if (!task || task.deletedAt !== null) notFound('task');
    const ts = now();
    task.status = completed ? 'completed' : 'open';
    task.completedAt = completed ? (task.completedAt ?? ts) : null;
    task.updatedAt = ts;
    touchTask(ctx, task);
    return toTask(ctx.store, task);
  }),
  set_task_due_date: write(({ id, dueDate }, ctx) => {
    const task = getTaskRow(ctx.store, id);
    if (task.parentTaskId !== null && dueDate !== null) invalid("subtasks don't have due dates");
    task.dueDate = dueDate === null ? null : requireDate(dueDate);
    task.updatedAt = now();
    touchTask(ctx, task);
    return toTask(ctx.store, task);
  }),
  move_task: write(({ id, spaceId }, ctx) => {
    const task = getTaskRow(ctx.store, id);
    requireTopLevel(task);
    resolveSpace(ctx.store, spaceId);
    touchTask(ctx, task);
    const keep =
      task.documentId === null || safeDocumentSpace(ctx.store, task.documentId) === spaceId;
    const ts = now();
    for (const t of ctx.store.tasks) {
      if (t.id !== id && t.parentTaskId !== id) continue;
      t.spaceId = spaceId;
      t.updatedAt = ts;
      if (!keep) t.documentId = null;
    }
    touchTask(ctx, task);
    return toTask(ctx.store, task);
  }),
  set_task_document: write(({ id, documentId }, ctx) => {
    const task = getTaskRow(ctx.store, id);
    requireTopLevel(task);
    touchTask(ctx, task);
    const spaceId = documentId === null ? task.spaceId : liveDocumentSpace(ctx.store, documentId);
    const order =
      documentId === null
        ? task.sortOrder
        : Math.max(
            nextOrder(
              ctx.store.tasks
                .filter((t) => t.documentId === documentId && t.parentTaskId === null)
                .map((t) => t.sortOrder),
            ),
            task.sortOrder,
          );
    const ts = now();
    for (const t of ctx.store.tasks) {
      if (t.id !== id && t.parentTaskId !== id) continue;
      t.documentId = documentId;
      t.spaceId = spaceId;
      t.updatedAt = ts;
    }
    task.sortOrder = order;
    touchTask(ctx, task);
    return toTask(ctx.store, task);
  }),
  reorder_tasks: write(({ ids }, ctx) => {
    const [first] = ids;
    if (first === undefined) return null;
    const parent = getTaskRow(ctx.store, first).parentTaskId;
    let base = Number.POSITIVE_INFINITY;
    for (const id of ids) {
      const task = getTaskRow(ctx.store, id);
      if (task.parentTaskId !== parent || task.deletedAt !== null) {
        invalid('only sibling tasks can be reordered together');
      }
      base = Math.min(base, task.sortOrder);
      touchTask(ctx, task);
    }
    if (new Set(ids).size !== ids.length) invalid('each task can appear only once');
    ids.forEach((id, index) => (getTaskRow(ctx.store, id).sortOrder = base + index * ORDER_STEP));
    return null;
  }),
  trash_task: write(({ id }, ctx) => {
    const task = getTaskRow(ctx.store, id);
    task.deletedAt ??= now();
    touchTask(ctx, task);
    reconcileStickies(ctx, null);
    return null;
  }),
  restore_task: write(({ id }, ctx) => {
    const unlinked = restoreTask(ctx, id);
    reconcileStickies(ctx, { kind: 'task', id });
    return unlinked;
  }),
  purge_task: write(({ id }, ctx) => {
    const task = getTaskRow(ctx.store, id);
    if (task.deletedAt === null) invalid('only items in Trash can be deleted permanently');
    deleteTasks(ctx.store, new Set([id]));
    touchTask(ctx, task);
    reconcileStickies(ctx, null);
    return null;
  }),
  set_task_triaged: write(({ id, triaged }, ctx) => {
    const task = findTask(ctx.store, id);
    if (task) task.triagedAt = triaged ? (task.triagedAt ?? now()) : null;
    ctx.touch('task', id);
    return null;
  }),
  set_task_tags: write(({ id, tags }, ctx) => setTags(ctx, 'task', id, tags)),

  // Inbox, trash, tags, search -----------------------------------------------------------------
  list_inbox: read(({ spaceId }, { store }) => {
    const { notes, tasks } = inboxRows(store, spaceId ?? null);
    const entries: { row: NoteRow | TaskRow; item: InboxItem }[] = [
      ...notes.map((row) => ({
        row,
        item: { type: 'note' as const, note: toListItem(store, row) },
      })),
      ...tasks.map((row) => ({ row, item: { type: 'task' as const, task: toTask(store, row) } })),
    ];
    return entries.sort((a, b) => newestFirst(a.row, b.row)).map((entry) => entry.item);
  }),
  inbox_count: read(({ spaceId }, { store }) => {
    const { notes, tasks } = inboxRows(store, spaceId ?? null);
    return notes.length + tasks.length;
  }),
  mark_inbox_triaged: write(({ spaceId }, ctx) => {
    const { notes, tasks } = inboxRows(ctx.store, spaceId ?? null);
    const ts = now();
    for (const note of notes) {
      note.triagedAt = ts;
      ctx.touch('note', note.id);
    }
    for (const task of tasks) {
      task.triagedAt = ts;
      ctx.touch('task', task.id);
    }
    return null;
  }),
  list_trash: read((_, { store }) => trashItems(store)),
  empty_trash: write((_, ctx) => {
    for (const item of trashItems(ctx.store)) {
      if (item.type === 'note') ctx.touch('note', item.note.id);
      else ctx.touch('task', item.task.id);
    }
    const trashed = (row: { deletedAt: string | null }) => row.deletedAt !== null;
    deleteTasks(ctx.store, new Set(ctx.store.tasks.filter(trashed).map((t) => t.id)));
    deleteNotes(ctx.store, new Set(ctx.store.notes.filter(trashed).map((n) => n.id)));
    reconcileStickies(ctx, null);
    return null;
  }),
  list_tags: read((_, { store }) => listTags(store)),
  search: read(({ query, spaceId }, { store }) => search(store, query, spaceId ?? null)),

  // Export and backup (nothing is written: paths are plausible placeholders) -------------------
  export_data: read((_, { store }) => ({
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now(),
    spaces: sortedSpaces(store),
    notes: store.notes
      .filter((n) => n.kind === 'quick_note' && n.deletedAt === null)
      .sort((a, b) => byText(a.createdAt, b.createdAt))
      .map((row) => toNote(store, row)),
    documents: store.notes
      .filter((n) => n.kind === 'document' && n.deletedAt === null)
      .sort((a, b) => byText(a.createdAt, b.createdAt))
      .map((row) => toDocument(store, row)),
    tasks: store.tasks
      .filter((t) => {
        const parent = t.parentTaskId === null ? undefined : findTask(store, t.parentTaskId);
        return t.deletedAt === null && parent?.deletedAt == null;
      })
      .sort(
        (a, b) =>
          Number(a.parentTaskId !== null) - Number(b.parentTaskId !== null) || byManual(a, b),
      )
      .map((row) => toTask(store, row)),
    tags: listTags(store),
  })),
  choose_export_folder: read(() => joinPath(homeFolder(), 'Documents')),
  write_export: read(({ folderName, files }, { host }) => {
    host.log(`write_export: ${files.length} files (not written by the dev mock)`);
    return joinPath(joinPath(homeFolder(), 'Documents'), folderName);
  }),
  backup_database: read(() => joinPath(homeFolder(), `piw-backup-${todayString()}.sqlite3`)),

  // Settings and capture drafts ----------------------------------------------------------------
  get_settings: read((_, { store, theme }) => ({
    ...store.settings,
    theme: theme ?? store.settings.theme,
  })),
  update_settings: write(({ patch }, ctx) => {
    for (const key of Object.keys(patch)) {
      if (!(key in DEFAULT_SETTINGS)) invalid(`unknown setting: ${key}`);
    }
    ctx.store.settings = { ...ctx.store.settings, ...patch };
    ctx.touch('settings', '*');
    if ('captureShortcut' in patch) {
      ctx.host.emit(null, 'piw://shortcut/status', shortcutStatus(ctx.store.settings));
    }
    return { ...ctx.store.settings, theme: ctx.theme ?? ctx.store.settings.theme };
  }),
  remember_capture_space: write(({ spaceId }, ctx) => {
    ctx.store.settings.lastCaptureSpaceId = resolveSpace(ctx.store, spaceId);
    ctx.touch('settings', '*');
    return null;
  }),
  get_capture_draft: read((_, { store }) => store.draft),
  save_capture_draft: write(({ draft }, ctx) => {
    const empty = !draft.text.trim() && !draft.description.trim();
    ctx.store.draft = empty ? null : { ...draft, updatedAt: now() };
    return null;
  }),
  clear_capture_draft: write((_, ctx) => {
    ctx.store.draft = null;
    return null;
  }),
};

export const COMMANDS = Object.keys(HANDLERS) as Command[];

function isCommand(command: string): command is Command {
  return Object.hasOwn(HANDLERS, command);
}

/** Emulates the JSON boundary of real IPC: no shared references, `undefined` dropped. */
function jsonClone<T>(value: T): T {
  return value === undefined ? (null as T) : (JSON.parse(JSON.stringify(value)) as T);
}

export function createMockBackend(initial: Store, options: MockBackendOptions): MockBackend {
  let store = initial;
  const { host, label } = options;
  const theme = options.theme ?? null;

  return {
    invoke(command, args) {
      if (!isCommand(command)) {
        host.log(`unhandled command "${command}"`);
        return fail('internal', `the dev mock backend does not implement "${command}"`);
      }
      const handler = HANDLERS[command] as Handler<unknown, unknown>;
      const changes: ChangeSet = { changes: [], origin: label };
      const ctx: Ctx = {
        store: handler.write ? structuredClone(store) : store,
        host,
        theme,
        touch(kind, id) {
          if (!changes.changes.some((c) => c.kind === kind && c.id === id)) {
            changes.changes.push({ kind, id });
          }
        },
      };
      const result = jsonClone(handler.run(jsonClone(args ?? {}), ctx));
      if (handler.write) {
        store = ctx.store;
        host.commit(changes);
      }
      return result;
    },
    getStore: () => store,
    setStore(next) {
      store = next;
    },
  };
}
