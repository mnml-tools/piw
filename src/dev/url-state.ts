/**
 * Dev-only: lets a URL choose what the browser mock shows, so screenshots need no clicks.
 * Notes are found by a case-insensitive path substring (e.g. `?note=refactor`).
 * See docs/architecture.md#browser-preview for the list of parameters.
 */
import type { StickyKind } from '@/lib/ipc/bindings/StickyKind';
import type { VaultTaskView } from '@/lib/ipc/bindings/VaultTaskView';
import { useVaultUi, type VaultTab } from '@/state/vault';
import type { Store } from './mock-store';
import { stickyFor } from './mock-vault';

const TASK_VIEWS: readonly string[] = ['today', 'upcoming', 'all'] satisfies VaultTaskView[];

const contains = (value: string, query: string) =>
  value.toLowerCase().includes(query.trim().toLowerCase());

function findNotePath(store: Store, query: string): string | undefined {
  return Object.keys(store.vault.files).find((path) => contains(path, query));
}

/**
 * Resolves a friendly sticky label (`sticky:vault_note:refactor`, `sticky:vault_tasks:today`)
 * to the real one (`sticky:vault_note:<id>`). Other labels are returned unchanged.
 */
export function resolveWindowLabel(raw: string, store: Store): string {
  const [prefix, kind, ...rest] = raw.split(':');
  const query = rest.join(':');
  if (prefix !== 'sticky' || !query) return raw;
  const finders: Record<StickyKind, (q: string) => string | undefined> = {
    vault_note: (q) => {
      const path = findNotePath(store, q);
      return path ? stickyFor(store.vault, { path }).id : undefined;
    },
    vault_tasks: (q) =>
      TASK_VIEWS.includes(q)
        ? stickyFor(store.vault, { view: q as VaultTaskView, space: null }).id
        : undefined,
  };
  const find = finders[kind as StickyKind] as (typeof finders)[StickyKind] | undefined;
  const id = find?.(query);
  if (id === undefined) console.warn(`[piw dev mock] no ${kind ?? ''} matches "${query}"`);
  return id === undefined ? raw : `sticky:${kind}:${id}`;
}

/**
 * Applies `note`, `tasks`, `space`, `open=trash|settings`, `panel=0` and `search=1` to the vault
 * shell. A URL with any query parameter starts from the default layout, so persisted UI state
 * (localStorage) never changes what a given URL renders; a bare `/` keeps it.
 */
export function applyWorkspaceParams(params: URLSearchParams, store: Store): void {
  if (params.toString() === '') return;
  const apply = () => {
    const ui = () => useVaultUi.getState();
    const warn = (message: string) => console.warn(`[piw dev mock] ${message}`);
    useVaultUi.setState(useVaultUi.getInitialState(), true);
    const open = (tab: VaultTab) => ui().open(tab);

    const space = params.get('space');
    if (space !== null) ui().setSpace(space);

    const tasks = params.get('tasks');
    if (tasks !== null) {
      if (TASK_VIEWS.includes(tasks)) open({ type: 'tasks', view: tasks as VaultTaskView });
      else warn(`unknown task view "${tasks}" (use ${TASK_VIEWS.join(', ')})`);
    }

    const other = params.get('open');
    if (other === 'trash' || other === 'settings') open({ type: other });
    else if (other !== null) warn(`unknown tab "${other}" (use trash, settings)`);

    const note = params.get('note');
    if (note) {
      const path = findNotePath(store, note);
      if (!path) warn(`no note matches "${note}"`);
      else {
        ui().reveal(path);
        open({ type: 'note', path });
      }
    }

    if (params.get('panel') === '0' && ui().panelOpen) ui().togglePanel();
    if (params.get('search') === '1') ui().setSearchOpen(true);
  };
  // localStorage hydrates synchronously; wait anyway if it ever becomes async.
  if (useVaultUi.persist.hasHydrated()) apply();
  else useVaultUi.persist.onFinishHydration(apply);
}
