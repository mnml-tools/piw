import { Ellipsis, FileText } from 'lucide-react';
import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { PageColumn, PageGroup, PageList, PageSectionHeader } from '@/components/app/Page';
import { spaceColor } from '@/components/app/space-color';
import {
  ContextMenu,
  DropdownMenu,
  IconButton,
  ListRow,
  SpaceDot,
  cx,
  detectPlatform,
  iconProps,
  type MenuEntry,
} from '@/components/ui';
import { formatRelative } from '@/lib/dates';
import { matches } from '@/lib/hooks/useHotkeys';
import type { NoteListItem } from '@/lib/ipc/bindings/NoteListItem';
import type { Space } from '@/lib/ipc/bindings/Space';
import { notesStrings as t } from '@/strings/notes';
import { displayTitle } from './titles';
import styles from './NotesList.module.css';

const MAX_TAGS = 2;

/** Row index a navigation key moves to (clamped, no wrap), or null for other keys. */
function targetIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowDown':
    case 'j':
      return Math.min(count - 1, index + 1);
    case 'ArrowUp':
    case 'k':
      return Math.max(0, index - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export interface NotesListHandle {
  /** Focuses the selected row (Esc from the editor in split view). */
  focusSelected: () => void;
}

export interface NotesListProps {
  items: readonly NoteListItem[];
  label: string;
  spaces: readonly Space[];
  /** Show the space dot + name (only under "All"). */
  showSpace: boolean;
  /**
   * Lead with a "Favourites" group (documents flagged for quick access) when any exist; the
   * other rows follow under "Notes". Off for the archived list.
   */
  groupFavourites?: boolean;
  selectedId: string | null;
  /** The note open in the editor (split view). */
  currentId: string | null;
  compact: boolean;
  /** Put focus on the selected row once mounted (coming back from the editor). */
  restoreFocus: boolean;
  /** Arrow keys / j k moved the selection (split view loads the editor). */
  onSelect: (item: NoteListItem, via: 'keyboard' | 'focus') => void;
  /** Click or Enter. `keyboard` is true when Enter/Space triggered it. */
  onOpen: (item: NoteListItem, keyboard: boolean) => void;
  onTrash: (item: NoteListItem) => void;
  /** → on the open note (split view): move focus to the editor. */
  onFocusEditor?: (item: NoteListItem) => void;
  onUndo: () => boolean;
  menuFor: (item: NoteListItem) => MenuEntry[];
  rememberScroll: (top: number) => void;
  recallScroll: () => number;
  ref?: Ref<NotesListHandle>;
}

/** Favourites first (in their saved order), then the rest in the list's own order. */
function splitFavourites(items: readonly NoteListItem[], enabled: boolean) {
  if (!enabled) return { favourites: [], others: items };
  const favourites = items
    .filter((item) => item.sidebarOrder !== null)
    .sort((a, b) => (a.sidebarOrder ?? 0) - (b.sidebarOrder ?? 0));
  const others = items.filter((item) => item.sidebarOrder === null);
  return { favourites, others };
}

/**
 * Notes and documents in one list (docs/ui-design-system.md §10), led by a quiet "Favourites" group
 * when some documents are favourites. One tab stop across both groups (roving tabindex): ↑/↓ or k/j
 * move in visual order, Home/End jump, Enter opens, Delete moves to Trash with undo, Shift+F10
 * opens the row menu.
 */
export function NotesList({
  items: listed,
  label,
  spaces,
  showSpace,
  groupFavourites = false,
  selectedId,
  currentId,
  compact,
  restoreFocus,
  onSelect,
  onOpen,
  onTrash,
  onFocusEditor,
  onUndo,
  menuFor,
  rememberScroll,
  recallScroll,
  ref,
}: NotesListProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const scroller = useRef<HTMLDivElement | null>(null);
  const { favourites, others } = useMemo(
    () => splitFavourites(listed, groupFavourites),
    [listed, groupFavourites],
  );
  // Keyboard order follows the screen: favourites, then the rest.
  const items = useMemo(
    () => (favourites.length > 0 ? [...favourites, ...others] : others),
    [favourites, others],
  );
  const restored = useRef(false);
  // The row that has (or last had) keyboard focus, and its position.
  const focused = useRef<{ id: string; index: number } | null>(null);
  const activeId = items.some((item) => item.id === selectedId)
    ? selectedId
    : (items[0]?.id ?? null);

  const focusRow = (id: string | null) => {
    if (id) buttons.current.get(id)?.focus();
  };

  useImperativeHandle(ref, () => ({ focusSelected: () => focusRow(activeId) }));

  // Back from the editor restores scroll position and puts focus on the row
  // (docs/ui-design-system.md §10).
  useLayoutEffect(() => {
    if (restored.current || items.length === 0) return;
    restored.current = true;
    if (scroller.current) scroller.current.scrollTop = recallScroll();
    if (restoreFocus && activeId) buttons.current.get(activeId)?.focus({ preventScroll: true });
  }, [activeId, restoreFocus, items.length, recallScroll]);

  // A focused row that leaves the list (Trash, Archive, moved, deleted elsewhere) hands focus
  // to the row that takes its place, so keyboard users never land on <body>.
  useLayoutEffect(() => {
    const last = focused.current;
    if (!last || items.some((item) => item.id === last.id)) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const neighbour = items[Math.min(last.index, items.length - 1)];
    if (!neighbour) return;
    buttons.current.get(neighbour.id)?.focus();
    onSelect(neighbour, 'focus');
  }, [items, onSelect]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const item = items[index];
    if (!item || event.defaultPrevented || event.nativeEvent.isComposing) return;
    const native = event.nativeEvent;
    if (matches('Mod+Z', native)) {
      if (onUndo()) event.preventDefault();
      return;
    }
    const trash =
      (event.key === 'Delete' && !event.ctrlKey && !event.metaKey && !event.altKey) ||
      (detectPlatform() === 'macos' && matches('Mod+Backspace', native));
    if (trash) {
      event.preventDefault();
      onTrash(item);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.key === 'ArrowRight') {
      if (onFocusEditor && item.id === currentId) {
        event.preventDefault();
        onFocusEditor(item);
      }
      return;
    }
    const next = targetIndex(event.key, index, items.length);
    if (next === null) return;
    event.preventDefault();
    const destination = items[next];
    if (!destination || destination.id === item.id) return;
    focusRow(destination.id);
    onSelect(destination, 'keyboard');
  };

  const groupId = useId();
  const renderRow = (item: NoteListItem, index: number) => (
    <NoteRow
      key={item.id}
      item={item}
      space={showSpace ? spaces.find((space) => space.id === item.spaceId) : undefined}
      tabbable={item.id === activeId}
      selected={item.id === selectedId}
      current={item.id === currentId}
      compact={compact}
      menu={menuFor(item)}
      register={(node) => {
        if (node) buttons.current.set(item.id, node);
        else buttons.current.delete(item.id);
      }}
      onOpen={(keyboard) => onOpen(item, keyboard)}
      onKeyDown={(event) => handleKeyDown(event, index)}
      onFocus={() => {
        focused.current = { id: item.id, index };
        onSelect(item, 'focus');
      }}
    />
  );

  return (
    <div
      ref={scroller}
      className={styles.scroller}
      onScroll={(event) => rememberScroll(event.currentTarget.scrollTop)}
    >
      <PageColumn width={compact ? 'full' : 'content'}>
        {favourites.length > 0 ? (
          <>
            <PageGroup aria-labelledby={`${groupId}-favourites`}>
              <PageSectionHeader id={`${groupId}-favourites`} title={t.list.favourites} />
              <PageList aria-labelledby={`${groupId}-favourites`}>
                {favourites.map((item, index) => renderRow(item, index))}
              </PageList>
            </PageGroup>
            {others.length > 0 && (
              <PageGroup aria-labelledby={`${groupId}-others`}>
                <PageSectionHeader id={`${groupId}-others`} title={t.list.others} />
                <PageList aria-label={label}>
                  {others.map((item, index) => renderRow(item, favourites.length + index))}
                </PageList>
              </PageGroup>
            )}
          </>
        ) : (
          <PageList aria-label={label}>
            {items.map((item, index) => renderRow(item, index))}
          </PageList>
        )}
      </PageColumn>
    </div>
  );
}

interface NoteRowProps {
  item: NoteListItem;
  space: Space | undefined;
  tabbable: boolean;
  selected: boolean;
  current: boolean;
  compact: boolean;
  menu: MenuEntry[];
  register: (node: HTMLButtonElement | null) => void;
  onOpen: (keyboard: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
}

function NoteRow({
  item,
  space,
  tabbable,
  selected,
  current,
  compact,
  menu,
  register,
  onOpen,
  onKeyDown,
  onFocus,
}: NoteRowProps) {
  const id = useId();
  const metaId = `${id}-meta`;
  const title = displayTitle(item);
  const untitled = !item.displayTitle.trim();
  const isDocument = item.kind === 'document';
  const shownTags = item.tags.slice(0, MAX_TAGS);
  const hiddenTags = item.tags.length - shownTags.length;

  // One quiet meta line under the snippet: date · space · tasks · tags · On desktop. Never a
  // date at the far right of a wide row (docs/ui-design-system.md, "ListRow").
  const metaParts: Array<[string, ReactNode]> = [
    ['date', <time dateTime={item.updatedAt}>{formatRelative(item.updatedAt)}</time>],
  ];
  if (space) {
    metaParts.push(['space', <SpaceDot color={spaceColor(space)} label={space.name} />]);
  }
  // The kind is the row's glyph (note or document) in the glyph column; the meta line names it
  // for assistive tech only, so it stays on one line at any width.
  if (isDocument && item.taskCount > 0) metaParts.push(['tasks', t.list.tasks(item.taskCount)]);
  for (const tag of shownTags) metaParts.push([`tag-${tag}`, `#${tag}`]);
  if (hiddenTags > 0) {
    metaParts.push([
      'more-tags',
      <>
        <span aria-hidden="true">{t.list.moreTags(hiddenTags)}</span>
        <span className="visually-hidden">{t.list.moreTagsLabel(hiddenTags)}</span>
      </>,
    ]);
  }
  if (item.pinned) metaParts.push(['desktop', t.list.onDesktop]);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // `detail` is 0 for clicks synthesised by Enter/Space.
    onOpen(event.detail === 0);
  };

  return (
    <li className={styles.item}>
      <ContextMenu items={menu}>
        <ListRow
          selected={selected}
          current={current ? 'true' : undefined}
          density={compact ? 'compact' : 'default'}
          className={compact ? styles.rowCompact : styles.row}
          // Documents carry a doc glyph in the glyph column; quick notes leave it empty and keep
          // their text on the text column, like every row.
          leading={
            isDocument ? (
              <span className={styles.glyph}>
                <FileText {...iconProps} />
              </span>
            ) : undefined
          }
          title={
            <button
              ref={register}
              type="button"
              className={styles.open}
              tabIndex={tabbable ? 0 : -1}
              data-row-id={item.id}
              aria-describedby={metaId}
              onClick={handleClick}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
            >
              <span className={cx(styles.titleText, untitled && styles.untitled)}>{title}</span>
            </button>
          }
          // Every row keeps three lines (56px): an empty snippet gets a quiet stand-in.
          snippet={
            item.excerpt.trim() ? (
              item.excerpt
            ) : (
              <span className={styles.placeholder} aria-hidden="true">
                {isDocument ? t.list.documentSnippet : t.list.noText}
              </span>
            )
          }
          meta={
            <span id={metaId} className={styles.meta}>
              {isDocument && <span className="visually-hidden">{t.documentKind}</span>}
              {metaParts.map(([key, part]) => (
                <span key={key} className={styles.metaPart}>
                  {part}
                </span>
              ))}
            </span>
          }
          actions={
            <DropdownMenu
              align="end"
              items={menu}
              trigger={
                <IconButton
                  aria-label={t.list.rowActions}
                  size="sm"
                  tabIndex={-1}
                  className={styles.rowActions}
                  icon={<Ellipsis {...iconProps} />}
                />
              }
            />
          }
        />
      </ContextMenu>
    </li>
  );
}
