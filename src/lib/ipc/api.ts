/**
 * Typed wrappers for every Rust command. UI code calls these instead of `invoke` so argument
 * names and payload types are checked against the generated bindings (docs/architecture.md#ipc-contract).
 */
import { call } from './client';
import type { AppStatus } from './bindings/AppStatus';
import type { CaptureDraft } from './bindings/CaptureDraft';
import type { CaptureMode } from './bindings/CaptureMode';
import type { ColorName } from './bindings/ColorName';
import type { PlatformInfo } from './bindings/PlatformInfo';
import type { Settings } from './bindings/Settings';
import type { StickyRecord } from './bindings/StickyRecord';
import type { StickyTarget } from './bindings/StickyTarget';
import type { VaultEntry } from './bindings/VaultEntry';
import type { VaultImportReport } from './bindings/VaultImportReport';
import type { VaultImportStatus } from './bindings/VaultImportStatus';
import type { VaultNote } from './bindings/VaultNote';
import type { VaultPinned } from './bindings/VaultPinned';
import type { VaultRenamed } from './bindings/VaultRenamed';
import type { VaultSearchHit } from './bindings/VaultSearchHit';
import type { VaultStatus } from './bindings/VaultStatus';
import type { VaultStickyView } from './bindings/VaultStickyView';
import type { VaultTask } from './bindings/VaultTask';
import type { VaultTaskChange } from './bindings/VaultTaskChange';
import type { VaultTaskView } from './bindings/VaultTaskView';
import type { VaultTrashItem } from './bindings/VaultTrashItem';

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
  // (docs/ui-design-system.md §17 rule 9). Pinning a vault note or view: `vaultPin*`.
  /** Reopens a pinned sticky. Resolves to the number of open stickies. */
  openSticky: (target: StickyTarget) => call<number>('open_sticky', { target }),
  /** Hide from desktop: closes the window, keeps the sticky pinned. */
  closeSticky: (target: StickyTarget) => call<void>('close_sticky', { target }),
  /** Remove from the desktop for good. The note itself is untouched. */
  unpinSticky: (target: StickyTarget) => call<void>('unpin_sticky', { target }),
  setStickyAlwaysOnTop: (target: StickyTarget, enabled: boolean) =>
    call<void>('set_sticky_always_on_top', { target, enabled }),
  setStickyColor: (target: StickyTarget, color: ColorName | null) =>
    call<void>('set_sticky_color', { target, color }),
  getSticky: (target: StickyTarget) => call<StickyRecord | null>('get_sticky', { target }),
  resetStickyPositions: () => call<void>('reset_sticky_positions'),

  // Settings and capture drafts
  getSettings: () => call<Settings>('get_settings'),
  updateSettings: (patch: Partial<Settings>) => call<Settings>('update_settings', { patch }),
  getCaptureDraft: () => call<CaptureDraft | null>('get_capture_draft'),
  saveCaptureDraft: (draft: CaptureDraft) => call<void>('save_capture_draft', { draft }),
  clearCaptureDraft: () => call<void>('clear_capture_draft'),

  // Vault (docs/redesign.md): a folder of Markdown notes, addressed by vault-relative paths.
  vaultStatus: () => call<VaultStatus>('vault_status'),
  vaultTree: () => call<VaultEntry[]>('vault_tree'),
  vaultReadNote: (path: string) => call<VaultNote>('vault_read_note', { path }),
  /** Refused with `conflict` when the file no longer has `expectedHash`. */
  vaultWriteNote: (path: string, text: string, expectedHash: string) =>
    call<VaultNote>('vault_write_note', { path, text, expectedHash }),
  /** Creates `folder/title.md` (the vault root when `folder` is null), with a free name. */
  vaultCreateNote: (folder: string | null, title: string, text = '') =>
    call<VaultNote>('vault_create_note', { folder, title, text }),
  vaultCreateFolder: (parent: string | null, name: string) =>
    call<string>('vault_create_folder', { parent, name }),
  /** Renames or moves a note or folder; links to a renamed note follow it. */
  vaultRename: (from: string, to: string) => call<VaultRenamed>('vault_rename', { from, to }),
  vaultTrash: (path: string) => call<VaultTrashItem>('vault_trash', { path }),
  vaultListTrash: () => call<VaultTrashItem[]>('vault_list_trash'),
  /** Resolves to where the item went (a free name if the old one is taken). */
  vaultRestore: (id: string) => call<string>('vault_restore', { id }),
  vaultPurge: (id: string) => call<void>('vault_purge', { id }),
  vaultSearch: (query: string, space: string | null) =>
    call<VaultSearchHit[]>('vault_search', { query, space }),
  vaultResolveLink: (target: string) => call<string | null>('vault_resolve_link', { target }),
  /** A task view; `today` is the local date (tasks ticked today stay listed). */
  vaultTasks: (view: VaultTaskView, space: string | null, today: string) =>
    call<VaultTask[]>('vault_tasks', { view, space, today }),
  /** Pin to desktop: a sticky for a vault note. Resolves to the number of open stickies. */
  vaultPinNote: (path: string) => call<number>('vault_pin_note', { path }),
  /** Pin to desktop: a sticky for a task view and its space filter. */
  vaultPinTasks: (view: VaultTaskView, space: string | null) =>
    call<number>('vault_pin_tasks', { view, space }),
  /** What a vault sticky shows (a sticky window asks for its own). */
  vaultStickyView: (target: StickyTarget) => call<VaultStickyView>('vault_sticky_view', { target }),
  vaultPinned: () => call<VaultPinned[]>('vault_pinned'),
  /** Quick Capture into `<space>/Inbox.md`; resolves to that path. */
  vaultCapture: (input: {
    space: string | null;
    mode: CaptureMode;
    text: string;
    description: string;
    due: string | null;
  }) => call<string>('vault_capture', input),
  /** "Create sticky from selection": a note in the space's Stickies folder; resolves to its path. */
  vaultStickyNote: (path: string, title: string, text: string) =>
    call<string>('vault_sticky_note', { path, title, text }),
  /** Changes one task's line, guarded by its text and the note's hash; resolves to the new hash. */
  vaultEditTask: (
    task: Pick<VaultTask, 'path' | 'line' | 'lineText' | 'fileHash'>,
    change: VaultTaskChange,
  ) =>
    call<string>('vault_edit_task', {
      path: task.path,
      line: task.line,
      lineText: task.lineText,
      fileHash: task.fileHash,
      change,
    }),
  /** Whether Piw 0.1 left notes or tasks to import, and when they were imported. */
  vaultImportStatus: () => call<VaultImportStatus>('vault_import_status'),
  /** Imports Piw 0.1's notes and tasks into the vault now (files get free names). */
  vaultImport: () => call<VaultImportReport>('vault_import'),
  /** A native folder picker; the vault there opens. Resolves to the folder, or null. */
  chooseVaultFolder: () => call<string | null>('choose_vault_folder'),
} as const;
