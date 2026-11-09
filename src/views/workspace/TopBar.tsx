import { Brand, StatusDot, TitleBar } from '@mnml-tools/ui';
import {
  Inbox,
  ListTodo,
  NotebookText,
  Palette,
  Pin,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  IconButton,
  cx,
  detectPlatform,
  formatShortcut,
  iconProps,
  toAriaKeyShortcuts,
  useToast,
} from '@/components/ui';
import { useInboxCount } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import { layout } from '@/lib/layout';
import { type Area, useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { workspaceStrings as t } from '@/strings/workspace';
import { AppearanceDialog } from './AppearanceDialog';
import { WindowControls } from './WindowChrome';
import styles from './TopBar.module.css';
import { TopBarSpaceMenu } from './TopBarSpaceMenu';

const s = t.topBar;
const AREAS: ReadonlyArray<[Area, LucideIcon]> = [
  ['inbox', Inbox],
  ['notes', NotebookText],
  ['tasks', ListTodo],
  ['pinned', Pin],
];
const NARROW_QUERY = `(max-width: ${layout.narrowWindow - 1}px)`;
const macInset = detectPlatform() === 'macos';

/** True below 800px: search becomes an icon (the kit hides the brand's note there too). */
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

/** The app mark (the pen nib from the app icon) as a one-colour glyph, the kit's brand icon. */
function AppMark() {
  return (
    <svg viewBox="224 165 660 660" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M356 208 432 172C610 268 774 404 784 546 788 588 770 620 748 640L770 694C776 708 768 722 754 728L566 806C550 813 534 806 527 792L500 752C382 744 330 642 322 520 316 404 330 300 348 224 350 216 352 211 356 208ZM376 202 410 186 514 410 482 424ZM530 418A68 68 0 1 0 530.1 418Z"
      />
    </svg>
  );
}

/** The kit's `ThemeToggle` (the palette in Zap's title bar), opening Piw's appearance dialog. */
function AppearanceToggle() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mnml-button mnml-theme-toggle"
        data-tauri-drag-region="false"
        title={s.appearance}
        aria-label={s.appearance}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Palette size={14} aria-hidden="true" />
      </button>
      <AppearanceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Search, New (the Quick Capture popup), Trash and Settings, at the end of the area tabs. */
function AreaActions({ narrow }: { narrow: boolean }) {
  const ws = useWorkspace();
  const { toast } = useToast();
  return (
    <div className={styles.actions}>
      {narrow ? (
        <IconButton
          aria-label={common.actions.search}
          shortcut="Mod+K"
          icon={<Search {...iconProps} />}
          onClick={() => ws.setSearchOpen(true)}
        />
      ) : (
        // The kit's search field, but a button: the palette is where you type.
        <button
          type="button"
          className={styles.search}
          aria-keyshortcuts={toAriaKeyShortcuts('Mod+K')}
          title={`${common.actions.search} (${formatShortcut('Mod+K')})`}
          onClick={() => ws.setSearchOpen(true)}
        >
          <Search {...iconProps} className={styles.searchIcon} />
          <span className={styles.searchLabel}>{common.actions.search}</span>
        </button>
      )}
      <IconButton
        aria-label={common.actions.new}
        tooltip={t.newButton.tooltip}
        aria-haspopup="dialog"
        icon={<Plus {...iconProps} />}
        onClick={() =>
          // The Quick Capture popup, as the global shortcut opens it; Task in the Tasks area.
          void api
            .showCapture(ws.area === 'tasks' ? 'task' : 'note')
            .catch(() => toast({ tone: 'error', message: common.toasts.genericError }))
        }
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
  );
}

/**
 * The four areas as the kit's tab strip (`.mnml-tabs`, Zap's open tabs): square tabs with an
 * icon, the current one on the canvas with the accent line on top. Navigation, so buttons with
 * `aria-current`; they never close. The area actions sit at the strip's end.
 */
function AreaTabs({ inboxCount, narrow }: { inboxCount: number; narrow: boolean }) {
  const ws = useWorkspace();
  return (
    <div className={cx('mnml-tabs', styles.strip)}>
      <nav className={styles.areas} aria-label={s.areasLabel}>
        {AREAS.map(([area, Icon], index) => {
          const shortcut = `Mod+${index + 1}`;
          const label = common.areas[area];
          const count = area === 'inbox' && inboxCount > 0 ? inboxCount : null;
          const current = ws.area === area;
          return (
            <div
              key={area}
              className={cx('mnml-tab', styles.area)}
              data-active={current || undefined}
            >
              <button
                type="button"
                className="mnml-button"
                aria-current={current ? 'page' : undefined}
                aria-keyshortcuts={toAriaKeyShortcuts(shortcut)}
                title={`${label} (${formatShortcut(shortcut)})`}
                onClick={() => ws.navigate(area)}
              >
                <Icon size={13} aria-hidden />
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
            </div>
          );
        })}
      </nav>
      <AreaActions narrow={narrow} />
    </div>
  );
}

/**
 * The app shell's chrome (docs/ui-design-system.md, "Title bar and area tabs"), as Zap's: the
 * kit's `TitleBar` (brand and note on the left, the space switcher in the centre, the appearance
 * palette, the status and the window controls on the right; the bar itself drags the window),
 * then the areas as the kit's tab strip with search, New (Quick Capture), Trash and Settings at
 * its end. Below 800px search becomes an icon.
 */
export function TopBar() {
  const ws = useWorkspace();
  const narrow = useNarrow();
  const inboxCount = useInboxCount(ws.spaceId).data ?? 0;

  return (
    <>
      <TitleBar
        className={styles.bar}
        macInset={macInset}
        brand={<Brand icon={<AppMark />} name={s.brand} note={s.brandNote} />}
        center={<TopBarSpaceMenu />}
        end={
          <>
            <AppearanceToggle />
            <StatusDot />
            {s.status}
            <WindowControls />
          </>
        }
      />
      <AreaTabs inboxCount={inboxCount} narrow={narrow} />
    </>
  );
}
