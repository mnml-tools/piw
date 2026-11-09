import { useEffect, useRef, useState } from 'react';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@/components/app/MarkdownEditor/MarkdownEditor';
import { taskProgress, type TaskProgress } from '@/lib/markdown';
import { Button } from '@/components/ui';
import { useNote } from '@/lib/hooks/data';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { api } from '@/lib/ipc/api';
import type { Note } from '@/lib/ipc/bindings/Note';
import { stickyStrings as t } from '@/strings/sticky';
import styles from './StickyBody.module.css';

interface NoteStickyProps {
  id: string;
  /** The note's task list progress, reported when it changes (for the strip). */
  onProgress?: (progress: TaskProgress) => void;
}

export function NoteSticky({ id, onProgress }: NoteStickyProps) {
  const note = useNote(id);
  if (note.isError) return <p className={styles.missing}>{t.missing}</p>;
  if (!note.data) return null;
  return <NoteStickyEditor key={id} note={note.data} onProgress={onProgress} />;
}

/** The note's text as live Markdown; autosaves and follows edits from other windows. */
function NoteStickyEditor({
  note,
  onProgress,
}: { note: Note } & Pick<NoteStickyProps, 'onProgress'>) {
  // Uncontrolled: typing never re-renders the sticky, and remote edits are written to the editor.
  const editor = useRef<MarkdownEditorHandle>(null);
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  }, [onProgress]);
  const { saver, status } = useAutosave({ value: note.body ?? '', rev: note.rev }, (value, rev) =>
    api.updateNoteText(note.id, rev, { body: value }).then((saved) => saved.rev),
  );

  // The editor reads its text once; later text arrives through `replaceText`.
  const [initial] = useState(note.body ?? '');
  useEffect(() => {
    report.current?.(taskProgress(initial));
  }, [initial]);

  const edit = (text: string) => {
    saver.update(text);
    report.current?.(taskProgress(text));
  };
  const adopt = (text: string) => {
    editor.current?.replaceText(text);
    report.current?.(taskProgress(text));
  };

  // Adopt edits made elsewhere (workspace, another sticky) when nothing is pending here.
  useEffect(() => {
    if (note.rev > saver.persisted.rev && !saver.dirty) {
      saver.takeTheirs(note.body ?? '', note.rev);
      editor.current?.replaceText(note.body ?? '');
      report.current?.(taskProgress(note.body ?? ''));
    }
  }, [note.rev, note.body, saver]);

  return (
    <div className={styles.note}>
      <MarkdownEditor
        ref={editor}
        className={styles.editor}
        label={t.noteLabel}
        defaultValue={initial}
        onChange={edit}
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
                adopt(latest.body ?? '');
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
