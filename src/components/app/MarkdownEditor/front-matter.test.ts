import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { frontMatterFold, frontMatterProperties } from './front-matter';
import { selectionMenu } from './selection-action';

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function editor(doc: string, extensions = frontMatterFold()): EditorView {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, extensions }),
  });
  return view;
}

describe('front matter', () => {
  it('reads tags and other properties for the summary', () => {
    expect(
      frontMatterProperties(['tags: [auth, "security"]', 'status: draft', 'aliases:', '  - 2FA']),
    ).toEqual([
      { key: 'tags', values: ['auth', 'security'] },
      { key: 'status', values: ['draft'] },
      { key: 'aliases', values: ['2FA'] },
    ]);
  });

  it('folds into a summary until the caret is in it', () => {
    const v = editor('---\ntags: [auth]\n---\n\nText');
    expect(v.contentDOM.textContent).toContain('#auth');
    expect(v.contentDOM.textContent).not.toContain('tags:');
    expect(v.state.doc.toString()).toBe('---\ntags: [auth]\n---\n\nText');
  });

  it('leaves notes without front matter alone', () => {
    const v = editor('# Title\n\n---\nnot metadata');
    expect(v.contentDOM.textContent).toContain('not metadata');
  });
});

describe('selection menu', () => {
  it('wraps the selection in a link with the caret ready for the address', () => {
    const v = editor(
      'Read the docs',
      selectionMenu({
        sticky: { label: 'Create sticky from selection…', shortcut: 'Mod-Shift-s', run: () => {} },
        bold: 'Bold',
        link: 'Link',
      }),
    );
    v.dispatch({ selection: { anchor: 9, head: 13 } });
    const link = document.querySelector<HTMLButtonElement>('[aria-label="Link"]');
    expect(link).not.toBeNull();
    link?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(v.state.doc.toString()).toBe('Read the [docs]()');
    expect(v.state.selection.main.head).toBe(16);
  });
});
