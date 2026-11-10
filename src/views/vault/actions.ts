import { useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui';
import { api } from '@/lib/ipc/api';
import { IpcError } from '@/lib/ipc/client';
import { useVaultUi } from '@/state/vault';
import { common } from '@/strings/common';
import { vaultStrings as t } from '@/strings/vault';
import { baseName, parentOf } from './tree';

/** Title of a note created with New note; Rust adds " 2", " 3"… when it is taken. */
export const UNTITLED = 'Untitled';

function message(error: unknown): string {
  return error instanceof IpcError ? error.message : common.toasts.genericError;
}

/**
 * The vault's commands as the shell uses them: each keeps the tabs in step and reports failures
 * (and undo) as toasts.
 */
export function useVaultActions() {
  const { toast } = useToast();
  const fail = useCallback(
    (error: unknown) => toast({ tone: 'error', message: message(error) }),
    [toast],
  );

  return useMemo(() => {
    const ui = () => useVaultUi.getState();

    const openNote = (path: string) => {
      ui().open({ type: 'note', path });
      ui().reveal(path);
    };

    /** Creates a note and opens it with its title ready to be typed. */
    const createNote = async (folder: string | null, title = UNTITLED) => {
      try {
        const note = await api.vaultCreateNote(folder, title);
        openNote(note.path);
        if (title === UNTITLED) ui().setRenaming(note.path);
        return note.path;
      } catch (error) {
        fail(error);
        return null;
      }
    };

    /** Mod+click on `[[target]]`: opens the note, or offers to create it next to `from`. */
    const openLink = async (target: string, from: string) => {
      try {
        const path = await api.vaultResolveLink(target);
        if (path !== null) {
          openNote(path);
          return;
        }
        toast({
          message: t.note.missingLink(target),
          action: {
            label: t.note.createLinked,
            onAction: () => void createNote(parentOf(from), baseName(target)),
          },
        });
      } catch (error) {
        fail(error);
      }
    };

    /** Renames or moves, keeping tabs and folders in step. Throws `IpcError` on failure. */
    const renameOrThrow = async (from: string, to: string) => {
      if (from === to) return from;
      const renamed = await api.vaultRename(from, to);
      ui().renamed(from, renamed.path);
      if (renamed.linked.length > 0) toast({ message: t.note.renamed(renamed.linked.length) });
      return renamed.path;
    };

    /** As `renameOrThrow`, but a failure becomes a toast and resolves to null. */
    const rename = async (from: string, to: string) => {
      try {
        return await renameOrThrow(from, to);
      } catch (error) {
        fail(error);
        return null;
      }
    };

    const trash = async (path: string, name: string) => {
      try {
        const item = await api.vaultTrash(path);
        ui().removed(path);
        toast({
          message: t.trash.trashed(name),
          action: {
            label: common.actions.undo,
            onAction: () => void api.vaultRestore(item.id).catch(fail),
          },
        });
      } catch (error) {
        fail(error);
      }
    };

    const createFolder = async (parent: string | null, name: string) => {
      const path = await api.vaultCreateFolder(parent, name);
      // `reveal` opens the folders above a path; the trailing slash opens this one too.
      ui().reveal(`${path}/`);
      return path;
    };

    return { openNote, createNote, openLink, rename, renameOrThrow, trash, createFolder, fail };
  }, [toast, fail]);
}
