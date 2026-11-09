/**
 * Dev-only in-memory tables for the mock backend (see `install.ts`). Rows mirror the SQLite
 * schema and the `to*` mappers build the same DTOs as the Rust services, so the UI cannot tell
 * the difference. Never imported by production code.
 */
import type { AppError } from '@/lib/ipc/bindings/AppError';
import type { CaptureDraft } from '@/lib/ipc/bindings/CaptureDraft';
import type { ColorName } from '@/lib/ipc/bindings/ColorName';
import type { ErrorCode } from '@/lib/ipc/bindings/ErrorCode';
import type { Note } from '@/lib/ipc/bindings/Note';
import type { NoteKind } from '@/lib/ipc/bindings/NoteKind';
import type { NoteListItem } from '@/lib/ipc/bindings/NoteListItem';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { Space } from '@/lib/ipc/bindings/Space';
import type { StickyPlacement } from '@/lib/ipc/bindings/StickyPlacement';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import type { Tab } from '@/lib/ipc/bindings/Tab';
import type { TabKind } from '@/lib/ipc/bindings/TabKind';
import type { Task } from '@/lib/ipc/bindings/Task';
import type { TasksTabSettings } from '@/lib/ipc/bindings/TasksTabSettings';
import type { TaskStatus } from '@/lib/ipc/bindings/TaskStatus';

// ---------------------------------------------------------------------------------------------
// Rows

