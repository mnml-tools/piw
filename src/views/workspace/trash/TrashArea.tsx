import { CircleCheck, FileText, RotateCcw, StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageColumn, PageList, PageScroll, PageView, ViewToolbar } from '@/components/app/Page';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  ListRow,
  iconProps,
  useToast,
} from '@/components/ui';
import { formatRelative } from '@/lib/dates';
import { useTrash } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { TrashItem } from '@/lib/ipc/bindings/TrashItem';
import { common } from '@/strings/common';
import { trashStrings as t } from '@/strings/workspace';
import area from '../Area.module.css';

interface Entry {
  id: string;
  kind: 'note' | 'document' | 'task';
  title: string;
  deletedAt: string;
}

function toEntry(item: TrashItem): Entry {
  if (item.type === 'note') {
    return {
      id: item.note.id,
      kind: item.note.kind === 'document' ? 'document' : 'note',
      title: item.note.displayTitle || t.untitled,
      deletedAt: item.note.deletedAt ?? '',
    };
  }
  return {
    id: item.task.id,
    kind: 'task',
    title: item.task.title,
    deletedAt: item.task.deletedAt ?? '',
  };
}

// Tasks show the round task mark (never a square box), like their checkboxes.
const ICONS = { note: StickyNote, document: FileText, task: CircleCheck };

/** Trash (docs/ui-design-system.md §10): restore, delete forever (confirmed), empty (confirmed). */
export default function TrashArea() {
  const trash = useTrash();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<{ type: 'one'; entry: Entry } | { type: 'all' } | null>(
    null,
  );
  const entries = (trash.data ?? []).map(toEntry);
  const isEmpty = trash.isSuccess && entries.length === 0;

  const restore = async (entry: Entry) => {
    const unlinked =
      entry.kind === 'task' ? await api.restoreTask(entry.id) : await api.restoreNote(entry.id);
    toast({ message: unlinked ? common.toasts.restoredWithoutDocument : t.restored(entry.title) });
  };

  const purge = (entry: Entry) =>
    entry.kind === 'task' ? api.purgeTask(entry.id) : api.purgeNote(entry.id);

  return (
    <PageView aria-labelledby="trash-title">
      <ViewToolbar
        title={t.title}
        titleId="trash-title"
        count={trash.isSuccess ? t.count(entries.length) : null}
        actions={
          entries.length > 0 && (
            <Button
              size="sm"
              icon={<Trash2 {...iconProps} />}
              onClick={() => setConfirm({ type: 'all' })}
            >
              {t.emptyTrash}
            </Button>
          )
        }
      />
      <PageScroll>
        {/* An empty view centres its EmptyState in the canvas, not in the list column. */}
        <PageColumn width={isEmpty ? 'full' : 'content'}>
          {isEmpty ? (
            <EmptyState
              icon={<Trash2 {...iconProps} />}
              title={t.empty}
              description={t.emptyDescription}
            />
          ) : (
            <PageList aria-labelledby="trash-title">
              {entries.map((entry) => {
                const Icon = ICONS[entry.kind];
                return (
                  <li key={entry.id}>
                    <ListRow
                      role="group"
                      aria-label={`${t.kinds[entry.kind]}: ${entry.title}`}
                      leading={
                        <span className={area.leadingIcon}>
                          <Icon {...iconProps} />
                        </span>
                      }
                      title={<span className={area.rowTitle}>{entry.title}</span>}
                      meta={
                        <span className={area.meta}>
                          <span className={area.metaPart}>{t.kinds[entry.kind]}</span>
                          <span className={area.metaPart}>
                            {t.deleted(formatRelative(entry.deletedAt))}
                          </span>
                        </span>
                      }
                      actions={
                        <span className={area.actions}>
                          <IconButton
                            aria-label={`${common.actions.restore} ${entry.title}`}
                            icon={<RotateCcw {...iconProps} />}
                            size="sm"
                            onClick={() => void restore(entry)}
                          />
                          <IconButton
                            aria-label={`${t.deleteForever} ${entry.title}`}
                            icon={<Trash2 {...iconProps} />}
                            size="sm"
                            onClick={() => setConfirm({ type: 'one', entry })}
                          />
                        </span>
                      }
                      onKeyDown={(event) => {
                        if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) {
                          event.preventDefault();
                          void restore(entry);
                        }
                      }}
                    />
                  </li>
                );
              })}
            </PageList>
          )}
        </PageColumn>
      </PageScroll>

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={
            confirm.type === 'all'
              ? t.emptyTitle(entries.length)
              : t.deleteForeverTitle(confirm.entry.title)
          }
          description={t.emptyBody}
          confirmLabel={common.actions.delete}
          cancelLabel={common.actions.cancel}
          destructive
          onConfirm={async () => {
            if (confirm.type === 'all') await api.emptyTrash();
            else await purge(confirm.entry);
            setConfirm(null);
          }}
        />
      )}
    </PageView>
  );
}
