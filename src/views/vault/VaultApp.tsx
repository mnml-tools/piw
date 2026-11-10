import { Brand, Separator, StatusBar, TitleBar } from '@mnml-tools/ui';
import { FilePlus, Settings as SettingsIcon } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { lazy, Suspense, useEffect } from 'react';
import {
  Button,
  EmptyState,
  detectPlatform,
  formatShortcut,
  iconProps,
  toAriaKeyShortcuts,
  useToast,
} from '@/components/ui';
import { useSettings } from '@/lib/hooks/data';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { useVaultPinned, useVaultTree } from '@/lib/hooks/vault';
import { api } from '@/lib/ipc/api';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import type { VaultStatus } from '@/lib/ipc/bindings/VaultStatus';
import { tabKey, useVaultUi, type VaultTab } from '@/state/vault';
import { vaultStrings as t } from '@/strings/vault';
import { workspaceStrings as w } from '@/strings/workspace';
import { AppMark, AppearanceToggle } from '@/views/workspace/TopBar';
import topBar from '@/views/workspace/TopBar.module.css';
import { ResizeEdges, WindowControls } from '@/views/workspace/WindowChrome';
import { useVaultActions } from './actions';
import { NoteView } from './NoteView';
import { SpaceMenu } from './SpaceMenu';
import { TasksView } from './TasksView';
import { TrashView } from './TrashView';
import { newNoteFolder, spacesOf } from './tree';
import { VaultSearch } from './VaultSearch';
import { VaultSidebar } from './VaultSidebar';
import { VaultTabs } from './VaultTabs';
import styles from './VaultApp.module.css';

const SettingsArea = lazy(() => import('@/views/workspace/settings/SettingsArea'));
const macInset = detectPlatform() === 'macos';

/**
 * The workspace when a vault is open (docs/redesign.md, "Layout"): the title bar with the space
 * filter, the sidebar tree on the left, the open tabs and their content in the centre, the
 * status bar at the foot.
 */
export default function VaultApp({ status }: { status: VaultStatus }) {
  return (
    <div className={styles.shell}>
      <TitleBar
        className={topBar.bar}
        macInset={macInset}
        brand={<Brand icon={<AppMark />} name={w.topBar.brand} />}
        center={status.phase === 'ready' ? <SpaceMenu /> : null}
        end={
          <>
            <AppearanceToggle />
            <SettingsToggle />
            <WindowControls />
          </>
        }
      />
      <ResizeEdges />
      {status.phase === 'ready' ? (
        <VaultShell root={status.root ?? ''} />
      ) : (
        <div className={styles.notice}>
          <EmptyState
            title={status.phase === 'failed' ? t.shell.failedTitle : t.shell.starting}
            description={
              status.phase === 'failed' && (
                <>
                  {t.shell.failedBody}
                  <span className={styles.detail}>{status.root}</span>
                  <span className={styles.detail}>{status.error}</span>
                </>
              )
            }
          />
        </div>
      )}
    </div>
  );
}

