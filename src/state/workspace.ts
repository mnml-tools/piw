import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { TaskView } from '@/lib/ipc/bindings/TaskView';
import type { NoteSort } from '@/lib/ipc/bindings/NoteSort';

/** Top-level destinations of the workspace window. */
export type Area = 'inbox' | 'notes' | 'tasks' | 'pinned' | 'trash' | 'settings';

/** What the content region shows on top of the area (an open item). */
export type Focus =
  | { type: 'none' }
  /** An unsaved note: the record is created on the first non-whitespace character. */
  | { type: 'newNote' }
  | { type: 'note'; id: string }
  | { type: 'document'; id: string; tabId?: string };

export interface WorkspaceState {
  area: Area;
  focus: Focus;
  /** Space filter; `null` means "All" (a filter, not a space). */
  spaceId: string | null;
  /** Task open in the contextual drawer (never persisted). */
  drawerTaskId: string | null;
  /** Task to highlight after navigation (e.g. from search). */
  selectedTaskId: string | null;
  notesSplit: boolean;
  notesSort: NoteSort;
  tasksView: TaskView;
  /** Last active tab per document. */
  documentTabs: Record<string, string>;
  history: { area: Area; focus: Focus }[];
  searchOpen: boolean;
  /** Incremented to ask the Tasks area to focus its "Add task" row (Mod+T). */
  addTaskRequest: number;

  navigate: (area: Area) => void;
  openNote: (id: string) => void;
  newNote: () => void;
  requestAddTask: () => void;
  openDocument: (id: string, tabId?: string) => void;
  back: () => void;
  /** Changes what is open without adding a Back entry (e.g. a draft became a record). */
  replaceFocus: (focus: Focus) => void;
  setSpace: (spaceId: string | null) => void;
  openTask: (id: string | null) => void;
  setTasksView: (view: TaskView) => void;
  setNotesSort: (sort: NoteSort) => void;
  toggleNotesSplit: () => void;
  rememberDocumentTab: (documentId: string, tabId: string) => void;
  setSearchOpen: (open: boolean) => void;
}

const MAX_HISTORY = 30;

/** Keys of v1 persisted state that no longer exist. */
const RETIRED_KEYS = ['sidebarCollapsed', 'documentsCollapsed'] as const;

/**
 * Upgrades persisted layout preferences from an older version. Tolerant: anything that is not an
 * object yields an empty state (the defaults), and unknown keys from older shells are dropped.
 */
export function migratePersisted(persisted: unknown): Partial<WorkspaceState> {
  if (typeof persisted !== 'object' || persisted === null) return {};
  const state: Record<string, unknown> = { ...persisted };
  for (const key of RETIRED_KEYS) delete state[key];
  return state as Partial<WorkspaceState>;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      area: 'inbox',
      focus: { type: 'none' },
      spaceId: null,
      drawerTaskId: null,
      selectedTaskId: null,
      notesSplit: false,
      notesSort: 'updated',
      tasksView: 'all',
      documentTabs: {},
      history: [],
      searchOpen: false,
      addTaskRequest: 0,

      navigate: (area) => {
        const { area: current, focus, history } = get();
        if (current === area && focus.type === 'none') return;
        set({
          area,
          focus: { type: 'none' },
          drawerTaskId: null,
          history: [...history, { area: current, focus }].slice(-MAX_HISTORY),
        });
      },
      openNote: (id) => {
        const { area, focus, history } = get();
        set({
          area: area === 'inbox' || area === 'pinned' ? area : 'notes',
          focus: { type: 'note', id },
          history: [...history, { area, focus }].slice(-MAX_HISTORY),
        });
      },
      newNote: () => {
        const { area, focus, history } = get();
        set({
          area: 'notes',
          focus: { type: 'newNote' },
          drawerTaskId: null,
          history: [...history, { area, focus }].slice(-MAX_HISTORY),
        });
      },
      requestAddTask: () => {
        const { area, focus, history, addTaskRequest } = get();
        set({
          area: area === 'inbox' ? 'inbox' : 'tasks',
          focus: { type: 'none' },
          addTaskRequest: addTaskRequest + 1,
          history: area === 'tasks' ? history : [...history, { area, focus }].slice(-MAX_HISTORY),
        });
      },
      openDocument: (id, tabId) => {
        const { area, focus, history } = get();
        set({
          area: 'notes',
          focus: { type: 'document', id, ...(tabId ? { tabId } : {}) },
          drawerTaskId: null,
          history: [...history, { area, focus }].slice(-MAX_HISTORY),
        });
      },
      back: () => {
        const { history } = get();
        const previous = history.at(-1);
        if (!previous) {
          set({ focus: { type: 'none' } });
          return;
        }
        set({ ...previous, history: history.slice(0, -1), drawerTaskId: null });
      },
      replaceFocus: (focus) => set({ focus }),
      setSpace: (spaceId) => set({ spaceId }),
      openTask: (id) => set({ drawerTaskId: id, selectedTaskId: id ?? get().selectedTaskId }),
      setTasksView: (tasksView) => set({ tasksView }),
      setNotesSort: (notesSort) => set({ notesSort }),
      toggleNotesSplit: () => set({ notesSplit: !get().notesSplit }),
      rememberDocumentTab: (documentId, tabId) =>
        set({ documentTabs: { ...get().documentTabs, [documentId]: tabId } }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
    }),
    {
      name: 'piw.workspace',
      version: 2,
      // v1 also saved the sidebar's `sidebarCollapsed` and `documentsCollapsed`; the top-bar shell
      // has neither, so they are dropped and every other preference carries over.
      migrate: (persisted) => migratePersisted(persisted),
      // localStorage may be unavailable (private mode, blocked storage); fall back silently.
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return undefined as unknown as Storage;
        }
      }),
      // Layout preferences only (docs/ui-design-system.md §9). The open drawer is contextual and
      // never saved.
      partialize: (state) => ({
        area: state.area === 'settings' ? 'inbox' : state.area,
        spaceId: state.spaceId,
        notesSplit: state.notesSplit,
        notesSort: state.notesSort,
        tasksView: state.tasksView,
        documentTabs: state.documentTabs,
      }),
    },
  ),
);
