import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { createMarkdownSourceState, markdownSourceExtensions, scanSource } from '../src/codemirror/markdown-source'
import { readFixture, writeResult } from './helpers'

const A = '0190a6e4-7b5c-7d3e-9f10-2a3b4c5d6e7f'

describe('Candidate B — CodeMirror 6 (Markdown source editor)', () => {
  it.each(['full.md', 'noncanonical.md'])('fidelity: %s is kept byte-for-byte (no normalisation at all)', (name) => {
    const md = readFixture(name)
    expect(createMarkdownSourceState(md).doc.toString()).toBe(md)
  })

  it('distinguishes checklist items (Lezer GFM "Task") from taskRefs only by re-scanning text', () => {
    const scan = scanSource(createMarkdownSourceState(readFixture('full.md')))
    expect(scan.checklistItems).toBe(3)
    expect(scan.taskRefIds).toEqual([A, '9b2f5c1e-3d4a-4b6c-8e9f-0a1b2c3d4e5f'])
  })

  it('a taskRef is NOT atomic: deleting one character silently drops the reference', () => {
    const state = createMarkdownSourceState(`Ver [[task:${A}]].\n`)
    const pos = state.doc.toString().indexOf(']]')
    const edited = state.update({ changes: { from: pos, to: pos + 1 } }).state
    expect(scanSource(state).taskRefIds).toEqual([A])
    expect(scanSource(edited).taskRefIds).toEqual([])
  })

  it('no WYSIWYG: the rendered DOM shows raw Markdown syntax', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({
      parent,
      doc: '# Título\n\n**negrito** e - [ ] item\n',
      extensions: markdownSourceExtensions(),
    })
    const text = view.contentDOM.textContent ?? ''
    expect(text).toContain('# Título')
    expect(text).toContain('**negrito**')
    expect(view.contentDOM.querySelector('h1, strong, input[type=checkbox]')).toBeNull()
    view.destroy()
  })

  it('long document: load + full Lezer parse of 5k paragraphs', () => {
    const md = Array.from({ length: 5000 }, (_, i) => `Parágrafo ${i}: ação, café ☕ e **negrito** com *itálico*, \`code\` e [link](https://example.com/${i}).`).join('\n\n')
    const start = performance.now()
    const state = createMarkdownSourceState(md)
    const scan = scanSource(state)
    const ms = Math.round((performance.now() - start) * 10) / 10
    expect(state.doc.toString()).toBe(md)
    expect(scan.checklistItems).toBe(0)
    writeResult('perf-codemirror.json', { paragraphs: 5000, markdownBytes: Buffer.byteLength(md), loadAndParseMs: ms, runs: 1 })
    console.info(`[codemirror] 5000 paragraphs load + parse: ${ms} ms`)
  })
})