function VaultShell({ root }: { root: string }) {
  const tree = useVaultTree();
  const ui = useVaultUi();
  const actions = useVaultActions();
  const entries = tree.data ?? [];
  const activeNote = ui.active?.startsWith('note:') ? ui.active.slice('note:'.length) : null;
  const activeTab = ui.tabs.find((tab) => tabKey(tab) === ui.active) ?? null;
  const onDesktop = (useVaultPinned().data ?? []).filter((p) => p.isOpen).length;
  const { toast } = useToast();
  const trayNoticeShown = useSettings().data?.trayNoticeShown ?? true;

  // Another vault folder (Settings › Data): its notes are not the old one's.
  const { adopt } = ui;
  useEffect(() => adopt(root), [adopt, root]);

  // "Open in Piw" from a vault sticky, the tray's Settings, the first close to the tray and the
  // many-stickies memory warning.
  useEffect(() => {
    if (!isTauri()) return undefined;
    const subscriptions = [
      listen<StickyTarget>('piw://open', (event) => {
        const target = event.payload;
        if (target.kind !== 'vault_note' && target.kind !== 'vault_tasks') return;
        void api.vaultStickyView(target).then((shows) => {
          const state = useVaultUi.getState();
          if (shows.kind === 'note') {
            state.open({ type: 'note', path: shows.path });
            state.reveal(shows.path);
          } else {
            state.setSpace(shows.space);
            state.open({ type: 'tasks', view: shows.view });
          }
        });
      }),
      listen<string>('piw://navigate', (event) => {
        if (event.payload === 'settings') useVaultUi.getState().open({ type: 'settings' });
      }),
      listen('piw://lifecycle/hidden-to-tray', () => {
        if (trayNoticeShown) return;
        toast({ message: w.trayNotice, duration: 10_000 });
        void api.updateSettings({ trayNoticeShown: true });
      }),
      listen<number>('piw://stickies/many', (event) => {
        toast({ message: w.manyStickies(event.payload), duration: 10_000 });
      }),
    ];
    return () => subscriptions.forEach((s) => void s.then((stop) => stop()));
  }, [toast, trayNoticeShown]);

  // A space filter left on a folder that is gone (renamed elsewhere) would hide everything.
  const { space, setSpace } = ui;
  useEffect(() => {
    if (tree.data && space !== null && !spacesOf(tree.data).includes(space)) setSpace(null);
  }, [tree.data, space, setSpace]);

  const newNote = () => void actions.createNote(newNoteFolder(activeNote, ui.space));
  useHotkeys({
    'Mod+K': () => ui.setSearchOpen(true),
    'Mod+N': newNote,
    'Mod+W': () => ui.active !== null && ui.close(ui.active),
    'Ctrl+Tab': () => ui.cycle(1),
    'Ctrl+Shift+Tab': () => ui.cycle(-1),
    'Mod+,': () => ui.open({ type: 'settings' }),
    'Mod+Q': () => void api.quit(),
  });

  return (
    <>
      <div className={styles.body}>
        <VaultSidebar entries={entries} />
        <main className={styles.main}>
          <VaultTabs onNew={newNote} />
          <div className={styles.panel}>
            {activeTab === null ? (
              <div className={styles.notice}>
                <EmptyState
                  title={t.tabs.emptyTitle}
                  description={t.tabs.empty}
                  action={
                    <Button size="sm" icon={<FilePlus {...iconProps} />} onClick={newNote}>
                      {t.sidebar.newNote}
                    </Button>
                  }
                />
              </div>
            ) : (
              <TabContent tab={activeTab} />
            )}
          </div>
        </main>
      </div>
      <StatusBar
        start={`${shortPath(root)} / ${ui.space ?? t.space.all}`}
        end={
          <>
            {onDesktop > 0 && t.stickies.onDesktop(onDesktop)}
            {onDesktop > 0 && ui.saveState !== null && <Separator />}
            {ui.saveState !== null && (
              <span data-state={ui.saveState} className={styles.saveState} aria-live="polite">
                {t.shell.save[ui.saveState]}
              </span>
            )}
          </>
        }
      />
      {ui.searchOpen && <VaultSearch onClose={() => ui.setSearchOpen(false)} />}
    </>
  );
}

/** `/home/you/Piw` → `~/Piw`, as a terminal would show it. */
function shortPath(root: string): string {
  return root.replace(/^(\/home\/[^/]+|\/Users\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=[/\\]|$)/, '~');
}

/** The title bar's Settings button, as the appearance toggle beside it. */
function SettingsToggle() {
  const active = useVaultUi((s) => s.active === 'settings');
  const open = useVaultUi((s) => s.open);
  return (
    <button
      type="button"
      className="mnml-button mnml-theme-toggle"
      data-tauri-drag-region="false"
      title={`${t.tabs.settings} (${formatShortcut('Mod+,')})`}
      aria-label={t.tabs.settings}
      aria-pressed={active}
      aria-keyshortcuts={toAriaKeyShortcuts('Mod+,')}
      onClick={() => open({ type: 'settings' })}
    >
      <SettingsIcon size={14} aria-hidden="true" />
    </button>
  );
}

function TabContent({ tab }: { tab: VaultTab }) {
  if (tab.type === 'trash') return <TrashView />;
  if (tab.type === 'tasks') return <TasksView key={tab.view} view={tab.view} />;
  if (tab.type === 'settings') {
    return (
      <Suspense fallback={null}>
        <SettingsArea />
      </Suspense>
    );
  }
  return <NoteView key={tab.path} path={tab.path} />;
}
