import { ChevronDown, Folder, Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { DropdownMenu, iconProps, type MenuEntry } from '@/components/ui';
import { useVaultTree } from '@/lib/hooks/vault';
import { useVaultUi } from '@/state/vault';
import { vaultStrings as t } from '@/strings/vault';
import { SpaceNameDialog } from '@/views/workspace/spaces/SpaceDialogs';
import styles from '@/views/workspace/TopBar.module.css';
import { useVaultActions } from './actions';
import { spacesOf } from './tree';

const ALL = '__all__';

/**
 * The title bar's space filter (docs/redesign.md, "Layout"): All spaces or one top-level folder.
 * It scopes the tree and search. New space… creates a top-level folder.
 */
export function SpaceMenu() {
  const space = useVaultUi((s) => s.space);
  const setSpace = useVaultUi((s) => s.setSpace);
  const spaces = spacesOf(useVaultTree().data ?? []);
  const actions = useVaultActions();
  const [creating, setCreating] = useState(false);
  const name = space ?? t.space.all;

  const items: MenuEntry[] = [
    {
      id: 'filter',
      type: 'radio-group',
      label: t.space.all,
      value: space ?? ALL,
      onValueChange: (value) => setSpace(value === ALL ? null : value),
      options: [
        { value: ALL, label: t.space.all, icon: <Layers {...iconProps} /> },
        ...spaces.map((folder) => ({
          value: folder,
          label: folder,
          icon: <Folder {...iconProps} />,
        })),
      ],
    },
    { id: 'sep', type: 'separator' },
    {
      id: 'new',
      label: t.space.newSpace,
      icon: <Plus {...iconProps} />,
      onSelect: () => setCreating(true),
    },
  ];

  return (
    <>
      <DropdownMenu
        align="center"
        items={items}
        trigger={
          <button
            type="button"
            className={styles.switcher}
            aria-label={t.space.trigger(name)}
            title={t.space.trigger(name)}
          >
            <span className={styles.switcherGlyph}>
              {space ? <Folder {...iconProps} /> : <Layers {...iconProps} />}
            </span>
            <span className={styles.switcherName}>{name}</span>
            <ChevronDown {...iconProps} className={styles.chevron} />
          </button>
        }
      />
      {creating && (
        <SpaceNameDialog
          title={t.space.spaceTitle}
          onClose={() => setCreating(false)}
          onSubmit={async (value) => {
            setSpace(await actions.createFolder(null, value.trim()));
          }}
        />
      )}
    </>
  );
}
