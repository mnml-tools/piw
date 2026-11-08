import { useEffect, useState } from 'react';
import { useAutosave } from '@/lib/hooks/useAutosave';

/**
 * Autosave delay for drawer fields (docs/ui-design-system.md §10: 400 ms after typing, and on
 * blur).
 */
const FIELD_SAVE_DELAY = 400;

/**
 * Local text of one record, autosaved with its revision (`useAutosave`), that follows changes
 * made in other windows while nothing is pending here. When both sides edited, the save fails
 * with `conflict` and the caller shows Reload / Keep mine: text is never overwritten silently.
 * Render the owner with `key={record id}`.
 */
export function useRecordText<T>(
  server: { value: T; rev: number },
  save: (value: T, rev: number) => Promise<number>,
  equals: (a: T, b: T) => boolean,
) {
  const { saver, status } = useAutosave<T>(server, save, { delay: FIELD_SAVE_DELAY, equals });
  const [value, setValue] = useState<T>(server.value);
  const [seenRev, setSeenRev] = useState(server.rev);
  const settled = status === 'idle' || status === 'saved';

  // A newer revision arrived (another window, or our own save): show it unless edits are pending.
  // Revisions only grow, so an older cached copy (e.g. right after Reload) is ignored.
  if (server.rev > seenRev) {
    setSeenRev(server.rev);
    if (settled && !equals(value, server.value)) setValue(server.value);
  }

  // Keep the saver's baseline on the newest revision so the next save isn't a false conflict.
  const { value: serverValue, rev: serverRev } = server;
  useEffect(() => {
    if (settled && serverRev > saver.persisted.rev) saver.reset(serverValue, serverRev);
  }, [saver, settled, serverValue, serverRev]);

  /** Drops local edits and shows `next` (Reload after a conflict). */
  const adopt = (next: T, rev: number) => {
    saver.takeTheirs(next, rev);
    setValue(next);
    setSeenRev(rev);
  };

  return { value, setValue, saver, status, adopt };
}
