/**
 * Dev-only showcase of every shared component and state (`?window=gallery`).
 * Not shipped as a product screen; copy here is sample data, not catalogue strings.
 */
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleExclamationPoint,
  Ellipsis,
  FileText,
  Inbox,
  NotebookText,
  Pin,
  PinOff,
  Plus,
  Search,
  SquareCheck,
  StickyNote,
  Tag,
  Trash,
  TriangleExclamationPoint,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  ContextMenu,
  DateQuickPicker,
  Dialog,
  Drawer,
  DropdownMenu,
  EmptyState,
  IconButton,
  Kbd,
  ListRow,
  SaveIndicator,
  Segmented,
  SpaceDot,
  Spinner,
  STICKY_COLORS,
  TabPanel,
  Tabs,
  TextArea,
  TextInput,
  ToastProvider,
  cx,
  iconProps,
  parseISODate,
  todayISO,
  useToast,
  type DrawerMode,
  type MenuEntry,
  type Platform,
  type SaveState,
  type StickyColor,
  type TabItem,
} from '@/components/ui';
import dialogStyles from '@/components/ui/Dialog/Dialog.module.css';
import menuStyles from '@/components/ui/Menu/Menu.module.css';
import toastStyles from '@/components/ui/Toast/Toast.module.css';
import styles from './Gallery.module.css';

type Theme = 'system' | 'light' | 'dark';
type TextSize = 'small' | 'default' | 'large';

const SAVE_LABELS = { saving: 'Saving…', saved: 'Saved', error: "Couldn't save", retry: 'Retry' };
const DATE_LABELS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  nextWeek: 'Next week',
  pick: 'Pick a date…',
  clear: 'Remove date',
  pickInput: 'Due date',
  apply: 'Set date',
};
const COLOR_NAMES: Record<StickyColor, string> = {
  plain: 'Warm gray',
  yellow: 'Yellow',
  peach: 'Clay',
  rose: 'Rose',
  mint: 'Sage',
  sky: 'Blue',
  lavender: 'Lavender',
};

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
function formatDue(iso: string | null): string {
  const date = iso ? parseISODate(iso) : null;
  return date ? shortDate.format(date) : 'No date';
}

function readRoot(name: 'theme' | 'textSize' | 'platform'): string | undefined {
  return document.documentElement.dataset[name];
}
function writeRoot(name: 'theme' | 'textSize' | 'platform', value: string | null): void {
  if (value) document.documentElement.dataset[name] = value;
  else delete document.documentElement.dataset[name];
}

function Section({
  title,
  wide = false,
  children,
}: {
  title: string;
  /** Span both columns of the grid. */
  wide?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={cx(styles.section, wide && styles.wide)} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      {label && <span className={styles.rowLabel}>{label}</span>}
      <div className={styles.rowItems}>{children}</div>
    </div>
  );
}

export default function Gallery() {
  return (
    <ToastProvider>
      <GalleryContent />
    </ToastProvider>
  );
}

function GalleryContent() {
  const [theme, setTheme] = useState<Theme>(() => {
    const value = readRoot('theme');
    return value === 'light' || value === 'dark' ? value : 'system';
  });
  const [textSize, setTextSize] = useState<TextSize>(() => {
    const value = readRoot('textSize');
    return value === 'small' || value === 'large' ? value : 'default';
  });
  const [platform, setPlatform] = useState<Platform>(() => {
    const value = readRoot('platform');
    return value === 'macos' || value === 'windows' || value === 'linux' ? value : 'linux';
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Piw components</h1>
        <div className={styles.controls}>
          <Segmented<Theme>
            aria-label="Theme"
            size="sm"
            value={theme}
            onValueChange={(value) => {
              writeRoot('theme', value === 'system' ? null : value);
              setTheme(value);
            }}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Segmented<TextSize>
            aria-label="Text size"
            size="sm"
            value={textSize}
            onValueChange={(value) => {
              writeRoot('textSize', value === 'default' ? null : value);
              setTextSize(value);
            }}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'default', label: 'Default' },
              { value: 'large', label: 'Large' },
            ]}
          />
          <Segmented<Platform>
            aria-label="Platform"
            size="sm"
            value={platform}
            onValueChange={(value) => {
              writeRoot('platform', value);
              setPlatform(value);
            }}
            options={[
              { value: 'macos', label: 'macOS' },
              { value: 'windows', label: 'Windows' },
              { value: 'linux', label: 'Linux' },
            ]}
          />
        </div>
      </header>

      <main className={styles.grid}>
        <StatesSection />
        <ButtonsSection />
        <FieldsSection />
        <CheckboxSection />
        <SegmentedSection />
        <TabsSection />
        <ListSection />
        <MenuSection />
        <DialogSection />
        <ToastSection />
        <DrawerSection />
        <EmptySection />
        <KbdSection platform={platform} />
        <BadgeSection />
        <SaveSection />
        <DateSection />
        <StickySection />
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */

