import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../react/DocumentEditor';
import { createMemoryTaskRefStore, TaskRefProvider } from '../react/task-ref-store';

const ID = '0190f1b2-7c3d-7a00-8000-000000000001';
const content = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Problem' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'SMS codes are being phased out.' }] },
    {
      type: 'checklist',
      content: [
        {
          type: 'checklistItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read RFC 6238' }] }],
        },
      ],
    },
    { type: 'paragraph', content: [{ type: 'taskRef', attrs: { taskId: ID } }] },
    {
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'const a = 1;' }],
    },
  ],
};

// jsdom has no layout: ProseMirror's scroll-into-view after focus needs these.
beforeAll(() => {
  const rect = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = rect as () => DOMRect;
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

describe('opening a document', () => {
  it('does not emit a change (no autosave) when nothing was edited', async () => {
    const onChange = vi.fn();
    render(
      <TaskRefProvider
        store={createMemoryTaskRefStore([{ id: ID, title: 'Task', status: 'open' }])}
      >
        <DocumentEditor
          content={content}
          onChange={onChange}
          onReady={(e) => e.commands.focus('end')}
        />
      </TaskRefProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(onChange).not.toHaveBeenCalled();
  });
});
