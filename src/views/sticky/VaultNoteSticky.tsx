import { useEffect, useRef, useState } from 'react';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@/components/app/MarkdownEditor/MarkdownEditor';
import { taskDates } from '@/components/app/MarkdownEditor/task-dates';
import { Button } from '@/components/ui';
import { todayString } from '@/lib/dates';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { useVaultNote, useVaultStickyView } from '@/lib/hooks/vault';
import { api } from '@/lib/ipc/api';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import type { VaultNote } from '@/lib/ipc/bindings/VaultNote';
import type { TaskProgress } from '@/lib/markdown';
import { parseNote } from '@/lib/vault/tasks';
import { stickyStrings as t } from '@/strings/sticky';
import styles from './StickyBody.module.css';

function progressOf(text: string): TaskProgress {
  const tasks = parseNote(text).tasks;
  return { done: tasks.filter((task) => task.checked).length, total: tasks.length };
}

interface VaultNoteStickyProps {
  target: StickyTarget;
  onProgress?: (progress: TaskProgress) => void;
}

/** A vault note on the desktop (docs/redesign.md, phase 4): its text, as live Markdown. */
export function VaultNoteSticky({ target, onProgress }: VaultNoteStickyProps) {
  const view = useVaultStickyView(target);
  const shows = view.data;
  const note = useVaultNote(shows?.kind === 'note' ? shows.path : '', shows?.kind === 'note');
  if (view.isError || note.isError) return <p className={styles.missing}>{t.missing}</p>;
  if (shows?.kind !== 'note' || !note.data) return null;
  return <Editor key={shows.path} note={note.data} onProgress={onProgress} />;
}

/** Autosaves with the file's hash and adopts edits made elsewhere while nothing is unsaved. */
function Editor({
  note,
  onProgress,
}: {
  note: VaultNote;
  onProgress?: VaultNoteStickyProps['onProgress'];
}) {
  const editor = useRef<MarkdownEditorHandle>(null);
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  }, [onProgress]);
  const { saver, status } = useAutosave<string, string>(
    { value: note.text, rev: note.hash },
    (text, hash) => api.vaultWriteNote(note.path, text, hash).then((saved) => saved.hash),
  );
  const [initial] = useState(note.text);
  const [extensions] = useState(() => taskDates(todayString));
  useEffect(() => {
    report.current?.(progressOf(initial));
  }, [initial]);

  const live = useVaultNote(note.path).data;
  useEffect(() => {
    if (!live || live.hash === saver.persisted.rev || saver.dirty || saver.current === 'conflict') {
      return;
    }
    saver.reset(live.text, live.hash);
    editor.current?.replaceText(live.text);
    report.current?.(progressOf(live.text));
  }, [live, saver]);

  const reload = async () => {
    const fresh = await api.vaultReadNote(note.path);
    saver.takeTheirs(fresh.text, fresh.hash);
    editor.current?.replaceText(fresh.text);
    report.current?.(progressOf(fresh.text));
  };

  return (
    <div className={styles.note}>
      <MarkdownEditor
        ref={editor}
        className={styles.editor}
        label={t.noteLabel}
        defaultValue={initial}
        extensions={extensions}
        onChange={(text) => {
          saver.update(text);
          report.current?.(progressOf(text));
        }}
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
          <Button size="sm" variant="ghost" onClick={() => void reload()}>
            {t.reload}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void api.vaultReadNote(note.path).then((fresh) => saver.keepMine(fresh.hash))
            }
          >
            {t.keepMine}
          </Button>
        </div>
      )}
    </div>
  );
}