/**
 * Static matrix of interaction states. Hover and focus cannot be held in a screenshot, so these
 * cells force them with gallery-only `data-force` attributes (styled in Gallery.module.css with the
 * same tokens the components use). Everything here is inert.
 */
const STATE_COLUMNS = ['default', 'hover', 'pressed / selected', 'focus', 'disabled', 'busy'];

function StateCell({ children }: { children?: ReactNode }) {
  return <div className={styles.stateCell}>{children}</div>;
}

function StatesSection() {
  return (
    <Section title="States (forced, inert)" wide>
      <div className={styles.states} inert>
        <span />
        {STATE_COLUMNS.map((column) => (
          <span key={column} className={styles.stateHead}>
            {column}
          </span>
        ))}

        <span className={styles.rowLabel}>ghost</span>
        <StateCell>
          <Button variant="ghost" icon={<Plus {...iconProps} />}>
            New
          </Button>
        </StateCell>
        <StateCell>
          <Button variant="ghost" icon={<Plus {...iconProps} />} data-force="hover">
            New
          </Button>
        </StateCell>
        <StateCell>
          <Button variant="ghost" icon={<Plus {...iconProps} />} aria-expanded="true">
            New
          </Button>
        </StateCell>
        <StateCell>
          <Button variant="ghost" icon={<Plus {...iconProps} />} data-force="focus">
            New
          </Button>
        </StateCell>
        <StateCell>
          <Button variant="ghost" icon={<Plus {...iconProps} />} disabled>
            New
          </Button>
        </StateCell>
        <StateCell>
          <Button variant="ghost" icon={<Plus {...iconProps} />} loading>
            New
          </Button>
        </StateCell>

        <span className={styles.rowLabel}>secondary</span>
        <StateCell>
          <Button>Rename</Button>
        </StateCell>
        <StateCell>
          <Button data-force="hover-layer">Rename</Button>
        </StateCell>
        <StateCell>
          <Button aria-expanded="true">Rename</Button>
        </StateCell>
        <StateCell>
          <Button data-force="focus">Rename</Button>
        </StateCell>
        <StateCell>
          <Button disabled>Rename</Button>
        </StateCell>
        <StateCell>
          <Button loading>Rename</Button>
        </StateCell>

        <span className={styles.rowLabel}>primary</span>
        <StateCell>
          <Button variant="primary">Save</Button>
        </StateCell>
        <StateCell>
          <Button variant="primary" data-force="hover-accent">
            Save
          </Button>
        </StateCell>
        <StateCell />
        <StateCell>
          <Button variant="primary" data-force="focus">
            Save
          </Button>
        </StateCell>
        <StateCell>
          <Button variant="primary" disabled>
            Save
          </Button>
        </StateCell>
        <StateCell>
          <Button variant="primary" loading>
            Save
          </Button>
        </StateCell>

        <span className={styles.rowLabel}>icon</span>
        <StateCell>
          <IconButton aria-label="Pin" icon={<Pin {...iconProps} />} />
        </StateCell>
        <StateCell>
          <IconButton aria-label="Pin" icon={<Pin {...iconProps} />} data-force="hover" />
        </StateCell>
        <StateCell>
          <IconButton aria-label="Pin" icon={<Pin {...iconProps} />} pressed />
        </StateCell>
        <StateCell>
          <IconButton aria-label="Pin" icon={<Pin {...iconProps} />} data-force="focus" />
        </StateCell>
        <StateCell>
          <IconButton aria-label="Pin" icon={<Pin {...iconProps} />} disabled />
        </StateCell>
        <StateCell />

        <span className={styles.rowLabel}>checkbox</span>
        <StateCell>
          <Checkbox aria-label="Task" />
        </StateCell>
        <StateCell>
          <Checkbox aria-label="Task" data-force="hover" />
        </StateCell>
        <StateCell>
          <Checkbox aria-label="Task" defaultChecked />
        </StateCell>
        <StateCell>
          <Checkbox aria-label="Task" data-force="focus" />
        </StateCell>
        <StateCell>
          <Checkbox aria-label="Task" disabled />
          <Checkbox aria-label="Task" disabled defaultChecked />
        </StateCell>
        <StateCell />

        <span className={styles.rowLabel}>input</span>
        <StateCell>
          <TextInput aria-label="Name" size="sm" defaultValue="Work" />
        </StateCell>
        <StateCell>
          <TextInput aria-label="Name" size="sm" defaultValue="Work" data-force="hover-field" />
        </StateCell>
        <StateCell>
          <TextInput aria-label="Name" size="sm" defaultValue="Required" invalid />
        </StateCell>
        <StateCell>
          <TextInput aria-label="Name" size="sm" defaultValue="Work" data-force="focus-field" />
        </StateCell>
        <StateCell>
          <TextInput aria-label="Name" size="sm" defaultValue="Work" disabled />
        </StateCell>
        <StateCell />
      </div>

      <div className={styles.statesWide} inert>
        {/* eslint-disable-next-line jsx-a11y-x/no-redundant-roles */}
        <ul role="list" aria-label="Row states" className={styles.list}>
          <li>
            <ListRow title="Default row" snippet="Snippet in muted text." />
          </li>
          <li>
            <ListRow
              title="Hovered row"

              snippet="A soft rounded fill, inset 6px; content stays on the grid."
              data-force="hover"
            />
          </li>
          <li>
            <ListRow title="Selected row" snippet="--color-bg-active." selected />
          </li>
          <li>
            <ListRow
              title="Selected, list focused"

              snippet="--color-bg-active-accent."
              selected
              data-force="selected-accent"
            />
          </li>
          <li>
            <ListRow
              title="Focused row"

              snippet="Keyboard ring, inset."
              data-force="focus-inset"
            />
          </li>
        </ul>
      </div>
    </Section>
  );
}

