import { useId, useState, type FormEvent } from 'react';
import { Button, Dialog, TextInput } from '@/components/ui';
import { common } from '@/strings/common';
import { notesStrings as t } from '@/strings/notes';

/** Tags are flat names of up to 40 characters; a leading `#` is optional. */
const TAG_MAX = 40;

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, '').trim();
}

interface TagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The note's current tags (to reject duplicates). */
  existing: readonly string[];
  /** Known tags, offered as suggestions. */
  suggestions: readonly string[];
  /** Resolves to true once the tag is saved. */
  onAdd: (tag: string) => Promise<boolean>;
}

export function TagDialog({ open, onOpenChange, existing, suggestions, onAdd }: TagDialogProps) {
  const formId = useId();
  const listId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tag = normalizeTag(value);

  const close = (next: boolean) => {
    if (!next) {
      setValue('');
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!tag || busy) return;
    if (tag.length > TAG_MAX) {
      setError(t.tagDialog.tooLong);
      return;
    }
    if (existing.some((name) => name.toLowerCase() === tag.toLowerCase())) {
      setError(t.tagDialog.exists);
      return;
    }
    setBusy(true);
    const saved = await onAdd(tag);
    setBusy(false);
    if (saved) close(false);
  };

  const available = suggestions.filter(
    (name) => !existing.some((current) => current.toLowerCase() === name.toLowerCase()),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t.tagDialog.title}
      closeLabel={common.actions.close}
      footer={
        <>
          <Button onClick={() => close(false)}>{common.actions.cancel}</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!tag} loading={busy}>
            {t.tagDialog.add}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)}>
        <TextInput
          size="lg"
          label={t.tagDialog.label}
          placeholder={t.tagDialog.placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          list={available.length > 0 ? listId : undefined}
          autoComplete="off"
          spellCheck={false}
          error={error ?? undefined}
        />
        {available.length > 0 && (
          <datalist id={listId}>
            {available.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        )}
      </form>
    </Dialog>
  );
}
