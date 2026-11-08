import { useId, useState } from 'react';
import { ConfirmDialog } from '@/components/ui';
import type { LinkedTasks } from '@/lib/ipc/bindings/LinkedTasks';
import { common } from '@/strings/common';
import { notesStrings as t } from '@/strings/notes';
import styles from './DocumentDialogs.module.css';

interface TrashDocumentDialogProps {
  open: boolean;
  title: string;
  taskCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (linkedTasks: LinkedTasks) => Promise<unknown>;
}

/** "Move “Refactor 2FA” to Trash? It has 4 linked tasks." with what happens to them (§4.11). */
export function TrashDocumentDialog({
  open,
  title,
  taskCount,
  onOpenChange,
  onConfirm,
}: TrashDocumentDialogProps) {
  const name = useId();
  const [choice, setChoice] = useState<LinkedTasks>('keep');
  const options: { value: LinkedTasks; label: string }[] = [
    { value: 'keep', label: t.confirmTrashDocument.keep },
    { value: 'trash', label: t.confirmTrashDocument.trashToo },
  ];
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setChoice('keep');
        onOpenChange(next);
      }}
      title={t.confirmTrashDocument.title(title)}
      description={t.confirmTrashDocument.body(taskCount)}
      confirmLabel={t.confirmTrashDocument.confirm}
      cancelLabel={common.actions.cancel}
      destructive
      onConfirm={() => onConfirm(choice)}
    >
      <fieldset className={styles.choices}>
        <legend className="visually-hidden">{t.confirmTrashDocument.groupLabel}</legend>
        {options.map((option) => (
          <label key={option.value} className={styles.choice}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={choice === option.value}
              onChange={() => setChoice(option.value)}
              className={styles.radio}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    </ConfirmDialog>
  );
}

interface MoveDocumentDialogProps {
  open: boolean;
  title: string;
  spaceName: string;
  tasks: number;
  notes: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<unknown>;
}

/**
 * Moving a document moves its tasks and notes too, so it is confirmed
 * (docs/ui-design-system.md §8).
 */
export function MoveDocumentDialog({
  open,
  title,
  spaceName,
  tasks,
  notes,
  onOpenChange,
  onConfirm,
}: MoveDocumentDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.confirmMoveDocument.title(title, spaceName)}
      description={t.confirmMoveDocument.body(tasks, notes)}
      confirmLabel={t.confirmMoveDocument.confirm}
      cancelLabel={common.actions.cancel}
      onConfirm={onConfirm}
    />
  );
}
