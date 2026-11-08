import type { NoteListItem } from '@/lib/ipc/bindings/NoteListItem';
import { notesStrings as t } from '@/strings/notes';

/** Title shown for a row: inferred (notes) or explicit (documents), or "Untitled …". */
export function displayTitle(item: Pick<NoteListItem, 'displayTitle' | 'kind'>): string {
  if (item.displayTitle.trim()) return item.displayTitle;
  return item.kind === 'document' ? t.untitledDocument : t.untitledNote;
}
