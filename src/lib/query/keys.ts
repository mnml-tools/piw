import type { EntityKind } from '@/lib/ipc/bindings/EntityKind';

/**
 * Query keys. The first element ("root") names what the query shows; when Rust broadcasts
 * `piw://changed`, every query whose root depends on a changed entity kind is invalidated
 * (and refetched only if some component is displaying it).
 */
export const keys = {
  settings: ['settings'] as const,
  sticky: (label: string) => ['sticky', label] as const,
  vaultStatus: ['vaultStatus'] as const,
  vaultTree: ['vaultTree'] as const,
  vaultNote: (path: string) => ['vaultNote', path] as const,
  vaultSearch: (query: string, space: string | null) => ['vaultSearch', query, space] as const,
  vaultTrash: ['vaultTrash'] as const,
  vaultTasks: (view: string, space: string | null, today: string) =>
    ['vaultTasks', view, space, today] as const,
  vaultPinned: ['vaultPinned'] as const,
  vaultStickyView: (label: string) => ['vaultStickyView', label] as const,
  vaultImport: ['vaultImport'] as const,
};

export type QueryRoot =
  | 'settings'
  | 'sticky'
  | 'vaultStatus'
  | 'vaultTree'
  | 'vaultNote'
  | 'vaultSearch'
  | 'vaultTrash'
  | 'vaultTasks'
  | 'vaultPinned'
  | 'vaultStickyView'
  | 'vaultImport';

/** Which query roots must refresh when an entity kind changes. */
const DEPENDENCIES: Record<EntityKind, readonly QueryRoot[]> = {
  settings: ['settings', 'vaultImport'],
  sticky: ['sticky', 'vaultPinned', 'vaultStickyView'],
  // Any vault path: the vault's queries are cheap, so they all refresh.
  file: [
    'vaultStatus',
    'vaultTree',
    'vaultNote',
    'vaultSearch',
    'vaultTrash',
    'vaultTasks',
    'vaultPinned',
    'vaultStickyView',
    'vaultImport',
  ],
};

export function rootsFor(kinds: Iterable<EntityKind>): Set<QueryRoot> {
  const roots = new Set<QueryRoot>();
  for (const kind of kinds) {
    for (const root of DEPENDENCIES[kind]) roots.add(root);
  }
  return roots;
}
