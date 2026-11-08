/**
 * Dev-only: lets a URL choose what the browser mock shows, so screenshots need no clicks.
 * Items are found by a case-insensitive title substring (e.g. `?doc=refactor&tab=impl`).
 * See docs/architecture.md#browser-preview for the list of parameters.
 */
import type { StickyKind } from '@/lib/ipc/bindings/StickyKind';
import type { TaskView } from '@/lib/ipc/bindings/TaskView';
import { type Area, useWorkspace } from '@/state/workspace';
import { displayTitle, documentTabs, findNote, type NoteRow, type Store } from './mock-store';

const AREAS: readonly string[] = [
  'inbox',
  'notes',
  'tasks',
  'pinned',
  'trash',
  'settings',
] satisfies Area[];
const TASK_VIEWS: readonly string[] = [
  'all',
  'today',
  'upcoming',
  'completed',
] satisfies TaskView[];

const contains = (value: string, query: string) =>
  value.toLowerCase().includes(query.trim().toLowerCase());

function findDocument(store: Store, query: string): NoteRow | undefined {
  return store.notes.find(
    (n) =>
      n.kind === 'document' && n.deletedAt === null && (n.id === query || contains(n.title, query)),
  );
}

function findQuickNote(store: Store, query: string): NoteRow | undefined {
  return store.notes.find(
    (n) =>
      n.kind === 'quick_note' &&
      n.deletedAt === null &&
      (n.id === query || contains(displayTitle(n.title, n.body), query)),
  );
}

function findTaskId(store: Store, query: string): string | undefined {
  return store.tasks.find(
    (t) => t.deletedAt === null && (t.id === query || contains(t.title, query)),
  )?.id;
}

/** A tasks tab by id, tab title or document title. */
function findTasksTabId(store: Store, query: string): string | undefined {
  const tabs = store.tabs.filter((t) => t.kind === 'tasks' && t.deletedAt === null);
  return (
    tabs.find((t) => t.id === query || contains(t.title, query)) ??
    tabs.find((t) => contains(findNote(store, t.documentId)?.title ?? '', query))
  )?.id;
}

/**
 * Resolves a friendly sticky label (`sticky:task:demo`) to the real one
 * (`sticky:task:<uuid>`). Other labels are returned unchanged.
 */
export function resolveWindowLabel(raw: string, store: Store): string {
  const [prefix, kind, ...rest] = raw.split(':');
  const query = rest.join(':');
  if (prefix !== 'sticky' || !query) return raw;
  const finders: Record<StickyKind, (s: Store, q: string) => string | undefined> = {
    note: (s, q) => findQuickNote(s, q)?.id,
    task: findTaskId,
    tasks_tab: findTasksTabId,
  };
  const find = finders[kind as StickyKind] as (typeof finders)[StickyKind] | undefined;
  const id = find?.(store, query);
  if (id === undefined) console.warn(`[piw dev mock] no ${kind ?? ''} matches "${query}"`);
  return id === undefined ? raw : `sticky:${kind}:${id}`;
}

/**
 * Applies `area`, `doc`/`tab`, `note`, `task`, `filter`, `split` and `search` to the workspace
 * store. A URL with any query parameter starts from the default layout, so persisted
 * UI state (localStorage) never changes what a given URL renders; a bare `/` keeps it.
 */
export function applyWorkspaceParams(params: URLSearchParams, store: Store): void {
  if (params.toString() === '') return;
  const apply = () => {
    const ws = () => useWorkspace.getState();
    const warn = (message: string) => console.warn(`[piw dev mock] ${message}`);
    useWorkspace.setState(useWorkspace.getInitialState(), true);

    if (params.get('split') === '1' && !ws().notesSplit) ws().toggleNotesSplit();

    const filter = params.get('filter');
    if (filter !== null) {
      if (TASK_VIEWS.includes(filter)) ws().setTasksView(filter as TaskView);
      else warn(`unknown filter "${filter}" (use ${TASK_VIEWS.join(', ')})`);
    }

    const area = params.get('area');
    if (area !== null) {
      if (AREAS.includes(area)) ws().navigate(area as Area);
      else warn(`unknown area "${area}" (use ${AREAS.join(', ')})`);
    }

    const docQuery = params.get('doc');
    if (docQuery) {
      const doc = findDocument(store, docQuery);
      const tabQuery = params.get('tab');
      const tab =
        doc && tabQuery
          ? documentTabs(store, doc.id).find((t) => contains(t.title, tabQuery))
          : undefined;
      if (!doc) warn(`no document matches "${docQuery}"`);
      else if (tabQuery && !tab) warn(`no tab of "${doc.title}" matches "${tabQuery}"`);
      if (doc) ws().openDocument(doc.id, tab?.id);
    }

    const noteQuery = params.get('note');
    if (noteQuery) {
      const note = findQuickNote(store, noteQuery);
      if (!note) warn(`no note matches "${noteQuery}"`);
      else {
        if (area === null) ws().navigate('notes');
        ws().openNote(note.id);
      }
    }

    const taskQuery = params.get('task');
    if (taskQuery) {
      const taskId = findTaskId(store, taskQuery);
      if (!taskId) warn(`no task matches "${taskQuery}"`);
      else {
        if (area === null && !docQuery) ws().navigate('tasks');
        ws().openTask(taskId);
      }
    }

    if (params.get('search') === '1') ws().setSearchOpen(true);
  };
  // localStorage hydrates synchronously; wait anyway if it ever becomes async.
  if (useWorkspace.persist.hasHydrated()) apply();
  else useWorkspace.persist.onFinishHydration(apply);
}