function ButtonsSection() {
  const [onTop, setOnTop] = useState(false);
  return (
    <Section title="Button · IconButton · Spinner">
      {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
        <Row key={variant} label={variant}>
          <Button variant={variant}>Move to Trash</Button>
          <Button variant={variant} size="sm">
            Small
          </Button>
          <Button variant={variant} icon={<Plus {...iconProps} />}>
            New note
          </Button>
          <Button variant={variant} loading>
            Saving
          </Button>
          <Button variant={variant} disabled>
            Disabled
          </Button>
        </Row>
      ))}
      <Row label="icon">
        <IconButton aria-label="New note" icon={<Plus {...iconProps} />} shortcut="Mod+N" />
        <IconButton
          aria-label="Keep on top"
          tooltip={onTop ? 'Stop keeping on top' : 'Keep on top'}
          icon={onTop ? <Pin {...iconProps} /> : <PinOff {...iconProps} />}
          pressed={onTop}
          onClick={() => setOnTop((value) => !value)}
        />
        <IconButton aria-label="Open in Piw" size="sm" icon={<ArrowUpRight {...iconProps} />} />
        <IconButton aria-label="Hide from desktop" size="sm" icon={<X {...iconProps} />} />
        <IconButton aria-label="More" icon={<Ellipsis {...iconProps} />} disabled />
        <Spinner />
      </Row>
    </Section>
  );
}

function FieldsSection() {
  const [description, setDescription] = useState('Grows with its content.\nTry adding lines.');
  return (
    <Section title="TextInput · TextArea">
      <div className={styles.stack}>
        <TextInput label="Space name" placeholder="Work" />
        <TextInput label="Space name" defaultValue="" error="A space needs a name" />
        <TextInput aria-label="Rename tab" variant="ghost" defaultValue="Implementation" />
        <TextInput label="Data folder" readOnly defaultValue="~/.local/share/piw/piw.db" />
        <TextInput label="Disabled" disabled defaultValue="Not editable" />
        <TextArea
          aria-label="Description"
          variant="ghost"
          autoGrow
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add a description…"
        />
        <TextArea aria-label="Default" placeholder="Write a note…" />
        <TextArea
          aria-label="Editor"
          variant="editor"
          autoGrow
          defaultValue={'Ligar ao fornecedor\nPedir orçamento revisto até sexta.'}
        />
      </div>
    </Section>
  );
}

function CheckboxSection() {
  return (
    <Section title="Checkbox">
      <Row label="task md">
        <Checkbox aria-label="Unchecked task" />
        <Checkbox aria-label="Checked task" defaultChecked />
        <Checkbox aria-label="Disabled task" disabled />
        <Checkbox aria-label="Disabled checked task" disabled defaultChecked />
      </Row>
      <Row label="task sm">
        <Checkbox size="sm" label="Testar serviço TOTP" defaultChecked />
        <Checkbox size="sm" label="Testar recuperação" />
      </Row>
    </Section>
  );
}

function KbdSection({ platform }: { platform: Platform }) {
  const shortcuts = ['Mod+Shift+Space', 'Mod+Enter', 'Mod+K', 'Mod+Shift+\\', 'Esc', 'Alt+ArrowUp'];
  return (
    <Section title={`Kbd (${platform})`}>
      {shortcuts.map((shortcut) => (
        <Row key={shortcut} label={shortcut}>
          <Kbd shortcut={shortcut} />
          <Kbd shortcut={shortcut} variant="chip" />
        </Row>
      ))}
    </Section>
  );
}

function BadgeSection() {
  return (
    <Section title="Badge · SpaceDot">
      <Row label="badge">
        <Badge>Archived</Badge>
        <Badge>#security</Badge>
      </Row>
      <Row label="dot">
        {STICKY_COLORS.map((color) => (
          <SpaceDot key={color} color={color} label={COLOR_NAMES[color]} />
        ))}
      </Row>
    </Section>
  );
}

