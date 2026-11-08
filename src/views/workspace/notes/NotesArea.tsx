import { Archive, Columns2, Ellipsis, Plus, StickyNote } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  Button,
  DropdownMenu,
  EmptyState,
  IconButton,
  cx,
  iconProps,
  type MenuEntry,
} from '@/components/ui';
import { PageColumn, PageScroll, PageView, ViewToolbar } from '@/components/app/Page';
import { useNotes, useSpaces } from '@/lib/hooks/data';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { api } from '@/lib/ipc/api';
import type { LinkedTasks } from '@/lib/ipc/bindings/LinkedTasks';
import type { NoteListItem } from '@/lib/ipc/bindings/NoteListItem';
import type { NoteQuery } from '@/lib/ipc/bindings/NoteQuery';
import type { NoteSort } from '@/lib/ipc/bindings/NoteSort';
import { useWorkspace, type Focus } from '@/state/workspace';
import { common } from '@/strings/common';
import { notesStrings as t } from '@/strings/notes';
import { MoveDocumentDialog, TrashDocumentDialog } from './DocumentDialogs';
import { SPLIT_MIN_CONTENT_WIDTH, useElementWidth } from './layout';
import { NoteEditor, type NoteEditorHandle } from './NoteEditor';
import { NotesList, type NotesListHandle } from './NotesList';
import { LoadingLine, RegionError } from './RegionStates';
import { displayTitle } from './titles';
import { useNoteActions } from './useNoteActions';
import { useNotesView } from './useNotesView';
import styles from './NotesArea.module.css';

const SORTS: readonly NoteSort[] = ['updated', 'created', 'title'];

/** Selection inside Notes replaces the focus instead of stacking history entries. */
function replaceFocus(focus: Focus) {
  useWorkspace.getState().replaceFocus(focus);
}

interface MoveRequest {
  item: NoteListItem;
  spaceId: string;
  tasks: number;
  notes: number;
}

/**
 * The Notes area (docs/ui-design-system.md §10): a flat list of notes and documents and the note
 * editor, which replaces the list or, in split view, sits beside it. Documents open in the shell's
 * document view, so this renders nothing while one is focused.
 */
