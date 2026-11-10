/**
 * Dev-only vault for the browser preview (docs/architecture.md#browser-preview): the
 * rules of `src-tauri/src/vault` over an in-memory folder of notes, close enough for UI work
 * (names, hash guard, free names, links that follow a rename, trash). Search is a substring
 * match, not FTS.
 */
import type { VaultEntry } from '@/lib/ipc/bindings/VaultEntry';
import type { VaultNote } from '@/lib/ipc/bindings/VaultNote';
import type { VaultSearchHit } from '@/lib/ipc/bindings/VaultSearchHit';
import type { VaultTask } from '@/lib/ipc/bindings/VaultTask';
import type { VaultTaskChange } from '@/lib/ipc/bindings/VaultTaskChange';
import type { VaultTaskView } from '@/lib/ipc/bindings/VaultTaskView';
import { applyTaskChange, parseNote, taskBox } from '@/lib/vault/tasks';
import type { VaultTrashItem } from '@/lib/ipc/bindings/VaultTrashItem';
import { addDays, todayString } from '@/lib/dates';
import { conflict, invalid, notFound } from './mock-store';

export interface MockTrashEntry {
  id: string;
  path: string;
  kind: 'note' | 'folder';
  files: Record<string, string>;
  folders: string[];
}

/** What a vault sticky shows (`services/vault_stickies.rs`). */
export interface MockVaultSticky {
  kind: 'vault_note' | 'vault_tasks';
  id: string;
  path: string | null;
  view: VaultTaskView | null;
  space: string | null;
}

export interface MockVault {
  root: string;
  stickies: MockVaultSticky[];
  /** Note path → text. */
  files: Record<string, string>;
  /** Every folder path, empty ones included. */
  folders: string[];
  trash: MockTrashEntry[];
}

const START = '\u0002';
const END = '\u0003';
const FORBIDDEN = /[/\\:*?"<>|\p{Cc}]/u;

/** FNV-1a: a stand-in for the SHA-256 the Rust side uses. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}

const parentOf = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null;
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const titleOf = (path: string) => nameOf(path).replace(/\.md$/i, '');
const spaceOf = (path: string) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : null);
const join = (folder: string | null, name: string) =>
  folder === null ? name : `${folder}/${name}`;
const inside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);
const isNote = (path: string) => /\.md$/i.test(path);

function requirePath(path: string): string {
  const bad =
    path === '' || path.split('/').some((s) => s === '' || s.startsWith('.') || s.includes('\\'));
  return bad ? invalid('that path is not inside the vault') : path.normalize('NFC');
}

function requireName(name: string): void {
  if (!name) invalid('enter a name');
  if ([...name].length > 120) invalid('names can have at most 120 characters');
  if (FORBIDDEN.test(name))
    invalid('names cannot contain / \\ : * ? " < > | or control characters');
  if (/^[. ]|[. ]$/.test(name))
    invalid('names cannot start with a dot or a space, or end with one');
}

function namesIn(vault: MockVault, folder: string | null): Set<string> {
  const all = [...Object.keys(vault.files), ...vault.folders];
  return new Set(all.filter((p) => parentOf(p) === folder).map((p) => nameOf(p).toLowerCase()));
}

function requireFolder(vault: MockVault, folder: string | null): void {
  if (folder !== null && !vault.folders.includes(folder)) notFound('folder');
}

function freeName(vault: MockVault, folder: string | null, stem: string, note: boolean): string {
  const taken = namesIn(vault, folder);
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? stem : `${stem} ${n}`;
    const name = note ? `${candidate}.md` : candidate;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

function noteOf(vault: MockVault, path: string): VaultNote {
  const text = vault.files[path];
  if (text === undefined) notFound('note');
  return { path, title: titleOf(path), space: spaceOf(path), text, hash: hashText(text) };
}

/** Tree order: folders before notes at each level, then by name ignoring case. */
export function vaultTree(vault: MockVault): VaultEntry[] {
  const entries: VaultEntry[] = [
    ...vault.folders.map((path) => ({ path, kind: 'folder' as const, name: nameOf(path) })),
    ...Object.keys(vault.files).map((path) => ({
      path,
      kind: 'note' as const,
      name: titleOf(path),
    })),
  ];
  const key = (e: VaultEntry) => {
    const parts = e.path.split('/');
    return parts.map(
      (p, i) => `${i === parts.length - 1 && e.kind === 'note' ? 1 : 0}${p.toLowerCase()}`,
    );
  };
  return entries.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < Math.min(ka.length, kb.length); i += 1) {
      const order = ka[i]!.localeCompare(kb[i]!);
      if (order !== 0) return order;
    }
    return ka.length - kb.length;
  });
}

