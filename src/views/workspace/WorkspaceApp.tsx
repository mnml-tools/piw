import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useToast } from '@/components/ui';
import { useAppStatus, useSettings, useSpaces } from '@/lib/hooks/data';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { api } from '@/lib/ipc/api';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import { type Area, useWorkspace } from '@/state/workspace';
import { workspaceStrings as t } from '@/strings/workspace';
import { DataError } from './DataError';
import { NewDocumentDialog } from './NewDocumentDialog';
import { SearchPalette } from './search/SearchPalette';
import { TopBar } from './TopBar';
import { ResizeEdges } from './WindowChrome';
import { WorkspaceStatusBar } from './WorkspaceStatusBar';
import styles from './WorkspaceApp.module.css';

const NotesArea = lazy(() => import('./notes/NotesArea'));
const TasksArea = lazy(() => import('./tasks/TasksArea'));
const InboxArea = lazy(() => import('./inbox/InboxArea'));
const PinnedArea = lazy(() => import('./pinned/PinnedArea'));
const TrashArea = lazy(() => import('./trash/TrashArea'));
const SettingsArea = lazy(() => import('./settings/SettingsArea'));
const DocumentView = lazy(() => import('./document/DocumentView'));

const AREA_KEYS: Area[] = ['inbox', 'notes', 'tasks', 'pinned'];

/**
 * The workspace window (docs/ui-design-system.md, "Shell"): the title bar and area tabs, one
 * content region at full width, then the status bar. No sidebar.
 */
export default function WorkspaceApp() {
  const ws = useWorkspace();
  const status = useAppStatus();
  const settings = useSettings();
  const { toast } = useToast();
  const [newDocument, setNewDocument] = useState(false);

  // The space filter is persisted per webview, not per database: a filter left on a space that
  // no longer exists (deleted elsewhere, or another data directory) would hide every item.
  const spaces = useSpaces().data;
  const { spaceId, setSpace } = ws;
  useEffect(() => {
    if (spaces && spaceId !== null && !spaces.some((space) => space.id === spaceId)) {
      setSpace(null);
    }
  }, [spaces, spaceId, setSpace]);

  // Tray → Settings, and the one-time "keeps running in the tray" notice.
  const { navigate } = ws;
  const trayNoticeShown = settings.data?.trayNoticeShown ?? true;
  useEffect(() => {
    if (!isTauri()) return undefined;
    const subscriptions = [
      listen<string>('piw://navigate', (event) => {
        if (event.payload === 'settings') navigate('settings');
      }),
      // "Open in Piw" from a sticky.
      listen<StickyTarget>('piw://open', (event) => {
        const target = event.payload;
        const state = useWorkspace.getState();
        if (target.kind === 'note') state.openNote(target.id);
        else if (target.kind === 'task') {
          state.setSpace(null);
          state.navigate('tasks');
          state.openTask(target.id);
        } else {
          void api.getTab(target.id).then((tab) => state.openDocument(tab.documentId, tab.id));
        }
      }),
      listen<number>('piw://stickies/many', (event) => {
        toast({ message: t.manyStickies(event.payload), duration: 10_000 });
      }),
      listen('piw://lifecycle/hidden-to-tray', () => {
        if (trayNoticeShown) return;
        toast({ message: t.trayNotice, duration: 10_000 });
        void api.updateSettings({ trayNoticeShown: true });
      }),
    ];
    return () => subscriptions.forEach((s) => void s.then((stop) => stop()));
  }, [navigate, toast, trayNoticeShown]);

  useHotkeys(
    {
      'Mod+N': ws.newNote,
      'Mod+T': ws.requestAddTask,
      'Mod+Shift+N': () => setNewDocument(true),
      'Mod+K': () => ws.setSearchOpen(true),
      '/': () => ws.setSearchOpen(true),
      'Mod+,': () => ws.navigate('settings'),
      'Mod+[': ws.back,
      'Alt+ArrowLeft': ws.back,
      'Mod+Q': () => void api.quit(),
      ...Object.fromEntries(AREA_KEYS.map((a, i) => [`Mod+${i + 1}`, () => ws.navigate(a)])),
    },
    status.data?.dataError == null,
  );

  if (status.data?.dataError) {
    return <DataError reason={status.data.dataError} path={status.data.dataPath} />;
  }

  const content = (() => {
    if (ws.focus.type === 'document') return <DocumentView documentId={ws.focus.id} />;
    switch (ws.area) {
      case 'inbox':
        return <InboxArea />;
      case 'notes':
        return <NotesArea />;
      case 'tasks':
        return <TasksArea />;
      case 'pinned':
        return <PinnedArea />;
      case 'trash':
        return <TrashArea />;
      case 'settings':
        return <SettingsArea />;
    }
  })();

  return (
    <div className={styles.shell}>
      <TopBar />
      <ResizeEdges />
      <main className={styles.content}>
        <div className={styles.region}>
          <Suspense fallback={null}>{content}</Suspense>
        </div>
      </main>
      <WorkspaceStatusBar />
      {ws.searchOpen && <SearchPalette onClose={() => ws.setSearchOpen(false)} />}
      {newDocument && <NewDocumentDialog onClose={() => setNewDocument(false)} />}
    </div>
  );
}
