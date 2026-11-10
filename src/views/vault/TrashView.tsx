import { FileText, Folder, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageColumn, PageScroll, PageView, ViewToolbar } from '@/components/app/Page';
import { Button, ConfirmDialog, EmptyState, iconProps, useToast } from '@/components/ui';
import { useVaultTrash } from '@/lib/hooks/vault';
import { api } from '@/lib/ipc/api';
import type { VaultTrashItem } from '@/lib/ipc/bindings/VaultTrashItem';
import { common } from '@/strings/common';
import { vaultStrings as t } from '@/strings/vault';
import { useVaultActions } from './actions';
import { parentOf } from './tree';
import styles from './TrashView.module.css';

/** `.piw/trash/`: restore an item where it was, or delete it for good. */
export function TrashView() {
  const trash = useVaultTrash();
  const actions = useVaultActions();
  const { toast } = useToast();
  const [purging, setPurging] = useState<VaultTrashItem | null>(null);
  const items = trash.data ?? [];

  const restore = async (item: VaultTrashItem) => {
    try {
      const path = await api.vaultRestore(item.id);
      toast({ message: t.trash.restored(path) });
      if (item.kind === 'note') actions.openNote(path);
    } catch (error) {
      actions.fail(error);
    }
  };

  return (
    <PageView>
      <ViewToolbar title={t.trash.title} count={items.length || undefined} />
      <PageScroll>
        <PageColumn>
          {trash.isSuccess && items.length === 0 ? (
            <EmptyState
              icon={<Trash2 {...iconProps} />}
              title={t.trash.empty}
              description={t.trash.emptyBody}
            />
          ) : (
            <ul className={styles.list}>
              {items.map((item) => {
                const Icon = item.kind === 'folder' ? Folder : FileText;
                return (
                  <li key={item.id} className={styles.row}>
                    <Icon {...iconProps} className={styles.icon} />
                    <span className={styles.text}>
                      <span className={styles.name}>{item.name}</span>
                      <span className={styles.from}>
                        {t.trash.from(parentOf(item.path) ?? '/')}
                      </span>
                    </span>
                    <Button size="sm" onClick={() => void restore(item)}>
                      {t.trash.restore}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPurging(item)}>
                      {t.trash.purge}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </PageColumn>
      </PageScroll>
      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(open) => !open && setPurging(null)}
        title={purging ? t.trash.purgeTitle(purging.name) : ''}
        description={t.trash.purgeBody}
        confirmLabel={t.trash.purge}
        cancelLabel={common.actions.cancel}
        destructive
        onConfirm={async () => {
          if (!purging) return;
          await api.vaultPurge(purging.id).catch(actions.fail);
          setPurging(null);
        }}
      />
    </PageView>
  );
}