function SegmentedSection() {
  const [mode, setMode] = useState<'note' | 'task'>('note');
  const [size, setSize] = useState<'small' | 'default' | 'large'>('default');
  const [filter, setFilter] = useState<'today' | 'upcoming' | 'all' | 'completed'>('upcoming');
  const filterOptions = [
    { value: 'today', label: 'Today' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'all', label: 'All' },
    { value: 'completed', label: 'Completed' },
  ] as const;
  return (
    <Section title="Segmented">
      <Row label="text md">
        <Segmented
          aria-label="Task view"
          variant="text"
          value={filter}
          onValueChange={setFilter}
          options={filterOptions}
        />
      </Row>
      <Row label="text sm">
        <Segmented
          aria-label="Task view (small)"
          variant="text"
          size="sm"
          value={filter}
          onValueChange={setFilter}
          options={[
            ...filterOptions.slice(0, 3),
            { value: 'completed', label: 'Completed', disabled: true },
          ]}
        />
      </Row>
      <Row label="contained md">
        <Segmented
          aria-label="Capture mode"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'note', label: 'Note', icon: <StickyNote {...iconProps} /> },
            { value: 'task', label: 'Task', icon: <SquareCheck {...iconProps} /> },
          ]}
        />
      </Row>
      <Row label="contained sm">
        <Segmented
          aria-label="Text size sample"
          size="sm"
          value={size}
          onValueChange={setSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'default', label: 'Default' },
            { value: 'large', label: 'Large', disabled: true },
          ]}
        />
      </Row>
    </Section>
  );
}

function RenameField({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <TextInput
      ref={ref}
      aria-label="Tab name"
      variant="ghost"
      size="sm"
      defaultValue={initial}
      onBlur={(event) => onDone(event.currentTarget.value.trim() || null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onDone(event.currentTarget.value.trim() || null);
        if (event.key === 'Escape') {
          event.preventDefault();
          onDone(null);
        }
      }}
    />
  );
}

let tabCounter = 0;

function TabsSection() {
  const idBase = useId();
  const [tabs, setTabs] = useState<TabItem[]>([
    { id: 'overview', label: 'Overview' },
    { id: 'impl', label: 'Implementation' },
    { id: 'todos', label: 'To-dos', icon: <SquareCheck {...iconProps} />, srSuffix: '(tasks)' },
    { id: 'refs', label: 'References' },
    { id: 'notes', label: 'Meeting notes' },
    { id: 'rollout', label: 'Rollout plan' },
  ]);
  const [active, setActive] = useState('overview');
  const [editing, setEditing] = useState<string | null>(null);

  const move = (from: number, to: number) =>
    setTabs((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
  const add = (kind: 'content' | 'tasks') => {
    tabCounter += 1;
    const id = `new-${tabCounter}`;
    const item: TabItem =
      kind === 'tasks'
        ? { id, label: 'Tasks', icon: <SquareCheck {...iconProps} />, srSuffix: '(tasks)' }
        : { id, label: 'Untitled' };
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === active);
      const next = [...current];
      next.splice(index + 1, 0, item);
      return next;
    });
    setActive(id);
    setEditing(id);
  };
  const tabMenu = (item: TabItem): MenuEntry[] => {
    const index = tabs.findIndex((tab) => tab.id === item.id);
    return [
      { id: 'rename', label: 'Rename', shortcut: 'F2', onSelect: () => setEditing(item.id) },
      {
        id: 'left',
        label: 'Move left',
        disabled: index === 0,
        onSelect: () => move(index, index - 1),
      },
      {
        id: 'right',
        label: 'Move right',
        disabled: index === tabs.length - 1,
        onSelect: () => move(index, index + 1),
      },
      { id: 'sep', type: 'separator' },
      {
        id: 'delete',
        label: 'Delete tab…',
        danger: true,
        disabled: tabs.length === 1,
        onSelect: () => setTabs((current) => current.filter((tab) => tab.id !== item.id)),
      },
    ];
  };

  return (
    <Section title="Tabs">
      <p className={styles.note}>
        ←/→ Home End · Alt+←/→ reorders · F2 or double-click renames · Shift+F10 menu · narrow the
        window to see overflow.
      </p>
      <div className={styles.tabsFrame}>
        <Tabs
          aria-label="Document tabs"
          idBase={idBase}
          items={tabs}
          value={active}
          onValueChange={setActive}
          onReorder={move}
          onRename={setEditing}
          editingId={editing}
          renderEditor={(item) => (
            <RenameField
              initial={item.label}
              onDone={(name) => {
                if (name) {
                  setTabs((current) =>
                    current.map((tab) => (tab.id === item.id ? { ...tab, label: name } : tab)),
                  );
                }
                setEditing(null);
              }}
            />
          )}
          renderTab={(item, tab) => <ContextMenu items={tabMenu(item)}>{tab}</ContextMenu>}
          overflowLabel="All tabs"
          addSlot={
            <DropdownMenu
              align="end"
              trigger={<IconButton aria-label="Add tab" size="sm" icon={<Plus {...iconProps} />} />}
              items={[
                { id: 'content', label: 'Content tab', onSelect: () => add('content') },
                { id: 'tasks', label: 'Tasks tab', onSelect: () => add('tasks') },
              ]}
            />
          }
        />
        <TabPanel idBase={idBase} tabId={active} className={styles.panel}>
          Panel for “{tabs.find((tab) => tab.id === active)?.label}”
        </TabPanel>
      </div>
    </Section>
  );
}

