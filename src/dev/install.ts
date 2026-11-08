/**
 * Dev-only: serves the UI from an in-memory mock backend when it runs in a plain browser
 * (`pnpm dev`, then http://localhost:1420). `main.tsx` imports this module only when
 * `import.meta.env.DEV` is true and the page is not inside Tauri, so production builds never
 * contain it. Usage: docs/architecture.md#browser-preview.
 *
 * - Commands: `mockIPC` routes every `invoke` to `mock-backend.ts`.
 * - Events: Tauri's event plugin (`listen`, `unlisten`, `emit`, `emit_to`) is emulated here, so
 *   the backend's `piw://changed` reaches TanStack Query exactly as in the app.
 * - Windows: `?window=` picks the label (`main`, `capture`, `sticky:<kind>:<id or title>`,
 *   `gallery`) through `mockWindows`, and `isTauri` is set so the app takes its Tauri paths.
 * - Stickies: "Pin to desktop" logs the sticky's URL. With `?popups=1` it opens a popup instead
 *   (off by default: embedded browsers such as the Claude browser pane replace the page instead
 *   of opening a popup). Popups share their opener's data live over a `BroadcastChannel`; any
 *   other page load starts from fresh demo data.
 */
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { ChangeSet } from '@/lib/ipc/bindings/ChangeSet';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import { CHANGED_EVENT } from '@/lib/query/sync';
import { createMockBackend, type MockHost } from './mock-backend';
import { type MockMode, seedStore } from './mock-data';
import { newId, STICKY_DEFAULT_HEIGHT, STICKY_DEFAULT_WIDTH, type Store } from './mock-store';
import { applyWorkspaceParams, resolveWindowLabel } from './url-state';

/** What a popup reads from the window that opened it to join its session. */
interface MockSession {
  id: string;
  mode: MockMode;
  getStore(): Store;
}

/** Messages between the windows of one session. */
type PeerMessage =
  | { type: 'sync'; store: Store; changes: ChangeSet }
  | { type: 'event'; label: string | null; event: string; payload: unknown }
  | { type: 'close'; label: string };

/** Globals read or set by the mock (kept local instead of augmenting `Window`). */
interface MockGlobals {
  __PIW_DEV_MOCK__?: MockSession;
  /** Set up by `mockIPC`; `callbacks` holds the handlers registered by `transformCallback`. */
  __TAURI_INTERNALS__?: { callbacks?: Map<number, (data: unknown) => void> };
  isTauri?: boolean;
}

const globals = window as unknown as MockGlobals;

const PREFIX = '[piw dev mock]';
/** Query parameters a sticky popup inherits from its opener. */
const INHERITED_PARAMS = ['mock', 'theme', 'popups'];

function log(message: string): void {
  // The mock announces itself so nobody mistakes demo data for a real database.
  // eslint-disable-next-line no-console
  console.info(`${PREFIX} ${message}`);
}

function parseTheme(value: string | null): Settings['theme'] | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

/** The session of the window that opened this one (a sticky popup), if any. */
function openerSession(mode: MockMode): { id: string; store: Store } | null {
  try {
    const session = (window.opener as MockGlobals | null)?.__PIW_DEV_MOCK__;
    if (session?.mode !== mode) return null;
    return { id: session.id, store: JSON.parse(JSON.stringify(session.getStore())) as Store };
  } catch {
    return null;
  }
}

const stickyLabel = (target: StickyTarget) => `sticky:${target.kind}:${target.id}`;

