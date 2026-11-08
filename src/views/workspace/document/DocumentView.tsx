import { ArrowLeft, FileText, ListChecks, MoreHorizontal, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageColumn, ViewToolbar } from '@/components/app/Page';
import { SpaceMenu } from '@/components/app/SpaceMenu';
import { useScrolled } from '@/components/app/useScrolled';
import {
  Button,
  ConfirmDialog,
  ContextMenu,
  DropdownMenu,
  EmptyState,
  IconButton,
  SaveIndicator,
  TabPanel,
  Tabs,
  TextInput,
  useToast,
  type MenuEntry,
} from '@/components/ui';
import type { SaveStatus } from '@/lib/autosave';
import { formatRelative } from '@/lib/dates';
import { jsonToMarkdown } from '@/lib/editor';
import { useDocument, useDocumentTasks, useSpaces } from '@/lib/hooks/data';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { api } from '@/lib/ipc/api';
import type { Document } from '@/lib/ipc/bindings/Document';
import type { Tab } from '@/lib/ipc/bindings/Tab';
import type { TabKind } from '@/lib/ipc/bindings/TabKind';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { documentStrings as t } from '@/strings/document';
import { ContentTab } from './ContentTab';
import { TaskDrawer } from '../tasks';
import { TasksTab } from './TasksTab';
import styles from './DocumentView.module.css';

const SAVE_LABELS = {
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Couldn’t save',
  retry: 'Retry',
};

function toSaveState(status: SaveStatus) {
  if (status === 'saving' || status === 'pending') return 'saving' as const;
  if (status === 'saved') return 'saved' as const;
  if (status === 'error' || status === 'conflict') return 'error' as const;
  return 'idle' as const;
}

/**
 * A document: explicit title, tabs (Content / Tasks), editor-focused
 * (docs/ui-design-system.md §10). A quiet line above the editor (back link and the document's name;
 * save state, space and ⋯ on the right), then the centred reading column: the 26/700 title, its
 * quiet meta line, the quiet text tabs under it and the active tab.
 */
export default function DocumentView({ documentId }: { documentId: string }) {
  const document = useDocument(documentId);
  if (document.isError) {
    return <EmptyState icon={<FileText aria-hidden size={24} />} title={t.missing} />;
  }
  if (!document.data) return null;
  return <DocumentBody key={documentId} document={document.data} />;
}

