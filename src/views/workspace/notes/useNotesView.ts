import { useCallback, useState } from 'react';
import type { Focus } from '@/state/workspace';

interface ViewState {
  focus: Focus;
  /** Changes whenever another note (or a new draft) opens, so each gets a fresh editor. */
  editorKey: number;
  /** Record created by the open draft; adopting it as the focus keeps the same editor. */
  createdId: string | null;
  /** Row selection; survives opening a note and coming back (docs/ui-design-system.md §10). */
  selectedId: string | null;
  /** The editor just closed: the list puts focus back on the selected row. */
  returnToList: boolean;
  /** Opened from the list in split view while focus stays in the list. */
  quietId: string | null;
}

function openNoteId(focus: Focus): string | null {
  return focus.type === 'note' ? focus.id : null;
}

/**
 * View state of the Notes area derived from the workspace focus: which editor instance is
 * showing, which row is selected and where keyboard focus should go after a change.
 */
export function useNotesView(focus: Focus) {
  const [state, setState] = useState<ViewState>(() => ({
    focus,
    editorKey: 0,
    createdId: null,
    selectedId: openNoteId(focus),
    returnToList: false,
    quietId: null,
  }));

  let view = state;
  if (state.focus !== focus) {
    const previous = state.focus;
    const opened = openNoteId(focus);
    const adopted =
      previous.type === 'newNote' && focus.type === 'note' && focus.id === state.createdId;
    view = {
      focus,
      editorKey: adopted ? state.editorKey : state.editorKey + 1,
      createdId: null,
      selectedId: opened ?? openNoteId(previous) ?? state.selectedId,
      returnToList:
        (previous.type === 'note' || previous.type === 'newNote') && focus.type === 'none',
      quietId: opened !== null && opened === state.quietId ? opened : null,
    };
    setState(view);
  }

  const select = useCallback((id: string | null) => {
    setState((current) => ({ ...current, selectedId: id }));
  }, []);
  const markCreated = useCallback((id: string) => {
    setState((current) => ({ ...current, createdId: id }));
  }, []);
  const markQuiet = useCallback((id: string) => {
    setState((current) => ({ ...current, quietId: id, selectedId: id }));
  }, []);

  return {
    editorKey: view.editorKey,
    selectedId: view.selectedId,
    returnToList: view.returnToList,
    quietId: view.quietId,
    select,
    markCreated,
    markQuiet,
  };
}
