import type { EntityKind } from '@/lib/ipc/bindings/EntityKind';

/**
 * Query keys. The first element ("root") names what the query shows; when Rust broadcasts
 * `piw://changed`, every query whose root depends on a changed entity kind is invalidated
 * (and refetched only if some component is displaying it).
 */
export const keys = {
  spaces: ['spaces'] as const,
  notes: (query: object = {}) => ['notes', query] as const,
  note: (id: string) => ['note', id] as const,
  document: (id: string) => ['document', id] as const,
  tasks: (query: object = {}) => ['tasks', query] as const,
  documentTasks: (documentId: string, show: string, sort: string) =>
    ['documentTasks', documentId, show, sort] as const,
  task: (id: string) => ['task', id] as const,
  completedCount: (spaceId: string | null) => ['completedCount', spaceId] as const,
  inbox: (spaceId: string | null) => ['inbox', spaceId] as const,
  inboxCount: (spaceId: string | null) => ['inboxCount', spaceId] as const,
  trash: ['trash'] as const,
  tags: ['tags'] as const,
  search: (query: string, spaceId: string | null) => ['search', query, spaceId] as const,
  settings: ['settings'] as const,
  pinned: (spaceId: string | null) => ['pinned', spaceId] as const,
  sticky: (label: string) => ['sticky', label] as const,
};

export type QueryRoot =
  | 'spaces'
  | 'notes'
  | 'note'
  | 'document'
  | 'tasks'
  | 'documentTasks'
  | 'task'
  | 'completedCount'
  | 'inbox'
  | 'inboxCount'
  | 'trash'
  | 'tags'
  | 'search'
  | 'settings'
  | 'pinned'
  | 'sticky';

/** Which query roots must refresh when an entity kind changes. */
const DEPENDENCIES: Record<EntityKind, readonly QueryRoot[]> = {
  space: ['spaces', 'notes', 'tasks', 'inbox', 'inboxCount', 'search', 'pinned'],
  note: [
    'notes',
    'note',
    'document',
    'tasks',
    'documentTasks',
    'task',
    'inbox',
    'inboxCount',
    'trash',
    'search',
    'pinned',
  ],
  tab: ['document', 'search', 'pinned'],
  task: [
    'tasks',
    'documentTasks',
    'task',
    'completedCount',
    'inbox',
    'inboxCount',
    'trash',
    'search',
    'notes',
    'document',
    'pinned',
  ],
  tag: ['tags', 'notes', 'note', 'tasks', 'task', 'documentTasks', 'inbox'],
  settings: ['settings'],
  sticky: ['pinned', 'sticky', 'notes', 'note', 'tasks', 'task', 'documentTasks'],
};

export function rootsFor(kinds: Iterable<EntityKind>): Set<QueryRoot> {
  const roots = new Set<QueryRoot>();
  for (const kind of kinds) {
    for (const root of DEPENDENCIES[kind]) roots.add(root);
  }
  return roots;
}