export default function NotesArea() {
  const focus = useWorkspace((state) => state.focus);
  const spaceId = useWorkspace((state) => state.spaceId);
  const splitPreferred = useWorkspace((state) => state.notesSplit);
  const sort = useWorkspace((state) => state.notesSort);
  const previous = useWorkspace((state) => state.history.at(-1));
  const newNote = useWorkspace((state) => state.newNote);
  const openNote = useWorkspace((state) => state.openNote);
  const openDocument = useWorkspace((state) => state.openDocument);
  const back = useWorkspace((state) => state.back);
  const toggleNotesSplit = useWorkspace((state) => state.toggleNotesSplit);
  const setNotesSort = useWorkspace((state) => state.setNotesSort);
  const setSpace = useWorkspace((state) => state.setSpace);

  const [showArchived, setShowArchived] = useState(false);
  const [areaRef, width] = useElementWidth<HTMLDivElement>();
  const splitAvailable = width === null || width >= SPLIT_MIN_CONTENT_WIDTH;
  const split = splitPreferred && splitAvailable;

  const view = useNotesView(focus);
  const spaces = useSpaces();
  const query: Partial<NoteQuery> = {
    sort,
    scope: showArchived ? 'archived' : 'active',
    ...(spaceId ? { spaceId } : {}),
  };
  const notes = useNotes(query);
  const actions = useNoteActions();

  const listRef = useRef<NotesListHandle>(null);
  const editorRef = useRef<NoteEditorHandle>(null);
  const scrollTop = useRef(0);
  const rememberScroll = useCallback((top: number) => {
    scrollTop.current = top;
  }, []);
  const recallScroll = useCallback(() => scrollTop.current, []);

  const [trashRequest, setTrashRequest] = useState<{ item: NoteListItem; open: boolean } | null>(
    null,
  );
  const [moveRequest, setMoveRequest] = useState<(MoveRequest & { open: boolean }) | null>(null);
  const headingId = useId();
  const splitHintId = useId();
  const listCount = notes.data?.length;
  const count =
    listCount === undefined
      ? null
      : showArchived
        ? t.list.archivedCount(listCount)
        : t.list.count(listCount);

  useHotkeys(
    {
      'Mod+Shift+\\': () => {
        if (splitAvailable) toggleNotesSplit();
      },
    },
    focus.type !== 'document',
  );

  if (focus.type === 'document') return null;

  const items = notes.data ?? [];
  const spaceList = spaces.data ?? [];
  const filterSpace = spaceId ? spaceList.find((space) => space.id === spaceId) : undefined;
  const openId = focus.type === 'note' ? focus.id : null;
  const editorOpen = focus.type === 'note' || focus.type === 'newNote';
  const showList = split || !editorOpen;
  const backLabel = previous ? common.areas[previous.area] : t.title;

  const openQuietly = (id: string) => {
    // Commit "quiet" first so the editor mounts without taking focus from the list.
    flushSync(() => view.markQuiet(id));
    replaceFocus({ type: 'note', id });
  };

  const openItem = (item: NoteListItem, keyboard: boolean) => {
    if (item.kind === 'document') {
      openDocument(item.id);
      return;
    }
    view.select(item.id);
    if (!split) {
      openNote(item.id);
      return;
    }
    // Split view: Enter moves focus to the editor; a click keeps it in the list.
    if (openId === item.id) {
      if (keyboard) editorRef.current?.focus();
    } else if (keyboard) {
      replaceFocus({ type: 'note', id: item.id });
    } else {
      openQuietly(item.id);
    }
  };

  const selectItem = (item: NoteListItem, via: 'keyboard' | 'focus') => {
    if (via === 'focus' || !split) {
      if (view.selectedId !== item.id) view.select(item.id);
      return;
    }
    // Split view: ↑/↓ loads the note while focus stays in the list.
    if (item.kind === 'quick_note') {
      if (openId !== item.id) openQuietly(item.id);
      return;
    }
    view.select(item.id);
    if (focus.type !== 'none') replaceFocus({ type: 'none' });
  };

  const closeEditor = () => {
    if (split) {
      replaceFocus({ type: 'none' });
      listRef.current?.focusSelected();
    } else {
      back();
    }
  };

  /** Before the list changes the open note: save it and keep the record on close. */
  const releaseOpen = async (item: NoteListItem) => {
    if (openId !== item.id) return false;
    await editorRef.current?.handOver();
    return true;
  };

  const trashNow = async (item: NoteListItem, linkedTasks?: LinkedTasks) => {
    const wasOpen = await releaseOpen(item);
    const done = await actions.trash(
      { id: item.id, title: displayTitle(item), kind: item.kind },
      linkedTasks,
    );
    if (done && wasOpen) replaceFocus({ type: 'none' });
  };

  const trashItem = (item: NoteListItem) => {
    if (item.kind === 'document' && item.taskCount > 0) setTrashRequest({ item, open: true });
    else void trashNow(item);
  };

  const archiveItem = async (item: NoteListItem, archived: boolean) => {
    const wasOpen = await releaseOpen(item);
    const done = await actions.setArchived(
      { id: item.id, title: displayTitle(item), kind: item.kind },
      archived,
    );
    if (done && wasOpen) replaceFocus({ type: 'none' });
  };

  const convertItem = async (item: NoteListItem) => {
    const wasOpen = await releaseOpen(item);
    const done = await actions.convert(item.id);
    if (done && wasOpen) replaceFocus({ type: 'none' });
  };

  const moveItem = async (item: NoteListItem, target: string) => {
    if (target === item.spaceId) return;
    if (item.kind === 'document') {
      const preview = await api.documentMovePreview(item.id).catch(() => null);
      if (preview && preview.tasks + preview.notes > 0) {
        setMoveRequest({ item, spaceId: target, ...preview, open: true });
        return;
      }
    }
    await actions.move(item.id, target);
  };

  const menuFor = (item: NoteListItem): MenuEntry[] => {
    const isDocument = item.kind === 'document';
    const entries: MenuEntry[] = [
      { id: 'open', label: t.menu.open, shortcut: 'Enter', onSelect: () => openItem(item, true) },
    ];
    if (isDocument) {
      const favourite = item.sidebarOrder !== null;
      entries.push({
        id: 'favourite',
        label: favourite ? t.menu.removeFromFavourites : t.menu.addToFavourites,
        onSelect: () => void actions.setFavourite(item.id, !favourite),
      });
    } else {
      entries.push(
        { id: 'pin', label: t.menu.pin, onSelect: () => void actions.pin(item.id) },
        { id: 'convert', label: t.menu.convert, onSelect: () => void convertItem(item) },
      );
    }
    entries.push(
      {
        id: 'move',
        type: 'submenu',
        label: t.menu.moveToSpace,
        disabled: spaceList.length < 2,
        items: [
          {
            id: 'spaces',
            type: 'radio-group',
            label: t.menu.moveToSpace,
            value: item.spaceId,
            onValueChange: (target) => void moveItem(item, target),
            options: spaceList.map((space) => ({ value: space.id, label: space.name })),
          },
        ],
      },
      {
        id: 'archive',
        label: showArchived ? t.menu.unarchive : t.menu.archive,
        onSelect: () => void archiveItem(item, !showArchived),
      },
      { id: 'separator', type: 'separator' },
      {
        id: 'trash',
        label: t.menu.trash,
        shortcut: 'Delete',
        danger: true,
        onSelect: () => trashItem(item),
      },
    );
    return entries;
  };

  const optionsMenu: MenuEntry[] = [
    {
      id: 'sort',
      type: 'radio-group',
      label: t.header.sortLabel,
      showLabel: true,
      value: sort,
      onValueChange: (value) => {
        const next = SORTS.find((option) => option === value);
        if (next) setNotesSort(next);
      },
      options: SORTS.map((value) => ({ value, label: t.header.sort[value] })),
    },
    { id: 'separator', type: 'separator' },
    {
      id: 'archived',
      type: 'checkbox',
      label: t.header.showArchived,
      checked: showArchived,
      onCheckedChange: setShowArchived,
    },
  ];

  /** Loading, error and empty states: centred in the list pane (the canvas) under the header. */
  const listState = (state: ReactNode) => (
    <PageScroll>
      <PageColumn width="full">{state}</PageColumn>
    </PageScroll>
  );

  const renderListBody = () => {
    if (notes.isPending) return listState(<LoadingLine />);
    if (notes.isError && !notes.data) {
      return listState(
        <RegionError
          title={t.error.listTitle}
          error={notes.error}
          onRetry={() => void notes.refetch()}
        />,
      );
    }
    if (items.length === 0) {
      if (showArchived) {
        return listState(
          <EmptyState
            icon={<Archive {...iconProps} />}
            title={t.empty.archivedTitle}
            action={
              <Button onClick={() => setShowArchived(false)}>{t.empty.archivedAction}</Button>
            }
          />,
        );
      }
      if (filterSpace) {
        return listState(
          <EmptyState
            icon={<StickyNote {...iconProps} />}
            title={t.empty.inSpace(filterSpace.name)}
            action={<Button onClick={() => setSpace(null)}>{t.empty.showAll}</Button>}
          />,
        );
      }
      return listState(
        <EmptyState
          icon={<StickyNote {...iconProps} />}
          title={t.empty.title}
          description={t.empty.description}
          action={
            <Button icon={<Plus {...iconProps} />} onClick={newNote}>
              {t.empty.action}
            </Button>
          }
        />,
      );
    }
    return (
      <NotesList
        ref={listRef}
        items={items}
        label={showArchived ? t.list.archivedLabel : t.list.label}
        spaces={spaceList}
        showSpace={spaceId === null}
        groupFavourites={!showArchived}
        selectedId={view.selectedId}
        currentId={split ? openId : null}
        compact={split}
        restoreFocus={view.returnToList}
        onSelect={selectItem}
        onOpen={openItem}
        onTrash={trashItem}
        onFocusEditor={split ? () => editorRef.current?.focus() : undefined}
        onUndo={actions.undoLast}
        menuFor={menuFor}
        rememberScroll={rememberScroll}
        recallScroll={recallScroll}
      />
    );
  };

  return (
    <div ref={areaRef} className={cx(styles.area, split && styles.split)}>
      {showList && (
        <PageView className={styles.listPane} aria-labelledby={headingId}>
          <ViewToolbar
            title={t.title}
            titleId={headingId}
            count={count}
            note={showArchived ? t.archived.banner : undefined}
            actions={
              <>
                {showArchived && (
                  <Button size="sm" variant="ghost" onClick={() => setShowArchived(false)}>
                    {t.archived.back}
                  </Button>
                )}
                <IconButton
                  aria-label={t.header.split}
                  shortcut={'Mod+Shift+\\'}
                  icon={<Columns2 {...iconProps} />}
                  pressed={splitPreferred}
                  aria-disabled={splitAvailable ? undefined : true}
                  aria-describedby={splitAvailable ? undefined : splitHintId}
                  tooltip={splitAvailable ? undefined : t.header.splitUnavailable}
                  className={cx(!splitAvailable && styles.unavailable)}
                  onClick={() => {
                    if (splitAvailable) toggleNotesSplit();
                  }}
                />
                {!splitAvailable && (
                  <span id={splitHintId} className="visually-hidden">
                    {t.header.splitUnavailable}
                  </span>
                )}
                <IconButton
                  aria-label={t.header.newNote}
                  shortcut="Mod+N"
                  icon={<Plus {...iconProps} />}
                  onClick={newNote}
                />
                <DropdownMenu
                  align="end"
                  trigger={
                    <IconButton aria-label={t.header.options} icon={<Ellipsis {...iconProps} />} />
                  }
                  items={optionsMenu}
                />
              </>
            }
          />
          {renderListBody()}
        </PageView>
      )}

      {editorOpen ? (
        <div className={styles.editorPane}>
          <NoteEditor
            key={view.editorKey}
            ref={editorRef}
            noteId={openId}
            onBack={closeEditor}
            backLabel={backLabel}
            showBack={!split}
            focusOnOpen={!(openId !== null && openId === view.quietId)}
            onCreated={(id) => {
              flushSync(() => view.markCreated(id));
              if (useWorkspace.getState().focus.type === 'newNote') {
                replaceFocus({ type: 'note', id });
              }
            }}
            onEscape={split ? () => listRef.current?.focusSelected() : closeEditor}
          />
        </div>
      ) : (
        split && (
          <div className={styles.editorPane}>
            <ViewToolbar />
            <EmptyState
              icon={<StickyNote {...iconProps} />}
              title={t.list.noSelectionTitle}
              description={t.list.noSelection}
            />
          </div>
        )
      )}

      {trashRequest && (
        <TrashDocumentDialog
          open={trashRequest.open}
          title={displayTitle(trashRequest.item)}
          taskCount={trashRequest.item.taskCount}
          onOpenChange={(open) => setTrashRequest({ ...trashRequest, open })}
          onConfirm={(linkedTasks) => trashNow(trashRequest.item, linkedTasks)}
        />
      )}
      {moveRequest && (
        <MoveDocumentDialog
          open={moveRequest.open}
          title={displayTitle(moveRequest.item)}
          spaceName={spaceList.find((space) => space.id === moveRequest.spaceId)?.name ?? ''}
          tasks={moveRequest.tasks}
          notes={moveRequest.notes}
          onOpenChange={(open) => setMoveRequest({ ...moveRequest, open })}
          onConfirm={() => actions.move(moveRequest.item.id, moveRequest.spaceId)}
        />
      )}
    </div>
  );
}