function MenuSection() {
  const [onTop, setOnTop] = useState(true);
  const [sort, setSort] = useState('edited');
  const [color, setColor] = useState<string>('yellow');
  const { toast } = useToast();
  const items: MenuEntry[] = [
    { id: 'open', label: 'Open', onSelect: () => toast({ message: 'Open' }) },
    {
      id: 'pin',
      label: 'Pin to desktop',
      icon: <Pin {...iconProps} />,
      shortcut: 'Mod+Shift+P',
      onSelect: () => toast({ message: 'Pinned to desktop' }),
    },
    {
      id: 'top',
      type: 'checkbox',
      label: 'Keep on top',
      checked: onTop,
      onCheckedChange: setOnTop,
    },
    {
      id: 'color',
      type: 'submenu',
      label: 'Colour',
      items: [
        {
          id: 'colors',
          type: 'radio-group',
          label: 'Colour',
          value: color,
          onValueChange: setColor,
          options: STICKY_COLORS.map((name) => ({
            value: name,
            label: COLOR_NAMES[name],
            icon: <SpaceDot color={name} decorative />,
          })),
        },
      ],
    },
    { id: 'archive', label: 'Archive', disabled: true, onSelect: () => {} },
    { id: 'sep', type: 'separator' },
    {
      id: 'trash',
      label: 'Move to Trash',
      icon: <Trash {...iconProps} />,
      shortcut: 'Delete',
      danger: true,
      onSelect: () => toast({ message: '“Ligar ao fornecedor” moved to Trash' }),
    },
  ];
  return (
    <Section title="DropdownMenu · ContextMenu">
      <Row>
        <DropdownMenu
          trigger={<IconButton aria-label="More" icon={<Ellipsis {...iconProps} />} />}
          items={items}
        />
        <DropdownMenu
          trigger={<Button variant="ghost">Sort ▾</Button>}
          items={[
            {
              id: 'sort',
              type: 'radio-group',
              label: 'Sort',
              showLabel: true,
              value: sort,
              onValueChange: setSort,
              options: [
                { value: 'edited', label: 'Last edited' },
                { value: 'created', label: 'Created' },
                { value: 'title', label: 'Title' },
              ],
            },
          ]}
        />
      </Row>
      <ContextMenu items={items}>
        <button type="button" className={styles.contextTarget}>
          Right-click, Shift+F10 or the Menu key here
        </button>
      </ContextMenu>
      <p className={styles.note}>Static surface (real menu classes; item 2 highlighted):</p>
      <div className={styles.surfaces} inert>
        <div className={cx(menuStyles.content, styles.staticMenu)}>
          <div className={menuStyles.item}>
            <span className={menuStyles.icon} />
            <span className={menuStyles.itemLabel}>Open</span>
          </div>
          <div className={menuStyles.item} data-highlighted="">
            <span className={menuStyles.icon}>
              <Pin {...iconProps} />
            </span>
            <span className={menuStyles.itemLabel}>Pin to desktop</span>
            <span className={menuStyles.shortcut}>
              <Kbd shortcut="Mod+Shift+P" />
            </span>
          </div>
          <div className={menuStyles.item}>
            <span className={menuStyles.icon}>
              <Tag {...iconProps} />
            </span>
            <span className={menuStyles.itemLabel}>Add tag…</span>
            <span className={menuStyles.shortcut}>
              <Kbd shortcut="Mod+T" />
            </span>
          </div>
          <div className={menuStyles.item} data-disabled="">
            <span className={menuStyles.icon} />
            <span className={menuStyles.itemLabel}>Archive</span>
          </div>
          <div className={menuStyles.separator} />
          <div className={cx(menuStyles.item, menuStyles.danger)}>
            <span className={menuStyles.icon}>
              <Trash {...iconProps} />
            </span>
            <span className={menuStyles.itemLabel}>Move to Trash</span>
            <span className={menuStyles.shortcut}>
              <Kbd shortcut="Delete" />
            </span>
          </div>
        </div>
        <div className={cx(menuStyles.content, styles.staticMenu)}>
          <div className={menuStyles.label}>Sort</div>
          <div className={menuStyles.item}>
            <span className={menuStyles.indicator}>
              <Check {...iconProps} />
            </span>
            <span className={menuStyles.itemLabel}>Last edited</span>
          </div>
          <div className={menuStyles.item}>
            <span className={menuStyles.indicator} />
            <span className={menuStyles.itemLabel}>Created</span>
          </div>
          <div className={menuStyles.item} data-state="open">
            <span className={menuStyles.indicator} />
            <span className={menuStyles.itemLabel}>Group by</span>
            <ChevronRight {...iconProps} className={menuStyles.subChevron} />
          </div>
        </div>
      </div>
    </Section>
  );
}

