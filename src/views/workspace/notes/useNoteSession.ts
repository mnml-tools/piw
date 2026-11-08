import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { SaveState } from '@/components/ui';
import { useNote } from '@/lib/hooks/data';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { api } from '@/lib/ipc/api';
import type { Note } from '@/lib/ipc/bindings/Note';
import { IpcError } from '@/lib/ipc/client';
import { replaceText } from './markdown';

/** Autosave runs 400 ms after the last keystroke (docs/ui-design-system.md §10). */
export const AUTOSAVE_DELAY_MS = 400;
/** Failed saves retry on their own: 2 s, 4 s, 8 s… up to 30 s (docs/ui-design-system.md §8). */
export const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30_000;

type Creation = 'none' | 'creating' | 'created' | 'failed';

/** Result of {@link NoteSession.flush}: `empty` means a draft with nothing to persist. */
export type FlushResult = 'saved' | 'empty' | 'failed';

export interface NoteSessionOptions {
  /** The persisted note, or `null` for a new unsaved draft. */
  initial: Note | null;
  field: RefObject<HTMLTextAreaElement | null>;
  /** Space for the record, read when it is created. */
  resolveSpace: () => string | null;
  onCreated?: (note: Note) => void;
}

export interface NoteSession {
  /** The record id; `null` until the draft has its first non-whitespace character. */
  id: string | null;
  /** Latest database version (live, from change events). */
  note: Note | undefined;
  saveState: SaveState;
  failed: boolean;
  conflict: boolean;
  /** The note no longer exists (deleted elsewhere). */
  gone: boolean;
  onText: (value: string) => void;
  text: () => string;
  retry: () => void;
  flush: () => Promise<FlushResult>;
  /** After a conflict: adopt the other window's text. */
  reload: () => Promise<void>;
  /** After a conflict: save this text over the newer version. */
  keepMine: () => Promise<void>;
  /** The record was handed over (Trash, conversion): leaving must not discard it. */
  release: (released: boolean) => void;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Persistence for one open note (render the editor with a `key` per note).
 *
 * - **No empty records:** a draft becomes a record on its first non-whitespace character.
 *   Keystrokes typed while that create is in flight are kept and saved right after it.
 * - Autosave chains revisions (`expectedRev`) and stops on a conflict until the user chooses.
 * - Another window's newer text is adopted when there are no local edits.
 * - Leaving a note whose text is now empty discards it (no Trash entry).
 */
export function useNoteSession({
  initial,
  field,
  resolveSpace,
  onCreated,
}: NoteSessionOptions): NoteSession {
  const [id, setId] = useState<string | null>(initial?.id ?? null);
  const [creation, setCreation] = useState<Creation>('none');
  const [gone, setGone] = useState(false);
  const idRef = useRef<string | null>(initial?.id ?? null);
  const textRef = useRef(initial?.body ?? '');
  const creating = useRef<Promise<void> | null>(null);
  const alive = useRef(true);
  const released = useRef(false);
  const callbacks = useLatest({ resolveSpace, onCreated });

  const save = useCallback(async (value: string, rev: number) => {
    const noteId = idRef.current;
    if (!noteId) throw new IpcError('internal', 'The note has not been created yet');
    try {
      const note = await api.updateNoteText(noteId, rev, { body: value });
      return note.rev;
    } catch (error) {
      if (error instanceof IpcError && error.code === 'not_found') setGone(true);
      throw error;
    }
  }, []);

  const { saver, status } = useAutosave(
    { value: initial?.body ?? '', rev: initial?.rev ?? 0 },
    save,
    { delay: AUTOSAVE_DELAY_MS },
  );

  const create = useCallback(
    (text: string) => {
      setCreation('creating');
      const spaceId = callbacks.current.resolveSpace() ?? undefined;
      const run = api
        .createNote({ body: text, spaceId })
        .then(
          async (note) => {
            idRef.current = note.id;
            const body = note.body ?? text;
            saver.reset(body, note.rev);
            const latest = textRef.current;
            if (!alive.current) {
              // Closed while creating: persist the last keystrokes without the (disposed) saver.
              if (latest !== body) {
                await api
                  .updateNoteText(note.id, note.rev, { body: latest })
                  .catch(() => undefined);
              }
              return;
            }
            setId(note.id);
            setCreation('created');
            if (latest !== body) saver.update(latest);
            const wanted = callbacks.current.resolveSpace();
            if (wanted && wanted !== note.spaceId) {
              void api.moveNote(note.id, wanted).catch(() => undefined);
            }
            callbacks.current.onCreated?.(note);
          },
          () => {
            if (alive.current) setCreation('failed');
          },
        )
        .finally(() => {
          creating.current = null;
        });
      creating.current = run;
    },
    [callbacks, saver],
  );

  const onText = useCallback(
    (value: string) => {
      textRef.current = value;
      if (idRef.current) {
        saver.update(value);
        return;
      }
      if (creating.current) return; // Saved right after the create resolves.
      if (value.trim() !== '') create(value);
      else setCreation((current) => (current === 'failed' ? 'none' : current));
    },
    [create, saver],
  );

  const retry = useCallback(() => {
    if (idRef.current) {
      void saver.retry();
      return;
    }
    if (!creating.current && textRef.current.trim() !== '') create(textRef.current);
  }, [create, saver]);

  const flush = useCallback(async (): Promise<FlushResult> => {
    if (creating.current) await creating.current;
    if (!idRef.current) return textRef.current.trim() === '' ? 'empty' : 'failed';
    if (saver.current === 'error') await saver.retry();
    else await saver.flush();
    const ok = !saver.dirty && saver.current !== 'error' && saver.current !== 'conflict';
    return ok ? 'saved' : 'failed';
  }, [saver]);

  const reload = useCallback(async () => {
    const noteId = idRef.current;
    if (!noteId) return;
    const note = await api.getNote(noteId);
    const body = note.body ?? '';
    saver.takeTheirs(body, note.rev);
    textRef.current = body;
    replaceText(field.current, body);
  }, [field, saver]);

  const keepMine = useCallback(async () => {
    const noteId = idRef.current;
    if (!noteId) return;
    const note = await api.getNote(noteId);
    await saver.keepMine(note.rev);
  }, [saver]);

  // Another window saved this note: adopt its text when there is nothing unsaved here.
  const remote = useNote(id).data;
  useEffect(() => {
    if (!remote || remote.id !== idRef.current || remote.kind !== 'quick_note') return;
    if (remote.rev <= saver.persisted.rev || saver.dirty) return;
    if (saver.current === 'conflict' || saver.current === 'error') return;
    const body = remote.body ?? '';
    saver.takeTheirs(body, remote.rev);
    textRef.current = body;
    replaceText(field.current, body);
  }, [field, remote, saver]);

  const failed = creation === 'failed' || status === 'error';
  const blocked = gone || Boolean(remote?.deletedAt);

  // Automatic retry with backoff while a save keeps failing; the text is never discarded.
  const attempts = useRef(0);
  useEffect(() => {
    if (status === 'saved' || creation === 'created') attempts.current = 0;
  }, [status, creation]);
  useEffect(() => {
    if (!failed || blocked) return undefined;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempts.current);
    const timer = setTimeout(() => {
      attempts.current += 1;
      retry();
    }, delay);
    return () => clearTimeout(timer);
  }, [failed, blocked, retry]);

  const leave = useCallback(async () => {
    if (creating.current) await creating.current;
    const noteId = idRef.current;
    if (!noteId || released.current || textRef.current.trim() !== '') return;
    await saver.flush();
    if (saver.dirty || saver.current === 'error' || saver.current === 'conflict') return;
    await api.discardNoteIfEmpty(noteId).catch(() => false);
  }, [saver]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Deferred, because StrictMode re-runs effects at once and that is not leaving the note.
      queueMicrotask(() => {
        if (!alive.current) void leave();
      });
    };
  }, [leave]);

  const release = useCallback((value: boolean) => {
    released.current = value;
  }, []);
  const text = useCallback(() => textRef.current, []);

  let saveState: SaveState = 'idle';
  if (creation === 'creating' || status === 'saving') saveState = 'saving';
  else if (failed) saveState = 'error';
  else if (status === 'saved' || (creation === 'created' && status === 'idle')) saveState = 'saved';

  return {
    id,
    note: remote,
    saveState,
    failed,
    conflict: status === 'conflict',
    gone,
    onText,
    text,
    retry,
    flush,
    reload,
    keepMine,
    release,
  };
}