export function installMockBackend(): void {
  const params = new URLSearchParams(window.location.search);
  const mode: MockMode = params.get('mock') === 'empty' ? 'empty' : 'demo';
  const inherited = openerSession(mode);
  const sessionId = inherited?.id ?? newId();
  const initial = inherited?.store ?? seedStore(mode);
  const label = resolveWindowLabel(params.get('window') ?? 'main', initial);
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(`piw-dev-mock:${sessionId}`);
  const post = (message: PeerMessage) => channel?.postMessage(message);

  // Event plugin: handler ids come from `transformCallback` (installed by `mockIPC`).
  const listeners = new Map<number, string>();
  const deliver = (event: string, payload: unknown) => {
    const callbacks = globals.__TAURI_INTERNALS__?.callbacks;
    for (const [id, name] of listeners) {
      if (name === event) callbacks?.get(id)?.({ event, id, payload });
    }
  };
  // Like in Tauri, events arrive after the command that caused them has resolved.
  const emitLocal = (event: string, payload: unknown) => {
    setTimeout(() => deliver(event, payload), 0);
  };
  const emitTo = (target: string | null, event: string, payload: unknown) => {
    if (target === null || target === label) emitLocal(event, payload);
    if (target !== label) post({ type: 'event', label: target, event, payload });
  };
  const closeSelf = () => {
    // Only windows opened by a script can close themselves.
    if (window.opener) window.close();
  };

  const openSticky = (target: StickyTarget) => {
    const name = stickyLabel(target);
    if (name === label) return;
    const url = new URL(window.location.pathname, window.location.origin);
    for (const key of INHERITED_PARAMS) {
      const value = params.get(key);
      if (value) url.searchParams.set(key, value);
    }
    url.searchParams.set('window', name);
    // Colons are valid in a query string; keep the label readable.
    url.search = url.search.replaceAll('%3A', ':');
    if (params.get('popups') !== '1') {
      log(`${name} is on the desktop: open ${url.href} to see it (or add ?popups=1)`);
      return;
    }
    const features = `popup,width=${STICKY_DEFAULT_WIDTH},height=${STICKY_DEFAULT_HEIGHT}`;
    if (!window.open(url, `piw-${sessionId}-${name}`, features)) {
      log(`the sticky popup was blocked; open ${url.href} instead`);
    }
  };

  const host: MockHost = {
    openSticky,
    closeSticky: (target) => {
      const name = stickyLabel(target);
      if (name === label) closeSelf();
      else post({ type: 'close', label: name });
    },
    emit: emitTo,
    commit: (changes) => {
      post({ type: 'sync', store: backend.getStore(), changes });
      if (changes.changes.length > 0) emitLocal(CHANGED_EVENT, changes);
    },
    log,
  };
  const backend = createMockBackend(initial, {
    label,
    host,
    theme: parseTheme(params.get('theme')),
  });

  channel?.addEventListener('message', (event: MessageEvent<PeerMessage>) => {
    const message = event.data;
    if (message.type === 'sync') {
      backend.setStore(message.store);
      if (message.changes.changes.length > 0) emitLocal(CHANGED_EVENT, message.changes);
    } else if (message.type === 'event') {
      if (message.label === null || message.label === label) {
        emitLocal(message.event, message.payload);
      }
    } else if (message.label === label) {
      closeSelf();
    }
  });

  mockWindows(label);
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    switch (command) {
      case 'plugin:event|listen': {
        const id = Number(args['handler']);
        listeners.set(id, String(args['event']));
        return id;
      }
      case 'plugin:event|unlisten':
        listeners.delete(Number(args['eventId']));
        return null;
      case 'plugin:event|emit':
        emitTo(null, String(args['event']), args['payload']);
        return null;
      case 'plugin:event|emit_to': {
        const target = args['target'] as { label?: string } | undefined;
        emitTo(target?.label ?? null, String(args['event']), args['payload']);
        return null;
      }
      default:
        return backend.invoke(command, args);
    }
  });
  // The app checks `isTauri()` before subscribing to events and reading the window label.
  globals.isTauri = true;
  globals.__PIW_DEV_MOCK__ = { id: sessionId, mode, getStore: () => backend.getStore() };

  if (label === 'main') {
    applyWorkspaceParams(params, backend.getStore());
    log(
      `${mode === 'empty' ? 'empty store' : 'demo data'} in memory (dev only, resets on reload). ` +
        'Try ?window=capture, ?window=sticky:task:totp, ?area=tasks&task=demo, ?doc=refactor, ' +
        '?theme=dark, ?mock=empty.',
    );
  }
}
