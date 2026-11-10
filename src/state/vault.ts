import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { VaultTaskView } from '@/lib/ipc/bindings/VaultTaskView';

/** What a tab of the vault shell shows (docs/redesign.md, "Layout"). */
export type VaultTab =
  | { type: 'note'; path: string }
  | { type: 'tasks'; view: VaultTaskView }
  | { type: 'trash' }
  | { type: 'settings' };

export function tabKey(tab: VaultTab): string {
  if (tab.type === 'note') return `note:${tab.path}`;
  if (tab.type === 'tasks') return `tasks:${tab.view}`;
  return tab.type;
}

/** True when `path` is `folder` or inside it. */
export function isInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

export interface VaultUiState {
  /** The vault folder this state belongs to (`null` until the first one opens). */
  root: string | null;
  tabs: VaultTab[];
  /** Key of the active tab, or `null` when none is open. */
  active: string | null;
  /** Space filter: a top-level folder, or `null` for "All spaces". */
  space: string | null;
  /** Folders open in the tree. */
  expanded: string[];
  searchOpen: boolean;
  /** Path of a note whose title should take focus once it opens (a new note). */
  renaming: string | null;
  /** Path of a note whose text should take focus once it opens (after its title was renamed). */
  focusText: string | null;
  /** A line to put the caret on once its note is shown (from a task view or the panel). */
  goto: { path: string; line: number } | null;
  /** The note panel (tasks and outline) on the right. */
  panelOpen: boolean;
  /** What the sidebar lists: the vault's notes, or the task views. */
  sidebarMode: 'notes' | 'tasks';
  /** The active note's save state, for the status bar (`null` with no note open). */
  saveState: 'saved' | 'saving' | 'error' | 'conflict' | null;

  /** Activates the tab if it is open, otherwise opens it after the active one. */
  open: (tab: VaultTab) => void;
  close: (key: string) => void;
  activate: (key: string) => void;
  /** Moves the active tab by `step`, wrapping around. */
  cycle: (step: number) => void;
  /** A note or folder moved: tabs under `from` follow it to `to`. */
  renamed: (from: string, to: string) => void;
  /** A note or folder is gone: its tabs close. */
  removed: (path: string) => void;
  setSpace: (space: string | null) => void;
  toggleFolder: (path: string) => void;
  /** Opens `path` and every folder above it. */
  reveal: (path: string) => void;
  setSearchOpen: (open: boolean) => void;
  setRenaming: (path: string | null) => void;
  setFocusText: (path: string | null) => void;
  /** Opens a note at a line. */
  openAt: (path: string, line: number) => void;
  clearGoto: () => void;
  togglePanel: () => void;
  setSidebarMode: (mode: 'notes' | 'tasks') => void;
  setSaveState: (state: VaultUiState['saveState']) => void;
  /**
   * The vault at `root` is open. When it is another folder than before (Settings › Data ›
   * Change folder…), the notes, folders and space of the old one are forgotten; task views,
   * Trash and Settings stay open.
   */
  adopt: (root: string) => void;
}

function withTabs(state: VaultUiState, tabs: VaultTab[], preferred: string | null) {
  const keys = tabs.map(tabKey);
  if (preferred !== null && keys.includes(preferred)) return { tabs, active: preferred };
  if (state.active !== null && keys.includes(state.active)) return { tabs, active: state.active };
  // The closed tab's neighbour takes over, as in Zap.
  const index = state.active === null ? -1 : state.tabs.map(tabKey).indexOf(state.active);
  const next = tabs[Math.min(Math.max(index, 0), tabs.length - 1)];
  return { tabs, active: next ? tabKey(next) : null };
}

