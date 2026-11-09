import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveMarkdown, replaceText } from './live-markdown';

describe('liveMarkdown', () => {
  let view: EditorView | null = null;
  afterEach(() => view?.destroy());

  function mount(doc: string, onEdit = vi.fn()) {
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc, extensions: liveMarkdown({ onEdit }) }),
    });
    return { view, onEdit };
  }

  const shown = (editor: EditorView) =>
    [...editor.contentDOM.querySelectorAll('.cm-line')].map((line) => line.textContent);

  it('hides the Markdown markers and keeps the text unchanged', () => {
    const { view } = mount('# Plan\n- [ ] **Ship** it\n- note\n> quoted `code`');
    expect(shown(view)).toEqual(['Plan', 'Ship it', 'note', 'quoted code']);
    expect(view.contentDOM.querySelectorAll('input[type=checkbox]')).toHaveLength(1);
    expect(view.state.doc.toString()).toBe('# Plan\n- [ ] **Ship** it\n- note\n> quoted `code`');
  });

  it('saves edits but not text adopted from elsewhere', () => {
    const { view, onEdit } = mount('one');
    view.dispatch({ changes: { from: 3, insert: ' two' } });
    expect(onEdit).toHaveBeenLastCalledWith('one two');

    onEdit.mockClear();
    view.dispatch({ selection: { anchor: 1 } });
    replaceText(view, 'zero one two');
    expect(view.state.doc.toString()).toBe('zero one two');
    // The caret stays on the same character ("o|ne"), after the inserted word.
    expect(view.state.selection.main.head).toBe(6);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