function DialogSection() {
  const [notice, setNotice] = useState(false);
  const [palette, setPalette] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [trashDoc, setTrashDoc] = useState(false);
  const [keepTasks, setKeepTasks] = useState('keep');
  const { toast } = useToast();
  return (
    <Section title="Dialog · ConfirmDialog">
      <Row>
        <Button onClick={() => setNotice(true)}>Tray notice</Button>
        <Button onClick={() => setPalette(true)} icon={<Search {...iconProps} />}>
          Palette layout
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Empty trash…
        </Button>
        <Button onClick={() => setTrashDoc(true)}>Move document to Trash…</Button>
      </Row>
      <Dialog
        open={notice}
        onOpenChange={setNotice}
        title="Piw keeps running in the tray"
        showClose={false}
        footer={
          <>
            <Button onClick={() => setNotice(false)}>Quit when closed</Button>
            <Button variant="primary" onClick={() => setNotice(false)}>
              Keep running
            </Button>
          </>
        }
      />
      <Dialog
        open={palette}
        onOpenChange={setPalette}
        title="Search"
        hideTitle
        placement="top"
        padding="none"
      >
        <div className={styles.palette}>
          <TextInput
            aria-label="Search notes, tasks and documents"
            placeholder="Search notes, tasks and documents"
            variant="ghost"
            size="lg"
          />
          <p className={styles.note}>Results go here (SearchPalette is a feature component).</p>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Permanently delete 14 items?"
        description="This can't be undone."
        confirmLabel="Delete forever"
        cancelLabel="Cancel"
        destructive
        onConfirm={() =>
          new Promise<void>((resolve) => {
            window.setTimeout(() => {
              toast({ message: 'Trash emptied' });
              resolve();
            }, 800);
          })
        }
      />
      <ConfirmDialog
        open={trashDoc}
        onOpenChange={setTrashDoc}
        title="Move “Refactor 2FA” to Trash?"
        description="It has 4 linked tasks."
        confirmLabel="Move to Trash"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          toast({
            message: '“Refactor 2FA” moved to Trash',
            action: { label: 'Undo', onAction: () => {} },
          });
        }}
      >
        <Segmented
          aria-label="Linked tasks"
          size="sm"
          value={keepTasks}
          onValueChange={setKeepTasks}
          options={[
            { value: 'keep', label: 'Keep the tasks' },
            { value: 'trash', label: 'Move them too' },
          ]}
        />
      </ConfirmDialog>
      <p className={styles.note}>Static surface (real dialog classes):</p>
      <div className={styles.surfaceFrame} inert>
        <div className={cx(dialogStyles.dialog, styles.staticDialog)}>
          <div className={dialogStyles.header}>
            <h3 className={dialogStyles.title}>Permanently delete 14 items?</h3>
          </div>
          <p className={dialogStyles.description}>This can’t be undone.</p>
          <div className={dialogStyles.confirmFooter}>
            <Button>Cancel</Button>
            <Button variant="danger">Delete forever</Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ToastSection() {
  const { toast } = useToast();
  return (
    <Section title="Toast">
      <Row>
        <Button onClick={() => toast({ message: 'Converted to document' })}>Info</Button>
        <Button
          onClick={() =>
            toast({
              message: '“Comprar café” moved to Trash',
              action: { label: 'Undo', onAction: () => toast({ message: 'Restored' }) },
            })
          }
        >
          Undo toast
        </Button>
        <Button
          onClick={() =>
            toast({
              message: "Couldn't export. Check the folder and try again.",
              tone: 'error',
              duration: 0,
            })
          }
        >
          Error (stays)
        </Button>
      </Row>
      <div className={styles.toastStack} inert>
        <div className={toastStyles.toast}>
          <p className={toastStyles.message}>“Comprar café” moved to Trash</p>
          <Button variant="ghost" size="sm" className={toastStyles.action}>
            Undo
          </Button>
          <IconButton aria-label="Dismiss" tooltip={false} size="sm" icon={<X {...iconProps} />} />
        </div>
        <div className={cx(toastStyles.toast, toastStyles.error)}>
          <CircleExclamationPoint {...iconProps} className={toastStyles.toneIcon} />
          <p className={toastStyles.message}>Couldn’t export. Check the folder.</p>
          <Button variant="ghost" size="sm" className={toastStyles.action}>
            Retry
          </Button>
          <IconButton aria-label="Dismiss" tooltip={false} size="sm" icon={<X {...iconProps} />} />
        </div>
      </div>
    </Section>
  );
}

