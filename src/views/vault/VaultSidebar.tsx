import {
  ResizableSidebar,
  Segmented,
  SidebarFooter,
  SidebarItem,
  SidebarLabel,
  SidebarNav,
} from '@mnml-tools/ui';
import {
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Inbox,
  ListTodo,
  Pin,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import {
  ContextMenu,
  EmptyState,
  IconButton,
  formatShortcut,
  iconProps,
  toAriaKeyShortcuts,
  type MenuEntry,
} from '@/components/ui';
import { useToday, useVaultPinned, useVaultTasks } from '@/lib/hooks/vault';
import type { VaultEntry } from '@/lib/ipc/bindings/VaultEntry';
import type { VaultTaskView } from '@/lib/ipc/bindings/VaultTaskView';
import { common } from '@/strings/common';
import { vaultStrings as t } from '@/strings/vault';
import { SpaceNameDialog } from '@/views/workspace/spaces/SpaceDialogs';
import { tabKey, useVaultUi } from '@/state/vault';
import { useVaultActions } from './actions';
import {
  INBOX_NAME,
  baseName,
  buildTree,
  join,
  newNoteFolder,
  parentOf,
  visibleRows,
} from './tree';
import styles from './VaultSidebar.module.css';

/** What a dragged tree row carries. */
const DRAG_TYPE = 'application/x-piw-vault-path';
const INDENT = 14;

type Dialog =
  { type: 'newFolder'; parent: string | null } | { type: 'rename'; entry: VaultEntry } | null;

/**
 * The left sidebar (docs/ui-design-system.md §5): Notes | Tasks at the top (the kit's segmented
 * control, as Zap's Tables | Queries), search, then either
 * the vault as a tree (each space's Inbox first, with its open tasks; folders open and close; a
 * note opens in a tab; right-click for New note, New folder…, Rename… and Move to Trash; drag a
 * row onto a folder to move it) or the task views, and Trash at the foot. The space filter shows
 * one top-level folder's contents.
 */
export function VaultSidebar({ entries }: { entries: readonly VaultEntry[] }) {
  const ui = useVaultUi();
  const actions = useVaultActions();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const expanded = useMemo(() => new Set(ui.expanded), [ui.expanded]);
  const rows = useMemo(
    () => visibleRows(buildTree(entries, ui.space), expanded),
    [entries, ui.space, expanded],
  );
  const activeNote = ui.active?.startsWith('note:') ? ui.active.slice('note:'.length) : null;
  const root = ui.space;
  const pinned = useVaultPinned().data;
  const onDesktop = useMemo(
    () =>
      new Set(
        (pinned ?? []).flatMap((p) => (p.isOpen && p.shows.kind === 'note' ? [p.shows.path] : [])),
      ),
    [pinned],
  );

  const newNote = () => void actions.createNote(newNoteFolder(activeNote, ui.space));
  const today = useToday();
  const tasks = useVaultTasks('all', ui.space, today).data;
  // Open tasks per Inbox note, for the count beside it.
  const inboxOpen = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks ?? []) {
      if (!task.checked && baseName(task.path) === `${INBOX_NAME}.md`) {
        counts.set(task.path, (counts.get(task.path) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const menuFor = (entry: VaultEntry): MenuEntry[] => {
    const folder = entry.kind === 'folder';
    return [
      ...(folder
        ? [
            {
              id: 'new-note',
              label: t.menu.newNote,
              icon: <FilePlus {...iconProps} />,
              onSelect: () => void actions.createNote(entry.path),
            },
            {
              id: 'new-folder',
              label: t.menu.newFolder,
              icon: <FolderPlus {...iconProps} />,
              onSelect: () => setDialog({ type: 'newFolder', parent: entry.path }),
            },
            { id: 'sep', type: 'separator' as const },
          ]
        : []),
      {
        id: 'rename',
        label: t.menu.rename,
        onSelect: () => setDialog({ type: 'rename', entry }),
      },
      {
        id: 'trash',
        label: t.menu.trash,
        icon: <Trash2 {...iconProps} />,
        danger: true,
        onSelect: () => void actions.trash(entry.path, entry.name),
      },
    ];
  };

  /** Moves the dragged entry into `folder` (`null`: the vault root). */
  const drop = (event: DragEvent, folder: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const path = event.dataTransfer.getData(DRAG_TYPE);
    if (!path || parentOf(path) === folder) return;
    if (folder !== null && (folder === path || folder.startsWith(`${path}/`))) return;
    void actions.rename(path, join(folder, baseName(path)));
  };
  const allowDrop = (event: DragEvent, folder: string | null) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(folder ?? '');
  };

  return (
    <ResizableSidebar
      id="vault-sidebar"
      storageKey="piw.vaultSidebarWidth"
      label={t.sidebar.resize}
      className={styles.sidebar}
    >
      <Segmented label={t.sidebar.modes} className={styles.modes}>
        {(
          [
            ['notes', Folder, t.sidebar.notes],
            ['tasks', CheckSquare, t.tasks.label],
          ] as const
        ).map(([mode, Icon, label]) => (
          <button
            key={mode}
            type="button"
            className={styles.mode}
            aria-pressed={ui.sidebarMode === mode}
            onClick={() => ui.setSidebarMode(mode)}
          >
            <Icon {...iconProps} />
            {label}
          </button>
        ))}
      </Segmented>

      <button
        type="button"
        className={styles.search}
        aria-keyshortcuts={toAriaKeyShortcuts('Mod+K')}
        title={`${common.actions.search} (${formatShortcut('Mod+K')})`}
        onClick={() => ui.setSearchOpen(true)}
      >
        <Search {...iconProps} />
        <span>{common.actions.search}</span>
        <kbd className={styles.kbd}>{formatShortcut('Mod+K')}</kbd>
      </button>

      {ui.sidebarMode === 'tasks' ? (
        <TaskEntries />
      ) : (
        <>
          <SidebarLabel className={styles.label}>
            <span>{ui.space ?? t.sidebar.notes}</span>
            <span className={styles.labelActions}>
              <IconButton
                className={styles.framed}
                aria-label={t.sidebar.newNote}
                shortcut="Mod+N"
                icon={<FilePlus {...iconProps} />}
                onClick={newNote}
              />
              <IconButton
                className={styles.framed}
                aria-label={t.sidebar.newFolder}
                icon={<FolderPlus {...iconProps} />}
                onClick={() => setDialog({ type: 'newFolder', parent: root })}
              />
            </span>
          </SidebarLabel>

          <div
            className={styles.tree}
            data-drop={dropTarget === '' || undefined}
            onDragOver={(event) => allowDrop(event, root)}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) => drop(event, root)}
          >
            <SidebarNav label={t.sidebar.label}>
              {rows.map(({ entry, depth }) => {
                const folder = entry.kind === 'folder';
                const open = folder && expanded.has(entry.path);
                const inbox = !folder && entry.name === INBOX_NAME;
                const Icon = folder ? Folder : inbox ? Inbox : FileText;
                const active = !folder && ui.active === tabKey({ type: 'note', path: entry.path });
                return (
                  <ContextMenu key={entry.path} items={menuFor(entry)}>
                    <SidebarItem
                      active={active}
                      className={styles.row}
                      style={{ paddingInlineStart: 12 + depth * INDENT }}
                      data-drop={dropTarget === entry.path || undefined}
                      aria-expanded={folder ? open : undefined}
                      aria-current={active ? 'page' : undefined}
                      title={entry.path}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_TYPE, entry.path);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={folder ? (event) => allowDrop(event, entry.path) : undefined}
                      onDrop={folder ? (event) => drop(event, entry.path) : undefined}
                      onClick={() =>
                        folder ? ui.toggleFolder(entry.path) : actions.openNote(entry.path)
                      }
                    >
                      <ChevronRight
                        {...iconProps}
                        className={styles.chevron}
                        data-open={open || undefined}
                        data-hidden={!folder || undefined}
                      />
                      <Icon {...iconProps} className={styles.icon} />
                      <span>{entry.name}</span>
                      {inbox && (inboxOpen.get(entry.path) ?? 0) > 0 && (
                        <small aria-label={t.tasks.count(inboxOpen.get(entry.path) ?? 0)}>
                          {inboxOpen.get(entry.path)}
                        </small>
                      )}
                      {onDesktop.has(entry.path) && (
                        <>
                          <Pin {...iconProps} className={styles.pin} />
                          <span className="visually-hidden">{t.stickies.marker}</span>
                        </>
                      )}
                    </SidebarItem>
                  </ContextMenu>
                );
              })}
            </SidebarNav>
            {rows.length === 0 && (
              <EmptyState
                className={styles.empty}
                title={t.sidebar.empty}
                headingLevel={3}
                action={
                  <button type="button" className={styles.emptyAction} onClick={newNote}>
                    {t.sidebar.emptyAction}
                  </button>
                }
              />
            )}
          </div>
        </>
      )}

      <SidebarFooter>
        <button
          type="button"
          className={styles.footerButton}
          aria-pressed={ui.active === 'trash'}
          onClick={() => ui.open({ type: 'trash' })}
        >
          <Trash2 {...iconProps} />
          {t.sidebar.trash}
        </button>
      </SidebarFooter>

      {dialog?.type === 'newFolder' && (
        <SpaceNameDialog
          title={t.dialogs.newFolderTitle}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await actions.createFolder(dialog.parent, name.trim());
          }}
        />
      )}
      {dialog?.type === 'rename' && (
        <SpaceNameDialog
          title={t.dialogs.renameTitle(dialog.entry.name)}
          initialName={dialog.entry.name}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const { entry } = dialog;
            const leaf = entry.kind === 'note' ? `${name.trim()}.md` : name.trim();
            await actions.renameOrThrow(entry.path, join(parentOf(entry.path), leaf));
          }}
        />
      )}
    </ResizableSidebar>
  );
}

const TASK_ENTRIES: ReadonlyArray<[VaultTaskView, typeof CalendarDays]> = [
  ['today', CalendarDays],
  ['upcoming', CalendarClock],
  ['all', ListTodo],
];

/** The task views (the sidebar's Tasks mode); Today counts what is still open. */
function TaskEntries() {
  const space = useVaultUi((s) => s.space);
  const active = useVaultUi((s) => s.active);
  const open = useVaultUi((s) => s.open);
  const today = useToday();
  const due = (useVaultTasks('today', space, today).data ?? []).filter((task) => !task.checked);
  return (
    <div className={styles.entries}>
      <SidebarNav label={t.tasks.label}>
        {TASK_ENTRIES.map(([view, Icon]) => (
          <SidebarItem
            key={view}
            active={active === tabKey({ type: 'tasks', view })}
            className={styles.row}
            onClick={() => open({ type: 'tasks', view })}
          >
            <ChevronRight {...iconProps} className={styles.chevron} data-hidden />
            <Icon {...iconProps} className={styles.icon} />
            <span>{t.tasks[view]}</span>
            {view === 'today' && due.length > 0 && <small>{due.length}</small>}
          </SidebarItem>
        ))}
      </SidebarNav>
    </div>
  );
}