function ancestors(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

export const useVaultUi = create<VaultUiState>()(
  persist(
    (set) => ({
      root: null,
      tabs: [],
      active: null,
      space: null,
      expanded: [],
      searchOpen: false,
      renaming: null,
      focusText: null,
      goto: null,
      panelOpen: true,
      sidebarMode: 'notes',
      saveState: null,

      open: (tab) =>
        set((state) => {
          const key = tabKey(tab);
          if (state.tabs.some((t) => tabKey(t) === key)) return { active: key };
          const at = state.active === null ? -1 : state.tabs.map(tabKey).indexOf(state.active);
          const tabs = [...state.tabs];
          tabs.splice(at + 1, 0, tab);
          return { tabs, active: key };
        }),
      close: (key) =>
        set((state) =>
          withTabs(
            state,
            state.tabs.filter((t) => tabKey(t) !== key),
            null,
          ),
        ),
      activate: (key) => set({ active: key }),
      cycle: (step) =>
        set((state) => {
          if (state.tabs.length === 0) return {};
          const keys = state.tabs.map(tabKey);
          const at = state.active === null ? 0 : Math.max(keys.indexOf(state.active), 0);
          return { active: keys[(at + step + keys.length) % keys.length] ?? null };
        }),
      renamed: (from, to) =>
        set((state) => {
          const move = (path: string) =>
            isInside(path, from) ? to + path.slice(from.length) : path;
          const tabs = state.tabs.map((t) =>
            t.type === 'note' ? { ...t, path: move(t.path) } : t,
          );
          const active =
            state.active?.startsWith('note:') === true
              ? `note:${move(state.active.slice('note:'.length))}`
              : state.active;
          return {
            tabs,
            active,
            expanded: state.expanded.map(move),
            space:
              state.space !== null && isInside(state.space, from) ? move(state.space) : state.space,
            renaming: state.renaming === null ? null : move(state.renaming),
            focusText: state.focusText === null ? null : move(state.focusText),
            goto: state.goto === null ? null : { ...state.goto, path: move(state.goto.path) },
          };
        }),
      removed: (path) =>
        set((state) => ({
          ...withTabs(
            state,
            state.tabs.filter((t) => t.type !== 'note' || !isInside(t.path, path)),
            null,
          ),
          expanded: state.expanded.filter((folder) => !isInside(folder, path)),
        })),
      setSpace: (space) => set({ space }),
      toggleFolder: (path) =>
        set((state) => ({
          expanded: state.expanded.includes(path)
            ? state.expanded.filter((folder) => folder !== path)
            : [...state.expanded, path],
        })),
      reveal: (path) =>
        set((state) => ({
          expanded: [...new Set([...state.expanded, ...ancestors(path)])],
        })),
      setSearchOpen: (open) => set({ searchOpen: open }),
      setRenaming: (path) => set({ renaming: path }),
      setFocusText: (path) => set({ focusText: path }),
      openAt: (path, line) =>
        set((state) => {
          const key = tabKey({ type: 'note', path });
          if (state.tabs.some((t) => tabKey(t) === key))
            return { active: key, goto: { path, line } };
          const at = state.active === null ? -1 : state.tabs.map(tabKey).indexOf(state.active);
          const tabs = [...state.tabs];
          tabs.splice(at + 1, 0, { type: 'note', path });
          return { tabs, active: key, goto: { path, line } };
        }),
      clearGoto: () => set({ goto: null }),
      togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
      setSidebarMode: (mode) => set({ sidebarMode: mode }),
      setSaveState: (saveState) => set({ saveState }),
      adopt: (root) =>
        set((state) => {
          if (state.root === root) return {};
          if (state.root === null) return { root };
          return {
            root,
            ...withTabs(
              state,
              state.tabs.filter((t) => t.type !== 'note'),
              null,
            ),
            space: null,
            expanded: [],
            renaming: null,
            focusText: null,
            goto: null,
          };
        }),
    }),
    {
      name: 'piw.vault',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        root: state.root,
        tabs: state.tabs,
        active: state.active,
        space: state.space,
        expanded: state.expanded,
        panelOpen: state.panelOpen,
        sidebarMode: state.sidebarMode,
      }),
    },
  ),
);
