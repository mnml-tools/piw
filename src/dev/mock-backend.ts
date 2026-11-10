/**
 * Dev-only in-memory implementation of every Rust command called by `src/lib/ipc/api.ts`, so
 * the UI runs in a plain browser (see `install.ts` and docs/architecture.md#browser-preview).
 * Semantics follow `src-tauri/src/commands/*` closely enough for UI work: writes run on a copy
 * of the store (a failed command changes nothing, like a rolled-back transaction) and report the
 * same `ChangeSet` the Rust side broadcasts as `piw://changed`.
 */
import { detectPlatform } from '@/app/theme';
import type { AppStatus } from '@/lib/ipc/bindings/AppStatus';
import type { CaptureDraft } from '@/lib/ipc/bindings/CaptureDraft';
import type { CaptureMode } from '@/lib/ipc/bindings/CaptureMode';
import type { ChangeSet } from '@/lib/ipc/bindings/ChangeSet';
import type { ColorName } from '@/lib/ipc/bindings/ColorName';
import type { EntityKind } from '@/lib/ipc/bindings/EntityKind';
import type { PlatformInfo } from '@/lib/ipc/bindings/PlatformInfo';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { ShortcutStatus } from '@/lib/ipc/bindings/ShortcutStatus';
import type { StickyRecord } from '@/lib/ipc/bindings/StickyRecord';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import type { VaultEntry } from '@/lib/ipc/bindings/VaultEntry';
import type { VaultImportReport } from '@/lib/ipc/bindings/VaultImportReport';
import type { VaultImportStatus } from '@/lib/ipc/bindings/VaultImportStatus';
import type { VaultNote } from '@/lib/ipc/bindings/VaultNote';
import type { VaultPinned } from '@/lib/ipc/bindings/VaultPinned';
import type { VaultStickyView } from '@/lib/ipc/bindings/VaultStickyView';
import type { VaultRenamed } from '@/lib/ipc/bindings/VaultRenamed';
import type { VaultSearchHit } from '@/lib/ipc/bindings/VaultSearchHit';
import type { VaultStatus } from '@/lib/ipc/bindings/VaultStatus';
import type { VaultTask } from '@/lib/ipc/bindings/VaultTask';
import type { VaultTaskChange } from '@/lib/ipc/bindings/VaultTaskChange';
import type { VaultTaskView } from '@/lib/ipc/bindings/VaultTaskView';
import type { VaultTrashItem } from '@/lib/ipc/bindings/VaultTrashItem';
import packageJson from '../../package.json';
import * as vaultMock from './mock-vault';
import type { MockVault } from './mock-vault';
import {
  DEFAULT_SETTINGS,
  fail,
  invalid,
  notFound,
  now,
  STICKY_DEFAULT_HEIGHT,
  STICKY_DEFAULT_WIDTH,
  type StickyRow,
  type Store,
} from './mock-store';

const APP_VERSION = packageJson.version;
const SCHEMA_VERSION = 3;
/** Above this many open stickies the workspace shows a memory warning. */
const STICKY_SOFT_LIMIT = 8;