function SaveSection() {
  const [state, setState] = useState<SaveState>('idle');
  const [speed, setSpeed] = useState<'fast' | 'slow' | 'fail'>('slow');
  const timer = useRef<number | undefined>(undefined);
  const save = (outcome: 'fast' | 'slow' | 'fail') => {
    window.clearTimeout(timer.current);
    setState('saving');
    timer.current = window.setTimeout(
      () => setState(outcome === 'fail' ? 'error' : 'saved'),
      outcome === 'fast' ? 120 : 1200,
    );
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Section title="SaveIndicator">
      <Row label="live">
        <Segmented
          aria-label="Save speed"
          size="sm"
          value={speed}
          onValueChange={setSpeed}
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'slow', label: 'Slow' },
            { value: 'fail', label: 'Fails' },
          ]}
        />
        <Button size="sm" onClick={() => save(speed)}>
          Save
        </Button>
        <SaveIndicator state={state} labels={SAVE_LABELS} onRetry={() => save('slow')} />
      </Row>
      <Row label="states">
        <SaveIndicator state="saving" delayMs={0} labels={SAVE_LABELS} />
        <SaveIndicator state="saved" confirmSave savedMs={0} labels={SAVE_LABELS} />
        <SaveIndicator state="error" labels={SAVE_LABELS} onRetry={() => {}} />
      </Row>
    </Section>
  );
}

interface DemoTask {
  id: string;
  title: string;
  due: string;
  overdue?: boolean;
  doc?: string;
  subtasks?: string;
  color: StickyColor;
  space: string;
  done: boolean;
}

function TaskRow({
  task,
  selected,
  onToggle,
  onOpen,
}: {
  task: DemoTask;
  selected?: boolean;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  const metaId = useId();
  return (
    <ListRow
      role="listitem"
      selected={selected}
      completed={task.done}
      leading={
        <Checkbox
          aria-label={task.title}
          aria-describedby={metaId}
          checked={task.done}
          onChange={onToggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onOpen?.();
          }}
        />
      }
      trailing={
        <span id={metaId} className={styles.meta}>
          {task.doc && (
            <span className={styles.metaItem}>
              <FileText {...iconProps} /> {task.doc}
            </span>
          )}
          {task.subtasks && (
            <span className={styles.metaItem}>
              <SquareCheck {...iconProps} /> {task.subtasks}
            </span>
          )}
          <span className={task.overdue ? styles.overdue : undefined}>
            {task.overdue && <TriangleExclamationPoint {...iconProps} />}
            {task.overdue ? <span className="visually-hidden">Overdue, </span> : null}
            {task.due}
          </span>
          <SpaceDot color={task.color} label={task.space} />
        </span>
      }
    >
      {onOpen ? (
        <button type="button" tabIndex={-1} className={styles.rowButton} onClick={onOpen}>
          {task.title}
        </button>
      ) : (
        task.title
      )}
    </ListRow>
  );
}

const DEMO_TASKS: DemoTask[] = [
  {
    id: 't1',
    title: 'Enviar fatura ao cliente',
    due: '3 Nov',
    overdue: true,
    color: 'mint',
    space: 'Work',
    done: false,
  },
  {
    id: 't2',
    title: 'Adicionar testes',
    due: 'Today',
    doc: 'Refactor 2FA',
    subtasks: '1/3',
    color: 'mint',
    space: 'Work',
    done: false,
  },
  { id: 't3', title: 'Comprar café', due: 'Fri', color: 'sky', space: 'Personal', done: false },
  {
    id: 't4',
    title: 'Ler artigo sobre WAL',
    due: 'Mon',
    color: 'sky',
    space: 'Personal',
    done: true,
  },
];

function ListSection() {
  const [tasks, setTasks] = useState(DEMO_TASKS);
  const toggle = (id: string) =>
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    );
  return (
    <Section title="ListRow">
      {/* eslint-disable-next-line jsx-a11y-x/no-redundant-roles */}
      <ul role="list" aria-label="Notes" className={styles.list}>
        <li>
          <ListRow
            title="Ligar ao fornecedor"

            snippet="Pedir orçamento revisto até sexta. Confirmar prazos de entrega e pedir contacto alternativo."
            meta={<SpaceDot color="mint" label="Work" />}
            actions={
              <IconButton
                aria-label="Pin to desktop"
                size="sm"
                tabIndex={-1}
                icon={<Pin {...iconProps} />}
              />
            }
          />
        </li>
        <li>
          <ListRow
            selected
            leading={<NotebookText {...iconProps} />}
            title="Refactor 2FA"

            snippet="SMS codes are being phased out; move to TOTP and recovery codes."
            meta={
              <>
                <SpaceDot color="mint" label="Work" /> · 4 tabs · <Badge>#security</Badge>
              </>
            }
          />
        </li>
      </ul>
      <div role="list" aria-label="Tasks" className={styles.list}>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            selected={task.id === 't2'}
            onToggle={() => toggle(task.id)}
          />
        ))}
      </div>
      <p className={styles.note}>density=&quot;compact&quot; · completed note</p>
      {/* eslint-disable-next-line jsx-a11y-x/no-redundant-roles */}
      <ul role="list" aria-label="Compact rows" className={styles.list}>
        <li>
          <ListRow density="compact" leading={<FileText {...iconProps} />} title="Refactor 2FA" />
        </li>
        <li>
          <ListRow
            density="compact"
            leading={<StickyNote {...iconProps} />}
            title="Standup notes"

            snippet="Deploy moved to Thursday. Pair on the search ranking."
          />
        </li>
        <li>
          <ListRow
            completed
            title="Gift ideas"

            snippet="Books, a good coffee grinder, concert tickets."
          />
        </li>
      </ul>
    </Section>
  );
}

