import type { VaultEntry } from '@/lib/ipc/bindings/VaultEntry';

export interface TreeNode {
  entry: VaultEntry;
  depth: number;
  children: TreeNode[];
}

/** The capture note at the top of each space (docs/vault-format.md §5). */
export const INBOX_NAME = 'Inbox';

export function parentOf(path: string): string | null {
  const at = path.lastIndexOf('/');
  return at === -1 ? null : path.slice(0, at);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function join(folder: string | null, name: string): string {
  return folder === null ? name : `${folder}/${name}`;
}

export function spaceOf(path: string): string | null {
  const at = path.indexOf('/');
  return at === -1 ? null : path.slice(0, at);
}

/** Top-level folders: the vault's spaces. */
export function spacesOf(entries: readonly VaultEntry[]): string[] {
  return entries.filter((e) => e.kind === 'folder' && !e.path.includes('/')).map((e) => e.path);
}

/**
 * The flat, tree-ordered entries from Rust as nested nodes. With a space, only that folder's
 * contents, one level up. A space's Inbox note comes first, before its folders.
 */
export function buildTree(entries: readonly VaultEntry[], space: string | null): TreeNode[] {
  const roots: TreeNode[] = [];
  const folders = new Map<string, TreeNode>();
  const offset = space === null ? 0 : 1;
  for (const entry of entries) {
    if (space !== null && (entry.path === space || !entry.path.startsWith(`${space}/`))) continue;
    const parent = parentOf(entry.path);
    const node: TreeNode = {
      entry,
      depth: entry.path.split('/').length - 1 - offset,
      children: [],
    };
    const siblings = parent === null || parent === space ? roots : folders.get(parent)?.children;
    if (!siblings) continue;
    siblings.push(node);
    if (entry.kind === 'folder') folders.set(entry.path, node);
  }
  const inboxFirst = (nodes: TreeNode[]) => {
    const at = nodes.findIndex((n) => n.entry.kind === 'note' && n.entry.name === INBOX_NAME);
    if (at > 0) {
      const [inbox] = nodes.splice(at, 1);
      if (inbox) nodes.unshift(inbox);
    }
  };
  if (space !== null) inboxFirst(roots);
  for (const [path, folder] of folders) if (!path.includes('/')) inboxFirst(folder.children);
  return roots;
}

/** The nodes as rows, depth first, skipping the contents of closed folders. */
export function visibleRows(nodes: readonly TreeNode[], expanded: ReadonlySet<string>): TreeNode[] {
  const rows: TreeNode[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      rows.push(node);
      if (node.entry.kind === 'folder' && expanded.has(node.entry.path)) walk(node.children);
    }
  };
  walk(nodes);
  return rows;
}

/** Where a new note goes: the folder of the active note, else the space filter, else the root. */
export function newNoteFolder(activeNote: string | null, space: string | null): string | null {
  if (activeNote !== null) {
    const folder = parentOf(activeNote);
    if (
      space === null ||
      (folder !== null && (folder === space || folder.startsWith(`${space}/`)))
    ) {
      return folder;
    }
  }
  return space;
}

/** Where a row takes a drop: a folder takes it inside, a note into the folder it is in. */
export function dropFolderFor(entry: VaultEntry): string | null {
  return entry.kind === 'folder' ? entry.path : parentOf(entry.path);
}

/** Whether moving `path` into `folder` (`null`: the vault root) changes anything and is allowed. */
export function canMoveInto(path: string, folder: string | null): boolean {
  if (parentOf(path) === folder) return false;
  return folder === null || (folder !== path && !folder.startsWith(`${path}/`));
}
