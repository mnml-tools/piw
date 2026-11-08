import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createEditorExtensions } from '../extensions';
import {
  extractTaskRefIds,
  htmlToJson,
  jsonToMarkdown,
  jsonToPlainText,
  markdownToJson,
  serializeDoc,
} from '../serialization';
import { isTaskId, normalizeTaskId } from '../task-ref';

const A = '0190a6e4-7b5c-7d3e-9f10-2a3b4c5d6e7f';
const B = '9b2f5c1e-3d4a-4b6c-8e9f-0a1b2c3d4e5f';

const roundTrip = (md: string) => jsonToMarkdown(markdownToJson(md));

describe('taskRef Markdown syntax [[task:<uuid>]]', () => {
  it.each([
    [`[[task:${A}]]\n`],
    [`Antes [[task:${A}]] depois.\n`],
    [`[[task:${A}]][[task:${B}]]\n`],
    [`# Título [[task:${A}]]\n`],
    [`> citação [[task:${A}]]\n`],
    [`- item [[task:${A}]]\n- outro\n`],
    [`1. passo [[task:${A}]]\n`],
  ])('round-trips %j byte-identically', (md) => {
    expect(roundTrip(md)).toBe(md);
    expect(extractTaskRefIds(markdownToJson(md)).length).toBeGreaterThan(0);
  });

  it('stores ONLY the taskId attribute (no title/status copy)', () => {
    const json = markdownToJson(`Ver [[task:${A}]].\n`);
    const node = json.content?.[0]?.content?.[1];
    expect(node).toEqual({ type: 'taskRef', attrs: { taskId: A } });
  });

  it('carries no marks: bold/italic around a ref are not stored and the export converges', () => {
    const md = `**negrito [[task:${A}]]** e *[[task:${B}]]*\n`;
    const json = markdownToJson(md);
    expect(JSON.stringify(json)).not.toMatch(/"type":"taskRef","attrs":\{[^}]*\},"marks"/);
    const once = jsonToMarkdown(json);
    expect(once).toBe(`**negrito** [[task:${A}]] e [[task:${B}]]\n`);
    expect(roundTrip(once)).toBe(once);
    expect(extractTaskRefIds(json)).toEqual([A, B]);
  });

  it('normalises upper-case UUIDs to lower-case', () => {
    expect(roundTrip(`[[task:${A.toUpperCase()}]]\n`)).toBe(`[[task:${A}]]\n`);
  });

  it('a taskRef inside an editorial checklist item is a task ref; the checklist item is not', () => {
    const md = `- [ ] ler documentação\n- [x] rever [[task:${A}]]\n`;
    const json = markdownToJson(md);
    expect(roundTrip(md)).toBe(md);
    expect(extractTaskRefIds(json)).toEqual([A]);
    expect(json.content?.[0]?.type).toBe('checklist');
  });

  it('checklists alone never produce task refs', () => {
    const md = '- [ ] um\n- [x] dois\n  - [ ] três\n';
    expect(extractTaskRefIds(markdownToJson(md))).toEqual([]);
  });

  it('invalid ids stay literal text (escaped on export, stable on re-import)', () => {
    const md = '[[task:not-a-uuid]] [[task:0190a6e4]]\n';
    const json = markdownToJson(md);
    expect(extractTaskRefIds(json)).toEqual([]);
    const exported = jsonToMarkdown(json);
    expect(exported).toBe('\\[\\[task:not-a-uuid\\]\\] \\[\\[task:0190a6e4\\]\\]\n');
    expect(roundTrip(exported)).toBe(exported);
  });

  it('is not recognised inside inline code or fenced code', () => {
    const md = `\`[[task:${A}]]\`\n\n\`\`\`md\n[[task:${B}]]\n\`\`\`\n`;
    const json = markdownToJson(md);
    expect(extractTaskRefIds(json)).toEqual([]);
    expect(roundTrip(md)).toBe(md);
  });

  it('literal text that LOOKS like a reference is escaped, so it cannot become one on re-import', () => {
    const json = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `[[task:${A}]]` }] }],
    };
    const md = jsonToMarkdown(json);
    expect(md).toBe(`\\[\\[task:${A}\\]\\]\n`);
    expect(extractTaskRefIds(markdownToJson(md))).toEqual([]);
  });

  it('extractTaskRefIds is unique and in document order', () => {
    const md = `[[task:${B}]] [[task:${A}]] [[task:${B}]]\n`;
    expect(extractTaskRefIds(markdownToJson(md))).toEqual([B, A]);
  });

  it('plain text: nothing by default, resolver on demand', () => {
    const json = markdownToJson(`Rever [[task:${A}]] hoje\n`);
    expect(jsonToPlainText(json)).toBe('Rever  hoje');
    expect(jsonToPlainText(json, { taskRefText: (id) => (id === A ? 'Rever PR' : '') })).toBe(
      'Rever Rever PR hoje',
    );
  });
});

describe('taskRef HTML (paste/copy between documents)', () => {
  it('parses span[data-task-ref] and ignores any copied title/status', () => {
    const json = htmlToJson(
      `<p>x <span data-task-ref="${A}" data-title="Hack" data-status="done">Título copiado</span></p>`,
    );
    expect(serializeDoc(json)).toBe(
      `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x "},{"type":"taskRef","attrs":{"taskId":"${A}"}}]}]}`,
    );
  });

  it('rejects spans with an invalid id (no dangling refs)', () => {
    const json = htmlToJson('<p><span data-task-ref="javascript:alert(1)">texto</span></p>');
    expect(extractTaskRefIds(json)).toEqual([]);
    expect(jsonToPlainText(json)).toBe('texto');
  });
});

describe('taskRef in a headless Editor', () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('renderHTML emits only the id, never task data', () => {
    editor = new Editor({
      extensions: createEditorExtensions(),
      content: markdownToJson(`[[task:${A}]]\n`),
    });
    expect(editor.getHTML()).toBe(`<p><span class="task-ref" data-task-ref="${A}"></span></p>`);
  });

  it('insertTaskRef validates the id and inserts an atom', () => {
    editor = new Editor({ extensions: createEditorExtensions() });
    expect(editor.commands.insertTaskRef('nope')).toBe(false);
    expect(editor.commands.insertTaskRef(A.toUpperCase())).toBe(true);
    expect(extractTaskRefIds(editor.getJSON())).toEqual([A]);
  });

  it('id helpers', () => {
    expect(isTaskId(A)).toBe(true);
    expect(isTaskId('x')).toBe(false);
    expect(normalizeTaskId(A.toUpperCase())).toBe(A);
    expect(normalizeTaskId(42)).toBeNull();
  });
});