type Empty = Record<string, never>;
type Target = { target: StickyTarget };

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
  reset_sticky_positions: [Empty, null];
  // Settings and capture drafts
  get_settings: [Empty, Settings];
  update_settings: [{ patch: Partial<Settings> }, Settings];
  get_capture_draft: [Empty, CaptureDraft | null];
  save_capture_draft: [{ draft: CaptureDraft }, null];
  clear_capture_draft: [Empty, null];
  // Vault
  vault_status: [Empty, VaultStatus];
  vault_tree: [Empty, VaultEntry[]];
  vault_read_note: [{ path: string }, VaultNote];
  vault_write_note: [{ path: string; text: string; expectedHash: string }, VaultNote];
  vault_create_note: [{ folder: string | null; title: string; text: string }, VaultNote];
  vault_create_folder: [{ parent: string | null; name: string }, string];
  vault_rename: [{ from: string; to: string }, VaultRenamed];
  vault_trash: [{ path: string }, VaultTrashItem];
  vault_list_trash: [Empty, VaultTrashItem[]];
  vault_restore: [{ id: string }, string];
  vault_purge: [{ id: string }, null];
  vault_search: [{ query: string; space: string | null }, VaultSearchHit[]];
  vault_resolve_link: [{ target: string }, string | null];
  vault_pin_note: [{ path: string }, number];
  vault_pin_tasks: [{ view: VaultTaskView; space: string | null }, number];
  vault_sticky_view: [Target, VaultStickyView];
  vault_pinned: [Empty, VaultPinned[]];
  vault_capture: [
    {
      space: string | null;
      mode: CaptureMode;
      text: string;
      description: string;
      due: string | null;
    },
    string,
  ];
  vault_sticky_note: [{ path: string; title: string; text: string }, string];
  vault_tasks: [{ view: VaultTaskView; space: string | null; today: string }, VaultTask[]];
  vault_edit_task: [
    { path: string; line: number; lineText: string; fileHash: string; change: VaultTaskChange },
    string,
  ];
  vault_import_status: [Empty, VaultImportStatus];
  vault_import: [Empty, VaultImportReport];
  choose_vault_folder: [Empty, string | null];
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
// Stickies

const same = (a: StickyTarget, b: StickyTarget) => a.kind === b.kind && a.id === b.id;
const stickyLabel = (target: StickyTarget) => `sticky:${target.kind}:${target.id}`;

function findSticky(store: Store, target: StickyTarget): StickyRow | undefined {
  return store.stickies.find((sticky) => same(sticky.target, target));
}

/** Checks that the vault still knows what a sticky shows (`stickies::live_target`). */
function requireLiveTarget(store: Store, target: StickyTarget): void {
  if (!store.vault.stickies.some((s) => s.kind === target.kind && s.id === target.id)) {
    notFound('item');
  }
}

function touchSticky(ctx: Ctx, target: StickyTarget): void {
  ctx.touch('sticky', stickyLabel(target));
}