function DocumentBody({ document }: { document: Document }) {
  const ws = useWorkspace();
  const spaces = useSpaces();
  const { toast } = useToast();
  const { note, tabs } = document;
  const remembered = ws.documentTabs[note.id];
  const focusTab = ws.focus.type === 'document' ? ws.focus.tabId : undefined;
  const [activeId, setActiveId] = useState(
    () => tabs.find((tab) => tab.id === (focusTab ?? remembered))?.id ?? tabs[0]?.id ?? '',
  );
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const [tabStatus, setTabStatus] = useState<SaveStatus>('idle');
  // Only the tab shown when the document opens takes the caret; switching tabs keeps focus
  // in the tab bar (keyboard navigation).
  const [focusOnOpen, setFocusOnOpen] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { type: 'deleteTab'; tab: Tab }
    | { type: 'move'; spaceId: string; tasks: number }
    | { type: 'trash'; tasks: number }
    | null
  >(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The toolbar's breadcrumb always names the document; `scrolled` only drives its hairline.
  const scrolled = useScrolled(scrollRef);
  // Same query (and cache) as a Tasks tab showing everything in manual order.
  const linkedTasks = useDocumentTasks(note.id, 'all', 'manual');
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const registerFlush = useCallback((flush: () => Promise<void>) => {
    flushRef.current = flush;
  }, []);

  const fail = (error: unknown) =>
    toast({
      tone: 'error',
      message: error instanceof IpcError ? error.message : common.toasts.genericError,
    });

  // Title: explicit, autosaved like note text (rev-guarded).
  const [title, setTitle] = useState(note.title);
  const { saver: titleSaver, status: titleStatus } = useAutosave(
    { value: note.title, rev: note.rev },
    (value, rev) => api.updateNoteText(note.id, rev, { title: value }).then((saved) => saved.rev),
  );
  useEffect(() => {
    if (note.rev > titleSaver.persisted.rev && !titleSaver.dirty)
      titleSaver.takeTheirs(note.title, note.rev);
  }, [note.rev, note.title, titleSaver]);

  const selectTab = async (id: string) => {
    setFocusOnOpen(false);
    await flushRef.current();
    setActiveId(id);
    ws.rememberDocumentTab(note.id, id);
  };

  const addTab = async (kind: TabKind) => {
    try {
      const tab = await api.createTab(
        note.id,
        kind,
        kind === 'content' ? t.untitledTab : t.tasksTab,
      );
      // New tab goes right after the active one.
      const ids = tabs.map((x) => x.id);
      const index = ids.indexOf(active?.id ?? '');
      ids.splice(index + 1, 0, tab.id);
      await api.reorderTabs(note.id, ids);
      await selectTab(tab.id);
      setRenaming(tab.id);
    } catch (error) {
      fail(error);
    }
  };

  const moveTab = (from: number, to: number) => {
    if (to < 0 || to >= tabs.length) return;
    const ids = tabs.map((x) => x.id);
    const [moved] = ids.splice(from, 1);
    if (moved) ids.splice(to, 0, moved);
    void api.reorderTabs(note.id, ids).catch(fail);
  };

  const deleteTab = async (tab: Tab) => {
    const index = tabs.findIndex((x) => x.id === tab.id);
    await api.deleteTab(tab.id);
    if (tab.id === active?.id) setActiveId(tabs[index === 0 ? 1 : index - 1]?.id ?? '');
    toast({
      message: t.tabDeleted(tab.title),
      action: {
        label: common.actions.undo,
        onAction: () => void api.restoreTab(tab.id).catch(fail),
      },
    });
  };

  const requestDelete = (tab: Tab) => {
    if (tabs.length <= 1) return;
    const empty = tab.kind === 'content' && !(tab.contentJson ?? '').includes('"text"');
    if (empty) void deleteTab(tab).catch(fail);
    else setDialog({ type: 'deleteTab', tab });
  };

  useHotkeys({
    'Ctrl+PageDown': () => {
      const i = tabs.findIndex((x) => x.id === active?.id);
      const next = tabs[(i + 1) % tabs.length];
      if (next) void selectTab(next.id);
    },
    'Ctrl+PageUp': () => {
      const i = tabs.findIndex((x) => x.id === active?.id);
      const prev = tabs[(i - 1 + tabs.length) % tabs.length];
      if (prev) void selectTab(prev.id);
    },
    'Mod+S': () => void flushRef.current(),
  });

  const copyMarkdown = async () => {
    await flushRef.current();
    const parts = [`# ${note.title}`];
    for (const tab of tabs) {
      if (tab.kind !== 'content' || !tab.contentJson) continue;
      parts.push(`## ${tab.title}`, jsonToMarkdown(JSON.parse(tab.contentJson)));
    }
    await navigator.clipboard.writeText(parts.join('\n\n'));
    toast({ message: t.copied });
  };

  const moreMenu: MenuEntry[] = [
    {
      id: 'favourite',
      label: note.sidebarOrder !== null ? t.removeFromFavourites : t.addToFavourites,
      onSelect: () =>
        void api.setDocumentInSidebar(note.id, note.sidebarOrder === null).catch(fail),
    },
    {
      id: 'move',
      type: 'submenu',
      label: t.moveToSpace,
      items: (spaces.data ?? [])
        .filter((space) => space.id !== note.spaceId)
        .map((space) => ({
          id: space.id,
          label: space.name,
          onSelect: () =>
            void api
              .documentMovePreview(note.id)
              .then((preview) =>
                setDialog({ type: 'move', spaceId: space.id, tasks: preview.tasks }),
              ),
        })),
    },
    { id: 'copy', label: t.copyMarkdown, onSelect: () => void copyMarkdown().catch(fail) },
    {
      id: 'archive',
      label: note.archivedAt ? t.unarchive : t.archive,
      onSelect: () => void api.setNoteArchived(note.id, note.archivedAt === null).catch(fail),
    },
    { id: 'sep', type: 'separator' },
    {
      id: 'trash',
      label: t.trash,
      danger: true,
      onSelect: () =>
        void api
          .documentMovePreview(note.id)
          .then((preview) =>
            preview.tasks > 0
              ? setDialog({ type: 'trash', tasks: preview.tasks })
              : void trash('keep'),
          ),
    },
  ];

  const trash = async (linked: 'keep' | 'trash') => {
    await flushRef.current();
    await api.trashDocument(note.id, linked);
    ws.back();
    toast({
      message: t.movedToTrash(note.title),
      action: {
        label: common.actions.undo,
        onAction: () => void api.restoreNote(note.id).catch(fail),
      },
    });
  };

  const backLabel = common.areas[ws.history.at(-1)?.area ?? 'notes'];
  const saveState = toSaveState(titleStatus === 'idle' ? tabStatus : titleStatus);

  const taskCount = linkedTasks.data?.length ?? 0;
  const meta = [
    note.archivedAt ? t.archived : null,
    t.edited(formatRelative(note.updatedAt)),
    taskCount > 0 ? t.taskCount(taskCount) : null,
  ].filter((part): part is string => part !== null);

  return (
    <article className={styles.document} aria-label={note.title}>
      <ViewToolbar
        scrolled={scrolled}
        leading={
          <Button
            variant="ghost"
            size="sm"
            className={styles.back}
            icon={<ArrowLeft aria-hidden size={14} />}
            onClick={ws.back}
          >
            {backLabel}
          </Button>
        }
        title={title.trim() || note.title}
        titleAs="span"
        actions={
          <>
            {/* First, so the controls on its right never move when it shows or hides. */}
            <SaveIndicator
              className={styles.save}
              state={saveState}
              labels={SAVE_LABELS}
              onRetry={() => void flushRef.current()}
            />
            <SpaceMenu
              spaces={spaces.data ?? []}
              value={note.spaceId}
              label={common.actions.moveToSpace}
              onChange={(spaceId) =>
                void api
                  .documentMovePreview(note.id)
                  .then((preview) => setDialog({ type: 'move', spaceId, tasks: preview.tasks }))
              }
            />
            <DropdownMenu
              align="end"
              trigger={
                <IconButton
                  aria-label={common.actions.more}
                  icon={<MoreHorizontal aria-hidden size={16} />}
                />
              }
              items={moreMenu}
            />
          </>
        }
      />

      <div ref={scrollRef} className={styles.scroll}>
        <PageColumn width="editor" className={styles.column}>
          <header className={styles.head}>
            <input
              className={styles.title}
              aria-label={t.titleLabel}
              value={title}
              maxLength={300}
              onChange={(event) => {
                setTitle(event.target.value);
                if (event.target.value.trim()) titleSaver.update(event.target.value.trim());
              }}
              onBlur={() => {
                if (!title.trim()) setTitle(titleSaver.persisted.value);
                void titleSaver.flush();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
            />
            <p className={styles.meta}>
              {meta.map((part, index) => (
                <span key={part}>
                  {index > 0 && (
                    <span className={styles.metaDot} aria-hidden>
                      ·
                    </span>
                  )}
                  {part}
                </span>
              ))}
            </p>
          </header>

          <Tabs
            className={styles.tabStrip}
            aria-label={t.tabs}
            idBase={`doc-${note.id}`}
            items={tabs.map((tab) => ({
              id: tab.id,
              label: tab.title,
              ...(tab.kind === 'tasks'
                ? {
                    icon: <ListChecks aria-hidden size={14} />,
                    srSuffix: '(tasks)',
                  }
                : {}),
            }))}
            value={active?.id ?? ''}
            onValueChange={(id) => void selectTab(id)}
            onReorder={moveTab}
            onRename={(id) => setRenaming(id)}
            editingId={renaming}
            overflowLabel={t.allTabs}
            renderEditor={(item) => (
              <RenameField
                initial={item.label}
                onDone={(value) => {
                  setRenaming(null);
                  if (value && value !== item.label) void api.renameTab(item.id, value).catch(fail);
                }}
              />
            )}
            renderTab={(item, tab) => {
              const index = tabs.findIndex((x) => x.id === item.id);
              const record = tabs[index];
              if (!record) return tab;
              return (
                <ContextMenu
                  key={item.id}
                  items={[
                    {
                      id: 'rename',
                      label: t.rename,
                      shortcut: 'F2',
                      onSelect: () => setRenaming(item.id),
                    },
                    ...(record.kind === 'content'
                      ? [
                          {
                            id: 'dup',
                            label: t.duplicate,
                            onSelect: () => void api.duplicateTab(item.id).catch(fail),
                          },
                        ]
                      : [
                          {
                            id: 'pin',
                            label: t.pinView,
                            onSelect: () =>
                              void api.openSticky({ kind: 'tasks_tab', id: item.id }).catch(fail),
                          },
                        ]),
                    {
                      id: 'left',
                      label: t.moveLeft,
                      disabled: index === 0,
                      onSelect: () => moveTab(index, index - 1),
                    },
                    {
                      id: 'right',
                      label: t.moveRight,
                      disabled: index === tabs.length - 1,
                      onSelect: () => moveTab(index, index + 1),
                    },
                    { id: 'sep', type: 'separator' },
                    {
                      id: 'delete',
                      label: tabs.length <= 1 ? t.lastTab : t.deleteTab,
                      danger: true,
                      disabled: tabs.length <= 1,
                      onSelect: () => requestDelete(record),
                    },
                  ]}
                >
                  {tab}
                </ContextMenu>
              );
            }}
            addSlot={
              <DropdownMenu
                trigger={
                  <IconButton
                    aria-label={t.addTab}
                    icon={<Plus aria-hidden size={14} />}
                    size="sm"
                  />
                }
                items={[
                  { id: 'content', label: t.addContentTab, onSelect: () => void addTab('content') },
                  { id: 'tasks', label: t.addTasksTab, onSelect: () => void addTab('tasks') },
                ]}
              />
            }
          />

          {active && (
            <TabPanel idBase={`doc-${note.id}`} tabId={active.id}>
              {active.kind === 'content' ? (
                <ContentTab
                  key={active.id}
                  tab={active}
                  documentId={note.id}
                  focusOnMount={focusOnOpen}
                  onFocused={() => setFocusOnOpen(false)}
                  onStatus={setTabStatus}
                  registerFlush={registerFlush}
                />
              ) : (
                <TasksTab key={active.id} tab={active} documentId={note.id} />
              )}
            </TabPanel>
          )}
        </PageColumn>
      </div>

      {ws.drawerTaskId && (
        <TaskDrawer taskId={ws.drawerTaskId} mode="overlay" onClose={() => ws.openTask(null)} />
      )}

      {dialog?.type === 'deleteTab' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t.deleteContentTitle(dialog.tab.title)}
          description={dialog.tab.kind === 'content' ? t.deleteContentBody : t.deleteTasksBody}
          confirmLabel={common.actions.delete}
          cancelLabel={common.actions.cancel}
          destructive
          onConfirm={async () => {
            await deleteTab(dialog.tab);
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === 'move' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t.moveTitle(
            note.title,
            dialog.tasks,
            spaces.data?.find((s) => s.id === dialog.spaceId)?.name ?? '',
          )}
          confirmLabel={t.move}
          cancelLabel={common.actions.cancel}
          onConfirm={async () => {
            await api.moveNote(note.id, dialog.spaceId);
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === 'trash' && (
        <TrashDocumentDialog
          title={note.title}
          tasks={dialog.tasks}
          onClose={() => setDialog(null)}
          onConfirm={(linked) => trash(linked)}
        />
      )}
    </article>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <TextInput
      size="sm"
      variant="ghost"
      className={styles.rename}
      // Grows with the name, like the tab it replaces (capped by the CSS max-width).
      style={{ width: `${Math.max(value.length, 4)}ch` }}
      aria-label={t.rename}
      // eslint-disable-next-line jsx-a11y-x/no-autofocus -- inline rename takes focus by design
      autoFocus
      value={value}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onDone(value.trim());
        if (event.key === 'Escape') {
          event.stopPropagation();
          onDone(initial);
        }
      }}
    />
  );
}

function TrashDocumentDialog({
  title,
  tasks,
  onClose,
  onConfirm,
}: {
  title: string;
  tasks: number;
  onClose: () => void;
  onConfirm: (linked: 'keep' | 'trash') => Promise<void>;
}) {
  const [linked, setLinked] = useState<'keep' | 'trash'>('keep');
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t.trashTitle(title)}
      description={t.trashBody(tasks)}
      confirmLabel={t.moveToTrash}
      cancelLabel={common.actions.cancel}
      destructive
      onConfirm={async () => {
        await onConfirm(linked);
        onClose();
      }}
    >
      <fieldset className={styles.choices}>
        <legend className="visually-hidden">{t.trashBody(tasks)}</legend>
        <label>
          <input
            type="radio"
            name="linked"
            checked={linked === 'keep'}
            onChange={() => setLinked('keep')}
          />
          {t.keepTasks}
        </label>
        <label>
          <input
            type="radio"
            name="linked"
            checked={linked === 'trash'}
            onChange={() => setLinked('trash')}
          />
          {t.trashTasks}
        </label>
      </fieldset>
    </ConfirmDialog>
  );
}
