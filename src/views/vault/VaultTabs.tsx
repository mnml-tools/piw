import { Tab, Tabs } from '@mnml-tools/ui';
import {
  CalendarClock,
  CalendarDays,
  FileText,
  ListTodo,
  Plus,
  Settings as SettingsIcon,
  Trash2,
} from 'lucide-react';
import { formatShortcut, toAriaKeyShortcuts } from '@/components/ui';
import { tabKey, useVaultUi, type VaultTab } from '@/state/vault';
import { vaultStrings as t } from '@/strings/vault';
import { baseName } from './tree';
import styles from './VaultApp.module.css';

function tabTitle(tab: VaultTab): string {
  if (tab.type === 'trash') return t.tabs.trash;
  if (tab.type === 'settings') return t.tabs.settings;
  if (tab.type === 'tasks') return t.tasks[tab.view];
  return baseName(tab.path).replace(/\.md$/i, '');
}

function TabIcon({ tab }: { tab: VaultTab }) {
  const Icon =
    tab.type === 'trash'
      ? Trash2
      : tab.type === 'settings'
        ? SettingsIcon
        : tab.type === 'tasks'
          ? { today: CalendarDays, upcoming: CalendarClock, all: ListTodo }[tab.view]
          : FileText;
  return <Icon size={13} aria-hidden />;
}

/**
 * The open tabs as the kit's strip (Zap's open tables): select with a click, close with ×; `+`
 * at the end makes a new note.
 */
export function VaultTabs({ onNew }: { onNew: () => void }) {
  const tabs = useVaultUi((s) => s.tabs);
  const active = useVaultUi((s) => s.active);
  const activate = useVaultUi((s) => s.activate);
  const close = useVaultUi((s) => s.close);
  return (
    <Tabs>
      {tabs.map((tab) => {
        const key = tabKey(tab);
        const title = tabTitle(tab);
        return (
          <Tab
            key={key}
            title={title}
            icon={<TabIcon tab={tab} />}
            active={key === active}
            closeLabel={t.tabs.close(title)}
            onSelect={() => activate(key)}
            onClose={() => close(key)}
          />
        );
      })}
      <button
        type="button"
        className={styles.newTab}
        title={`${t.sidebar.newNote} (${formatShortcut('Mod+N')})`}
        aria-label={t.sidebar.newNote}
        aria-keyshortcuts={toAriaKeyShortcuts('Mod+N')}
        onClick={onNew}
      >
        <Plus size={13} aria-hidden />
      </button>
    </Tabs>
  );
}
