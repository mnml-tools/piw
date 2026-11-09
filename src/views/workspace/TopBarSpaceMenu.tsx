import { ChevronDown, Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { spaceColor } from '@/components/app/space-color';
import { DropdownMenu, SpaceDot, iconProps, type MenuEntry } from '@/components/ui';
import { useSpaces } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { Space } from '@/lib/ipc/bindings/Space';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { workspaceStrings as t } from '@/strings/workspace';
import { DeleteSpaceDialog, SpaceNameDialog } from './spaces/SpaceDialogs';
import styles from './TopBar.module.css';

const s = t.topBar;

const ALL = '__all__';
const COLORS = ['yellow', 'peach', 'rose', 'mint', 'sky', 'lavender'] as const;
type SpaceColorName = (typeof COLORS)[number];

type DialogState =
  { type: 'create' } | { type: 'rename'; space: Space } | { type: 'delete'; space: Space } | null;

/**
 * The top bar's space filter: a soft pill with the space's dot, its name and a chevron. The menu
 * picks the filter (All spaces or one space), edits the filtered space (rename, colour, default,
 * delete) and creates a space. Space colours appear only as these small round dots.
 */
export function TopBarSpaceMenu() {
  const ws = useWorkspace();
  const spaces = useSpaces();
  const [dialog, setDialog] = useState<DialogState>(null);
  const list = spaces.data ?? [];
  const current = list.find((space) => space.id === ws.spaceId);
  const name = current?.name ?? common.spaces.all;

  const editCurrent: MenuEntry[] = current
    ? [
        { id: 'current', type: 'label', label: current.name },
        {
          id: 'rename',
          label: s.renameSpace,
          onSelect: () => setDialog({ type: 'rename', space: current }),
        },
        {
          id: 'color',
          type: 'submenu',
          label: common.spaces.color,
          items: [
            {
              id: 'color-group',
              type: 'radio-group',
              label: common.spaces.color,
              value: current.color ?? 'none',
              onValueChange: (value) =>
                void api.setSpaceColor(
                  current.id,
                  value === 'none' ? null : (value as SpaceColorName),
                ),
              options: [
                { value: 'none', label: t.colors.none },
                ...COLORS.map((color) => ({ value: color, label: t.colors[color] })),
              ],
            },
          ],
        },
        {
          id: 'default',
          type: 'checkbox',
          label: t.spaces.isDefault,
          checked: current.isDefault,
          disabled: current.isDefault,
          onCheckedChange: () => void api.setDefaultSpace(current.id),
        },
        {
          id: 'delete',
          label: s.deleteSpace,
          danger: true,
          disabled: list.length <= 1,
          onSelect: () => setDialog({ type: 'delete', space: current }),
        },
        { id: 'sep-edit', type: 'separator' },
      ]
    : [];

  const items: MenuEntry[] = [
    {
      id: 'filter',
      type: 'radio-group',
      label: t.spaces.filterLabel,
      value: ws.spaceId ?? ALL,
      onValueChange: (value) => ws.setSpace(value === ALL ? null : value),
      options: [
        { value: ALL, label: common.spaces.all, icon: <Layers {...iconProps} /> },
        ...list.map((space) => ({
          value: space.id,
          label: space.name,
          icon: <SpaceDot color={spaceColor(space)} decorative />,
        })),
      ],
    },
    { id: 'sep-filter', type: 'separator' },
    ...editCurrent,
    {
      id: 'new',
      label: s.newSpace,
      icon: <Plus {...iconProps} />,
      onSelect: () => setDialog({ type: 'create' }),
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
            aria-label={s.spaceTrigger(name)}
            title={s.spaceTrigger(name)}
          >
            <span className={styles.switcherGlyph}>
              {current ? (
                <SpaceDot color={spaceColor(current)} decorative />
              ) : (
                <Layers {...iconProps} />
              )}
            </span>
            <span className={styles.switcherName}>{name}</span>
            <ChevronDown {...iconProps} className={styles.chevron} />
          </button>
        }
      />

      {dialog?.type === 'create' && (
        <SpaceNameDialog
          title={t.spaces.createTitle}
          onClose={() => setDialog(null)}
          onSubmit={async (value) => {
            const space = await api.createSpace(value);
            ws.setSpace(space.id);
          }}
        />
      )}
      {dialog?.type === 'rename' && (
        <SpaceNameDialog
          title={t.spaces.renameTitle}
          initialName={dialog.space.name}
          onClose={() => setDialog(null)}
          onSubmit={(value) => api.renameSpace(dialog.space.id, value).then(() => undefined)}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteSpaceDialog
          space={dialog.space}
          spaces={list}
          onClose={() => setDialog(null)}
          onDeleted={(moveTo) => {
            if (ws.spaceId === dialog.space.id) ws.setSpace(moveTo);
          }}
        />
      )}
    </>
  );
}