function DateSection() {
  const [today] = useState(() => todayISO());
  const [due, setDue] = useState<string | null>(null);
  return (
    <Section title="DateQuickPicker">
      <Row label="due">
        <DateQuickPicker
          value={due}
          onChange={setDue}
          labels={DATE_LABELS}
          today={today}
          trigger={
            <Button variant="ghost" size="sm" iconEnd={<span aria-hidden="true">▾</span>}>
              {formatDue(due)}
            </Button>
          }
        />
        <code className={styles.code}>{JSON.stringify(due)}</code>
      </Row>
    </Section>
  );
}

function EmptySection() {
  return (
    <Section title="EmptyState">
      <p className={styles.note}>
        Centred in the region it describes: 28px thin icon, 13/600 title, one soft action.
      </p>
      <div className={styles.emptyFrame}>
        <EmptyState
          icon={<Inbox {...iconProps} />}
          title="Inbox is clear"
          description="New captures land here until you organise them."
          action={<Button>Quick capture</Button>}
        />
      </div>
    </Section>
  );
}

function DrawerSection() {
  const [mode, setMode] = useState<DrawerMode>('docked');
  const [openId, setOpenId] = useState<string | null>(null);
  const [tasks, setTasks] = useState(DEMO_TASKS);
  const task = tasks.find((item) => item.id === openId) ?? null;
  return (
    <Section title="Drawer">
      <Row label="mode">
        <Segmented
          aria-label="Drawer mode"
          size="sm"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'docked', label: 'Docked ≥ 820' },
            { value: 'overlay', label: 'Overlay < 820' },
            { value: 'full', label: 'Full < 560' },
          ]}
        />
      </Row>
      <div className={styles.drawerFrame}>
        <div role="list" aria-label="Tasks" className={styles.drawerList}>
          {tasks.map((item) => (
            <TaskRow
              key={item.id}
              task={item}
              selected={item.id === openId}
              onToggle={() =>
                setTasks((current) =>
                  current.map((t) => (t.id === item.id ? { ...t, done: !t.done } : t)),
                )
              }
              onOpen={() => setOpenId(item.id)}
            />
          ))}
        </div>
        <Drawer
          open={task != null}
          onClose={() => setOpenId(null)}
          mode={mode}
          title="Task"
          regionLabel="Task details"
          actions={
            <>
              <IconButton aria-label="Pin to desktop" icon={<Pin {...iconProps} />} />
              <IconButton aria-label="More" icon={<Ellipsis {...iconProps} />} />
            </>
          }
        >
          {task && (
            <div className={styles.stack}>
              <Checkbox label={task.title} checked={task.done} onChange={() => {}} />
              <TextArea
                aria-label="Description"
                variant="ghost"
                autoGrow
                placeholder="Add a description…"
              />
            </div>
          )}
        </Drawer>
      </div>
    </Section>
  );
}

function StickySection() {
  return (
    <Section title="Sticky colours (data-sticky-color)">
      <div className={styles.stickies}>
        {STICKY_COLORS.map((color) => (
          <StickySample key={color} color={color} />
        ))}
      </div>
    </Section>
  );
}

function StickySample({ color }: { color: StickyColor }) {
  const [onTop, setOnTop] = useState(color === 'yellow');
  return (
    <div data-sticky-color={color} className={styles.sticky}>
      <div className={styles.stickyStrip}>
        <span className={styles.stickyTitle}>{COLOR_NAMES[color]} sticky</span>
        <IconButton
          size="sm"
          aria-label="Keep on top"
          tooltip={onTop ? 'Stop keeping on top' : 'Keep on top'}
          pressed={onTop}
          onClick={() => setOnTop((value) => !value)}
          icon={onTop ? <Pin {...iconProps} /> : <PinOff {...iconProps} />}
        />
        <IconButton size="sm" aria-label="Open in Piw" icon={<ArrowUpRight {...iconProps} />} />
        <IconButton size="sm" aria-label="Hide from desktop" icon={<X {...iconProps} />} />
      </div>
      <div className={styles.stickyBody}>
        <Checkbox size="sm" label="Comprar café" defaultChecked={color === 'mint'} />
        <Checkbox size="sm" label="Ver preços" />
        <TextArea
          aria-label={`${COLOR_NAMES[color]} sticky note`}
          variant="ghost"
          autoGrow
          defaultValue="Grão, não moído"
        />
      </div>
    </div>
  );
}
