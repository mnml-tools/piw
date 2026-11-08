import type { Editor, JSONContent } from '@tiptap/core';

import { serializeDoc } from './serialization';

/**
 * Apply content that came from OUTSIDE this editor (another window saved the
 * same tab, a reload from SQLite…) without creating an autosave loop:
 * - no-op when the canonical JSON is identical (keeps cursor and undo stack);
 * - `emitUpdate: false` → `onUpdate` (and therefore autosave) is not fired;
 * - `addToHistory: false` → Undo cannot "revert" another window's change.
 * Returns true when the document was replaced.
 */
export function applyExternalContent(editor: Editor, json: JSONContent): boolean {
  if (editor.isDestroyed) return false;
  const next = serializeDoc(json);
  if (serializeDoc(editor.getJSON()) === next) return false;
  return editor
    .chain()
    .setMeta('addToHistory', false)
    .setContent(JSON.parse(next) as JSONContent, { emitUpdate: false })
    .run();
}

/** Canonical string of the editor's current content — what autosave persists. */
export function currentDocString(editor: Editor): string {
  return serializeDoc(editor.getJSON());
}
