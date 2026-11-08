import { useEffect, useRef, useState } from 'react';
import { Button, ConfirmDialog, Dialog, TextInput } from '@/components/ui';
import { api } from '@/lib/ipc/api';
import type { Space } from '@/lib/ipc/bindings/Space';
import { IpcError } from '@/lib/ipc/client';
import { common } from '@/strings/common';
import { workspaceStrings as t } from '@/strings/workspace';
import styles from './SpaceDialogs.module.css';

interface SpaceNameDialogProps {
  title: string;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

/** Create or rename a space. Validation errors from Rust (duplicates…) show inline. */
export function SpaceNameDialog({
  title,
  initialName = '',
  onClose,
  onSubmit,
}: SpaceNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(name);
      onClose();
    } catch (cause) {
      setError(cause instanceof IpcError ? cause.message : common.toasts.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      initialFocusRef={input}
      footer={
        <>
          <Button onClick={onClose}>{common.actions.cancel}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            {t.spaces.save}
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)}>
        <TextInput
          size="lg"
          ref={input}
          label={t.spaces.name}
          placeholder={common.spaces.namePlaceholder}
          value={name}
          maxLength={80}
          error={error ?? undefined}
          invalid={error !== null}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}

interface DeleteSpaceDialogProps {
  space: Space;
  spaces: readonly Space[];
  onClose: () => void;
  onDeleted: (moveTo: string) => void;
}

/** Deleting a space always asks where its items go; nothing is deleted. */
export function DeleteSpaceDialog({ space, spaces, onClose, onDeleted }: DeleteSpaceDialogProps) {
  const others = spaces.filter((s) => s.id !== space.id);
  const [moveTo, setMoveTo] = useState(others.find((s) => s.isDefault)?.id ?? others[0]?.id ?? '');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    void api.spaceItemCount(space.id).then(setCount, () => setCount(null));
  }, [space.id]);

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t.spaces.deleteTitle(space.name)}
      description={count === null ? undefined : t.spaces.deleteBody(count)}
      confirmLabel={t.spaces.delete}
      cancelLabel={common.actions.cancel}
      destructive
      onConfirm={async () => {
        await api.deleteSpace(space.id, moveTo);
        onDeleted(moveTo);
        onClose();
      }}
    >
      {others.length === 0 ? (
        <p>{t.spaces.lastSpace}</p>
      ) : (
        <label className={styles.field}>
          <span>{t.spaces.moveTo}</span>
          <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </ConfirmDialog>
  );
}
