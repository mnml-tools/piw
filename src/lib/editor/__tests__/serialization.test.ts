import { describe, expect, it } from 'vitest';

import {
  extractTaskRefIds,
  jsonToMarkdown,
  jsonToPlainText,
  markdownToJson,
  normalizeDoc,
  serializeDoc,
} from '../serialization';
import { golden, readFixture } from './helpers';

const TASK_A = '0190a6e4-7b5c-7d3e-9f10-2a3b4c5d6e7f';
const TASK_B = '9b2f5c1e-3d4a-4b6c-8e9f-0a1b2c3d4e5f';

const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe('golden: full.md (every required element, canonical Markdown)', () => {
  const md = readFixture('full.md');
  const json = markdownToJson(md);

  it('md → json matches the reviewed golden JSON', () => {
    expect(pretty(json)).toBe(golden('full.json', pretty(json)));
  });

  it('md → json → md is byte-identical to the input', () => {
    expect(jsonToMarkdown(json)).toBe(md);
  });

  it('json → md → json is identical (lossless for the canonical form)', () => {
    expect(serializeDoc(markdownToJson(jsonToMarkdown(json)))).toBe(serializeDoc(json));
  });

  it('covers every required node and mark type', () => {
    const types = new Set<string>();
    const marks = new Set<string>();
    const walk = (n: { type?: string; marks?: { type: string }[]; content?: unknown[] }) => {
      if (n.type) types.add(n.type);
      n.marks?.forEach((m) => marks.add(m.type));
      (n.content as (typeof n)[] | undefined)?.forEach(walk);
    };
    walk(json);
    expect([...types].sort()).toEqual(
      [
        'blockquote',
        'bulletList',
        'checklist',
        'checklistItem',
        'codeBlock',
        'doc',
        'heading',
        'horizontalRule',
        'listItem',
        'orderedList',
        'paragraph',
        'taskRef',
        'text',
      ].sort(),
    );
    expect([...marks].sort()).toEqual(['bold', 'code', 'italic', 'link', 'strike']);
  });

  it('keeps the code block language', () => {
    const code = json.content?.find((n) => n.type === 'codeBlock');
    expect(code?.attrs).toEqual({ language: 'ts' });
    expect(md).toContain('```ts\n');
  });

  it('preserves unicode, emoji (incl. ZWJ sequences) and Portuguese accents', () => {
    const text = jsonToPlainText(json);
    expect(text).toContain('Ação — café ☕ 🚀');
    expect(text).toContain('👩‍💻');
    expect(jsonToMarkdown(json)).toContain('Ação — café ☕ 🚀');
  });

  it('plain text extraction matches the golden file (no Markdown syntax, no task data)', () => {
    const text = jsonToPlainText(json);
    expect(text).toBe(golden('full.txt', text));
    expect(text).not.toMatch(/\*\*|^#|```/m);
    expect(text).not.toContain(TASK_A);
  });

  it('extracts only real task references, never editorial checklist items', () => {
    expect(extractTaskRefIds(json)).toEqual([TASK_A, TASK_B]);
    // The fixture has 3 checklist items (one checked, one nested) — none of them is a task.
    const checklistItems = JSON.stringify(json).match(/"type":"checklistItem"/g) ?? [];
    expect(checklistItems).toHaveLength(3);
  });
});

describe('golden: noncanonical.md (normalisation converges in one pass)', () => {
  const input = readFixture('noncanonical.md');

  it('first export matches the reviewed golden Markdown', () => {
    const exported = jsonToMarkdown(markdownToJson(input));
    expect(exported).toBe(golden('noncanonical.export.md', exported));
  });

  it('is idempotent: export(import(export(x))) === export(x)', () => {
    const json1 = markdownToJson(input);
    const md1 = jsonToMarkdown(json1);
    const json2 = markdownToJson(md1);
    const md2 = jsonToMarkdown(json2);
    expect(md2).toBe(md1);
    expect(serializeDoc(json2)).toBe(serializeDoc(json1));
  });
});

describe('determinism', () => {
  const md = readFixture('full.md');

  it('same Markdown → identical JSON string, twice', () => {
    expect(JSON.stringify(markdownToJson(md))).toBe(JSON.stringify(markdownToJson(md)));
  });

  it('same JSON → identical Markdown, twice', () => {
    const json = markdownToJson(md);
    expect(jsonToMarkdown(json)).toBe(jsonToMarkdown(json));
  });

  it('normalizeDoc is idempotent and independent of input key order', () => {
    const json = markdownToJson(md);
    const shuffled = JSON.parse(JSON.stringify(json), (_key, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).reverse());
      }
      return value;
    }) as typeof json;
    expect(serializeDoc(shuffled)).toBe(serializeDoc(json));
    expect(serializeDoc(normalizeDoc(json))).toBe(serializeDoc(json));
  });

  it('does not apply Unicode normalisation (NFD stays NFD, byte-exact)', () => {
    const nfd = 'Ac\u0327a\u0303o';
    expect(nfd.normalize('NFC')).not.toBe(nfd);
    const json = markdownToJson(`${nfd}\n`);
    expect(jsonToPlainText(json)).toBe(nfd);
    expect(jsonToMarkdown(json)).toBe(`${nfd}\n`);
  });
});

