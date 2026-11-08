import { ChevronDown, Plus, Search, Settings as SettingsIcon, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  IconButton,
  formatShortcut,
  iconProps,
  toAriaKeyShortcuts,
} from '@/components/ui';
import { useInboxCount } from '@/lib/hooks/data';
import { layout } from '@/lib/layout';
import { type Area, useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { workspaceStrings as t } from '@/strings/workspace';
import { WindowControls } from './WindowChrome';
import styles from './TopBar.module.css';
import { TopBarSpaceMenu } from './TopBarSpaceMenu';

const s = t.topBar;
const AREAS: Area[] = ['inbox', 'notes', 'tasks', 'pinned'];
const NARROW_QUERY = `(max-width: ${layout.narrowWindow - 1}px)`;

/** True below 800px: the area tabs fold into a menu and search becomes an icon. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const list = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return narrow;
}

/** 16px app mark (a sheet with a check) in the glyph column, drawn in the text colour. */
function AppMark() {
  return (
    <span className={styles.mark} role="img" aria-label={common.appName} title={common.appName}>
      {/* The pen nib from the app icon, as a one-colour glyph (holes cut with evenodd). */}
      <svg viewBox="224 165 660 660" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M356 208 432 172C610 268 774 404 784 546 788 588 770 620 748 640L770 694C776 708 768 722 754 728L566 806C550 813 534 806 527 792L500 752C382 744 330 642 322 520 316 404 330 300 348 224 350 216 352 211 356 208ZM376 202 410 186 514 410 482 424ZM530 418A68 68 0 1 0 530.1 418Z"
        />
      </svg>
    </span>
  );
}

/** Wide windows: the four areas as text tabs. Navigation, so buttons with `aria-current`. */
function AreaTabs({ inboxCount }: { inboxCount: number }) {
  const ws = useWorkspace();
  return (
    <nav className={styles.tabs} aria-label={s.areasLabel}>
      {AREAS.map((area, index) => {
        const shortcut = `Mod+${index + 1}`;
        const label = common.areas[area];
        const count = area === 'inbox' && inboxCount > 0 ? inboxCount : null;
        return (
          <button
            key={area}
            type="button"
            className={styles.tab}
            aria-current={ws.area === area ? 'page' : undefined}
            aria-keyshortcuts={toAriaKeyShortcuts(shortcut)}
            title={`${label} (${formatShortcut(shortcut)})`}
            onClick={() => ws.navigate(area)}
          >
            {/* One inline run, so the 11px count shares the label's baseline. */}
            <span>
              {label}
              {count !== null && (
                <>
                  <span className={styles.count} aria-hidden="true">
                    {count}
                  </span>
                  <span className="visually-hidden">{`, ${t.inboxCount(count)}`}</span>
                </>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** Narrow windows: one menu button named after the current area. */
function AreaMenu({ inboxCount }: { inboxCount: number }) {
  const ws = useWorkspace();
  const current = common.areas[ws.area];
  return (
    <DropdownMenu
      align="start"
      aria-label={s.areaMenuLabel}
      items={[
        {
          id: 'areas',
          type: 'radio-group',
          label: s.areasLabel,
          value: ws.area,
          onValueChange: (value) => ws.navigate(value as Area),
          // Trash and Settings stay as icons in the bar.
          options: AREAS.map((area) => ({
            value: area,
            label:
              area === 'inbox' && inboxCount > 0 ? s.inboxInMenu(inboxCount) : common.areas[area],
          })),
        },
      ]}
      trigger={
        <button type="button" className={styles.areaMenu} aria-label={s.areaMenu(current)}>
          <span className={styles.areaMenuName}>{current}</span>
          <ChevronDown {...iconProps} className={styles.chevron} />
        </button>
      }
    />
  );
}

interface TopBarProps {
  onNewDocument: () => void;
}

/**
 * The app shell's one bar (docs/ui-design-system.md, "Top bar"): 44px on the soft surface with
 * one hairline under it. Left: the app mark in the glyph column and the areas as text tabs, the
 * first label on the text column. Right: the space switcher, the search field, New, Trash and
 * Settings, the last one ending on the content inset. Below 800px the areas fold into a menu and
 * search becomes an icon. The empty parts of the bar drag the window.
 */
export function TopBar({ onNewDocument }: TopBarProps) {
  const ws = useWorkspace();
  const narrow = useNarrow();
  const inboxCount = useInboxCount(ws.spaceId).data ?? 0;

  return (
    <header
      className={styles.bar}
      aria-label={s.label}
      data-narrow={narrow ? '' : undefined}
      data-tauri-drag-region
    >
      <AppMark />
      {narrow ? <AreaMenu inboxCount={inboxCount} /> : <AreaTabs inboxCount={inboxCount} />}
      <div className={styles.drag} data-tauri-drag-region />

      <div className={styles.actions}>
        <TopBarSpaceMenu />

        {narrow ? (
          <IconButton
            aria-label={common.actions.search}
            shortcut="Mod+K"
            icon={<Search {...iconProps} />}
            onClick={() => ws.setSearchOpen(true)}
          />
        ) : (
          // The search field's look, but a button: the palette is where you type.
          <button
            type="button"
            className={styles.search}
            aria-keyshortcuts={toAriaKeyShortcuts('Mod+K')}
            onClick={() => ws.setSearchOpen(true)}
          >
            <Search {...iconProps} className={styles.searchIcon} />
            <span className={styles.searchLabel}>{common.actions.search}</span>
            <span className={styles.searchKey} aria-hidden="true">
              {formatShortcut('Mod+K')}
            </span>
          </button>
        )}

        <div className={styles.icons}>
          <DropdownMenu
            align="end"
            trigger={
              <IconButton
                aria-label={common.actions.new}
                tooltip={t.newMenu.tooltip}
                icon={<Plus {...iconProps} />}
              />
            }
            items={[
              { id: 'note', label: t.newMenu.note, shortcut: 'Mod+N', onSelect: ws.newNote },
              { id: 'task', label: t.newMenu.task, shortcut: 'Mod+T', onSelect: ws.requestAddTask },
              {
                id: 'document',
                label: t.newMenu.document,
                shortcut: 'Mod+Shift+N',
                onSelect: onNewDocument,
              },
            ]}
          />
          <IconButton
            aria-label={common.areas.trash}
            icon={<Trash2 {...iconProps} />}
            pressed={ws.area === 'trash'}
            onClick={() => ws.navigate('trash')}
          />
          <IconButton
            aria-label={common.areas.settings}
            shortcut="Mod+,"
            icon={<SettingsIcon {...iconProps} />}
            pressed={ws.area === 'settings'}
            onClick={() => ws.navigate('settings')}
          />
        </div>
      </div>
      <WindowControls />
    </header>
  );
}
