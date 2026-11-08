import { cpus } from 'node:os';

import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { createEditorExtensions } from '../extensions';
import {
  extractTaskRefIds,
  jsonToMarkdown,
  jsonToPlainText,
  markdownToJson,
  serializeDoc,
} from '../serialization';
import { writeResult } from './helpers';

const PARAGRAPHS = 5000;
const RUNS = 5;

/** ~5k paragraphs + a heading every 50, a list every 100, a code block every 250, a taskRef every 500. */
function longMarkdown(): string {
  const blocks: string[] = [];
  for (let i = 0; i < PARAGRAPHS; i += 1) {
    if (i % 50 === 0) blocks.push(`## Secção ${i / 50 + 1}`);
    if (i % 100 === 0) blocks.push('- item um\n- item **dois**\n  - aninhado');
    if (i % 250 === 0) blocks.push('```ts\nconst x: number = 42\n```');
    const ref =
      i % 500 === 0 ? ` [[task:0190a6e4-7b5c-7d3e-9f10-${String(i).padStart(12, '0')}]]` : '';
    blocks.push(
      `Parágrafo ${i}: ação, café ☕ e **negrito** com *itálico*, \`code\` e [link](https://example.com/${i}).${ref}`,
    );
  }
  return `${blocks.join('\n\n')}\n`;
}

function measure<T>(fn: () => T): { median: number; min: number; max: number; result: T } {
  fn(); // warm-up (JIT, lazy schema/toolkit)
  const times: number[] = [];
  let result!: T;
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now();
    result = fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    median: round(times[Math.floor(times.length / 2)] ?? 0),
    min: round(times[0] ?? 0),
    max: round(times[times.length - 1] ?? 0),
    result,
  };
}

// Slow (~13 s): run with `EDITOR_PERF=1 pnpm test src/lib/editor` (results in docs/architecture.md#validation).
describe.skipIf(!process.env['EDITOR_PERF'])(`long document (${PARAGRAPHS} paragraphs)`, () => {
  it('parses, serialises and loads within budget; round-trip stays stable', () => {
    const md = longMarkdown();

    const parse = measure(() => markdownToJson(md));
    const json = parse.result;
    const serialise = measure(() => jsonToMarkdown(json));
    const canonical = measure(() => serializeDoc(json));
    const plain = measure(() => jsonToPlainText(json));
    const refs = measure(() => extractTaskRefIds(json));

    const element = document.createElement('div');
    document.body.append(element);
    const load = measure(() => {
      const editor = new Editor({ element, extensions: createEditorExtensions(), content: json });
      editor.destroy();
      return true;
    });

    const editor = new Editor({ element, extensions: createEditorExtensions(), content: json });
    const getJson = measure(() => JSON.stringify(editor.getJSON()));
    const keystroke = measure(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, 'x');
      return true;
    });
    editor.destroy();

    expect(serialise.result).toBe(md);
    expect(refs.result).toHaveLength(PARAGRAPHS / 500);

    const paragraphs = (json.content ?? []).filter((n) => n.type === 'paragraph').length;
    const results = {
      environment: {
        node: process.version,
        cpu: cpus()[0]?.model ?? 'unknown',
        dom: 'jsdom 31.0.0 (vitest 5.1.0)',
        runs: RUNS,
        note: 'median of RUNS after one warm-up; milliseconds',
      },
      document: {
        paragraphs,
        topLevelBlocks: json.content?.length ?? 0,
        markdownBytes: Buffer.byteLength(md),
        jsonBytes: Buffer.byteLength(canonical.result),
        plainTextBytes: Buffer.byteLength(plain.result),
      },
      ms: {
        markdownToJson: parse.median,
        jsonToMarkdown: serialise.median,
        serializeDoc: canonical.median,
        jsonToPlainText: plain.median,
        extractTaskRefIds: refs.median,
        editorCreateWithJson: load.median,
        editorGetJsonStringify: getJson.median,
        editorSingleInsert: keystroke.median,
      },
      range: {
        markdownToJson: [parse.min, parse.max],
        jsonToMarkdown: [serialise.min, serialise.max],
        editorCreateWithJson: [load.min, load.max],
      },
    };
    writeResult('perf-tiptap.json', results);
    console.info(JSON.stringify(results, null, 2));

    // Generous budgets: this is a regression guard, not the measurement itself.
    expect(parse.median).toBeLessThan(5000);
    expect(serialise.median).toBeLessThan(5000);
    expect(load.median).toBeLessThan(5000);
  });
});
