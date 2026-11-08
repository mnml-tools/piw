import { useRef, useState } from 'react';
import { Button, Dialog, TextInput } from '@/components/ui';
import { api } from '@/lib/ipc/api';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { workspaceStrings as t } from '@/strings/workspace';

/** Documents have explicit titles, so "New document" asks for one first. */
export function NewDocumentDialog({ onClose }: { onClose: () => void }) {
  const spaceId = useWorkspace((s) => s.spaceId);
  const openDocument = useWorkspace((s) => s.openDocument);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const document = await api.createDocument({ title, ...(spaceId ? { spaceId } : {}) });
      onClose();
      openDocument(document.note.id, document.tabs[0]?.id);
    } catch (cause) {
      setError(cause instanceof IpcError ? cause.message : common.toasts.genericError);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t.documents.newTitle}
      initialFocusRef={input}
      footer={
        <>
          <Button onClick={onClose}>{common.actions.cancel}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!title.trim()}
            onClick={() => void submit()}
          >
            {t.documents.create}
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)}>
        <TextInput
          size="lg"
          ref={input}
          label={t.documents.titleLabel}
          placeholder={t.documents.titlePlaceholder}
          value={title}
          maxLength={300}
          error={error ?? undefined}
          invalid={error !== null}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}
