import { useEffect, useRef } from 'react';
import { Button, TextArea } from '@/components/ui';
import { useNote } from '@/lib/hooks/data';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { api } from '@/lib/ipc/api';
import type { Note } from '@/lib/ipc/bindings/Note';
import { stickyStrings as t } from '@/strings/sticky';
import styles from './StickyBody.module.css';

export function NoteSticky({ id }: { id: string }) {
  const note = useNote(id);
  if (note.isError) return <p className={styles.missing}>{t.missing}</p>;
  if (!note.data) return null;
  return <NoteStickyEditor key={id} note={note.data} />;
}

/** The note's text, editable in place; autosaves and follows edits from other windows. */
function NoteStickyEditor({ note }: { note: Note }) {
  // Uncontrolled: typing never re-renders the sticky, and remote edits are written to the DOM.
  const field = useRef<HTMLTextAreaElement>(null);
  const { saver, status } = useAutosave({ value: note.body ?? '', rev: note.rev }, (value, rev) =>
    api.updateNoteText(note.id, rev, { body: value }).then((saved) => saved.rev),
  );

  // Adopt edits made elsewhere (workspace, another sticky) when nothing is pending here.
  useEffect(() => {
    if (note.rev > saver.persisted.rev && !saver.dirty) {
      saver.takeTheirs(note.body ?? '', note.rev);
      if (field.current) field.current.value = note.body ?? '';
    }
  }, [note.rev, note.body, saver]);

  return (
    <div className={styles.note}>
      <TextArea
        variant="ghost"
        className={styles.noteField}
        aria-label={t.noteLabel}
        ref={field}
        defaultValue={note.body ?? ''}
        onChange={(event) => saver.update(event.target.value)}
      />
      {status === 'error' && (
        <div className={styles.errorBar} role="alert">
          <span className={styles.errorText}>{t.saveError}</span>
          <Button size="sm" variant="ghost" onClick={() => void saver.retry()}>
            {t.retry}
          </Button>
        </div>
      )}
      {status === 'conflict' && (
        <div className={styles.errorBar} role="alert">
          <span className={styles.errorText}>{t.changedElsewhere}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void api.getNote(note.id).then((latest) => {
                saver.takeTheirs(latest.body ?? '', latest.rev);
                if (field.current) field.current.value = latest.body ?? '';
              })
            }
          >
            {t.reload}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void api.getNote(note.id).then((latest) => saver.keepMine(latest.rev))}
          >
            {t.keepMine}
          </Button>
        </div>
      )}
    </div>
  );
}
