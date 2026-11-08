import { CircleCheck, Eye, EyeOff, ListChecks, Pin, PinOff, StickyNote, X } from 'lucide-react';
import {
  PageColumn,
  PageGroup,
  PageList,
  PageScroll,
  PageSectionHeader,
  PageView,
  ViewToolbar,
} from '@/components/app/Page';
import { EmptyState, IconButton, ListRow, SpaceDot, iconProps, useToast } from '@/components/ui';
import { usePinned } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { PinnedItem } from '@/lib/ipc/bindings/PinnedItem';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { pinnedStrings as t, workspaceStrings } from '@/strings/workspace';
import area from '../Area.module.css';

// Tasks show the round task mark (never a square box), like their checkboxes.
const ICONS = { note: StickyNote, task: CircleCheck, tasks_tab: ListChecks };

/** Pinned (docs/ui-design-system.md §10): items on the desktop or ready to show again. */
export default function PinnedArea() {
  const spaceId = useWorkspace((s) => s.spaceId);
  const pinned = usePinned(spaceId);
  const { toast } = useToast();
  const items = pinned.data ?? [];
  const open = items.filter((item) => item.isOpen);
  const hidden = items.filter((item) => !item.isOpen);
  const isEmpty = pinned.isSuccess && items.length === 0;
  const count = !pinned.isSuccess
    ? null
    : items.length === 0
      ? t.count(0)
      : t.status(open.length, hidden.length);

  const fail = (error: unknown) =>
    toast({
      tone: 'error',
      message: error instanceof IpcError ? error.message : common.toasts.genericError,
    });

  const remove = async (item: PinnedItem) => {
    await api.unpinSticky(item.target);
    toast({
      message: t.removed(item.title),
      action: {
        label: common.actions.undo,
        onAction: () => void api.openSticky(item.target).catch(fail),
      },
    });
  };

  const row = (item: PinnedItem) => {
    const Icon = ICONS[item.target.kind];
    const label =
      item.target.kind === 'tasks_tab' && item.documentTitle
        ? `${item.documentTitle} · ${item.title}`
        : item.title;
    return (
      <li key={`${item.target.kind}:${item.target.id}`}>
        <ListRow
          role="group"
          aria-label={`${t.kinds[item.target.kind]}: ${label}`}
          leading={
            <span className={area.leadingIcon}>
              <Icon {...iconProps} />
            </span>
          }
          completed={item.completed}
          title={<span className={area.rowTitle}>{label || '—'}</span>}
          // State in words, never colour alone (docs/ui-design-system.md §10): kind · sticky colour
          // · On top.
          meta={
            <span className={area.meta}>
              <span className={area.metaPart}>{t.kinds[item.target.kind]}</span>
              {item.color && (
                <span className={area.metaPart}>
                  <SpaceDot color={item.color} label={workspaceStrings.colors[item.color]} />
                </span>
              )}
              {item.alwaysOnTop && <span className={area.metaPart}>{t.onTop}</span>}
            </span>
          }
          actions={
            <span className={area.actions}>
              <IconButton
                size="sm"
                aria-label={item.alwaysOnTop ? `${t.keepOnTop}: on` : t.keepOnTop}
                pressed={item.alwaysOnTop}
                disabled={!item.isOpen}
                icon={item.alwaysOnTop ? <Pin {...iconProps} /> : <PinOff {...iconProps} />}
                onClick={() =>
                  void api.setStickyAlwaysOnTop(item.target, !item.alwaysOnTop).catch(fail)
                }
              />
              {item.isOpen ? (
                <IconButton
                  size="sm"
                  aria-label={`${t.hide}: ${label}`}
                  icon={<EyeOff {...iconProps} />}
                  onClick={() => void api.closeSticky(item.target).catch(fail)}
                />
              ) : (
                <IconButton
                  size="sm"
                  aria-label={`${t.show}: ${label}`}
                  icon={<Eye {...iconProps} />}
                  onClick={() => void api.openSticky(item.target).catch(fail)}
                />
              )}
              <IconButton
                size="sm"
                aria-label={`${t.remove}: ${label}`}
                icon={<X {...iconProps} />}
                onClick={() => void remove(item).catch(fail)}
              />
            </span>
          }
        />
      </li>
    );
  };

  return (
    <PageView aria-labelledby="pinned-title">
      <ViewToolbar title={t.title} titleId="pinned-title" count={count} />
      <PageScroll>
        {/* An empty view centres its EmptyState in the canvas, not in the list column. */}
        <PageColumn width={isEmpty ? 'full' : 'content'}>
          {isEmpty ? (
            <EmptyState
              icon={<Pin {...iconProps} />}
              title={t.empty}
              description={t.emptyDescription}
            />
          ) : (
            <>
              {open.length > 0 && (
                <PageGroup aria-labelledby="pinned-open">
                  <PageSectionHeader
                    id="pinned-open"
                    title={t.onDesktop}
                    count={open.length}
                    countLabel={t.count(open.length)}
                  />
                  <PageList>{open.map(row)}</PageList>
                </PageGroup>
              )}
              {hidden.length > 0 && (
                <PageGroup aria-labelledby="pinned-hidden">
                  <PageSectionHeader
                    id="pinned-hidden"
                    title={t.hidden}
                    count={hidden.length}
                    countLabel={t.count(hidden.length)}
                  />
                  <PageList>{hidden.map(row)}</PageList>
                </PageGroup>
              )}
            </>
          )}
        </PageColumn>
      </PageScroll>
    </PageView>
  );
}
