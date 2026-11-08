import { useCallback, useMemo } from 'react';
import { DEFAULT_TOAST_DURATION, useToast } from '@/components/ui';
import { api } from '@/lib/ipc/api';
import type { LinkedTasks } from '@/lib/ipc/bindings/LinkedTasks';
import type { NoteKind } from '@/lib/ipc/bindings/NoteKind';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { notesStrings as t } from '@/strings/notes';

export interface ActionTarget {
  id: string;
  /** Display title, used in toasts. */
  title: string;
  kind: NoteKind;
}

export interface NoteActions {
  /** Moves a note (or a document, with what happens to its tasks) to Trash, with undo. */
  trash: (target: ActionTarget, linkedTasks?: LinkedTasks) => Promise<boolean>;
  setArchived: (target: ActionTarget, archived: boolean) => Promise<boolean>;
  move: (id: string, spaceId: string) => Promise<boolean>;
  pin: (id: string) => Promise<boolean>;
  /**
   * CA-03: converts immediately and offers undo with the original text (read from the database
   * when not given, e.g. from the list).
   */
  convert: (id: string, original?: { title: string; body: string }) => Promise<boolean>;
  /** Favourites are the documents flagged for quick access (the former sidebar flag). */
  setFavourite: (id: string, favourite: boolean) => Promise<boolean>;
  /** Runs the newest undo while its toast can still be on screen (Mod+Z). */
  undoLast: () => boolean;
}

interface PendingUndo {
  toastId: string;
  at: number;
  run: () => void;
}

/**
 * The newest undo, shared by every list and editor in the window: there is one undo toast at a
 * time (the newest replaces the previous), so Mod+Z in the list also undoes "Move to Trash"
 * chosen in the editor a moment ago.
 */
let pending: PendingUndo | null = null;

/**
 * List and editor commands with consistent feedback: every restorable change offers an undo toast
 * (docs/ui-design-system.md §8, "Undo replaces confirmation"), failures show an error toast. The
 * cache refreshes from change events, so nothing here touches it.
 */
export function useNoteActions(): NoteActions {
  const { toast, dismiss } = useToast();

  const fail = useCallback(
    (message: string) => {
      toast({ message, tone: 'error' });
      return false;
    },
    [toast],
  );

  const offerUndo = useCallback(
    (message: string, undo: () => Promise<unknown>, failure: string = t.toasts.undoFailed) => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        if (pending?.run === run) pending = null;
        undo().catch((error: unknown) => {
          const changed = error instanceof IpcError && error.code === 'validation';
          fail(changed ? failure : t.toasts.undoFailed);
        });
      };
      const toastId = toast({ message, action: { label: common.actions.undo, onAction: run } });
      pending = { toastId, at: Date.now(), run };
    },
    [fail, toast],
  );

  const restore = useCallback(
    async (id: string) => {
      const withoutDocument = await api.restoreNote(id);
      if (withoutDocument) toast({ message: common.toasts.restoredWithoutDocument });
    },
    [toast],
  );

  const trash = useCallback(
    async (target: ActionTarget, linkedTasks: LinkedTasks = 'keep') => {
      try {
        if (target.kind === 'document') await api.trashDocument(target.id, linkedTasks);
        else await api.trashNote(target.id);
      } catch {
        return fail(t.toasts.trashFailed);
      }
      offerUndo(t.toasts.trashed(target.title), () => restore(target.id));
      return true;
    },
    [fail, offerUndo, restore],
  );

  const setArchived = useCallback(
    async (target: ActionTarget, archived: boolean) => {
      try {
        await api.setNoteArchived(target.id, archived);
      } catch {
        return fail(t.toasts.archiveFailed);
      }
      offerUndo(
        archived ? t.toasts.archived(target.title) : t.toasts.unarchived(target.title),
        () => api.setNoteArchived(target.id, !archived),
      );
      return true;
    },
    [fail, offerUndo],
  );

  const move = useCallback(
    async (id: string, spaceId: string) => {
      try {
        await api.moveNote(id, spaceId);
        return true;
      } catch {
        return fail(t.toasts.moveFailed);
      }
    },
    [fail],
  );

  const pin = useCallback(
    async (id: string) => {
      try {
        await api.openSticky({ kind: 'note', id });
        return true;
      } catch {
        return fail(t.toasts.pinFailed);
      }
    },
    [fail],
  );

  const convert = useCallback(
    async (id: string, given?: { title: string; body: string }) => {
      let original = given;
      try {
        if (!original) {
          const note = await api.getNote(id);
          original = { title: note.title, body: note.body ?? '' };
        }
        await api.convertNoteToDocument(id);
      } catch {
        return fail(t.toasts.convertFailed);
      }
      const { title, body } = original;
      offerUndo(
        t.toasts.converted,
        async () => {
          await api.revertDocumentConversion(id, title, body);
          // Undo from the document view lands back in the note, without a history entry.
          const { focus } = useWorkspace.getState();
          if (focus.type === 'document' && focus.id === id) {
            useWorkspace.getState().replaceFocus({ type: 'note', id });
          }
        },
        t.toasts.revertFailed,
      );
      return true;
    },
    [fail, offerUndo],
  );

  const setFavourite = useCallback(
    async (id: string, favourite: boolean) => {
      try {
        await api.setDocumentInSidebar(id, favourite);
        return true;
      } catch {
        return fail(t.toasts.favouriteFailed);
      }
    },
    [fail],
  );

  const undoLast = useCallback(() => {
    const last = pending;
    if (!last || Date.now() - last.at > DEFAULT_TOAST_DURATION) return false;
    dismiss(last.toastId);
    last.run();
    return true;
  }, [dismiss]);

  return useMemo(
    () => ({ trash, setArchived, move, pin, convert, setFavourite, undoLast }),
    [trash, setArchived, move, pin, convert, setFavourite, undoLast],
  );
}
