import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from './extensions';
import { extractTaskRefIds } from './serialization';
import { convertLineToTask } from './task-actions';

const ID = '0190f1b2-7c3d-7a00-8000-0000000000aa';
let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function make(content: object) {
  editor = new Editor({ extensions: createEditorExtensions(), content });
  return editor;
}

describe('convertLineToTask', () => {
  it('replaces a paragraph with a reference to the new task', async () => {
    const e = make({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write tests' }] }],
    });
    e.commands.setTextSelection(3);
    const titles: string[] = [];
    expect(await convertLineToTask(e, async (title) => (titles.push(title), ID))).toBe(true);
    expect(titles).toEqual(['Write tests']);
    expect(extractTaskRefIds(e.getJSON())).toEqual([ID]);
    expect(e.getText()).not.toContain('Write tests');
  });

  it('moves a checklist line out of the editorial checklist (CA-05)', async () => {
    const e = make({
      type: 'doc',
      content: [
        {
          type: 'checklist',
          content: [
            {
              type: 'checklistItem',
              attrs: { checked: false },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read RFC' }] }],
            },
          ],
        },
      ],
    });
    e.commands.setTextSelection(4);
    await convertLineToTask(e, async () => ID);
    const json = JSON.stringify(e.getJSON());
    expect(json).not.toContain('checklistItem');
    expect(extractTaskRefIds(e.getJSON())).toEqual([ID]);
  });

  it('does nothing on an empty line and leaves the document untouched when creation fails', async () => {
    const e = make({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(await convertLineToTask(e, async () => ID)).toBe(false);
    const f = make({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'keep' }] }],
    });
    f.commands.setTextSelection(2);
    await expect(convertLineToTask(f, () => Promise.reject(new Error('offline')))).rejects.toThrow(
      'offline',
    );
    expect(f.getText()).toBe('keep');
  });
});
