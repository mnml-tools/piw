import { ChevronDown } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { IconButton } from '../IconButton/IconButton';
import { DropdownMenu } from '../Menu/DropdownMenu';
import { cx, iconProps, rovingIndex, rovingMove, type RovingKey } from '../utils';
import { getTabIds } from './tab-ids';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  /** Decorative icon before the label (☑ for Tasks tabs: type is never colour-only). */
  icon?: ReactNode;
  /** Visually hidden text after the label, e.g. "(tasks)". */
  srSuffix?: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: ReadonlyArray<TabItem>;
  /** Id of the selected tab. */
  value: string;
  onValueChange: (id: string) => void;
  /** Accessible name of the tablist ("Document tabs", "Task views"). */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** Prefix for tab/panel ids so the parent can render `<TabPanel>`s (default: `useId()`). */
  idBase?: string;
  /** Keyboard reorder: Alt+← / Alt+→ on a focused tab. Focus stays on the moved tab. */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** After the tabs, e.g. a "+" DropdownMenu ("Content tab", "Tasks tab"). */
  addSlot?: ReactNode;
  /** F2 or double-click on a tab. */
  onRename?: (id: string) => void;
  /** Tab being renamed: `renderEditor` replaces it (e.g. a ghost TextInput). */
  editingId?: string | null;
  renderEditor?: (item: TabItem) => ReactNode;
  /** Wrap each tab, e.g. in a `<ContextMenu>`. Keep `tab` as the (as-child) trigger. */
  renderTab?: (item: TabItem, tab: ReactElement) => ReactNode;
  /** When set, an overflow "▾" menu listing every tab appears while the tabs overflow. */
  overflowLabel?: string;
  className?: string;
}

const PAGE_MOVES: Record<string, RovingKey> = { PageDown: 'next', PageUp: 'prev' };

/**
 * Tab bar (`tablist` / `tab`): quiet text tabs under a document or Settings title, the selected
 * one marked by a 2px accent underline; renamable, reorderable. A roving tab stop: ←/→ (wrap,
 * and select), Home/End, Ctrl+PgUp/PgDn. Overflowing tabs scroll horizontally with an edge fade.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  idBase,
  onReorder,
  addSlot,
  onRename,
  editingId,
  renderEditor,
  renderTab,
  overflowLabel,
  className,
  ...aria
}: TabsProps) {
  const autoId = useId();
  const base = idBase ?? autoId;
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const isDisabled = (index: number) => Boolean(items[index]?.disabled);
  const selectedIndex = items.findIndex((item) => item.id === value);
  const tabStop =
    selectedIndex >= 0 && !isDisabled(selectedIndex)
      ? selectedIndex
      : rovingIndex(-1, 'next', items.length, isDisabled);

  // After a keyboard reorder, the moved tab keeps focus (its node may have been moved).
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    const tab = tabRefs.current.get(id);
    tab?.focus();
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [items]);

  // Edge fades and the overflow menu follow the scroll position and size.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const start = scroller.scrollLeft > 1;
      const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      setOverflow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    scroller.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', update);
    };
  }, []);

  const focusTab = (index: number) => {
    const item = items[index];
    if (item) tabRefs.current.get(item.id)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const item = items[index];
    if (!item) return;
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      if (!onReorder) return;
      event.preventDefault();
      event.stopPropagation(); // Alt+← is also "Back" at the app level
      const to = index + (event.key === 'ArrowLeft' ? -1 : 1);
      if (to < 0 || to >= items.length) return;
      pendingFocus.current = item.id;
      onReorder(index, to);
      return;
    }
    if (event.key === 'F2' && onRename) {
      event.preventDefault();
      onRename(item.id);
      return;
    }
    const pageMove = event.ctrlKey ? PAGE_MOVES[event.key] : undefined;
    const move =
      pageMove ?? (event.ctrlKey || event.metaKey || event.altKey ? null : rovingMove(event.key));
    if (!move) return;
    event.preventDefault();
    const next = rovingIndex(index, move, items.length, isDisabled);
    const target = items[next];
    if (!target) return;
    focusTab(next);
    onValueChange(target.id);
  };

  // Vertical wheels scroll the bar sideways.
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.currentTarget.scrollLeft += event.deltaY;
    }
  };

  const showOverflowMenu = Boolean(overflowLabel) && (overflow.start || overflow.end);

  return (
    <div className={cx(styles.tabs, className)}>
      <div
        ref={scrollerRef}
        className={styles.scroller}
        data-fade-start={overflow.start ? '' : undefined}
        data-fade-end={overflow.end ? '' : undefined}
        onWheel={handleWheel}
      >
        <div role="tablist" aria-orientation="horizontal" className={styles.tablist} {...aria}>
          {items.map((item, index) => {
            if (editingId === item.id && renderEditor) {
              return (
                <div key={item.id} className={styles.editor}>
                  {renderEditor(item)}
                </div>
              );
            }
            const selected = index === selectedIndex;
            const { tabId, panelId } = getTabIds(base, item.id);
            const tab = (
              <button
                type="button"
                role="tab"
                id={tabId}
                ref={(node) => {
                  if (node) tabRefs.current.set(item.id, node);
                  else tabRefs.current.delete(item.id);
                }}
                aria-selected={selected}
                aria-controls={selected ? panelId : undefined}
                tabIndex={index === tabStop ? 0 : -1}
                disabled={item.disabled}
                className={cx(styles.tab, 'focus-inset')}
                onClick={() => onValueChange(item.id)}
                onDoubleClick={onRename ? () => onRename(item.id) : undefined}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
                }
              >
                {item.icon && <span className={styles.icon}>{item.icon}</span>}
                <span className={styles.label}>{item.label}</span>
                {item.srSuffix && (
                  <>
                    {' '}
                    <span className="visually-hidden">{item.srSuffix}</span>
                  </>
                )}
              </button>
            );
            return <Fragment key={item.id}>{renderTab ? renderTab(item, tab) : tab}</Fragment>;
          })}
        </div>
      </div>
      {showOverflowMenu && overflowLabel && (
        <DropdownMenu
          align="end"
          trigger={
            <IconButton
              aria-label={overflowLabel}
              icon={<ChevronDown {...iconProps} />}
              size="sm"
            />
          }
          items={[
            {
              type: 'radio-group',
              id: 'tabs',
              label: overflowLabel,
              value,
              onValueChange,
              options: items.map((item) => ({
                value: item.id,
                label: item.srSuffix ? `${item.label} ${item.srSuffix}` : item.label,
                icon: item.icon,
                disabled: item.disabled,
              })),
            },
          ]}
        />
      )}
      {addSlot}
    </div>
  );
}

export interface TabPanelProps {
  /** Same `idBase` as the Tabs. */
  idBase: string;
  /** The tab this panel belongs to. */
  tabId: string;
  children: ReactNode;
  className?: string;
}

/** `role="tabpanel"` linked to its tab. Render only the active one. */
export function TabPanel({ idBase, tabId, children, className }: TabPanelProps) {
  const ids = getTabIds(idBase, tabId);
  return (
    <div
      role="tabpanel"
      id={ids.panelId}
      aria-labelledby={ids.tabId}
      className={cx(styles.panel, className)}
    >
      {children}
    </div>
  );
}