export interface NoteRow {
  id: string;
  spaceId: string;
  kind: NoteKind;
  title: string;
  /** Quick-note text; `null` for documents. */
  body: string | null;
  documentId: string | null;
  sidebarOrder: number | null;
  rev: number;
  tags: string[];
  triagedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface TabRow {
  id: string;
  documentId: string;
  title: string;
  kind: TabKind;
  sortOrder: number;
  contentJson: string | null;
  /** Indexed for search (derived by the editor on save). */
  plainText: string;
  settings: TasksTabSettings | null;
  rev: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TaskRow {
  id: string;
  spaceId: string;
  documentId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  completedAt: string | null;
  sortOrder: number;
  rev: number;
  tags: string[];
  triagedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** A pinned item (`sticky_windows` row); `isOpen` says whether its window is on the desktop. */
export interface StickyRow {
  target: StickyTarget;
  placement: StickyPlacement;
  color: ColorName | null;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TagRow {
  id: string;
  name: string;
}

/** Everything the backend knows. Plain data only, so it can be cloned and posted to peers. */
export interface Store {
  spaces: Space[];
  notes: NoteRow[];
  tabs: TabRow[];
  tasks: TaskRow[];
  tags: TagRow[];
  stickies: StickyRow[];
  settings: Settings;
  draft: CaptureDraft | null;
}

// ---------------------------------------------------------------------------------------------
// Constants and defaults (mirroring the Rust side)

/** Gap between consecutive `sort_order` values (`services::ORDER_STEP`). */
export const ORDER_STEP = 1024;
export const STICKY_DEFAULT_WIDTH = 300;
export const STICKY_DEFAULT_HEIGHT = 260;
export const DEFAULT_TAB_TITLE = 'Overview';
export const DEFAULT_TASKS_TAB_SETTINGS: TasksTabSettings = { show: 'open', sort: 'manual' };

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'blue',
  textSize: 'default',
  closeToTray: true,
  launchAtLogin: false,
  captureShortcut: 'CommandOrControl+Shift+Space',
  captureSpace: 'last_used',
  lastCaptureSpaceId: null,
  restoreStickiesOnLaunch: false,
  trayNoticeShown: false,
};

// ---------------------------------------------------------------------------------------------
// Errors: thrown as `{ code, message }`, exactly like a rejected Tauri command.

export function fail(code: ErrorCode, message: string): never {
  const error: AppError = { code, message };
  throw error;
}

export function notFound(entity: string): never {
  return fail('not_found', `${entity} not found`);
}

export function invalid(message: string): never {
  return fail('validation', message);
}

export function conflict(entity: string): never {
  return fail('conflict', `${entity} was changed elsewhere; reload and try again`);
}

// ---------------------------------------------------------------------------------------------
// Time, ids and ordering

let lastTimestamp = 0;

/** UTC timestamp like `2026-11-06T12:00:00.000Z`, strictly increasing so sorts are stable. */
export function now(): string {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return new Date(lastTimestamp).toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

/** `max + ORDER_STEP`, or 0 for the first row (`services::next_order`). */
export function nextOrder(orders: Iterable<number | null>): number {
  let max: number | null = null;
  for (const order of orders) {
    if (order !== null && (max === null || order > max)) max = order;
  }
  return max === null ? 0 : max + ORDER_STEP;
}

/** Validates that `ids` is exactly `expected` (any order), like `services::apply_order`. */
export function requireSameIds(ids: readonly string[], expected: readonly string[]): void {
  const a = [...new Set(ids)].sort();
  const b = [...expected].sort();
  if (a.length !== ids.length || a.join('\n') !== b.join('\n')) {
    invalid('the new order must contain exactly the current items');
  }
}

export function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Text rules (`domain/text.rs`)

const TITLE_MAX_CHARS = 120;
const EXCERPT_MAX_CHARS = 160;

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

function lines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Explicit title, or the first non-empty line of the body without heading markers. */
export function displayTitle(title: string, body: string | null): string {
  const explicit = title.trim();
  if (explicit) return truncate(explicit, TITLE_MAX_CHARS);
  const first = body === null ? undefined : lines(body)[0];
  if (first === undefined) return '';
  return truncate(first.replace(/^#+/, '').trimStart(), TITLE_MAX_CHARS);
}

/** Single-line preview of the body, skipping the line used as the inferred title. */
export function excerpt(title: string, body: string | null): string {
  if (body === null) return '';
  const rest = lines(body);
  if (!title.trim()) rest.shift();
  return truncate(rest.join(' '), EXCERPT_MAX_CHARS);
}

function normalizeName(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(' ');
}

export function requireName(value: string, what: string, maxChars: number): string {
  const name = normalizeName(value);
  if (!name) invalid(`${what} cannot be empty`);
  if (Array.from(name).length > maxChars) {
    invalid(`${what} is too long (max ${maxChars} characters)`);
  }
  return name;
}

export function normalizeTag(value: string): string {
  return requireName(value.trim().replace(/^#+/, ''), 'Tag', 40);
}

export function sortTags(tags: readonly string[]): string[] {
  return [...tags].sort((a, b) => byText(a.toLowerCase(), b.toLowerCase()));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a `YYYY-MM-DD` calendar date (`time::parse_date`). */
export function requireDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  if (!DATE_RE.test(value) || date.toISOString().slice(0, 10) !== value) {
    invalid('dates must use the YYYY-MM-DD format');
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Editor JSON

interface DocNode {
  type?: string;
  text?: string;
  content?: DocNode[];
}

const BLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'blockquote', 'listItem']);

/** Canonical editor JSON for plain text: one paragraph per line (`plain_text_to_doc_json`). */
export function plainTextToDocJson(text: string): string {
  const content = text.split('\n').map((raw) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    return line
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph' };
  });
  return JSON.stringify({ type: 'doc', content });
}

/** Rough plain text of an editor document (the editor derives the real one on save). */
export function docPlainText(contentJson: string | null): string {
  if (contentJson === null) return '';
  const out: string[] = [];
  const walk = (node: DocNode) => {
    if (typeof node.text === 'string') out.push(node.text);
    node.content?.forEach(walk);
    if (node.type !== undefined && BLOCKS.has(node.type)) out.push('\n');
  };
  try {
    walk(JSON.parse(contentJson) as DocNode);
  } catch {
    return '';
  }
  return out.join('').replace(/\n+/g, '\n').trim();
}

// ---------------------------------------------------------------------------------------------
// Lookups

export function findNote(store: Store, id: string): NoteRow | undefined {
  return store.notes.find((note) => note.id === id);
}

export function findTask(store: Store, id: string): TaskRow | undefined {
  return store.tasks.find((task) => task.id === id);
}

export function getNoteRow(store: Store, id: string): NoteRow {
  return findNote(store, id) ?? notFound('note');
}

export function getTaskRow(store: Store, id: string): TaskRow {
  return findTask(store, id) ?? notFound('task');
}

/** A tab that is not deleted (`documents::get_tab`). */
export function getTabRow(store: Store, id: string): TabRow {
  return store.tabs.find((tab) => tab.id === id && tab.deletedAt === null) ?? notFound('tab');
}

export function getDocumentRow(store: Store, id: string): NoteRow {
  const note = findNote(store, id);
  return note?.kind === 'document' ? note : notFound('document');
}

/** Live tabs of a document, in order. */
export function documentTabs(store: Store, documentId: string): TabRow[] {
  return store.tabs
    .filter((tab) => tab.documentId === documentId && tab.deletedAt === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || byText(a.createdAt, b.createdAt));
}

/** Space of a document outside Trash (items can only be grouped under live documents). */
export function liveDocumentSpace(store: Store, documentId: string): string {
  const doc = findNote(store, documentId);
  return doc?.kind === 'document' && doc.deletedAt === null ? doc.spaceId : notFound('document');
}

function defaultSpaceId(store: Store): string {
  const [first] = [...store.spaces].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder,
  );
  return first?.id ?? notFound('space');
}

/** `spaceId` after checking it exists, or the default space when absent. */
export function resolveSpace(store: Store, spaceId: string | null | undefined): string {
  if (spaceId == null) return defaultSpaceId(store);
  return store.spaces.some((space) => space.id === spaceId) ? spaceId : notFound('space');
}

function isPinned(store: Store, target: StickyTarget): boolean {
  return store.stickies.some((s) => s.target.kind === target.kind && s.target.id === target.id);
}

// ---------------------------------------------------------------------------------------------
// DTO mappers

export function toNote(store: Store, row: NoteRow): Note {
  const doc = row.documentId === null ? undefined : findNote(store, row.documentId);
  return {
    id: row.id,
    spaceId: row.spaceId,
    kind: row.kind,
    title: row.title,
    displayTitle: displayTitle(row.title, row.body),
    body: row.body,
    documentId: row.documentId,
    documentTitle: doc?.title ?? null,
    sidebarOrder: row.sidebarOrder,
    rev: row.rev,
    tags: sortTags(row.tags),
    pinned: isPinned(store, { kind: 'note', id: row.id }),
    triagedAt: row.triagedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
  };
}

export function toListItem(store: Store, row: NoteRow): NoteListItem {
  const note = toNote(store, row);
  return {
    id: note.id,
    spaceId: note.spaceId,
    kind: note.kind,
    displayTitle: note.displayTitle,
    excerpt: excerpt(row.title, row.body),
    documentId: note.documentId,
    documentTitle: note.documentTitle,
    sidebarOrder: note.sidebarOrder,
    tags: note.tags,
    pinned: note.pinned,
    taskCount: store.tasks.filter(
      (task) => task.documentId === row.id && task.deletedAt === null && task.parentTaskId === null,
    ).length,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    archivedAt: note.archivedAt,
    deletedAt: note.deletedAt,
  };
}

export function toTask(store: Store, row: TaskRow): Task {
  const doc = row.documentId === null ? undefined : findNote(store, row.documentId);
  const subtasks = store.tasks.filter((s) => s.parentTaskId === row.id && s.deletedAt === null);
  return {
    id: row.id,
    spaceId: row.spaceId,
    documentId: row.documentId,
    documentTitle: doc?.title ?? null,
    documentArchived: doc?.archivedAt != null,
    parentTaskId: row.parentTaskId,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    sortOrder: row.sortOrder,
    rev: row.rev,
    subtaskCount: subtasks.length,
    subtaskDone: subtasks.filter((s) => s.status === 'completed').length,
    tags: sortTags(row.tags),
    pinned: isPinned(store, { kind: 'task', id: row.id }),
    triagedAt: row.triagedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toTab(row: TabRow): Tab {
  return {
    id: row.id,
    documentId: row.documentId,
    title: row.title,
    kind: row.kind,
    sortOrder: row.sortOrder,
    contentJson: row.contentJson,
    settings: row.settings ?? DEFAULT_TASKS_TAB_SETTINGS,
    rev: row.rev,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