/** Pins `target` (it must exist) and shows it, as `pin_and_show`. Resolves to the open count. */
function pinSticky(ctx: Ctx, target: StickyTarget): number {
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

function stickyView(sticky: vaultMock.MockVaultSticky): VaultStickyView {
  return sticky.path !== null
    ? {
        kind: 'note',
        path: sticky.path,
        title: sticky.path.replace(/^.*\//, '').replace(/\.md$/i, ''),
      }
    : { kind: 'tasks', view: sticky.view ?? 'today', space: sticky.space };
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
  open_sticky: write(({ target }, ctx) => pinSticky(ctx, target)),
  close_sticky: write(({ target }, ctx) => {
    updateSticky(ctx, target, (row) => (row.isOpen = false));
    ctx.host.closeSticky(target);
    return null;
  }),
  unpin_sticky: write(({ target }, ctx) => {
    ctx.store.stickies = ctx.store.stickies.filter((sticky) => !same(sticky.target, target));
    ctx.store.vault.stickies = ctx.store.vault.stickies.filter(
      (s) => !(s.kind === target.kind && s.id === target.id),
    );
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
  reset_sticky_positions: write((_, ctx) => {
    for (const sticky of ctx.store.stickies) {
      sticky.placement.x = null;
      sticky.placement.y = null;
    }
    ctx.touch('sticky', '*');
    return null;
  }),

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

  // Vault (mock-vault.ts). Every write reports the paths as `file` changes.
  vault_status: read((_, { store }) => ({ phase: 'ready', root: store.vault.root, error: null })),
  vault_tree: read((_, { store }) => vaultMock.vaultTree(openVault(store))),
  vault_read_note: read(({ path }, { store }) => vaultMock.readNote(openVault(store), path)),
  vault_write_note: write(({ path, text, expectedHash }, ctx) => {
    const note = vaultMock.writeNote(openVault(ctx.store), path, text, expectedHash);
    ctx.touch('file', note.path);
    return note;
  }),
  vault_create_note: write(({ folder, title, text }, ctx) => {
    const note = vaultMock.createNote(openVault(ctx.store), folder, title, text);
    ctx.touch('file', note.path);
    return note;
  }),
  vault_create_folder: write(({ parent, name }, ctx) => {
    const path = vaultMock.createFolder(openVault(ctx.store), parent, name);
    ctx.touch('file', path);
    return path;
  }),
  vault_rename: write(({ from, to }, ctx) => {
    const renamed = vaultMock.renameEntry(openVault(ctx.store), from, to);
    for (const path of [from, renamed.path, ...renamed.linked]) ctx.touch('file', path);
    return renamed;
  }),
  vault_trash: write(({ path }, ctx) => {
    const item = vaultMock.trashEntry(openVault(ctx.store), path);
    ctx.touch('file', item.path);
    ctx.touch('file', '');
    return item;
  }),
  vault_list_trash: read((_, { store }) => vaultMock.listTrash(openVault(store))),
  vault_restore: write(({ id }, ctx) => {
    const path = vaultMock.restoreEntry(openVault(ctx.store), id);
    ctx.touch('file', path);
    ctx.touch('file', '');
    return path;
  }),
  vault_purge: write(({ id }, ctx) => {
    vaultMock.purgeEntry(openVault(ctx.store), id);
    ctx.touch('file', '');
    return null;
  }),
  vault_search: read(({ query, space }, { store }) =>
    vaultMock.searchVault(openVault(store), query, space),
  ),
  vault_resolve_link: read(({ target }, { store }) =>
    vaultMock.resolveLink(openVault(store), target),
  ),
  vault_tasks: read(({ view, space, today }, { store }) =>
    vaultMock.vaultTasks(openVault(store), view, space, today),
  ),
  vault_pin_note: write(({ path }, ctx) => {
    const vault = openVault(ctx.store);
    const note = vaultMock.readNote(vault, path);
    const sticky = vaultMock.stickyFor(vault, { path: note.path });
    return pinSticky(ctx, { kind: sticky.kind, id: sticky.id });
  }),
  vault_pin_tasks: write(({ view, space }, ctx) => {
    const sticky = vaultMock.stickyFor(openVault(ctx.store), { view, space });
    return pinSticky(ctx, { kind: sticky.kind, id: sticky.id });
  }),
  vault_sticky_view: read(({ target }, { store }) => {
    const sticky = openVault(store).stickies.find(
      (s) => s.kind === target.kind && s.id === target.id,
    );
    return sticky ? stickyView(sticky) : notFound('sticky');
  }),
  vault_pinned: read((_, { store }) =>
    openVault(store).stickies.flatMap((sticky) => {
      const row = findSticky(store, { kind: sticky.kind, id: sticky.id });
      if (!row) return [];
      const target = { kind: sticky.kind, id: sticky.id };
      return [{ target, shows: stickyView(sticky), isOpen: row.isOpen }];
    }),
  ),
  vault_capture: write(({ space, mode, text, description, due }, ctx) => {
    const path = vaultMock.captureToInbox(
      openVault(ctx.store),
      space,
      mode,
      text,
      description,
      due,
    );
    ctx.touch('file', path);
    return path;
  }),
  vault_sticky_note: write(({ path, title, text }, ctx) => {
    const made = vaultMock.createStickyNote(openVault(ctx.store), path, title, text);
    ctx.touch('file', made);
    return made;
  }),
  vault_edit_task: write(({ change, ...task }, ctx) => {
    const hash = vaultMock.editTask(openVault(ctx.store), task, change);
    ctx.touch('file', task.path);
    return hash;
  }),
  vault_import_status: read((_, { store }) => ({
    pending: store.importPending,
    importedAt: store.settings.vaultImportedAt,
  })),
  vault_import: write((_, ctx) => {
    const path = vaultMock.createNote(
      openVault(ctx.store),
      null,
      'Imported from Piw 0.1',
      '- [ ] A task from the old database\n',
    ).path;
    ctx.store.importPending = false;
    ctx.store.settings.vaultImportedAt = now();
    ctx.touch('file', path);
    ctx.touch('settings', '*');
    return { notes: 1, documents: 0, sections: 0, tasks: 1 };
  }),
  choose_vault_folder: read((_, { host }) => {
    host.log('choose_vault_folder: the dev mock has no folder picker');
    return null;
  }),
};

function openVault(store: Store): MockVault {
  return store.vault;
}

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
