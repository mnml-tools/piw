import { useRef, useState } from 'react';
import { Button, Dialog, TextInput } from '@/components/ui';
import { IpcError } from '@/lib/ipc/client';
import { common } from '@/strings/common';
import { workspaceStrings as t } from '@/strings/workspace';

interface SpaceNameDialogProps {
  title: string;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

/** Asks for a name (a new space or folder, a rename, a sticky's title). Validation errors from
 * Rust (taken names…) show inline. */
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