describe('edge cases', () => {
  it('code containing ``` is exported with a longer fence and round-trips', () => {
    const md = '````md\n```ts\nconst a = 1\n```\n````\n';
    const json = markdownToJson(md);
    expect(json.content?.[0]?.content?.[0]?.text).toBe('```ts\nconst a = 1\n```');
    expect(jsonToMarkdown(json)).toBe(md);
  });

  it('adjacent lists of the same type stay separate (JSON → MD → JSON)', () => {
    const item = (text: string) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const check = (text: string, checked: boolean) => ({
      type: 'checklistItem',
      attrs: { checked },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const json = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'bulletList', content: [item('a')] },
        { type: 'bulletList', content: [item('b')] },
        { type: 'orderedList', attrs: { start: 1 }, content: [item('um')] },
        { type: 'orderedList', attrs: { start: 5 }, content: [item('cinco')] },
        { type: 'checklist', content: [check('x', false)] },
        { type: 'checklist', content: [check('y', true)] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'pai' }] },
                { type: 'bulletList', content: [item('filho 1')] },
                { type: 'bulletList', content: [item('filho 2')] },
              ],
            },
          ],
        },
      ],
    });
    const md = jsonToMarkdown(json);
    expect(md).toContain('<!-- -->');
    expect(serializeDoc(markdownToJson(md))).toBe(serializeDoc(json));
    expect(jsonToMarkdown(markdownToJson(md))).toBe(md);
  });

  it('links: only href/title are stored; unsafe Markdown hrefs are dropped (text kept)', () => {
    const json = markdownToJson(
      '[ok](https://a.pt "Título") [js](javascript:alert(1)) [ftp](ftp://x.pt) [mail](mailto:a@b.pt)\n',
    );
    const links = JSON.stringify(json).match(/"type":"link","attrs":\{[^}]*\}/g);
    expect(links).toEqual([
      '"type":"link","attrs":{"href":"https://a.pt","title":"Título"}',
      '"type":"link","attrs":{"href":"mailto:a@b.pt","title":null}',
    ]);
    expect(jsonToPlainText(json)).toBe('ok js ftp mail');
  });

  it('empty document ↔ empty Markdown', () => {
    expect(jsonToMarkdown(markdownToJson(''))).toBe('');
    expect(serializeDoc(markdownToJson(''))).toBe(
      '{"type":"doc","content":[{"type":"paragraph"}]}',
    );
  });

  it('literal Markdown characters in text are escaped and survive', () => {
    const json = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '2 * 3 = 6, a_b, `x`, [y]' }] },
      ],
    });
    const md = jsonToMarkdown(json);
    expect(serializeDoc(markdownToJson(md))).toBe(serializeDoc(json));
  });

  it('rejects unknown node types instead of silently dropping them', () => {
    expect(() =>
      normalizeDoc({ type: 'doc', content: [{ type: 'futureWidget', attrs: { x: 1 } }] }),
    ).toThrow();
  });
});

describe('export of forged links', () => {
  it('keeps the text but drops unsafe hrefs', () => {
    const md = jsonToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    });
    expect(md).toBe('click\n');
  });
});