export function readNote(vault: MockVault, path: string): VaultNote {
  return noteOf(vault, requirePath(path));
}

export function writeNote(vault: MockVault, path: string, text: string, hash: string): VaultNote {
  const current = readNote(vault, path);
  if (current.hash !== hash) conflict('note');
  vault.files[current.path] = text;
  return noteOf(vault, current.path);
}

export function createNote(
  vault: MockVault,
  folder: string | null,
  title: string,
  text: string,
): VaultNote {
  requireName(title);
  const parent = folder === null ? null : requirePath(folder);
  requireFolder(vault, parent);
  const path = join(parent, freeName(vault, parent, title, true));
  vault.files[path] = text && !text.endsWith('\n') ? `${text}\n` : text;
  return noteOf(vault, path);
}

export function createFolder(vault: MockVault, parent: string | null, name: string): string {
  requireName(name);
  const folder = parent === null ? null : requirePath(parent);
  requireFolder(vault, folder);
  if (namesIn(vault, folder).has(name.toLowerCase())) {
    invalid('a note or folder with that name already exists here');
  }
  const path = join(folder, name);
  vault.folders.push(path);
  return path;
}

/** `[[target` (ignoring case) followed by `]]`, `|` or `#`. */
function rewriteLinks(text: string, target: string, replacement: string): string {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\[\\[${escaped}(?=\\]\\]|\\||#)`, 'gi'), `[[${replacement}`);
}

export function resolveLink(vault: MockVault, target: string): string | null {
  const key = target.trim().toLowerCase();
  const paths = Object.keys(vault.files);
  if (key.includes('/'))
    return paths.find((p) => p.replace(/\.md$/i, '').toLowerCase() === key) ?? null;
  return (
    paths
      .filter((p) => titleOf(p).toLowerCase() === key)
      .sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? null
  );
}

function linksIn(text: string): string[] {
  return Array.from(text.matchAll(/\[\[([^[\]\n|#]+)/g), (m) => m[1]!.trim());
}

export function renameEntry(
  vault: MockVault,
  from: string,
  to: string,
): { path: string; linked: string[] } {
  const source = requirePath(from);
  const target = requirePath(to);
  const note = isNote(source);
  if (isNote(target) !== note) invalid('a note keeps the .md extension');
  requireName(note ? titleOf(target) : nameOf(target));
  if (!note && inside(target, source)) invalid('a folder cannot move into itself');
  if (note ? vault.files[source] === undefined : !vault.folders.includes(source)) {
    notFound(note ? 'note' : 'folder');
  }
  requireFolder(vault, parentOf(target));
  const sameEntry =
    parentOf(source) === parentOf(target) &&
    nameOf(source).toLowerCase() === nameOf(target).toLowerCase();
  if (!sameEntry && namesIn(vault, parentOf(target)).has(nameOf(target).toLowerCase())) {
    invalid('a note or folder with that name already exists here');
  }
  // Backlinks resolve against the vault as it was.
  const backlinks = note
    ? Object.entries(vault.files).flatMap(([path, text]) =>
        linksIn(text)
          .filter((link) => resolveLink(vault, link) === source)
          .map((link) => ({ path, link })),
      )
    : [];
  const move = (path: string) => (inside(path, source) ? target + path.slice(source.length) : path);
  vault.files = Object.fromEntries(Object.entries(vault.files).map(([p, text]) => [move(p), text]));
  vault.folders = vault.folders.map(move);
  for (const sticky of vault.stickies) if (sticky.path !== null) sticky.path = move(sticky.path);
  const linked = new Set<string>();
  for (const { path, link } of backlinks) {
    const replacement = link.includes('/')
      ? target.replace(/\.md$/i, '')
      : titleOf(target) !== titleOf(source)
        ? titleOf(target)
        : null;
    if (replacement === null) continue;
    const at = move(path);
    const before = vault.files[at] ?? '';
    const after = rewriteLinks(before, link, replacement);
    if (after !== before) {
      vault.files[at] = after;
      linked.add(at);
    }
  }
  return { path: target, linked: [...linked].sort() };
}

export function trashEntry(vault: MockVault, path: string): VaultTrashItem {
  const source = requirePath(path);
  const note = isNote(source);
  if (note ? vault.files[source] === undefined : !vault.folders.includes(source)) notFound('note');
  const files = Object.fromEntries(Object.entries(vault.files).filter(([p]) => inside(p, source)));
  const folders = vault.folders.filter((f) => inside(f, source));
  for (const p of Object.keys(files)) delete vault.files[p];
  vault.folders = vault.folders.filter((f) => !inside(f, source));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  let id = stamp;
  for (let n = 2; vault.trash.some((t) => t.id === id); n += 1) id = `${stamp}-${n}`;
  const entry: MockTrashEntry = {
    id,
    path: source,
    kind: note ? 'note' : 'folder',
    files,
    folders,
  };
  vault.trash.push(entry);
  return trashItem(entry);
}

function trashItem(entry: MockTrashEntry): VaultTrashItem {
  return {
    id: entry.id,
    path: entry.path,
    kind: entry.kind,
    name: entry.kind === 'note' ? titleOf(entry.path) : nameOf(entry.path),
  };
}

export function listTrash(vault: MockVault): VaultTrashItem[] {
  return [...vault.trash].sort((a, b) => b.id.localeCompare(a.id)).map(trashItem);
}

export function restoreEntry(vault: MockVault, id: string): string {
  const entry = vault.trash.find((t) => t.id === id) ?? notFound('trash item');
  const parent = parentOf(entry.path);
  if (parent !== null) {
    const parts = parent.split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      const folder = parts.slice(0, i).join('/');
      if (!vault.folders.includes(folder)) vault.folders.push(folder);
    }
  }
  const note = entry.kind === 'note';
  const name = namesIn(vault, parent).has(nameOf(entry.path).toLowerCase())
    ? freeName(vault, parent, note ? titleOf(entry.path) : nameOf(entry.path), note)
    : nameOf(entry.path);
  const target = join(parent, name);
  const move = (path: string) => target + path.slice(entry.path.length);
  for (const [p, text] of Object.entries(entry.files)) vault.files[move(p)] = text;
  vault.folders.push(...entry.folders.map(move));
  vault.trash = vault.trash.filter((t) => t.id !== id);
  return target;
}

export function purgeEntry(vault: MockVault, id: string): void {
  if (!vault.trash.some((t) => t.id === id)) notFound('trash item');
  vault.trash = vault.trash.filter((t) => t.id !== id);
}

export function searchVault(
  vault: MockVault,
  query: string,
  space: string | null,
): VaultSearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return Object.entries(vault.files)
    .filter(([path]) => space === null || spaceOf(path) === space)
    .map(([path, text]) => {
      const haystack = fold(`${titleOf(path)}\n${text}`);
      if (!words.every((w) => haystack.includes(fold(w)))) return null;
      const titleHit = words.some((w) => fold(titleOf(path)).includes(fold(w)));
      const line = text.split('\n').find((l) => words.some((w) => fold(l).includes(fold(w)))) ?? '';
      let snippet = line.slice(0, 120);
      for (const w of words) {
        snippet = snippet.replace(
          new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
          (m) => `${START}${m}${END}`,
        );
      }
      return { hit: { path, title: titleOf(path), space: spaceOf(path), snippet }, titleHit };
    })
    .filter((x): x is { hit: VaultSearchHit; titleHit: boolean } => x !== null)
    .sort((a, b) => Number(b.titleHit) - Number(a.titleHit) || a.hit.path.localeCompare(b.hit.path))
    .map((x) => x.hit)
    .slice(0, 50);
}

/** The task views, as `Index::tasks` reads them. */
export function vaultTasks(
  vault: MockVault,
  view: VaultTaskView,
  space: string | null,
  today: string,
): VaultTask[] {
  const rows = Object.entries(vault.files)
    .filter(([path]) => space === null || spaceOf(path) === space)
    .flatMap(([path, text]) =>
      parseNote(text).tasks.map((task) => ({
        path,
        noteTitle: titleOf(path),
        space: spaceOf(path),
        line: task.line,
        lineText: task.lineText,
        fileHash: hashText(text),
        checked: task.checked,
        text: task.text,
        due: task.due,
        done: task.done,
        heading: task.heading,
        parentLine: task.parentLine,
      })),
    )
    .filter((t) => !t.checked || t.done === today)
    .filter((t) =>
      view === 'today'
        ? t.due !== null && t.due <= today
        : view === 'upcoming'
          ? t.due !== null && t.due > today
          : true,
    );
  const byPlace = (a: VaultTask, b: VaultTask) =>
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.line - b.line;
  return rows.sort((a, b) =>
    view === 'all' ? byPlace(a, b) : (a.due ?? '').localeCompare(b.due ?? '') || byPlace(a, b),
  );
}

/** One task line changed, with the guard of `Vault::edit_task`. Resolves to the new hash. */
export function editTask(
  vault: MockVault,
  task: { path: string; line: number; lineText: string; fileHash: string },
  change: VaultTaskChange,
): string {
  const note = readNote(vault, task.path);
  const lines = note.text.split('\n');
  const same = (i: number) => lines[i] === task.lineText;
  let index = note.hash === task.fileHash && same(task.line - 1) ? task.line - 1 : -1;
  if (note.hash !== task.fileHash) {
    const matches = lines.flatMap((_, i) => (same(i) ? [i] : []));
    if (matches.length === 1) index = matches[0]!;
  }
  if (index === -1) conflict('task');
  const found =
    parseNote(note.text).tasks.find((t) => t.line === index + 1) ??
    invalid('that line is not a task');
  try {
    lines[index] = applyTaskChange(lines[index]!, found.boxAt, change);
  } catch (error) {
    invalid(error instanceof Error ? error.message : 'that line is not a task');
  }
  vault.files[note.path] = lines.join('\n');
  return hashText(vault.files[note.path]!);
}

/** Quick Capture into `<space>/Inbox.md`, as `Vault::capture`. Resolves to that path. */
export function captureToInbox(
  vault: MockVault,
  space: string | null,
  mode: 'note' | 'task',
  text: string,
  description: string,
  due: string | null,
): string {
  if (space !== null && (space.includes('/') || !vault.folders.includes(space))) {
    return space.includes('/') ? invalid('captures go to a space') : notFound('folder');
  }
  let block: string;
  if (mode === 'note') {
    block = [text, description]
      .filter((part) => part.trim())
      .join('\n')
      .replace(/^\n+|\s+$/g, '');
    if (!block.trim()) invalid('write something to capture');
  } else {
    const title = text.trim();
    if (!title || /[\r\n]/.test(title)) invalid('a task needs one line of text');
    block = `- [ ] ${title}`;
    if (due) block = applyTaskChange(block, 2, { kind: 'due', due });
    for (const line of description.split('\n').filter((l) => l.trim()))
      block += `\n  ${line.trim()}`;
  }
  const path = join(space, 'Inbox.md');
  const current = vault.files[path] ?? '';
  if (!current.trim()) {
    vault.files[path] = `${block}\n`;
  } else {
    const out = current.replace(/\n+$/, '');
    const last = out.split('\n').at(-1) ?? '';
    const under = mode === 'task' && !current.endsWith('\n\n') && taskBox(last) !== null;
    vault.files[path] = `${out}${under ? '\n' : '\n\n'}${block}\n`;
  }
  return path;
}

/** "Create sticky from selection", as `Vault::create_sticky_note`. Resolves to the new path. */
export function createStickyNote(
  vault: MockVault,
  source: string,
  title: string,
  text: string,
): string {
  const body = text.trim();
  if (!body) invalid('select some text first');
  const folder = join(spaceOf(requirePath(source)), 'Stickies');
  if (!vault.folders.includes(folder)) vault.folders.push(folder);
  return createNote(vault, folder, title, `${body}\n\nFrom [[${titleOf(source)}]]\n`).path;
}

/** The sticky showing a note or a task view, created when there is none. */
export function stickyFor(
  vault: MockVault,
  item: { path: string } | { view: VaultTaskView; space: string | null },
): MockVaultSticky {
  const found = vault.stickies.find((s) =>
    'path' in item ? s.path === item.path : s.view === item.view && s.space === item.space,
  );
  if (found) return found;
  const sticky: MockVaultSticky =
    'path' in item
      ? { kind: 'vault_note', id: crypto.randomUUID(), path: item.path, view: null, space: null }
      : { kind: 'vault_tasks', id: crypto.randomUUID(), path: null, ...item };
  vault.stickies.push(sticky);
  return sticky;
}

/** The demo notes (`fixtures/demo/`, also `PIW_DEMO=1` in the app), by vault path. */
const DEMO_FILES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../fixtures/demo/**/*.md', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([file, text]) => [file.replace(/^.*\/fixtures\/demo\//, ''), text]),
);

/** `{{today}}`, `{{today+3}}`, `{{today-2}}` as dates around `today` (as `vault/demo.rs`). */
export function expandDates(text: string, today: string): string {
  return text.replace(/\{\{today(?:([+-])(\d+))?\}\}/g, (_, sign?: string, n?: string) =>
    addDays(today, sign ? (sign === '-' ? -1 : 1) * Number(n) : 0),
  );
}

/** A vault holding `files` (path → text, dates expanded) and every folder above them. */
export function vaultFrom(files: Record<string, string>, today: string = todayString()): MockVault {
  const folders = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i += 1) folders.add(parts.slice(0, i).join('/'));
  }
  return {
    root: '/home/you/Piw',
    stickies: [],
    folders: [...folders].sort(),
    trash: [],
    files: Object.fromEntries(
      Object.entries(files).map(([path, text]) => [path, expandDates(text, today)]),
    ),
  };
}

/** The demo vault: the same notes as `pnpm demo` in the app. */
export function seedVault(today: string = todayString()): MockVault {
  return vaultFrom(DEMO_FILES, today);
}
